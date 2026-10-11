import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ObjectId } from 'mongodb';
import { closeMongo } from '../src/db/client.js';
import { checkpointsRepo, stepExecutionsRepo, tasksRepo } from '../src/db/repositories/index.js';
import { createAgent } from '../src/services/agents.js';
import { systemActor } from '../src/services/events.js';
import { createPlaybookTask, PLAYBOOK_STEPS } from '../src/services/playbook.js';
import { announceSkip, atlasAvailability, cleanTestOrgs, testOrgs } from './helpers.js';

const atlas = await atlasAvailability();
if (!atlas.ok) announceSkip('recovery.e2e.test.ts', atlas.reason);

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEASE_MS = 4000;
const STEP_DELAY_MS = 1500;

/** Spawns the real worker entrypoint as a single node process (so SIGKILL kills the worker itself). */
function spawnWorker(workerId: string, orgId: ObjectId, output: string[]): ChildProcess {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
    cwd: backendDir,
    env: {
      ...process.env,
      WORKER_ID: workerId,
      WORKER_ORG_ID: orgId.toHexString(),
      LEASE_MS: String(LEASE_MS),
      DEMO_STEP_DELAY_MS: String(STEP_DELAY_MS),
      DEMO_MODE: 'false',
      LLM_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => output.push(String(d)));
  child.stderr!.on('data', (d) => output.push(String(d)));
  return child;
}

async function waitFor<T>(check: () => Promise<T | null | false>, timeoutMs: number, label: string, intervalMs = 150): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

const exited = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res) => {
    if (child.exitCode !== null || child.signalCode !== null) return res({ code: child.exitCode, signal: child.signalCode });
    child.once('exit', (code, signal) => res({ code, signal }));
  });

describe.skipIf(!atlas.ok)('crash recovery: real worker processes against Atlas (__test__ org)', () => {
  let org: ObjectId;
  let other: ObjectId;
  const children: ChildProcess[] = [];
  const logA: string[] = [];
  const logB: string[] = [];

  beforeAll(async () => {
    ({ a: org, b: other } = await testOrgs());
    await cleanTestOrgs(org, other);
  });

  afterAll(async () => {
    for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
    if (org && other) await cleanTestOrgs(org, other);
    await closeMongo();
  });

  it(
    'resumes from the last checkpoint after SIGKILL without repeating completed steps',
    async () => {
      const agent = await createAgent(org, { name: 'Recovery test agent' }, systemActor);
      const task = await createPlaybookTask(org, { agentId: agent._id.toHexString() }, systemActor);
      const countCheckpoints = () => checkpointsRepo.count(org, { taskId: task._id });

      // Worker A runs until two checkpoints exist, then is killed with SIGKILL (no cleanup, no lease release).
      const a = spawnWorker('worker-test-a', org, logA);
      children.push(a);
      await waitFor(async () => (await countCheckpoints()) >= 2, 60_000, 'worker A to write 2 checkpoints');
      a.kill('SIGKILL');
      const exitA = await exited(a);
      expect(exitA.signal === 'SIGKILL' || exitA.code !== 0).toBe(true);

      // The task is orphaned mid-run: still `running`, exactly 2 checkpoints, lease held by the dead worker.
      const orphan = (await tasksRepo.findById(org, task._id))!;
      expect(orphan.status).toBe('running');
      expect(orphan.workerId).toBe('worker-test-a');
      expect(await countCheckpoints()).toBe(2);
      expect(orphan.currentStep).toBe(2);

      // Worker B claims it once the lease expires and finishes the remaining steps.
      const b = spawnWorker('worker-test-b', org, logB);
      children.push(b);
      const done = await waitFor(
        async () => {
          const t = await tasksRepo.findById(org, task._id);
          return t?.status === 'completed' ? t : null;
        },
        90_000,
        'worker B to complete the task',
        300,
      );
      b.kill('SIGTERM');

      // 5 checkpoints, unique step indexes 0..4.
      const cps = await checkpointsRepo.find(org, { taskId: task._id }, { sort: { stepIndex: 1 } });
      expect(cps.map((c) => c.stepIndex)).toEqual([0, 1, 2, 3, 4]);
      expect(new Set(cps.map((c) => c.idempotencyKey)).size).toBe(PLAYBOOK_STEPS.length);
      expect(cps.slice(0, 2).every((c) => c.workerId === 'worker-test-a')).toBe(true);
      expect(cps.slice(2).every((c) => c.workerId === 'worker-test-b')).toBe(true);

      // Steps 0 and 1 were executed exactly once (counted from the worker's execution records).
      const execs = await stepExecutionsRepo.find(org, { taskId: task._id });
      const perStep = (i: number) => execs.filter((e) => e.stepIndex === i).length;
      expect(perStep(0)).toBe(1);
      expect(perStep(1)).toBe(1);
      // Step 2 may have started on A before the kill (never committed) and rerun on B.
      expect(perStep(2)).toBeGreaterThanOrEqual(1);
      expect(perStep(3)).toBe(1);
      expect(perStep(4)).toBe(1);

      expect(done.attempt).toBe(2);
      expect(done.workerId).toBe('worker-test-b');
      expect(done.steps.every((s) => s.status === 'completed')).toBe(true);
      expect(String(done.output?.summary ?? '')).not.toBe('');
      expect(logB.join('')).toMatch(/resuming task .* at step 3 \(attempt 2; 2 checkpoint\(s\) restored\)/);
    },
    180_000,
  );
});
