import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { groundedAnswer, resetLlmClientForTests } from '../src/services/llm/index.js';
import { resetBudgets } from '../src/lib/cost-guard.js';

/** Provider selection and fallback, with fetch stubbed (no network, no paid calls). */

const MEM = [{ id: 'a'.repeat(24), title: 'Fix pool exhaustion', type: 'procedural', verification: 'verified_success', content: 'Raise maxPoolSize.' }];
const original = { llm: config.LLM_API_KEY, groq: config.GROQ_API_KEY, provider: config.LLM_PROVIDER };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const groqOk = () =>
  json(200, {
    model: 'llama-3.3-70b-versatile',
    choices: [{ message: { content: `Raise the pool size [mem:${'a'.repeat(24)}].` }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 12 },
  });

function stubFetch(anthropic: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(new URL(url).host);
    if (url.includes('api.groq.com')) return groqOk();
    if (url.includes('api.anthropic.com')) return anthropic();
    throw new Error(`unexpected fetch ${url}`);
  });
  return calls;
}

describe('LLM provider chain', () => {
  beforeEach(() => {
    resetBudgets();
    resetLlmClientForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.assign(config, { LLM_API_KEY: original.llm, GROQ_API_KEY: original.groq, LLM_PROVIDER: original.provider });
  });

  it('uses Groq when only GROQ_API_KEY is set', async () => {
    Object.assign(config, { LLM_API_KEY: undefined, GROQ_API_KEY: 'gsk_test', LLM_PROVIDER: 'anthropic' });
    const calls = stubFetch(() => json(500, {}));
    const r = await groundedAnswer('How do we fix it?', MEM);
    expect(r.provider).toBe('groq');
    expect(r.mode).toBe('llm');
    expect(r.citations).toEqual(['a'.repeat(24)]);
    expect(r.fallbackReason).toBeUndefined();
    expect(calls).toEqual(['api.groq.com']);
  });

  it('falls back to Groq when Anthropic has no credit', async () => {
    Object.assign(config, { LLM_API_KEY: 'sk-ant-test', GROQ_API_KEY: 'gsk_test', LLM_PROVIDER: 'anthropic' });
    const calls = stubFetch(() =>
      json(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }),
    );
    const r = await groundedAnswer('How do we fix it?', MEM);
    expect(r.provider).toBe('groq');
    expect(r.fallbackReason).toMatch(/Anthropic unavailable: .*no credit/);
    expect(calls[0]).toBe('api.anthropic.com');
    expect(calls.at(-1)).toBe('api.groq.com');
  });

  it('does not retry a refusal on another provider', async () => {
    Object.assign(config, { LLM_API_KEY: 'sk-ant-test', GROQ_API_KEY: 'gsk_test', LLM_PROVIDER: 'anthropic' });
    const calls = stubFetch(() =>
      json(200, {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: null, explanation: null },
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
    );
    await expect(groundedAnswer('q', MEM)).rejects.toMatchObject({ code: 'LLM_REFUSED' });
    expect(calls).not.toContain('api.groq.com');
  });

  it('prefers Groq when LLM_PROVIDER=groq and both keys are set', async () => {
    Object.assign(config, { LLM_API_KEY: 'sk-ant-test', GROQ_API_KEY: 'gsk_test', LLM_PROVIDER: 'groq' });
    const calls = stubFetch(() => json(500, {}));
    const r = await groundedAnswer('q', MEM);
    expect(r.provider).toBe('groq');
    expect(calls).toEqual(['api.groq.com']);
  });

  it('uses the labelled template when no key is set', async () => {
    Object.assign(config, { LLM_API_KEY: undefined, GROQ_API_KEY: undefined });
    const r = await groundedAnswer('q', MEM);
    expect(r.provider).toBe('template');
    expect(r.answer).toMatch(/^Template answer \(LLM not configured\)/);
  });
});
