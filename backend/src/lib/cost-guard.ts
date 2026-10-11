import { AppError } from './errors.js';

/**
 * Process-wide budget for calls to paid providers. Per-route rate limits are per IP;
 * demo auth lets anyone get a token, so this caps total spend per minute regardless
 * of how many clients or tokens are used.
 */
const WINDOW_MS = 60_000;
const BUDGETS = { llm: 30, tts: 20, embed: 240 } as const;
export type PaidProvider = keyof typeof BUDGETS;

const calls: Record<PaidProvider, number[]> = { llm: [], tts: [], embed: [] };

export function spendBudget(provider: PaidProvider, units = 1): void {
  const now = Date.now();
  const recent = calls[provider].filter((t) => now - t < WINDOW_MS);
  if (recent.length + units > BUDGETS[provider]) {
    calls[provider] = recent;
    throw new AppError(429, 'BUDGET_EXCEEDED', `Too many ${provider === 'llm' ? 'answer' : provider === 'tts' ? 'audio' : 'embedding'} requests across all users right now. Try again in a minute.`);
  }
  for (let i = 0; i < units; i++) recent.push(now);
  calls[provider] = recent;
}

/** Test hook. */
export function resetBudgets() {
  calls.llm = [];
  calls.tts = [];
  calls.embed = [];
}
