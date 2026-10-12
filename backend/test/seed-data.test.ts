import { describe, expect, it } from 'vitest';
import { SEED_AGENTS, SEED_MEMORIES, SEED_OUTCOMES } from '../src/scripts/seed-data.js';

describe('seed data integrity', () => {
  const keys = new Set(SEED_MEMORIES.map((m) => m.key));

  it('has unique memory and outcome keys', () => {
    expect(keys.size).toBe(SEED_MEMORIES.length);
    expect(new Set(SEED_OUTCOMES.map((o) => o.key)).size).toBe(SEED_OUTCOMES.length);
  });

  it('only links to memories and agents that exist', () => {
    for (const m of SEED_MEMORIES) {
      expect(SEED_AGENTS[m.agent], m.key).toBeDefined();
      for (const r of m.relations ?? []) expect(keys.has(r.to), `${m.key} → ${r.to}`).toBe(true);
    }
    for (const o of SEED_OUTCOMES) {
      for (const c of o.cited) expect(keys.has(c), `${o.key} cites ${c}`).toBe(true);
      if (o.createdMemory) expect(keys.has(o.createdMemory), `${o.key} creates ${o.createdMemory}`).toBe(true);
    }
  });

  it('backs every verified memory with a matching outcome (the contextual policy needs its question)', () => {
    for (const m of SEED_MEMORIES.filter((x) => x.verification)) {
      const want = m.verification === 'verified_success' ? 'worked' : 'failed';
      const backed = SEED_OUTCOMES.some(
        (o) => o.result === want && (o.createdMemory === m.key || (m.type === 'procedural' && o.cited.includes(m.key))),
      );
      expect(backed, `${m.key} (${m.verification}) has no ${want} outcome`).toBe(true);
    }
  });
});
