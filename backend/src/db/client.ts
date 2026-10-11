import { MongoClient, type Db } from 'mongodb';
import { config, scrubSecrets } from '../config.js';
import { AppError } from '../lib/errors.js';

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(config.MONGODB_URI);
}

export async function getClient(): Promise<MongoClient> {
  if (client) return client;
  if (!config.MONGODB_URI) {
    throw new AppError(503, 'MONGO_NOT_CONFIGURED', 'MONGODB_URI is not set. Add your Atlas connection string to .env.');
  }
  if (!connecting) {
    const c = new MongoClient(config.MONGODB_URI, {
      appName: 'agent-recall',
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    connecting = c
      .connect()
      .then(() => {
        client = c;
        return c;
      })
      .catch((err: unknown) => {
        connecting = null;
        throw new AppError(503, 'MONGO_UNREACHABLE', describeMongoError(err));
      });
  }
  return connecting;
}

export async function getDb(): Promise<Db> {
  const c = await getClient();
  return c.db(config.DB_NAME);
}

export async function pingMongo(): Promise<{ ok: true; latencyMs: number } | { ok: false; detail: string }> {
  try {
    const db = await getDb();
    const start = performance.now();
    await db.command({ ping: 1 });
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return { ok: false, detail: err instanceof AppError ? err.message : describeMongoError(err) };
  }
}

/** Turns driver errors into a safe, actionable message (never includes the URI). */
export function describeMongoError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const msg = scrubSecrets(raw);
  if (/ServerSelection|ETIMEDOUT|ECONNREFUSED|timed out/i.test(msg)) {
    return `Could not reach the Atlas cluster (${msg.slice(0, 200)}). Most often the current IP is not in the access list: Atlas → Network Access → Add IP Address.`;
  }
  if (/auth|Authentication/i.test(msg)) {
    return `Atlas rejected the credentials (${msg.slice(0, 200)}). Check the user and password in MONGODB_URI.`;
  }
  return msg.slice(0, 300);
}

export async function closeMongo(): Promise<void> {
  const c = client;
  client = null;
  connecting = null;
  if (c) await c.close();
}
