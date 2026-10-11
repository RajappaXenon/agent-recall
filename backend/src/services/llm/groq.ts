import { config, scrubSecrets } from '../../config.js';

/**
 * Groq chat completions (OpenAI-compatible). Checked against console.groq.com/docs:
 * POST {GROQ_BASE_URL}/chat/completions, `Authorization: Bearer`, body { model, messages,
 * max_completion_tokens, temperature }, text at choices[0].message.content.
 */

export function isGroqConfigured(): boolean {
  return Boolean(config.GROQ_API_KEY);
}

export type GroqErrorCode = 'LLM_TIMEOUT' | 'LLM_RATE_LIMITED' | 'LLM_AUTH' | 'LLM_ERROR';

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly code: GroqErrorCode,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

interface ChatResponse {
  model: string;
  choices: { message: { content: string | null }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

const base = () => config.GROQ_BASE_URL.replace(/\/$/, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function groqChat(system: string, user: string): Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }> {
  let last: GroqError | null = null;
  // One retry on 429/5xx/network, with a short backoff (Retry-After honoured up to 5 s).
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base()}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.GROQ_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_completion_tokens: 1500,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      last =
        (err as Error).name === 'TimeoutError'
          ? new GroqError('Groq did not answer within 30 s.', 'LLM_TIMEOUT')
          : new GroqError('Could not reach Groq.', 'LLM_ERROR');
      await sleep(500);
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as ChatResponse;
      const text = json.choices[0]?.message.content?.trim() ?? '';
      if (!text) throw new GroqError('Groq returned an empty answer.', 'LLM_ERROR');
      return { text, model: json.model, inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0 };
    }
    // Provider bodies stay in server logs (scrubbed); clients get a fixed reason.
    const body = await res.text().catch(() => '');
    console.warn(`[llm] Groq HTTP ${res.status}: ${scrubSecrets(body.slice(0, 300))}`);
    if (res.status === 401 || res.status === 403) throw new GroqError('Groq rejected the API key. Check GROQ_API_KEY.', 'LLM_AUTH');
    if (res.status === 404) throw new GroqError(`Groq model ${config.GROQ_MODEL} was not found. Check GROQ_MODEL.`, 'LLM_ERROR');
    if (res.status === 429) {
      last = new GroqError('Groq is rate limiting requests. Retry shortly.', 'LLM_RATE_LIMITED');
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 1000);
      continue;
    }
    if (res.status >= 500) {
      last = new GroqError(`Groq returned HTTP ${res.status}.`, 'LLM_ERROR');
      await sleep(500);
      continue;
    }
    throw new GroqError(`Groq returned HTTP ${res.status}.`, 'LLM_ERROR');
  }
  throw last ?? new GroqError('The Groq call failed.', 'LLM_ERROR');
}

/** Token-free probe: confirms the key and that the configured model exists. */
export async function probeGroq(): Promise<{ ok: true; model: string; latencyMs: number } | { ok: false; detail: string }> {
  const start = performance.now();
  try {
    const res = await fetch(`${base()}/models/${encodeURIComponent(config.GROQ_MODEL)}`, {
      headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { id?: string };
      return { ok: true, model: json.id ?? config.GROQ_MODEL, latencyMs: Math.round(performance.now() - start) };
    }
    return {
      ok: false,
      detail: res.status === 401 ? 'Groq API key rejected (401).' : res.status === 404 ? `Groq model ${config.GROQ_MODEL} not found.` : `Groq returned HTTP ${res.status}.`,
    };
  } catch {
    return { ok: false, detail: 'Could not reach Groq.' };
  }
}
