import { describe, expect, it } from 'vitest';
import type { VerificationStatus } from '@agent-recall/shared';
import { applyOutcomePolicy, CONTEXT_HIGH, CONTEXT_LOW, contextWeight, cosine, POLICY_WEIGHT, reciprocalRankFusion, RRF_K, type RankedList } from '../src/services/rrf.js';

const kw = (ids: string[], scores?: number[]): RankedList => ({ mode: 'keyword', items: ids.map((id, i) => ({ id, score: scores?.[i] ?? 10 - i })) });
const sem = (ids: string[], scores?: number[]): RankedList => ({ mode: 'semantic', items: ids.map((id, i) => ({ id, score: scores?.[i] ?? 0.9 - i / 100 })) });

describe('reciprocalRankFusion', () => {
  it('computes Σ 1/(60 + rank) with ranks starting at 1', () => {
    const fused = reciprocalRankFusion([kw(['a', 'b']), sem(['b', 'a'])]);
    const a = fused.find((f) => f.id === 'a')!;
    expect(a.rrf).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 12);
    expect(RRF_K).toBe(60);
  });

  it('deduplicates by id across modes and within a list', () => {
    const fused = reciprocalRankFusion([kw(['a', 'a', 'b']), sem(['a', 'c'])]);
    expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c']);
    const a = fused.find((f) => f.id === 'a')!;
    expect(a.sources).toEqual([
      { mode: 'keyword', rank: 1, score: 10 },
      { mode: 'semantic', rank: 1, score: 0.9 },
    ]);
    // duplicate inside the keyword list does not consume a rank: b is rank 2
    expect(fused.find((f) => f.id === 'b')!.sources[0]!.rank).toBe(2);
  });

  it('keeps per-mode ranks and raw scores in sources', () => {
    const fused = reciprocalRankFusion([kw(['x', 'y'], [7.31, 5.12]), sem(['y'], [0.842])]);
    const y = fused.find((f) => f.id === 'y')!;
    expect(y.sources).toEqual([
      { mode: 'keyword', rank: 2, score: 5.12 },
      { mode: 'semantic', rank: 1, score: 0.842 },
    ]);
  });

  it('never mixes raw scores: rescaling one mode’s scores does not change the fusion', () => {
    const base = reciprocalRankFusion([kw(['a', 'b', 'c'], [3, 2, 1]), sem(['c', 'a'], [0.9, 0.8])]);
    const scaled = reciprocalRankFusion([kw(['a', 'b', 'c'], [3000, 2000, 1000]), sem(['c', 'a'], [0.0009, 0.0008])]);
    expect(scaled.map((f) => [f.id, f.rrf])).toEqual(base.map((f) => [f.id, f.rrf]));
  });

  it('a memory found by both modes outranks one found by only one at a better rank', () => {
    const fused = reciprocalRankFusion([kw(['only-kw', 'both']), sem(['only-sem', 'both'])]);
    expect(fused[0]!.id).toBe('both');
    expect(fused[0]!.sources).toHaveLength(2);
  });

  it('is deterministic on ties (id order)', () => {
    const fused = reciprocalRankFusion([kw(['b']), sem(['a'])]);
    expect(fused.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('handles an empty list (degraded mode)', () => {
    const fused = reciprocalRankFusion([kw(['a', 'b']), sem([])]);
    expect(fused.map((f) => f.id)).toEqual(['a', 'b']);
    expect(fused[0]!.sources).toHaveLength(1);
  });
});

describe('applyOutcomePolicy', () => {
  const fused = reciprocalRankFusion([kw(['u', 'v', 'f']), sem(['u', 'v', 'f'])]);
  const status = (id: string): VerificationStatus => (id === 'v' ? 'verified_success' : id === 'u' ? 'verified_failure' : 'unverified');

  it('final = rrf × (1 + 0.15·s)', () => {
    const out = applyOutcomePolicy(fused, status, true);
    const v = out.find((r) => r.id === 'v')!;
    const u = out.find((r) => r.id === 'u')!;
    const f = out.find((r) => r.id === 'f')!;
    expect(POLICY_WEIGHT).toBe(0.15);
    expect(v.multiplier).toBeCloseTo(1.15);
    expect(v.final).toBeCloseTo(v.rrf * 1.15, 12);
    expect(u.multiplier).toBeCloseTo(0.85);
    expect(f.multiplier).toBe(1);
    expect(f.final).toBe(f.rrf);
  });

  it('re-ranks by final and records the pre-policy rank', () => {
    const out = applyOutcomePolicy(fused, status, true);
    // rrf: u=2/61, v=2/62, f=2/63 → final: v=0.0371, f=0.0317, u=0.0279 (failure demoted below unverified)
    expect(out.map((r) => r.id)).toEqual(['v', 'f', 'u']);
    expect(out.find((r) => r.id === 'v')!.rankBeforePolicy).toBe(2);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('is a no-op when disabled', () => {
    const out = applyOutcomePolicy(fused, status, false);
    expect(out.map((r) => r.id)).toEqual(fused.map((f) => f.id));
    expect(out.every((r) => r.multiplier === 1 && r.final === r.rrf)).toBe(true);
  });
});

describe('contextual outcome policy', () => {
  const fused = reciprocalRankFusion([kw(['u', 'v', 'f']), sem(['u', 'v', 'f'])]);
  const status = (id: string): VerificationStatus => (id === 'v' ? 'verified_success' : id === 'u' ? 'verified_failure' : 'unverified');

  it('maps similarity to a 0–1 weight between the calibrated thresholds', () => {
    expect(contextWeight(CONTEXT_LOW - 0.1)).toBe(0);
    expect(contextWeight(CONTEXT_LOW)).toBe(0);
    expect(contextWeight((CONTEXT_LOW + CONTEXT_HIGH) / 2)).toBeCloseTo(0.5, 10);
    expect(contextWeight(CONTEXT_HIGH)).toBe(1);
    expect(contextWeight(0.99)).toBe(1);
  });

  it('final = rrf × (1 + 0.15·s·context)', () => {
    const out = applyOutcomePolicy(fused, status, true, (id) => (id === 'v' ? 0.5 : id === 'u' ? 1 : 0));
    const v = out.find((r) => r.id === 'v')!;
    expect(v.context).toBe(0.5);
    expect(v.multiplier).toBeCloseTo(1 + POLICY_WEIGHT * 0.5, 12);
    expect(out.find((r) => r.id === 'u')!.multiplier).toBeCloseTo(0.85, 12);
  });

  it('applies no outcome signal to a different question (context 0)', () => {
    const out = applyOutcomePolicy(fused, status, true, () => 0);
    expect(out.every((r) => r.multiplier === 1)).toBe(true);
    expect(out.map((r) => r.id)).toEqual(fused.map((f) => f.id));
  });

  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 12);
    expect(cosine([1, 1], [2, 2])).toBeCloseTo(1, 12);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});
