import type { BenchmarkMetrics } from '@agent-recall/shared';

/** Grade of each ranked item (0 = not labelled relevant), best first. */
export type GradedRanking = number[];

const ANSWER = 3;
const gain = (g: number) => 2 ** g - 1;

function dcg(grades: number[]): number {
  return grades.reduce((s, g, i) => s + gain(g) / Math.log2(i + 2), 0);
}

/**
 * Standard IR metrics for one query.
 * @param ranking grades of the returned items in rank order
 * @param labelled grades of every labelled memory for the query (grade ≥ 1)
 */
export function scoreQuery(ranking: GradedRanking, labelled: number[]): BenchmarkMetrics & { firstAnswerRank: number | null } {
  const firstAnswer = ranking.findIndex((g) => g >= ANSWER);
  const firstAnswerRank = firstAnswer === -1 ? null : firstAnswer + 1;
  const ideal = [...labelled].sort((a, b) => b - a).slice(0, 5);
  const idcg = dcg(ideal);
  const relevantInTop5 = ranking.slice(0, 5).filter((g) => g >= 1).length;
  return {
    hitAt1: ranking[0] !== undefined && ranking[0] >= ANSWER ? 1 : 0,
    mrrAt10: firstAnswerRank !== null && firstAnswerRank <= 10 ? 1 / firstAnswerRank : 0,
    recallAt5: labelled.length ? relevantInTop5 / labelled.length : 0,
    ndcgAt5: idcg > 0 ? dcg(ranking.slice(0, 5)) / idcg : 0,
    firstAnswerRank,
  };
}

/** Macro average: every query counts equally. */
export function meanMetrics(all: BenchmarkMetrics[]): BenchmarkMetrics {
  const n = all.length || 1;
  const avg = (k: keyof BenchmarkMetrics) => Math.round((all.reduce((s, m) => s + m[k], 0) / n) * 10_000) / 10_000;
  return { hitAt1: avg('hitAt1'), mrrAt10: avg('mrrAt10'), recallAt5: avg('recallAt5'), ndcgAt5: avg('ndcgAt5') };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]! * 10) / 10;
}
