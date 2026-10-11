import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ObjectId } from 'mongodb';
import { closeMongo } from '../src/db/client.js';
import { createAgent } from '../src/services/agents.js';
import { createMemory } from '../src/services/memories.js';
import { systemActor } from '../src/services/events.js';
import { isVoyageConfigured } from '../src/services/embeddings.js';
import { indexAvailability, search, type SearchOptions } from '../src/services/search.js';
import { searchability } from '../src/services/memory-insights.js';
import { retrievalLogsRepo } from '../src/db/repositories/index.js';
import { announceSkip, atlasAvailability, cleanTestOrgs, testOrgs } from './helpers.js';

const atlas = await atlasAvailability();
const indexes = atlas.ok ? await indexAvailability(true) : null;
const reason = !atlas.ok
  ? atlas.reason
  : !indexes?.search || !indexes.vector
    ? 'search/vector indexes not queryable (run npm run setup:indexes -w backend)'
    : !isVoyageConfigured()
      ? 'VOYAGE_API_KEY is not set'
      : '';
if (reason) announceSkip('search.integration.test.ts', reason);

const QUERY = 'Our API started timing out after a database connection pool change. How did we resolve a similar issue before?';

describe.skipIf(Boolean(reason))('search modes against Atlas (__test__ org)', () => {
  let org: ObjectId;
  let other: ObjectId;
  const ids: Record<string, string> = {};
  const opts = (o: Partial<SearchOptions> = {}): SearchOptions => ({ query: QUERY, filters: {}, limit: 10, applyOutcomePolicy: true, ...o });

  beforeAll(async () => {
    ({ a: org, b: other } = await testOrgs());
    await cleanTestOrgs(org, other);
    const agent = await createAgent(org, { name: 'Test engineering agent' }, systemActor);
    const mk = async (key: string, title: string, content: string, type: 'episodic' | 'procedural' | 'semantic', verified = false) => {
      const m = await createMemory(
        org,
        { agentId: agent._id.toHexString(), title, content, type, tags: ['test'] },
        systemActor,
        verified ? { verification: { status: 'verified_success', outcomeIds: [], verifiedAt: new Date() } } : {},
      );
      expect(m.embeddingStatus).toBe('ready');
      ids[key] = m._id.toHexString();
    };
    await mk('incident', 'API timed out after connection pool change', 'After lowering maxPoolSize to 10 the API returned 504s and logs showed Timed out while checking out a connection from connection pool.', 'episodic');
    await mk('fix', 'Fix connection pool exhaustion', 'Raise maxPoolSize, set minPoolSize, raise waitQueueTimeoutMS, close cursors, alert on pool checkout failures.', 'procedural', true);
    await mk('hung', 'Billing service hung under load after a driver config tweak', 'Requests piled up waiting on the data layer after the database client settings were trimmed; reverting fixed it.', 'episodic');
    await mk('unrelated', 'Quarterly offsite catering order', 'Ordered sandwiches and salads for forty people.', 'semantic');
    // A memory in another tenant that must never appear.
    const otherAgent = await createAgent(other, { name: 'Other tenant agent' }, systemActor);
    await createMemory(other, { agentId: otherAgent._id.toHexString(), title: 'API timed out after connection pool change (other org)', content: 'pool timeout', type: 'episodic', tags: [] }, systemActor);

    // Atlas indexing is near-real-time: poll until every test memory is retrievable (no fixed sleep).
    const deadline = Date.now() + 120_000;
    for (;;) {
      const states = await Promise.all(Object.values(ids).map((id) => searchability(org, id)));
      if (states.every((s) => s.searchable)) break;
      if (Date.now() > deadline) throw new Error(`Memories not searchable within 120 s: ${JSON.stringify(states.map((s) => s.detail))}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  });

  afterAll(async () => {
    if (org && other) await cleanTestOrgs(org, other);
    await closeMongo();
  });

  it('keyword (Atlas Search) returns the pool-timeout memories', async () => {
    const r = await search(org, 'keyword', opts(), systemActor, null);
    expect(r.engine).toBe('atlas_search');
    const top = r.results.slice(0, 2).map((x) => x.memory.id);
    expect(top).toContain(ids.incident);
    expect(r.results.every((x) => x.scoreKind === 'search')).toBe(true);
    expect(r.results.map((x) => x.memory.id)).not.toContain(ids.unrelated);
    expect(r.logId).toBeTruthy();
  });

  it('semantic (Vector Search) returns the pool-timeout memories and the paraphrased one', async () => {
    const r = await search(org, 'semantic', opts(), systemActor, null);
    expect(r.engine).toBe('atlas_vector_search');
    const ranked = r.results.map((x) => x.memory.id);
    expect(ranked.slice(0, 3)).toContain(ids.incident);
    expect(ranked).toContain(ids.hung);
    expect(ranked.indexOf(ids.unrelated!)).toBeGreaterThan(ranked.indexOf(ids.incident!));
    expect(r.latencyMs.embed).toBeDefined();
  });

  it('hybrid fuses both with RRF and the outcome policy lifts the verified fix', async () => {
    const on = await search(org, 'hybrid', opts(), systemActor, null);
    const off = await search(org, 'hybrid', opts({ applyOutcomePolicy: false }), systemActor, null);
    expect(on.engine).toBe('rrf');
    expect(on.components?.keyword.engine).toBe('atlas_search');
    expect(on.components?.semantic.engine).toBe('atlas_vector_search');
    const fixOn = on.results.find((x) => x.memory.id === ids.fix)!;
    const fixOff = off.results.find((x) => x.memory.id === ids.fix)!;
    expect(fixOn.policyMultiplier).toBeCloseTo(1.15);
    expect(fixOn.final).toBeCloseTo(fixOn.rrf! * 1.15, 10);
    expect(fixOff.final).toBe(fixOff.rrf);
    expect(fixOn.rank).toBeLessThanOrEqual(fixOff.rank);
    for (const x of on.results) {
      const expected = x.sources.reduce((s, src) => s + 1 / (60 + src.rank), 0);
      expect(x.rrf).toBeCloseTo(expected, 12);
    }
  });

  it('concurrent runs of one worker step log the retrieval exactly once', async () => {
    const idempotencyKey = `test-${Date.now()}:1`;
    const [a, b] = await Promise.all([
      search(org, 'hybrid', opts({ idempotencyKey }), systemActor, null),
      search(org, 'hybrid', opts({ idempotencyKey }), systemActor, null),
    ]);
    expect(a.logId).toBe(b.logId);
    expect(await retrievalLogsRepo.count(org, { idempotencyKey })).toBe(1);
  });

  it('never returns another tenant’s memories', async () => {
    for (const mode of ['keyword', 'semantic', 'hybrid'] as const) {
      const r = await search(org, mode, opts(), systemActor, null);
      expect(r.results.every((x) => x.memory.orgId === org.toHexString())).toBe(true);
    }
  });

  it('labels the keyword fallback when the search index is missing', async () => {
    const r = await search(org, 'keyword', opts({ indexNames: { search: 'does_not_exist_test_index' } }), systemActor, null);
    expect(r.engine).toBe('fallback_regex');
    expect(r.warnings.join(' ')).toMatch(/Fallback — not Atlas Search/);
    expect(r.results.every((x) => x.scoreKind === 'regex')).toBe(true);
    expect(r.results.map((x) => x.memory.id)).toContain(ids.incident);
  });

  it('reports semantic as unavailable (and hybrid as degraded) when the vector index is missing', async () => {
    const r = await search(org, 'hybrid', opts({ indexNames: { vector: 'does_not_exist_test_vector' } }), systemActor, null);
    expect(r.components?.semantic.engine).toBe('unavailable');
    expect(r.warnings.join(' ')).toMatch(/Hybrid degraded to keyword-only/);
    expect(r.results.every((x) => x.sources.every((s) => s.mode === 'keyword'))).toBe(true);
  });
});
