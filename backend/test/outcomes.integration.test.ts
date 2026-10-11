import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ObjectId } from 'mongodb';
import { closeMongo } from '../src/db/client.js';
import { memoriesRepo, outcomesRepo, tasksRepo } from '../src/db/repositories/index.js';
import { createAgent } from '../src/services/agents.js';
import { createAnswer } from '../src/services/answers.js';
import { createMemory } from '../src/services/memories.js';
import { recordOutcome } from '../src/services/outcomes.js';
import { systemActor } from '../src/services/events.js';
import { announceSkip, atlasAvailability, cleanTestOrgs, testOrgs } from './helpers.js';

const atlas = await atlasAvailability();
if (!atlas.ok) announceSkip('outcomes.integration.test.ts', atlas.reason);

describe.skipIf(!atlas.ok)('outcome verification rules (__test__ org)', () => {
  let org: ObjectId;
  let other: ObjectId;
  let user: ObjectId;
  let agentId: string;

  const proc = async (title: string, verified = false) =>
    String(
      (
        await createMemory(
          org,
          { agentId, title, content: `${title}: step one, step two.`, type: 'procedural', tags: [] },
          systemActor,
          verified ? { verification: { status: 'verified_success', outcomeIds: [], verifiedAt: new Date() } } : {},
          { embed: false },
        )
      )._id,
    );

  // Template answers (no LLM call) cite every grounding memory, which makes the rules deterministic to test.
  const answer = async (ids: string[]) => (await createAnswer(org, { agentId, query: 'How do we fix X?', memoryIds: ids }, systemActor)).taskId;

  beforeAll(async () => {
    ({ a: org, b: other, userA: user } = await testOrgs());
    await cleanTestOrgs(org, other);
    agentId = String((await createAgent(org, { name: 'Outcome test agent' }, systemActor))._id);
  });

  afterAll(async () => {
    if (org && other) await cleanTestOrgs(org, other);
    await closeMongo();
  });

  it('worked: cited procedural memory becomes verified_success, usefulness and provenance recorded', async () => {
    const p = await proc('Unverified fix A');
    const taskId = await answer([p]);
    const res = await recordOutcome(org, user, taskId, { result: 'worked', feedback: 'helpful', notes: 'ok' }, systemActor);
    const after = (await memoriesRepo.findById(org, p))!;
    expect(after.verification.status).toBe('verified_success');
    expect(after.verification.outcomeIds.map(String)).toContain(res.outcomeId);
    expect(after.usefulness.helpful).toBe(1);
    expect(res.createdMemory.type).toBe('episodic');
    expect(res.createdMemory.provenance).toMatchObject({ kind: 'outcome', outcomeId: res.outcomeId, citedMemoryIds: [p] });
    expect(res.createdMemory.sourceTaskId).toBe(taskId);
    expect(res.createdMemory.title.startsWith('Resolved:')).toBe(true);
  });

  it('failed on an unverified procedure marks it verified_failure', async () => {
    const p = await proc('Unverified fix B');
    const res = await recordOutcome(org, user, await answer([p]), { result: 'failed', notes: '' }, systemActor);
    expect((await memoriesRepo.findById(org, p))!.verification.status).toBe('verified_failure');
    expect(res.createdMemory.title.startsWith('Attempted, failed:')).toBe(true);
  });

  it('failed never un-verifies a procedure that was verified successful; the failure is kept as evidence', async () => {
    const p = await proc('Proven fix C', true);
    const res = await recordOutcome(org, user, await answer([p]), { result: 'failed', feedback: 'not_helpful', notes: '' }, systemActor);
    const after = (await memoriesRepo.findById(org, p))!;
    expect(after.verification.status).toBe('verified_success');
    expect(after.verification.outcomeIds.map(String)).toContain(res.outcomeId);
    expect(after.usefulness.notHelpful).toBe(1);
  });

  it('only procedural memories are verified by an outcome', async () => {
    const semantic = String(
      (await createMemory(org, { agentId, title: 'A fact', content: 'Some fact.', type: 'semantic', tags: [] }, systemActor, {}, { embed: false }))._id,
    );
    await recordOutcome(org, user, await answer([semantic]), { result: 'worked', notes: '' }, systemActor);
    expect((await memoriesRepo.findById(org, semantic))!.verification.status).toBe('unverified');
  });

  it('rejects a second outcome for the same task', async () => {
    const taskId = await answer([await proc('Fix D')]);
    await recordOutcome(org, user, taskId, { result: 'worked', notes: '' }, systemActor);
    await expect(recordOutcome(org, user, taskId, { result: 'failed', notes: '' }, systemActor)).rejects.toMatchObject({ code: 'OUTCOME_EXISTS' });
  });

  it('concurrent worked + failed outcomes never leave a procedure demoted', async () => {
    const p = await proc('Contended fix F');
    const [t1, t2] = [await answer([p]), await answer([p])];
    const results = await Promise.allSettled([
      recordOutcome(org, user, t1, { result: 'worked', notes: '' }, systemActor),
      recordOutcome(org, user, t2, { result: 'failed', notes: '' }, systemActor),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const after = (await memoriesRepo.findById(org, p))!;
    // Whatever the commit order, a success wins and both outcomes are kept as evidence.
    expect(after.verification.status).toBe('verified_success');
    expect(after.verification.outcomeIds).toHaveLength(2);
  });

  it('a retried outcome whose memory was never created is finished, not rejected', async () => {
    const p = await proc('Fix G');
    const taskId = await answer([p]);
    const task = (await tasksRepo.findById(org, taskId))!;
    // Simulate a crash after the transaction committed but before the memory was created.
    await outcomesRepo.insertOne(org, { taskId: task._id, agentId: task.agentId, result: 'worked', feedback: null, notes: '', citedMemoryIds: [], createdMemoryId: null, userId: user });
    const res = await recordOutcome(org, user, taskId, { result: 'worked', notes: '' }, systemActor);
    expect(res.createdMemory.provenance.outcomeId).toBe(res.outcomeId);
    const stored = (await outcomesRepo.find(org, { taskId: task._id }))[0]!;
    expect(String(stored.createdMemoryId)).toBe(res.createdMemory.id);
  });

  it('cannot record an outcome on another tenant’s task', async () => {
    const taskId = await answer([await proc('Fix E')]);
    await expect(recordOutcome(other, user, taskId, { result: 'worked', notes: '' }, systemActor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
