/**
 * npm run demo:reset -w backend
 * Deletes non-seed documents in the demo org only (isSeed !== true), then re-seeds,
 * which restores seed memories to their seeded verification/usefulness state.
 */
import {
  agentsRepo,
  checkpointsRepo,
  DEMO_ORG_SLUG,
  benchmarkRunsRepo,
  eventsRepo,
  identityRepo,
  memoriesRepo,
  outcomesRepo,
  retrievalLogsRepo,
  stepExecutionsRepo,
  tasksRepo,
} from '../db/repositories/index.js';
import { runScript } from './_util.js';
import { seedDemo } from './seed-lib.js';

runScript('demo:reset', async () => {
  const org = await identityRepo.findOrgBySlug(DEMO_ORG_SLUG);
  if (org) {
    const nonSeed = { isSeed: { $ne: true } };
    const repos = { memories: memoriesRepo, tasks: tasksRepo, checkpoints: checkpointsRepo, step_executions: stepExecutionsRepo, outcomes: outcomesRepo, retrieval_logs: retrievalLogsRepo, events: eventsRepo, benchmark_runs: benchmarkRunsRepo, agents: agentsRepo };
    for (const [name, repo] of Object.entries(repos)) {
      const n = await (repo as typeof memoriesRepo).deleteMany(org._id, nonSeed as never);
      console.log(`  ${name}: deleted ${n} non-seed document(s)`);
    }
  }
  const r = await seedDemo();
  console.log(`  re-seeded ${r.memories} memories, ${r.outcomes} outcomes · embeddings: ${typeof r.embedding === 'string' ? r.embedding : `${r.embedding.embedded} embedded, ${r.embedding.skipped} current`}`);
});
