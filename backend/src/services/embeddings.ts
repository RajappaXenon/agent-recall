import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { registerProbe } from './integrations.js';

export type InputType = 'document' | 'query';

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export function isVoyageConfigured(): boolean {
  return Boolean(config.VOYAGE_API_KEY);
}

export const embeddingModel = () => ({ provider: 'voyage' as const, model: config.VOYAGE_MODEL, dimensions: config.VOYAGE_DIMENSIONS });

/** Hash of what gets embedded; unchanged hash + model + dimensions ⇒ no re-embed. */
export function contentHash(title: string, content: string, tags: string[]): string {
  return createHash('sha256').update(`${title}\n\n${content}\n\n${tags.join(',')}`).digest('hex');
}

/** Text sent to Voyage for a memory document. */
export function documentText(title: string, content: string, tags: string[]): string {
  return `${title}\n\n${content}${tags.length ? `\n\nTags: ${tags.join(', ')}` : ''}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

/** Calls the Voyage embeddings API with timeout and exponential backoff on 429/5xx/network errors. */
async function callVoyage(inputs: string[], inputType: InputType, attempts = 4): Promise<number[][]> {
  if (!config.VOYAGE_API_KEY) throw new EmbeddingError('VOYAGE_API_KEY is not set', false);
  let lastErr: EmbeddingError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 250);
    try {
      const res = await fetch(`${config.VOYAGE_BASE_URL.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.VOYAGE_MODEL,
          input: inputs,
          input_type: inputType,
          output_dimension: config.VOYAGE_DIMENSIONS,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        // Provider bodies stay server-side; only status + a short reason propagate.
        const body = await res.text().catch(() => '');
        const reason = (() => {
          try {
            return String((JSON.parse(body) as { detail?: string }).detail ?? '').slice(0, 160);
          } catch {
            return '';
          }
        })();
        const retriable = res.status === 429 || res.status >= 500;
        if (res.status === 403 && /Atlas|endpoint/i.test(body)) {
          throw new EmbeddingError(
            `Voyage returned HTTP 403: this key does not match ${config.VOYAGE_BASE_URL}. Atlas model API keys need VOYAGE_BASE_URL=https://ai.mongodb.com/v1; voyageai.com keys need https://api.voyageai.com/v1.`,
            false,
          );
        }
        lastErr = new EmbeddingError(`Voyage returned HTTP ${res.status}${reason ? `: ${reason}` : ''}`, retriable);
        if (!retriable) throw lastErr;
        continue;
      }
      const json = (await res.json()) as VoyageResponse;
      const out = new Array<number[]>(inputs.length);
      for (const d of json.data) out[d.index] = d.embedding;
      if (out.some((v) => !v || v.length !== config.VOYAGE_DIMENSIONS)) {
        throw new EmbeddingError(`Voyage returned vectors that are not ${config.VOYAGE_DIMENSIONS}-dimensional`, false);
      }
      return out;
    } catch (err) {
      if (err instanceof EmbeddingError && !err.retriable) throw err;
      lastErr = err instanceof EmbeddingError ? err : new EmbeddingError(`Voyage request failed: ${(err as Error).message}`, true);
    }
  }
  throw lastErr ?? new EmbeddingError('Voyage request failed', true);
}

/** Embeds documents in batches (Voyage accepts up to 1000 inputs; we use 64 to stay well under token limits). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    out.push(...(await callVoyage(texts.slice(i, i + 64), 'document')));
  }
  return out;
}

// Small LRU for query embeddings (repeat demo queries skip the network call).
const QUERY_CACHE_MAX = 200;
const queryCache = new Map<string, number[]>();

export async function embedQuery(query: string): Promise<{ vector: number[]; cached: boolean }> {
  const key = `${config.VOYAGE_MODEL}:${config.VOYAGE_DIMENSIONS}:${query}`;
  const hit = queryCache.get(key);
  if (hit) {
    queryCache.delete(key);
    queryCache.set(key, hit);
    return { vector: hit, cached: true };
  }
  const [vector] = await callVoyage([query], 'query', 3);
  if (!vector) throw new EmbeddingError('Voyage returned no embedding', false);
  queryCache.set(key, vector);
  if (queryCache.size > QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value as string);
  return { vector, cached: false };
}

registerProbe('voyage', async () => {
  const meta = { model: config.VOYAGE_MODEL, dimensions: config.VOYAGE_DIMENSIONS };
  if (!isVoyageConfigured()) {
    return { status: 'not_configured', detail: 'VOYAGE_API_KEY is not set. Semantic search is unavailable.', latencyMs: null, meta };
  }
  const start = performance.now();
  try {
    await callVoyage(['ping'], 'query', 1);
    return {
      status: 'connected',
      detail: `Live embedding ok · ${config.VOYAGE_MODEL} · ${config.VOYAGE_DIMENSIONS} dims`,
      latencyMs: Math.round(performance.now() - start),
      meta,
    };
  } catch (err) {
    return { status: 'error', detail: (err as Error).message, latencyMs: null, meta };
  }
});
