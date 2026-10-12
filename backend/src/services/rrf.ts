import type { VerificationStatus } from '@agent-recall/shared';

/** RRF constant (Cormack et al. 2009). */
export const RRF_K = 60;
/** Outcome policy strength: final = rrf × (1 + POLICY_WEIGHT · s). See docs/RANKING.md. */
export const POLICY_WEIGHT = 0.15;
/** Recorded on benchmark runs so before/after comparisons name the policy that produced them. */
export const OUTCOME_POLICY_NAME = 'contextual-v1';

/**
 * Contextual outcome policy: an outcome only counts for questions like the one it was recorded on.
 * context = clamp((cos(query, closest outcome question) − LOW) / (HIGH − LOW), 0, 1).
 * Thresholds come from `npm run calibrate -w backend` (src/eval/calibration-pairs.ts, independent of
 * the benchmark) with a fixed rule: LOW = highest cosine of a different-problem pair (0.607),
 * HIGH = median cosine of a same-problem pair (0.706), voyage-3.5 / 1024 dims, query input type.
 */
export const CONTEXT_LOW = 0.61;
export const CONTEXT_HIGH = 0.71;

export function contextWeight(similarity: number): number {
  return Math.min(1, Math.max(0, (similarity - CONTEXT_LOW) / (CONTEXT_HIGH - CONTEXT_LOW)));
}

export type SourceMode = 'keyword' | 'semantic';

export interface RankedList {
  mode: SourceMode;
  /** Ordered best-first; rank = index + 1. Raw scores are carried, never combined. */
  items: { id: string; score: number }[];
}

export interface Fused {
  id: string;
  rrf: number;
  sources: { mode: SourceMode; rank: number; score: number }[];
}

export interface PolicyApplied extends Fused {
  /** 0–1 share of the outcome signal that applied (1 for the non-contextual form). */
  context: number;
  multiplier: number;
  final: number;
  rankBeforePolicy: number;
  rank: number;
}

/**
 * Reciprocal Rank Fusion: rrf(d) = Σ_m 1 / (k + rank_m(d)), rank starting at 1.
 * Deduplicates by id (first occurrence in a list wins). Only ranks contribute;
 * raw scores from different modes are never added together.
 */
export function reciprocalRankFusion(lists: RankedList[], k = RRF_K): Fused[] {
  const byId = new Map<string, Fused>();
  for (const list of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const item of list.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rank += 1;
      const entry = byId.get(item.id) ?? { id: item.id, rrf: 0, sources: [] };
      entry.rrf += 1 / (k + rank);
      entry.sources.push({ mode: list.mode, rank, score: item.score });
      byId.set(item.id, entry);
    }
  }
  return [...byId.values()].sort(compareFused);
}

function bestRank(f: Fused) {
  return Math.min(...f.sources.map((s) => s.rank));
}

/** Deterministic order: higher rrf, then more contributing modes, then better best rank, then id. */
function compareFused(a: Fused, b: Fused) {
  return b.rrf - a.rrf || b.sources.length - a.sources.length || bestRank(a) - bestRank(b) || a.id.localeCompare(b.id);
}

export function policySignal(status: VerificationStatus): -1 | 0 | 1 {
  return status === 'verified_success' ? 1 : status === 'verified_failure' ? -1 : 0;
}

/**
 * Outcome policy: final = rrf × (1 + 0.15·s·c), s = +1 verified success, −1 verified failure, 0 otherwise,
 * c = contextOf(id) in [0, 1] (how close this query is to the questions the outcome was recorded on;
 * omitted ⇒ 1, the original global form). When disabled, final = rrf. Returns items re-ranked by final.
 */
export function applyOutcomePolicy(
  fused: Fused[],
  statusOf: (id: string) => VerificationStatus,
  enabled: boolean,
  contextOf: (id: string) => number = () => 1,
): PolicyApplied[] {
  const withRank = fused.map((f, i) => {
    const s = enabled ? policySignal(statusOf(f.id)) : 0;
    const context = s === 0 ? 0 : contextOf(f.id);
    const multiplier = 1 + POLICY_WEIGHT * s * context;
    return { ...f, context, multiplier, final: f.rrf * multiplier, rankBeforePolicy: i + 1, rank: 0 };
  });
  withRank.sort((a, b) => b.final - a.final || a.rankBeforePolicy - b.rankBeforePolicy);
  withRank.forEach((r, i) => (r.rank = i + 1));
  return withRank;
}

/** Cosine similarity of two equal-length vectors (0 when either is all zeros). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
