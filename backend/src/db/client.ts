import dns from 'node:dns';
import { MongoClient, type Db } from 'mongodb';
import { config, scrubSecrets } from '../config.js';
import { AppError } from '../lib/errors.js';

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(config.MONGODB_URI);
}

const LOOPBACK = /^(127\.|::1$|\[::1\])/;
let dnsChecked = false;

/**
 * Node on some Windows setups only sees a loopback DNS server that does not answer
 * SRV queries, so `mongodb+srv://` fails with querySrv ECONNREFUSED even though the
 * OS resolves fine. Detect that and switch Node's resolver to DNS_SERVERS (or public
 * resolvers). Only affects this process's DNS lookups.
 */
async function ensureSrvResolvable(uri: string): Promise<void> {
  if (dnsChecked || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.replace(/^mongodb\+srv:\/\/(?:[^@/]*@)?/, '').split(/[/?]/)[0];
  if (!host) return;
  const srv = `_mongodb._tcp.${host}`;
  try {
    await dns.promises.resolveSrv(srv);
    dnsChecked = true;
    return;
  } catch (err) {
    const configured = config.DNS_SERVERS?.split(',').map((s) => s.trim()).filter(Boolean);
    const current = dns.getServers();
    if (!configured?.length && !current.every((s) => LOOPBACK.test(s))) throw err;
    const fallback = configured?.length ? configured : ['1.1.1.1', '8.8.8.8'];
    dns.setServers(fallback);
    try {
      await dns.promises.resolveSrv(srv);
      dnsChecked = true;
      console.warn(`[mongo] SRV lookup failed via ${current.join(', ')}; using DNS servers ${fallback.join(', ')} for this process.`);
    } catch {
      dns.setServers(current);
      throw err;
    }
  }
}

export async function getClient(): Promise<MongoClient> {
  if (client) return client;
  if (!config.MONGODB_URI) {
    throw new AppError(503, 'MONGO_NOT_CONFIGURED', 'MONGODB_URI is not set. Add your Atlas connection string to .env.');
  }
  if (!connecting) {
    const uri = config.MONGODB_URI;
    const c = new MongoClient(uri, {
      appName: 'agent-recall',
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    connecting = ensureSrvResolvable(uri)
      .then(() => c.connect())
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
  if (err instanceof AppError) return err.message;
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const msg = scrubSecrets(raw);
  if (/querySrv|ENOTFOUND|EAI_AGAIN|ESERVFAIL/i.test(msg)) {
    return `DNS lookup for the Atlas cluster failed (${msg.slice(0, 160)}). Check the cluster host in MONGODB_URI, or set DNS_SERVERS in .env (for example your router or 1.1.1.1).`;
  }
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
