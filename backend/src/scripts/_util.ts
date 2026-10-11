import { config } from '../config.js';
import { closeMongo, describeMongoError, isMongoConfigured } from '../db/client.js';
import { AppError } from '../lib/errors.js';

/** Runs a script with consistent error output and connection cleanup. */
export function runScript(name: string, main: () => Promise<void>) {
  const started = Date.now();
  (async () => {
    if (!isMongoConfigured()) {
      throw new AppError(1, 'MONGO_NOT_CONFIGURED', 'MONGODB_URI is not set. Copy .env.example to .env and add your Atlas connection string.');
    }
    console.log(`▶ ${name} · database ${config.DB_NAME}`);
    await main();
    console.log(`✔ ${name} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  })()
    .then(async () => {
      await closeMongo();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      const msg = err instanceof AppError ? err.message : describeMongoError(err);
      console.error(`✖ ${name} failed: ${msg}`);
      await closeMongo().catch(() => {});
      process.exit(1);
    });
}

/** Polls `check` until it returns a truthy value or the timeout passes. No fixed sleeps. */
export async function pollUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  opts: { timeoutMs: number; intervalMs?: number; label: string; onTick?: (elapsedMs: number) => void },
): Promise<T> {
  const start = Date.now();
  let interval = opts.intervalMs ?? 1000;
  for (;;) {
    const v = await check();
    if (v) return v;
    const elapsed = Date.now() - start;
    if (elapsed > opts.timeoutMs) throw new Error(`Timed out after ${Math.round(elapsed / 1000)}s waiting for ${opts.label}`);
    opts.onTick?.(elapsed);
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, 5000);
  }
}

export const hasFlag = (flag: string) => process.argv.includes(flag);
