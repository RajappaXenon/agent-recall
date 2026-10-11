/**
 * Task worker (separate process): npm run worker -w backend
 *
 * Claims playbook tasks with a lease, heartbeats the lease, resumes from the
 * last checkpoint, and commits each step (checkpoint + currentStep advance) in
 * one transaction that only succeeds while this worker still holds the lease.
 * SIGTERM/SIGINT: finish the current step, release the lease, exit 0.
 * DEMO_MODE crash request: exit(1) between steps without releasing anything.
 */
import { randomBytes } from 'node:crypto';
import { MongoError, MongoNetworkError, MongoServerError, MongoServerSelectionError, ObjectId } from 'mongodb';
import { config, scrubSecrets } from './config.js';
import { closeMongo, describeMongoError, getClient } from './db/client.js';
import type { TaskDoc } from './db/collections.js';
import { ensureRegularIndexes } from './db/indexes.js';
import { checkpointsRepo, stepExecutionsRepo, tasksRepo } from './db/repositories/index.js';
import {
  claimNextPlaybook,
  heartbeatLease,
  releaseLease,
  removeWorkerHeartbeat,
  takeCrashRequest,
  testOrgIds,
  workerHeartbeat,
} from './db/repositories/worker.js';
import { logEvent, workerActor } from './services/events.js';
import { PLAYBOOK_STEPS, STEP_FNS } from './services/playbook.js';
import { EmbeddingError } from './services/embeddings.js';

const WORKER_ID = process.env.WORKER_ID || `worker-${randomBytes(2).toString('hex')}`;
const ONLY_ORG = process.env.WORKER_ORG_ID && ObjectId.isValid(process.env.WORKER_ORG_ID) ? new ObjectId(process.env.WORKER_ORG_ID) : undefined;
const LEASE_MS = config.LEASE_MS;
const STEP_DELAY_MS = config.DEMO_STEP_DELAY_MS;
const POLL_MS = 1000;
const CRASH_REQUEST_MAX_AGE_MS = 120_000;
/** A task that has been claimed this many times (crashes, retries) is failed instead of looping forever. */
const MAX_ATTEMPTS = 5;

/** Errors worth retrying on another attempt rather than failing the task. */
function isTransient(err: unknown): boolean {
  if (err instanceof EmbeddingError) return err.retriable;
  if (err instanceof MongoNetworkError || err instanceof MongoServerSelectionError) return true;
  if (err instanceof MongoError) {
    return ['TransientTransactionError', 'UnknownTransactionCommitResult', 'RetryableWriteError'].some((l) => err.hasErrorLabel(l));
  }
  return false;
}

const actor = workerActor(WORKER_ID);
const log = (msg: string) => console.log(`${new Date().toISOString()} [${WORKER_ID}] ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stopping = false;
let currentTask: TaskDoc | null = null;

class LeaseLost extends Error {}

async function runTask(task: TaskDoc) {
  const orgId = task.orgId;
  let leaseLost = false;
  const beat = setInterval(() => {
    heartbeatLease(task._id, WORKER_ID, LEASE_MS)
      .then((ok) => {
        if (!ok) leaseLost = true;
      })
      .catch(() => {});
  }, Math.max(500, Math.floor(LEASE_MS / 3)));

  try {
    // Checkpoints are the source of truth: resume at max(stepIndex) + 1.
    const checkpoints = await checkpointsRepo.find(orgId, { taskId: task._id }, { sort: { stepIndex: 1 } });
    const previous: Record<number, Record<string, unknown>> = {};
    for (const c of checkpoints) previous[c.stepIndex] = c.output;
    const startAt = checkpoints.length ? Math.max(...checkpoints.map((c) => c.stepIndex)) + 1 : 0;

    if (task.attempt > 1) {
      const last = checkpoints[checkpoints.length - 1];
      log(`resuming task ${task._id} at step ${startAt + 1} (attempt ${task.attempt}; ${checkpoints.length} checkpoint(s) restored)`);
      await logEvent(orgId, {
        type: 'task.resumed',
        status: 'warning',
        actor,
        summary: `Resumed from step ${startAt + 1} by ${WORKER_ID} (attempt ${task.attempt})`,
        agentId: task.agentId,
        taskId: task._id,
        details: { fromStep: startAt, attempt: task.attempt, previousWorkerId: last?.workerId ?? null, restoredCheckpoints: checkpoints.length },
      });
    } else {
      log(`claimed task ${task._id}`);
      await logEvent(orgId, { type: 'task.started', actor, summary: `Playbook started by ${WORKER_ID}`, agentId: task.agentId, taskId: task._id });
    }
    // Steps already checkpointed are marked completed (they are never re-executed).
    if (startAt > 0) {
      await tasksRepo.updateMany(orgId, { _id: task._id, workerId: WORKER_ID }, {
        $set: Object.fromEntries([...Array(startAt).keys()].map((i) => [`steps.${i}.status`, 'completed'])),
      });
    }

    for (let i = startAt; i < PLAYBOOK_STEPS.length; i++) {
      if (leaseLost) throw new LeaseLost();
      const started = await tasksRepo.updateMany(orgId, { _id: task._id, workerId: WORKER_ID }, { $set: { [`steps.${i}.status`]: 'running', currentStep: i } });
      if (started.matchedCount !== 1) throw new LeaseLost();
      // Execution record: lets tests prove completed steps never run twice.
      await stepExecutionsRepo.insertOne(orgId, { taskId: task._id, stepIndex: i, workerId: WORKER_ID, attempt: task.attempt });
      log(`step ${i + 1}/${PLAYBOOK_STEPS.length} ${PLAYBOOK_STEPS[i]}…`);

      const idempotencyKey = `${task._id.toHexString()}:${i}`;
      const output = await STEP_FNS[i]!({ task, previous, idempotencyKey, workerId: WORKER_ID });
      if (STEP_DELAY_MS > 0) await sleep(STEP_DELAY_MS);

      // Commit: checkpoint + advance, atomically, only while we own the lease.
      const session = (await getClient()).startSession();
      try {
        await session.withTransaction(async () => {
          await checkpointsRepo.insertOne(
            orgId,
            { taskId: task._id, stepIndex: i, stepName: PLAYBOOK_STEPS[i]!, output, idempotencyKey, workerId: WORKER_ID, attempt: task.attempt },
            session,
          );
          const res = await tasksRepo.updateMany(
            orgId,
            { _id: task._id, workerId: WORKER_ID, currentStep: i },
            { $set: { currentStep: i + 1, [`steps.${i}.status`]: 'completed' } },
            session,
          );
          if (res.matchedCount !== 1) throw new LeaseLost();
        });
      } catch (err) {
        if (err instanceof LeaseLost) throw err;
        if (err instanceof MongoServerError && err.code === 11000) {
          // Another worker already committed this step: our lease is gone.
          throw new LeaseLost();
        }
        throw err;
      } finally {
        await session.endSession();
      }
      previous[i] = output;
      log(`step ${i + 1} checkpointed`);

      if (i < PLAYBOOK_STEPS.length - 1) {
        // DEMO_MODE: a requested crash is a real process exit between steps.
        if (config.DEMO_MODE) {
          const crash = await takeCrashRequest(orgId);
          if (crash?.requestedAt && Date.now() - crash.requestedAt.getTime() < CRASH_REQUEST_MAX_AGE_MS) {
            log(`crash requested: exiting with code 1 after step ${i + 1} (lease not released)`);
            await logEvent(orgId, {
              type: 'worker.crashed',
              status: 'error',
              actor,
              summary: `${WORKER_ID} crashed after step ${i + 1} (process.exit(1), lease left to expire)`,
              agentId: task.agentId,
              taskId: task._id,
              details: { afterStep: i, leaseMs: LEASE_MS },
            });
            process.exit(1);
          }
        }
        if (stopping) {
          await releaseLease(task._id, WORKER_ID);
          log(`stopping after step ${i + 1}: lease released`);
          await logEvent(orgId, { type: 'task.released', status: 'warning', actor, summary: `${WORKER_ID} stopped gracefully after step ${i + 1}`, taskId: task._id, agentId: task.agentId });
          return;
        }
      }
    }

    const summary = String(previous[4]?.summary ?? '');
    const memoryIds = ((previous[1]?.results ?? []) as { memoryId: string }[]).map((r) => new ObjectId(r.memoryId));
    const done = await tasksRepo.updateMany(
      orgId,
      { _id: task._id, workerId: WORKER_ID },
      { $set: { status: 'completed', output: { summary, procedure: previous[2]?.procedure ?? null, remediation: previous[3]?.text ?? '' }, memoryIds, leaseExpiresAt: null, completedAt: new Date() } },
    );
    if (done.matchedCount !== 1) throw new LeaseLost();
    log(`task ${task._id} completed`);
    await logEvent(orgId, { type: 'task.completed', status: 'success', actor, summary: `Playbook completed by ${WORKER_ID}`, agentId: task.agentId, taskId: task._id, details: { attempt: task.attempt } });
  } catch (err) {
    if (err instanceof LeaseLost) {
      log(`lease lost on task ${task._id}; stopping work on it`);
      await logEvent(orgId, { type: 'task.lease_lost', status: 'warning', actor, summary: `${WORKER_ID} lost the lease and stopped`, taskId: task._id, agentId: task.agentId });
      return;
    }
    const message = scrubSecrets(err instanceof Error ? err.message : 'Step failed').slice(0, 300);
    try {
      if (isTransient(err) && task.attempt < MAX_ATTEMPTS) {
        // Give the task back: the next claim resumes from the last committed checkpoint.
        log(`task ${task._id} hit a transient error, releasing for retry: ${message}`);
        await releaseLease(task._id, WORKER_ID);
        await logEvent(orgId, { type: 'task.retry', status: 'warning', actor, summary: `Transient error; task released for another attempt (${task.attempt}/${MAX_ATTEMPTS})`, taskId: task._id, agentId: task.agentId });
        return;
      }
      log(`task ${task._id} failed: ${message}`);
      await tasksRepo.updateMany(orgId, { _id: task._id, workerId: WORKER_ID }, { $set: { status: 'failed', error: 'A step failed. See the worker log for details.', leaseExpiresAt: null } });
      await logEvent(orgId, { type: 'task.failed', status: 'error', actor, summary: 'Playbook failed: a step raised an error', taskId: task._id, agentId: task.agentId });
    } catch (inner) {
      // The database is unavailable too: leave the lease to expire so another attempt picks it up.
      log(`could not record the failure of task ${task._id}: ${describeMongoError(inner)}`);
    }
  } finally {
    clearInterval(beat);
  }
}

async function main() {
  await ensureRegularIndexes();
  log(`started (lease ${LEASE_MS} ms, step delay ${STEP_DELAY_MS} ms${ONLY_ORG ? `, org ${ONLY_ORG.toHexString()} only` : ''})`);
  let excludeOrgIds: ObjectId[] = [];
  let excludeRefreshedAt = 0;
  let lastBeat = 0;
  let backoff = POLL_MS;
  while (!stopping) {
    try {
      if (Date.now() - lastBeat > 2000) {
        await workerHeartbeat(WORKER_ID, null).catch(() => {});
        lastBeat = Date.now();
      }
      // A general worker never touches integration-test tenants (refreshed: tests create them later).
      if (!ONLY_ORG && Date.now() - excludeRefreshedAt > 60_000) {
        excludeOrgIds = await testOrgIds();
        excludeRefreshedAt = Date.now();
      }
      if (stopping) break;
      const task = await claimNextPlaybook(WORKER_ID, LEASE_MS, { onlyOrgId: ONLY_ORG, excludeOrgIds });
      backoff = POLL_MS;
      if (!task) {
        await sleep(POLL_MS);
        continue;
      }
      if (task.attempt > MAX_ATTEMPTS) {
        await tasksRepo.updateMany(task.orgId, { _id: task._id, workerId: WORKER_ID }, {
          $set: { status: 'failed', error: `Gave up after ${MAX_ATTEMPTS} attempts.`, leaseExpiresAt: null },
        });
        await logEvent(task.orgId, { type: 'task.failed', status: 'error', actor, summary: `Playbook failed after ${MAX_ATTEMPTS} attempts`, taskId: task._id, agentId: task.agentId });
        continue;
      }
      currentTask = task;
      await workerHeartbeat(WORKER_ID, task._id).catch(() => {});
      await runTask(task);
    } catch (err) {
      // Transient database trouble must not kill the worker: back off and keep polling.
      log(`poll error, retrying in ${backoff} ms: ${describeMongoError(err)}`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    } finally {
      currentTask = null;
    }
  }
  // Shutdown is owned here, after the loop: no claim can start once `stopping` is set.
  await removeWorkerHeartbeat(WORKER_ID).catch(() => {});
  await closeMongo();
  log('stopped');
  process.exit(0);
}

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  // runTask checks `stopping` after each committed step and releases the lease; idle polling exits within POLL_MS.
  log(`${signal} received${currentTask ? ': finishing the current step' : ''}`);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch(async (err) => {
  console.error(`[${WORKER_ID}] fatal: ${describeMongoError(err)}`);
  await closeMongo().catch(() => {});
  process.exit(1);
});
