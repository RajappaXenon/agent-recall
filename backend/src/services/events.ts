import type { ObjectId } from 'mongodb';
import type { EventDoc } from '../db/collections.js';
import { eventsRepo } from '../db/repositories/index.js';

export type Actor = EventDoc['actor'];

export const systemActor: Actor = { kind: 'system', id: null, name: 'system' };
export const userActor = (userId: ObjectId, name = 'Demo user'): Actor => ({ kind: 'user', id: userId.toHexString(), name });
export const workerActor = (workerId: string): Actor => ({ kind: 'worker', id: workerId, name: workerId });

/** Appends to the activity log / audit trail. Never throws: logging must not break the action it records. */
export async function logEvent(
  orgId: ObjectId,
  e: {
    type: string;
    status?: EventDoc['status'];
    actor: Actor;
    summary: string;
    agentId?: ObjectId | null;
    taskId?: ObjectId | null;
    memoryId?: ObjectId | null;
    details?: Record<string, unknown>;
    isSeed?: boolean;
    createdAt?: Date;
  },
): Promise<void> {
  try {
    await eventsRepo.insertOne(orgId, {
      type: e.type,
      status: e.status ?? 'info',
      actor: e.actor,
      summary: e.summary,
      agentId: e.agentId ?? null,
      taskId: e.taskId ?? null,
      memoryId: e.memoryId ?? null,
      details: e.details ?? {},
      isSeed: e.isSeed ?? false,
      createdAt: e.createdAt,
    });
  } catch (err) {
    console.warn(`[events] failed to log ${e.type}: ${(err as Error).message}`);
  }
}
