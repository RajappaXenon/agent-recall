/**
 * npm run benchmark -w backend
 *
 * Runs the labelled retrieval benchmark (src/eval/benchmark-set.ts) against the demo org
 * through the real search pipeline, stores the run in benchmark_runs and prints the table.
 */
import { ensureRegularIndexes } from '../db/indexes.js';
import { identityRepo } from '../db/repositories/index.js';
import { runBenchmark } from '../services/benchmark.js';
import { systemActor } from '../services/events.js';
import { runScript } from './_util.js';

const LABEL = { keyword: 'Keyword (Atlas Search)', semantic: 'Semantic (Vector Search)', hybrid: 'Hybrid RRF', hybrid_policy: 'Hybrid RRF + outcomes' } as const;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);
const num = (x: number) => x.toFixed(3).padStart(7);

runScript('benchmark', async () => {
  await ensureRegularIndexes();
  const { org } = await identityRepo.ensureDemoIdentity();
  const run = await runBenchmark(org._id, systemActor, null);
  console.log(`\n${run.queryCount} queries · ${run.corpus.seedMemories} seed memories · engines: keyword=${run.engines.keyword}, semantic=${run.engines.semantic} · ${(run.durationMs / 1000).toFixed(1)} s`);
  for (const w of run.warnings) console.log(`⚠ ${w}`);
  const table = (title: string, m: typeof run.overall) => {
    console.log(`\n${title}\n${'config'.padEnd(26)}  Hit@1   MRR@10  Recall@5  nDCG@5`);
    for (const c of ['keyword', 'semantic', 'hybrid', 'hybrid_policy'] as const) {
      console.log(`${LABEL[c].padEnd(26)}${pct(m[c].hitAt1)} ${num(m[c].mrrAt10)} ${pct(m[c].recallAt5)}  ${num(m[c].ndcgAt5)}`);
    }
  };
  table('Overall', run.overall);
  for (const [cat, v] of Object.entries(run.byCategory)) table(`${cat} (${v.queries} queries)`, v.metrics);
  console.log(`\nLatency p50/p95 ms: keyword ${run.latencyMs.keyword.p50}/${run.latencyMs.keyword.p95} · semantic ${run.latencyMs.semantic.p50}/${run.latencyMs.semantic.p95} · hybrid ${run.latencyMs.hybrid.p50}/${run.latencyMs.hybrid.p95}`);
  const moved = run.queries.filter((q) => q.perConfig.hybrid.firstAnswerRank !== q.perConfig.hybrid_policy.firstAnswerRank);
  if (moved.length) {
    console.log('\nQueries where outcome signals moved the first direct answer:');
    for (const q of moved) console.log(`  ${q.id.padEnd(26)} rank ${q.perConfig.hybrid.firstAnswerRank ?? '—'} → ${q.perConfig.hybrid_policy.firstAnswerRank ?? '—'}`);
  }
  console.log(`\nStored as benchmark run ${run.id}`);
});
