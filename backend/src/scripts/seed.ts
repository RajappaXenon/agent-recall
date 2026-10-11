/** npm run seed -w backend — demo org, user, agents, memories, outcomes (all isSeed: true). Idempotent. */
import { runScript } from './_util.js';
import { seedDemo } from './seed-lib.js';

runScript('seed', async () => {
  const r = await seedDemo();
  console.log(`  org ${r.orgId.toHexString()} · ${r.agents} agents · ${r.memories} memories · ${r.outcomes} seeded outcomes`);
  console.log(`  embeddings: ${typeof r.embedding === 'string' ? r.embedding : `${r.embedding.embedded} embedded, ${r.embedding.skipped} already current, ${r.embedding.failed} failed`}`);
});
