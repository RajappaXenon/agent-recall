import type { Filter, ObjectId } from 'mongodb';
import { getDb } from '../client.js';
import { rawCollections, type TaskDoc } from '../collections.js';

/**
 * System-level operations for the task worker. The worker serves every tenant,
 * so claiming is the one deliberately cross-org query; everything it does after
 * a claim goes through the orgId-scoped repositories using the task's own orgId.
 */

export interface WorkerControlDoc {
  _id: string;
  kind: 'heartbeat' | 'crash';
  workerId?: string;
  orgId?: ObjectId;
  pid?: number;
  currentTaskId?: ObjectId | null;
  lastSeen?: Date;
  requestedAt?: Date;
  requestedBy?: string;
}

async function control() {
  return (await getDb()).collection<WorkerControlDoc>('worker_control');
}

/** Atomically claims the oldest runnable playbook task whose lease is empty or expired. */
export async function claimNextPlaybook(
  workerId: string,
  leaseMs: number,
  scope: { onlyOrgId?: ObjectId; excludeOrgIds?: ObjectId[] } = {},
): Promise<TaskDoc | null> {
  const { tasks } = await rawCollections();
  const now = new Date();
  const filter: Filter<TaskDoc> = {
    kind: 'playbook',
    status: { $in: ['queued', 'running'] },
    $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lt: now } }],
    ...(scope.onlyOrgId ? { orgId: scope.onlyOrgId } : scope.excludeOrgIds?.length ? { orgId: { $nin: scope.excludeOrgIds } } : {}),
  };
  return tasks.findOneAndUpdate(
    filter,
    { $set: { status: 'running', workerId, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now }, $inc: { attempt: 1 } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
}

/** Extends the lease only while this worker still owns the task. Returns false if the lease was lost. */
export async function heartbeatLease(taskId: ObjectId, workerId: string, leaseMs: number): Promise<boolean> {
  const { tasks } = await rawCollections();
  const res = await tasks.updateOne(
    { _id: taskId, workerId, status: 'running' },
    { $set: { leaseExpiresAt: new Date(Date.now() + leaseMs) } },
  );
  return res.matchedCount === 1;
}

/** Graceful shutdown: give the task back so another worker can claim it immediately. */
export async function releaseLease(taskId: ObjectId, workerId: string): Promise<void> {
  const { tasks } = await rawCollections();
  await tasks.updateOne({ _id: taskId, workerId, status: 'running' }, { $set: { leaseExpiresAt: null, updatedAt: new Date() } });
}

export async function workerHeartbeat(workerId: string, currentTaskId: ObjectId | null): Promise<void> {
  const c = await control();
  await c.updateOne(
    { _id: `hb:${workerId}` },
    { $set: { kind: 'heartbeat', workerId, pid: process.pid, currentTaskId, lastSeen: new Date() } },
    { upsert: true },
  );
}

export async function removeWorkerHeartbeat(workerId: string): Promise<void> {
  const c = await control();
  await c.deleteOne({ _id: `hb:${workerId}` });
}

export async function recentWorkers(withinMs = 10_000): Promise<WorkerControlDoc[]> {
  const c = await control();
  return c.find({ kind: 'heartbeat', lastSeen: { $gte: new Date(Date.now() - withinMs) } }).sort({ lastSeen: -1 }).toArray();
}

/** DEMO_MODE crash request for the worker running a task in this org. */
export async function requestCrash(orgId: ObjectId, requestedBy: string): Promise<void> {
  const c = await control();
  await c.updateOne(
    { _id: `crash:${orgId.toHexString()}` },
    { $set: { kind: 'crash', orgId, requestedAt: new Date(), requestedBy } },
    { upsert: true },
  );
}

/** Consumes a pending crash request for this org, if any. */
export async function takeCrashRequest(orgId: ObjectId): Promise<WorkerControlDoc | null> {
  const c = await control();
  return c.findOneAndDelete({ _id: `crash:${orgId.toHexString()}` });
}

export async function clearCrashRequest(orgId: ObjectId): Promise<void> {
  const c = await control();
  await c.deleteOne({ _id: `crash:${orgId.toHexString()}` });
}

/** Org ids reserved for integration tests: general workers never claim their tasks. */
export async function testOrgIds(): Promise<ObjectId[]> {
  const { organizations } = await rawCollections();
  return (await organizations.find({ slug: { $regex: '^__test__' } }, { projection: { _id: 1 } }).toArray()).map((o) => o._id);
}
