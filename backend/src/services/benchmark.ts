import type { ObjectId } from 'mongodb';
import type { BenchmarkConfig, BenchmarkMetrics, BenchmarkRun, BenchmarkRunSummary, BenchmarkSetResponse, Engine, SearchResult } from '@agent-recall/shared';
import type { BenchmarkRunDoc } from '../db/collections.js';
import { benchmarkRunsRepo, memoriesRepo } from '../db/repositories/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { BENCHMARK_QUERIES, BENCHMARK_VERSION } from '../eval/benchmark-set.js';
import { meanMetrics, percentile, scoreQuery } from '../eval/metrics.js';
import { logEvent, type Actor } from './events.js';
import { runSearch } from './search.js';

export const LABELLING_RULE =
  'Grade 3: the memory that directly answers the question (for "what fixed this" questions, the procedure or resolution that worked; for "should we do X", the memory recording what happened when X was tried, even if it failed). Grade 1: useful supporting context. Everything else: not relevant. Labels were written before the first run and are not tuned to results.';

const CONFIGS: BenchmarkConfig[] = ['keyword', 'semantic', 'hybrid', 'hybrid_policy'];
const running = new Set<string>();

/**
 * Runs every labelled query through the real search pipeline (Atlas Search, Atlas Vector Search,
 * RRF, outcome policy) with no side effects, scores the rankings, and stores the run.
 * Queries run one at a time so the latencies are not inflated by our own concurrency.
 */
export async function runBenchmark(orgId: ObjectId, actor: Actor, userId: ObjectId | null): Promise<BenchmarkRun> {
  const key = orgId.toHexString();
  if (running.has(key)) throw new AppError(409, 'BENCHMARK_RUNNING', 'A benchmark is already running for this workspace. Wait for it to finish.');
  running.add(key);
  try {
    return await execute(orgId, actor, userId);
  } finally {
    running.delete(key);
  }
}

async function execute(orgId: ObjectId, actor: Actor, userId: ObjectId | null): Promise<BenchmarkRun> {
  const started = performance.now();
  const seed = await memoriesRepo.find(orgId, { isSeed: true, archived: false }, { projection: { _id: 1, seedKey: 1, title: 1 } });
  const nonSeedMemories = await memoriesRepo.count(orgId, { isSeed: false, archived: false });
  const keyById = new Map(seed.filter((m) => m.seedKey).map((m) => [m._id.toHexString(), m.seedKey!]));
  const titleByKey = new Map(seed.filter((m) => m.seedKey).map((m) => [m.seedKey!, m.title]));
  const labelledKeys = new Set(BENCHMARK_QUERIES.flatMap((q) => Object.keys(q.relevant)));
  const missingSeedKeys = [...labelledKeys].filter((k) => !titleByKey.has(k));
  if (titleByKey.size === 0) throw new AppError(409, 'NO_SEED_DATA', 'The benchmark runs over the demo seed. Run npm run seed -w backend first.');

  const engines: Record<'keyword' | 'semantic', Engine> = { keyword: 'atlas_search', semantic: 'atlas_vector_search' };
  const warnings = new Set<string>();
  const latencies = { keyword: [] as number[], semantic: [] as number[], hybrid: [] as number[] };
  const queries: BenchmarkRunDoc['queries'] = [];

  for (const q of BENCHMARK_QUERIES) {
    const opts = { query: q.query, filters: {}, limit: 10 };
    const off = await runSearch(orgId, 'hybrid', { ...opts, applyOutcomePolicy: false });
    const on = await runSearch(orgId, 'hybrid', { ...opts, applyOutcomePolicy: true });
    const kw = off.components!.keyword;
    const sem = off.components!.semantic;
    if (kw.engine !== 'atlas_search') engines.keyword = kw.engine;
    if (sem.engine !== 'atlas_vector_search') engines.semantic = sem.engine;
    for (const w of [...kw.warnings, ...sem.warnings]) warnings.add(w);
    if (off.latencyMs.keyword !== undefined) latencies.keyword.push(off.latencyMs.keyword);
    if (sem.engine !== 'unavailable') latencies.semantic.push(sem.latencyMs.total);
    latencies.hybrid.push(off.latencyMs.total);

    const labelled = Object.values(q.relevant);
    let excluded = 0;
    const grade = (results: SearchResult[]) => {
      const ranked: { key: string; grade: number }[] = [];
      for (const r of results) {
        const k = keyById.get(r.memory.id);
        // Memories created after seeding (outcome memories, manual ones) carry no labels: leave them out
        // of the scored ranking instead of counting them as wrong, and report how many were removed.
        if (!k) {
          excluded += 1;
          continue;
        }
        ranked.push({ key: k, grade: q.relevant[k] ?? 0 });
      }
      return ranked;
    };
    const rankings: Record<BenchmarkConfig, { key: string; grade: number }[]> = {
      keyword: grade(kw.results),
      semantic: grade(sem.results),
      hybrid: grade(off.results),
      hybrid_policy: grade(on.results),
    };
    const perConfig = {} as BenchmarkRunDoc['queries'][number]['perConfig'];
    for (const c of CONFIGS) {
      const { firstAnswerRank, ...metrics } = scoreQuery(rankings[c].map((r) => r.grade), labelled);
      perConfig[c] = {
        metrics,
        firstAnswerRank,
        top: rankings[c].slice(0, 5).map((r) => ({ ...r, title: titleByKey.get(r.key) ?? null })),
      };
    }
    queries.push({ id: q.id, category: q.category, query: q.query, relevantCount: labelled.length, excludedNonSeedHits: excluded, perConfig });
  }

  const aggregate = (qs: typeof queries) =>
    Object.fromEntries(CONFIGS.map((c) => [c, meanMetrics(qs.map((x) => x.perConfig[c].metrics))])) as Record<BenchmarkConfig, BenchmarkMetrics>;
  const byCategory: BenchmarkRunDoc['byCategory'] = {};
  for (const cat of [...new Set(queries.map((q) => q.category))]) {
    const qs = queries.filter((q) => q.category === cat);
    byCategory[cat] = { queries: qs.length, metrics: aggregate(qs) };
  }
  if (missingSeedKeys.length) warnings.add(`Labelled seed memories missing from this workspace: ${missingSeedKeys.join(', ')}. Run npm run seed -w backend.`);

  const doc = await benchmarkRunsRepo.insertOne(orgId, {
    version: BENCHMARK_VERSION,
    userId,
    durationMs: Math.round(performance.now() - started),
    corpus: { seedMemories: titleByKey.size, nonSeedMemories, missingSeedKeys },
    engines,
    warnings: [...warnings],
    overall: aggregate(queries),
    byCategory,
    latencyMs: {
      keyword: { p50: percentile(latencies.keyword, 50), p95: percentile(latencies.keyword, 95) },
      semantic: { p50: percentile(latencies.semantic, 50), p95: percentile(latencies.semantic, 95) },
      hybrid: { p50: percentile(latencies.hybrid, 50), p95: percentile(latencies.hybrid, 95) },
    },
    queries,
  });
  const o = doc.overall;
  await logEvent(orgId, {
    type: 'benchmark.run',
    status: warnings.size ? 'warning' : 'success',
    actor,
    summary: `Retrieval benchmark: ${queries.length} queries · nDCG@5 keyword ${o.keyword.ndcgAt5.toFixed(2)}, semantic ${o.semantic.ndcgAt5.toFixed(2)}, hybrid ${o.hybrid.ndcgAt5.toFixed(2)}, hybrid + outcomes ${o.hybrid_policy.ndcgAt5.toFixed(2)}`,
    details: { runId: doc._id.toHexString(), version: BENCHMARK_VERSION, durationMs: doc.durationMs },
  });
  return toRun(doc);
}

function toSummary(d: BenchmarkRunDoc): BenchmarkRunSummary {
  return {
    id: d._id.toHexString(),
    version: d.version,
    createdAt: d.createdAt.toISOString(),
    durationMs: d.durationMs,
    queryCount: d.queries.length,
    engines: d.engines as BenchmarkRunSummary['engines'],
    warnings: d.warnings,
    overall: d.overall,
  };
}

function toRun(d: BenchmarkRunDoc): BenchmarkRun {
  return { ...toSummary(d), corpus: d.corpus, byCategory: d.byCategory, latencyMs: d.latencyMs, queries: d.queries as BenchmarkRun['queries'] };
}

export async function listBenchmarkRuns(orgId: ObjectId, limit = 20): Promise<BenchmarkRunSummary[]> {
  // Per-query detail stays out of the history list; the query ids are enough to count them.
  const docs = await benchmarkRunsRepo.find(orgId, {}, { sort: { createdAt: -1 }, limit, projection: { 'queries.perConfig': 0, byCategory: 0 } });
  return docs.map(toSummary);
}

export async function getBenchmarkRun(orgId: ObjectId, id: string): Promise<BenchmarkRun> {
  const d = await benchmarkRunsRepo.findById(orgId, id);
  if (!d) throw notFound('Benchmark run');
  return toRun(d);
}

export async function benchmarkSet(orgId: ObjectId): Promise<BenchmarkSetResponse> {
  const seed = await memoriesRepo.find(orgId, { isSeed: true }, { projection: { seedKey: 1, title: 1 } });
  const titleByKey = new Map(seed.filter((m) => m.seedKey).map((m) => [m.seedKey!, m.title]));
  return {
    version: BENCHMARK_VERSION,
    labellingRule: LABELLING_RULE,
    queries: BENCHMARK_QUERIES.map((q) => ({
      id: q.id,
      category: q.category,
      query: q.query,
      relevant: Object.entries(q.relevant)
        .sort((a, b) => b[1] - a[1])
        .map(([key, grade]) => ({ key, title: titleByKey.get(key) ?? null, grade })),
    })),
  };
}
