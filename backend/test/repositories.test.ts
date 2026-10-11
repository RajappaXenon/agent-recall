import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { agentsRepo, memoriesRepo } from '../src/db/repositories/index.js';
import { closeMongo } from '../src/db/client.js';
import { createMemory, listMemories } from '../src/services/memories.js';
import { createAgent } from '../src/services/agents.js';
import { systemActor } from '../src/services/events.js';
import { announceSkip, atlasAvailability, cleanTestOrgs, testOrgs } from './helpers.js';

const atlas = await atlasAvailability();
if (!atlas.ok) announceSkip('repositories.test.ts', atlas.reason);

describe.skipIf(!atlas.ok)('orgId-scoped repositories (Atlas, __test__ orgs)', () => {
  let a: ObjectId;
  let b: ObjectId;
  let memA: ObjectId;
  let agentA: ObjectId;

  beforeAll(async () => {
    ({ a, b } = await testOrgs());
    await cleanTestOrgs(a, b);
    agentA = (await createAgent(a, { name: 'Tenant A agent' }, systemActor))._id;
    await createAgent(b, { name: 'Tenant B agent' }, systemActor);
    memA = (
      await createMemory(a, { agentId: agentA.toHexString(), title: 'Tenant A secret', content: 'only for org A', type: 'semantic', tags: [] }, systemActor, {}, { embed: false })
    )._id;
  });

  afterAll(async () => {
    if (a && b) await cleanTestOrgs(a, b);
    await closeMongo();
  });

  it('reads a document only from its own org', async () => {
    expect(await memoriesRepo.findById(a, memA)).not.toBeNull();
    expect(await memoriesRepo.findById(b, memA)).toBeNull();
    expect(await memoriesRepo.findByIds(b, [memA])).toHaveLength(0);
  });

  it('lists and counts only the caller org', async () => {
    const listB = await listMemories(b, { page: 1, pageSize: 50, sort: 'newest' });
    expect(listB.items.map((m) => String(m._id))).not.toContain(String(memA));
    expect(await memoriesRepo.count(b, { _id: memA })).toBe(0);
  });

  it('cannot update or delete another org’s document', async () => {
    expect(await memoriesRepo.updateById(b, memA, { $set: { title: 'hijacked' } })).toBeNull();
    expect(await memoriesRepo.deleteMany(b, { _id: memA })).toBe(0);
    expect((await memoriesRepo.findById(a, memA))?.title).toBe('Tenant A secret');
  });

  it('aggregations start with the tenant $match', async () => {
    const rows = await memoriesRepo.aggregate<{ _id: ObjectId }>(b, [{ $match: { _id: memA } }]);
    expect(rows).toHaveLength(0);
  });

  it('rejects creating a memory for an agent in another org', async () => {
    await expect(
      createMemory(b, { agentId: agentA.toHexString(), title: 'x', content: 'y', type: 'semantic', tags: [] }, systemActor, {}, { embed: false }),
    ).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND' });
  });

  it('refuses a repository call without an orgId', async () => {
    await expect(agentsRepo.find(undefined as unknown as ObjectId)).rejects.toMatchObject({ code: 'ORG_SCOPE_MISSING' });
  });
});
