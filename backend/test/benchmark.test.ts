import { describe, expect, it } from 'vitest';
import { BENCHMARK_QUERIES } from '../src/eval/benchmark-set.js';
import { meanMetrics, percentile, scoreQuery } from '../src/eval/metrics.js';
import { SEED_MEMORIES } from '../src/scripts/seed-data.js';

describe('benchmark metrics', () => {
  it('scores a perfect ranking as 1 on every metric', () => {
    const m = scoreQuery([3, 1, 1, 0, 0], [3, 1, 1]);
    expect(m).toEqual({ hitAt1: 1, mrrAt10: 1, recallAt5: 1, ndcgAt5: 1, firstAnswerRank: 1 });
  });

  it('uses the first grade-3 item for MRR and Hit@1', () => {
    const m = scoreQuery([1, 0, 3], [3, 1]);
    expect(m.hitAt1).toBe(0);
    expect(m.firstAnswerRank).toBe(3);
    expect(m.mrrAt10).toBeCloseTo(1 / 3);
    expect(m.recallAt5).toBe(1);
  });

  it('computes graded nDCG@5 with 2^g − 1 gains', () => {
    // DCG = 1/log2(2) + 7/log2(3); IDCG = 7/log2(2) + 1/log2(3)
    const expected = (1 + 7 / Math.log2(3)) / (7 + 1 / Math.log2(3));
    expect(scoreQuery([1, 3], [3, 1]).ndcgAt5).toBeCloseTo(expected, 10);
  });

  it('gives zero when nothing relevant is returned, and ignores ranks past 10 for MRR', () => {
    const ranking = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3];
    const m = scoreQuery(ranking, [3]);
    expect(m).toMatchObject({ hitAt1: 0, mrrAt10: 0, recallAt5: 0, ndcgAt5: 0, firstAnswerRank: 11 });
  });

  it('macro-averages and computes nearest-rank percentiles', () => {
    expect(meanMetrics([
      { hitAt1: 1, mrrAt10: 1, recallAt5: 1, ndcgAt5: 1 },
      { hitAt1: 0, mrrAt10: 0.5, recallAt5: 0.5, ndcgAt5: 0 },
    ])).toEqual({ hitAt1: 0.5, mrrAt10: 0.75, recallAt5: 0.75, ndcgAt5: 0.5 });
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
  });
});

describe('benchmark set', () => {
  const seedKeys = new Set(SEED_MEMORIES.map((m) => m.key));

  it('only labels memories that exist in the seed', () => {
    const unknown = BENCHMARK_QUERIES.flatMap((q) => Object.keys(q.relevant)).filter((k) => !seedKeys.has(k));
    expect(unknown).toEqual([]);
  });

  it('gives every query at least one direct answer and unique ids', () => {
    for (const q of BENCHMARK_QUERIES) expect(Object.values(q.relevant)).toContain(3);
    expect(new Set(BENCHMARK_QUERIES.map((q) => q.id)).size).toBe(BENCHMARK_QUERIES.length);
  });
});
