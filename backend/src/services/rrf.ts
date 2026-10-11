import type { VerificationStatus } from '@agent-recall/shared';

/** RRF constant (Cormack et al. 2009). */
export const RRF_K = 60;
/** Outcome policy strength: final = rrf × (1 + POLICY_WEIGHT · s). See docs/RANKING.md. */
export const POLICY_WEIGHT = 0.15;

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
 * Outcome policy: final = rrf × (1 + 0.15·s), s = +1 verified success, −1 verified failure, 0 otherwise.
 * When disabled, final = rrf (multiplier 1). Returns items re-ranked by final.
 */
export function applyOutcomePolicy(fused: Fused[], statusOf: (id: string) => VerificationStatus, enabled: boolean): PolicyApplied[] {
  const withRank = fused.map((f, i) => {
    const multiplier = enabled ? 1 + POLICY_WEIGHT * policySignal(statusOf(f.id)) : 1;
    return { ...f, multiplier, final: f.rrf * multiplier, rankBeforePolicy: i + 1, rank: 0 };
  });
  withRank.sort((a, b) => b.final - a.final || a.rankBeforePolicy - b.rankBeforePolicy);
  withRank.forEach((r, i) => (r.rank = i + 1));
  return withRank;
}
