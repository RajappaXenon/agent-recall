import type { IntegrationKey, IntegrationStatus } from '@agent-recall/shared';
import { config } from '../config.js';
import { describeMongoError, isMongoConfigured, pingMongo } from '../db/client.js';
import {
  listMemorySearchIndexes,
  SEARCH_INDEX_NAME,
  VECTOR_INDEX_NAME,
  vectorIndexDimensions,
  type SearchIndexInfo,
} from '../db/search-indexes.js';

type Probe = Omit<IntegrationStatus, 'key' | 'name' | 'optional' | 'checkedAt'>;
type ProbeFn = () => Promise<Probe>;

/** Extra probes registered by provider services (Voyage, LLM, ElevenLabs). */
const extraProbes = new Map<IntegrationKey, ProbeFn>();
export function registerProbe(key: IntegrationKey, fn: ProbeFn) {
  extraProbes.set(key, fn);
}

const NAMES: Record<IntegrationKey, string> = {
  mongodb: 'MongoDB Atlas',
  atlas_search: 'Atlas Search',
  atlas_vector_search: 'Atlas Vector Search',
  voyage: 'Voyage AI embeddings',
  llm: 'LLM (Anthropic)',
  elevenlabs: 'ElevenLabs audio',
};
const OPTIONAL: Partial<Record<IntegrationKey, boolean>> = { elevenlabs: true };
const ORDER: IntegrationKey[] = ['mongodb', 'atlas_search', 'atlas_vector_search', 'voyage', 'llm', 'elevenlabs'];

const CACHE_MS = 60_000;
let cache: { at: number; value: IntegrationStatus[] } | null = null;
let inflight: Promise<IntegrationStatus[]> | null = null;

function indexProbe(info: SearchIndexInfo | undefined, name: string, setupHint: string): Probe {
  if (!info) return { status: 'index_missing', detail: `Index ${name} not found. ${setupHint}`, latencyMs: null, meta: { index: name } };
  if (!info.queryable)
    return {
      status: 'index_building',
      detail: `Index ${name} exists (status ${info.status}) but is not queryable yet.`,
      latencyMs: null,
      meta: { index: name, atlasStatus: info.status },
    };
  return { status: 'connected', detail: `Index ${name} is queryable (status ${info.status}).`, latencyMs: null, meta: { index: name, atlasStatus: info.status } };
}

async function probeAll(): Promise<IntegrationStatus[]> {
  const checkedAt = new Date().toISOString();
  const results = new Map<IntegrationKey, Probe>();

  if (!isMongoConfigured()) {
    const p: Probe = { status: 'not_configured', detail: 'MONGODB_URI is not set in .env.', latencyMs: null, meta: {} };
    results.set('mongodb', p);
    results.set('atlas_search', { ...p, detail: 'Needs MongoDB.' });
    results.set('atlas_vector_search', { ...p, detail: 'Needs MongoDB.' });
  } else {
    const ping = await pingMongo();
    if (!ping.ok) {
      results.set('mongodb', { status: 'error', detail: ping.detail, latencyMs: null, meta: {} });
      results.set('atlas_search', { status: 'error', detail: 'Cluster unreachable.', latencyMs: null, meta: {} });
      results.set('atlas_vector_search', { status: 'error', detail: 'Cluster unreachable.', latencyMs: null, meta: {} });
    } else {
      results.set('mongodb', { status: 'connected', detail: `ping ok · database ${config.DB_NAME}`, latencyMs: ping.latencyMs, meta: { database: config.DB_NAME } });
      try {
        const start = performance.now();
        const indexes = await listMemorySearchIndexes();
        const latencyMs = Math.round(performance.now() - start);
        const hint = 'Run npm run setup:indexes -w backend.';
        const search = indexProbe(indexes.find((i) => i.name === SEARCH_INDEX_NAME), SEARCH_INDEX_NAME, hint);
        const vectorInfo = indexes.find((i) => i.name === VECTOR_INDEX_NAME);
        const vector = indexProbe(vectorInfo, VECTOR_INDEX_NAME, hint);
        const dims = vectorIndexDimensions(vectorInfo);
        if (dims !== null) {
          vector.meta = { ...vector.meta, numDimensions: dims, configuredDimensions: config.VOYAGE_DIMENSIONS };
          if (dims !== config.VOYAGE_DIMENSIONS && vector.status === 'connected') {
            vector.status = 'error';
            vector.detail = `Index has ${dims} dimensions but VOYAGE_DIMENSIONS=${config.VOYAGE_DIMENSIONS}. Run setup:indexes --recreate, then embed:backfill.`;
          }
        }
        results.set('atlas_search', { ...search, latencyMs });
        results.set('atlas_vector_search', { ...vector, latencyMs });
      } catch (err) {
        const detail = `listSearchIndexes failed: ${describeMongoError(err)}`;
        results.set('atlas_search', { status: 'error', detail, latencyMs: null, meta: {} });
        results.set('atlas_vector_search', { status: 'error', detail, latencyMs: null, meta: {} });
      }
    }
  }

  await Promise.all(
    (['voyage', 'llm', 'elevenlabs'] as const).map(async (key) => {
      const fn = extraProbes.get(key);
      if (!fn) {
        results.set(key, { status: 'not_configured', detail: 'Provider not wired in this build.', latencyMs: null, meta: {} });
        return;
      }
      try {
        results.set(key, await fn());
      } catch (err) {
        results.set(key, { status: 'error', detail: err instanceof Error ? err.message.slice(0, 200) : 'Probe failed', latencyMs: null, meta: {} });
      }
    }),
  );

  return ORDER.map((key) => ({
    key,
    name: NAMES[key],
    optional: OPTIONAL[key] ?? false,
    checkedAt,
    ...results.get(key)!,
  }));
}

/** Live probes, cached for 60 s. `refresh` forces a new probe. */
export async function getIntegrationStatus(refresh = false): Promise<{ integrations: IntegrationStatus[]; cached: boolean }> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return { integrations: cache.value, cached: true };
  if (!inflight) {
    inflight = probeAll()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return { integrations: await inflight, cached: false };
}

export function invalidateIntegrationCache() {
  cache = null;
}

/** True only if the cached status (≤60 s old) says connected. */
export async function isConnected(key: IntegrationKey): Promise<boolean> {
  const { integrations } = await getIntegrationStatus(false);
  return integrations.find((i) => i.key === key)?.status === 'connected';
}
