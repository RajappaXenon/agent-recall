/**
 * npm run setup:indexes -w backend [-- --recreate]
 *
 * Creates the regular indexes, then the Atlas Search (`memories_search`) and
 * Vector Search (`memories_vector`) indexes on `memories`, and polls
 * listSearchIndexes until both report queryable: true.
 * `--recreate` drops and recreates the two search indexes (only when you run it).
 */
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import { COLLECTIONS } from '../db/collections.js';
import { ensureRegularIndexes } from '../db/indexes.js';
import {
  listMemorySearchIndexes,
  SEARCH_INDEX_NAME,
  searchIndexDefinition,
  VECTOR_INDEX_NAME,
  vectorIndexDefinition,
  vectorIndexDimensions,
} from '../db/search-indexes.js';
import { hasFlag, pollUntil, runScript } from './_util.js';

// Documented search-index caps per tier (Atlas docs). Dedicated tiers have no small cap.
const TIER_LIMITS: Record<string, number> = { M0: 3, FLEX: 10, M2: 5, M5: 10 };

runScript('setup:indexes', async () => {
  const recreate = hasFlag('--recreate');
  const db = await getDb();

  // Tier: the driver cannot read the Atlas tier, so it comes from ATLAS_TIER if set.
  const hello = await db.admin().command({ hello: 1 });
  const build = await db.admin().command({ buildInfo: 1 }).catch(() => ({ version: 'unknown' }));
  const tier = (process.env.ATLAS_TIER ?? '').toUpperCase() || null;
  console.log(`  MongoDB ${String(build.version)} · replica set ${String(hello.setName ?? 'n/a')}`);
  console.log(`  Cluster tier: ${tier ?? 'unknown (the driver cannot read it; set ATLAS_TIER=M0|FLEX|M10… to enforce limits)'}`);

  // 1. Regular indexes (creates collections as needed).
  const regular = await ensureRegularIndexes();
  console.log(`  Regular indexes ensured on ${regular.length} collections`);

  // 2. Count existing search indexes in DB_NAME (other databases are not inspected).
  let existingTotal = 0;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const c of collections) {
    try {
      existingTotal += (await db.collection(c.name).listSearchIndexes().toArray()).length;
    } catch {
      /* collection without search support (views etc.) */
    }
  }
  const current = await listMemorySearchIndexes();
  console.log(`  Existing search indexes in ${config.DB_NAME}: ${existingTotal} (${current.map((i) => `${i.name}:${i.status}`).join(', ') || 'none on memories'})`);

  const search = current.find((i) => i.name === SEARCH_INDEX_NAME);
  const vector = current.find((i) => i.name === VECTOR_INDEX_NAME);
  const toCreate = (recreate ? 2 : 0) + (!recreate && !search ? 1 : 0) + (!recreate && !vector ? 1 : 0);
  const newNeeded = recreate ? 0 : toCreate;
  if (tier && TIER_LIMITS[tier] !== undefined && existingTotal + newNeeded > TIER_LIMITS[tier]!) {
    throw new Error(
      `Creating ${newNeeded} more search index(es) would exceed the ${tier} limit of ${TIER_LIMITS[tier]} (currently ${existingTotal} in ${config.DB_NAME}; other databases on the cluster also count). Delete unused search indexes in Atlas first.`,
    );
  }

  // 3. Dimension mismatch check.
  const liveDims = vectorIndexDimensions(vector);
  if (vector && liveDims !== null && liveDims !== config.VOYAGE_DIMENSIONS && !recreate) {
    throw new Error(
      `Vector index ${VECTOR_INDEX_NAME} has numDimensions=${liveDims} but VOYAGE_DIMENSIONS=${config.VOYAGE_DIMENSIONS} (model ${config.VOYAGE_MODEL}).\n` +
        `  Fix: npm run setup:indexes -w backend -- --recreate   then   npm run embed:backfill -w backend`,
    );
  }

  const memories = db.collection(COLLECTIONS.memories);
  if (recreate) {
    for (const idx of [search, vector]) {
      if (!idx) continue;
      console.log(`  --recreate: dropping ${idx.name}`);
      await memories.dropSearchIndex(idx.name);
    }
    await pollUntil(
      async () => {
        const left = (await listMemorySearchIndexes()).filter((i) => i.name === SEARCH_INDEX_NAME || i.name === VECTOR_INDEX_NAME);
        return left.length === 0;
      },
      { timeoutMs: 180_000, label: 'search indexes to be dropped' },
    );
  }

  if (recreate || !search) {
    console.log(`  Creating ${SEARCH_INDEX_NAME} (search)`);
    await memories.createSearchIndex({ name: SEARCH_INDEX_NAME, type: 'search', definition: searchIndexDefinition() });
  } else {
    console.log(`  ${SEARCH_INDEX_NAME} already exists (${search.status})`);
  }
  if (recreate || !vector) {
    console.log(`  Creating ${VECTOR_INDEX_NAME} (vectorSearch, ${config.VOYAGE_DIMENSIONS} dims, cosine)`);
    await memories.createSearchIndex({ name: VECTOR_INDEX_NAME, type: 'vectorSearch', definition: vectorIndexDefinition() });
  } else {
    console.log(`  ${VECTOR_INDEX_NAME} already exists (${vector.status}, ${liveDims} dims)`);
  }

  // 4. Poll until both are queryable.
  let lastLine = '';
  const final = await pollUntil(
    async () => {
      const list = await listMemorySearchIndexes();
      const s = list.find((i) => i.name === SEARCH_INDEX_NAME);
      const v = list.find((i) => i.name === VECTOR_INDEX_NAME);
      const line = `    ${SEARCH_INDEX_NAME}: ${s?.status ?? 'missing'} queryable=${s?.queryable ?? false} · ${VECTOR_INDEX_NAME}: ${v?.status ?? 'missing'} queryable=${v?.queryable ?? false}`;
      if (line !== lastLine) {
        console.log(line);
        lastLine = line;
      }
      if (s?.status === 'FAILED' || v?.status === 'FAILED') throw new Error('Atlas reported an index build as FAILED. Check the index in the Atlas UI.');
      return s?.queryable && v?.queryable ? { s, v } : null;
    },
    { timeoutMs: 10 * 60_000, intervalMs: 2000, label: 'both search indexes to become queryable' },
  );
  console.log(`  ✓ ${final.s.name} queryable (${final.s.status}) · ✓ ${final.v.name} queryable (${final.v.status})`);
});
