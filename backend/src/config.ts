import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// .env lives at the repo root; npm workspaces run scripts with cwd = backend/.
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, '../../.env'), resolve(here, '../.env'), resolve(process.cwd(), '.env')]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, quiet: true } as dotenv.DotenvConfigOptions);
    break;
  }
}

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const bool = (def: boolean) =>
  z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()).transform((v) => (v === undefined ? def : v === 'true'));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  MONGODB_URI: optionalString,
  DB_NAME: z.preprocess(emptyToUndefined, z.string().default('agent_recall')),
  TEST_DB_NAME: optionalString,
  FRONTEND_URL: z.preprocess(emptyToUndefined, z.string().default('http://localhost:5173')),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).default('dev-only-insecure-secret-change-me')),
  AUTH_MODE: z.literal('demo').default('demo'),

  VOYAGE_API_KEY: optionalString,
  VOYAGE_MODEL: z.preprocess(emptyToUndefined, z.string().default('voyage-3.5')),
  VOYAGE_DIMENSIONS: z.preprocess(emptyToUndefined, z.coerce.number().int().default(1024)),

  LLM_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['anthropic']).default('anthropic')),
  LLM_API_KEY: optionalString,
  LLM_MODEL: z.preprocess(emptyToUndefined, z.string().default('claude-sonnet-5-5')),

  ELEVENLABS_API_KEY: optionalString,
  ELEVENLABS_VOICE_ID: optionalString,
  ELEVENLABS_MODEL_ID: optionalString,

  DEMO_MODE: bool(false),
  LEASE_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1000).default(15000)),
  DEMO_STEP_DELAY_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(4000)),
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),
});

export type Config = z.infer<typeof EnvSchema>;

function load(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('dev-only')) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return parsed.data;
}

export const config = load();

/** Redacts credentials from a MongoDB URI so it can never leak into logs. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]+@/, '//***:***@');
}

/** Removes any occurrence of secrets from a message before it reaches logs or clients. */
export function scrubSecrets(message: string): string {
  let out = message;
  for (const secret of [config.MONGODB_URI, config.VOYAGE_API_KEY, config.LLM_API_KEY, config.ELEVENLABS_API_KEY]) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/mongodb(\+srv)?:\/\/[^\s'"]+/g, (m) => redactUri(m));
}
