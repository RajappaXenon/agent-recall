/**
 * npm run embed:backfill -w backend
 * Embeds every memory (all orgs in DB_NAME) whose embedding is missing, failed,
 * or stale (content hash, model or dimensions changed).
 */
import { config } from '../config.js';
import { identityRepo, memoriesRepo } from '../db/repositories/index.js';
import { getDb } from '../db/client.js';
import { contentHash, isVoyageConfigured } from '../services/embeddings.js';
import { embedMany } from '../services/memories.js';
import type { MemoryDoc } from '../db/collections.js';
import { runScript } from './_util.js';

runScript('embed:backfill', async () => {
  if (!isVoyageConfigured()) throw new Error('VOYAGE_API_KEY is not set; nothing can be embedded.');
  const db = await getDb();
  const orgIds = (await db.collection('organizations').find({}, { projection: { _id: 1 } }).toArray()).map((o) => o._id);
  let total = { embedded: 0, skipped: 0, failed: 0 };
  for (const orgId of orgIds) {
    const org = await identityRepo.findOrgById(orgId);
    // Vectors themselves aren't needed to decide what is stale.
    const all = (await memoriesRepo.find(orgId, {}, { projection: { 'embedding.vector': 0 } })) as MemoryDoc[];
    const stale = all.filter(
      (m) =>
        m.embeddingStatus !== 'ready' ||
        !m.embedding ||
        m.embedding.model !== config.VOYAGE_MODEL ||
        m.embedding.dimensions !== config.VOYAGE_DIMENSIONS ||
        m.embedding.contentHash !== contentHash(m.title, m.content, m.tags),
    );
    if (!stale.length) continue;
    const r = await embedMany(orgId, stale);
    console.log(`  ${org?.slug ?? orgId.toHexString()}: ${r.embedded} embedded, ${r.failed} failed (of ${all.length})`);
    total = { embedded: total.embedded + r.embedded, skipped: total.skipped + all.length - stale.length, failed: total.failed + r.failed };
  }
  console.log(`  total: ${total.embedded} embedded · ${total.skipped} already current · ${total.failed} failed · model ${config.VOYAGE_MODEL} (${config.VOYAGE_DIMENSIONS} dims)`);
  if (total.failed) process.exitCode = 1;
});
