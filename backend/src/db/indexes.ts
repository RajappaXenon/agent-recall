import type { IndexDescription } from 'mongodb';
import { COLLECTIONS } from './collections.js';
import { getDb } from './client.js';

/** Regular (non-search) indexes from SPEC §3. Idempotent: createIndexes is a no-op for existing ones. */
export const REGULAR_INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.organizations]: [{ key: { slug: 1 }, unique: true }],
  [COLLECTIONS.users]: [{ key: { orgId: 1, email: 1 }, unique: true }],
  [COLLECTIONS.agents]: [{ key: { orgId: 1, createdAt: -1 } }],
  [COLLECTIONS.memories]: [
    { key: { orgId: 1, archived: 1, type: 1 } },
    { key: { orgId: 1, agentId: 1, createdAt: -1 } },
    { key: { orgId: 1, sourceTaskId: 1 } },
    { key: { orgId: 1, 'verification.status': 1 } },
  ],
  [COLLECTIONS.tasks]: [{ key: { status: 1, leaseExpiresAt: 1 } }, { key: { orgId: 1, agentId: 1, createdAt: -1 } }],
  [COLLECTIONS.checkpoints]: [
    { key: { taskId: 1, stepIndex: 1 }, unique: true },
    { key: { idempotencyKey: 1 }, unique: true },
  ],
  [COLLECTIONS.stepExecutions]: [{ key: { taskId: 1, stepIndex: 1 } }],
  [COLLECTIONS.events]: [{ key: { orgId: 1, createdAt: -1 } }, { key: { orgId: 1, type: 1, createdAt: -1 } }],
  [COLLECTIONS.retrievalLogs]: [{ key: { orgId: 1, createdAt: -1 } }],
  [COLLECTIONS.outcomes]: [
    { key: { orgId: 1, taskId: 1 } },
    { key: { orgId: 1, createdAt: -1 } },
    // One outcome per task (prevents double-recording under concurrent submits).
    { key: { taskId: 1, orgId: 1 }, unique: true, name: 'outcome_once_per_task' },
  ],
};

export async function ensureRegularIndexes(): Promise<{ collection: string; indexes: string[] }[]> {
  const db = await getDb();
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const out: { collection: string; indexes: string[] }[] = [];
  for (const [name, specs] of Object.entries(REGULAR_INDEXES)) {
    if (!existing.has(name)) await db.createCollection(name);
    const names = await db.collection(name).createIndexes(specs);
    out.push({ collection: name, indexes: names });
  }
  return out;
}
