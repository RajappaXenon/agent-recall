import type { Filter, ObjectId } from 'mongodb';
import type { Checkpoint, OutcomeListItem, Task } from '@agent-recall/shared';
import type { OutcomeDoc, TaskDoc } from '../db/collections.js';
import { checkpointsRepo, outcomesRepo, tasksRepo, toObjectId } from '../db/repositories/index.js';
import { notFound } from '../lib/errors.js';
import { isoOrNull } from '../lib/serialize.js';

export function toTask(t: TaskDoc, outcome: OutcomeDoc | null): Task {
  return {
    id: String(t._id),
    orgId: String(t.orgId),
    isSeed: t.isSeed,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    kind: t.kind,
    agentId: String(t.agentId),
    goal: t.goal,
    input: t.input,
    status: t.status,
    currentStep: t.currentStep,
    steps: t.steps,
    memoryIds: t.memoryIds.map(String),
    output: t.output,
    error: t.error,
    workerId: t.workerId,
    leaseExpiresAt: isoOrNull(t.leaseExpiresAt),
    attempt: t.attempt,
    completedAt: isoOrNull(t.completedAt),
    outcome: outcome
      ? {
          id: String(outcome._id),
          result: outcome.result,
          feedback: outcome.feedback,
          createdMemoryId: outcome.createdMemoryId ? String(outcome.createdMemoryId) : null,
          createdAt: outcome.createdAt.toISOString(),
        }
      : null,
  };
}

async function withOutcomes(orgId: ObjectId, tasks: TaskDoc[]): Promise<Task[]> {
  const outcomes = await outcomesRepo.find(orgId, { taskId: { $in: tasks.map((t) => t._id) } });
  const byTask = new Map(outcomes.map((o) => [String(o.taskId), o]));
  return tasks.map((t) => toTask(t, byTask.get(String(t._id)) ?? null));
}

export async function listTasks(orgId: ObjectId, q: { page: number; pageSize: number; agentId?: string; kind?: 'qa' | 'playbook'; status?: TaskDoc['status'] }) {
  const filter: Filter<TaskDoc> = {};
  if (q.agentId) filter.agentId = toObjectId(q.agentId, 'Agent');
  if (q.kind) filter.kind = q.kind;
  if (q.status) filter.status = q.status;
  const [docs, total] = await Promise.all([
    tasksRepo.find(orgId, filter, { sort: { createdAt: -1 }, skip: (q.page - 1) * q.pageSize, limit: q.pageSize }),
    tasksRepo.count(orgId, filter),
  ]);
  return { items: await withOutcomes(orgId, docs), total, page: q.page, pageSize: q.pageSize };
}

export async function getTask(orgId: ObjectId, id: string): Promise<Task> {
  const t = await tasksRepo.findById(orgId, toObjectId(id, 'Task'));
  if (!t) throw notFound('Task');
  return (await withOutcomes(orgId, [t]))[0]!;
}

export async function listCheckpoints(orgId: ObjectId, taskId: string): Promise<Checkpoint[]> {
  const tid = toObjectId(taskId, 'Task');
  if (!(await tasksRepo.findById(orgId, tid))) throw notFound('Task');
  const docs = await checkpointsRepo.find(orgId, { taskId: tid }, { sort: { stepIndex: 1 } });
  return docs.map((c) => ({
    id: String(c._id),
    taskId: String(c.taskId),
    stepIndex: c.stepIndex,
    stepName: c.stepName,
    output: c.output,
    idempotencyKey: c.idempotencyKey,
    workerId: c.workerId,
    attempt: c.attempt,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function listOutcomes(orgId: ObjectId, q: { agentId?: string; limit?: number }): Promise<OutcomeListItem[]> {
  const filter: Filter<OutcomeDoc> = q.agentId ? { agentId: toObjectId(q.agentId, 'Agent') } : {};
  const outcomes = await outcomesRepo.find(orgId, filter, { sort: { createdAt: -1 }, limit: q.limit ?? 50 });
  const tasks = await tasksRepo.findByIds(orgId, outcomes.map((o) => o.taskId));
  const goal = new Map(tasks.map((t) => [String(t._id), t.goal]));
  return outcomes.map((o) => ({
    id: String(o._id),
    taskId: String(o.taskId),
    agentId: String(o.agentId),
    question: goal.get(String(o.taskId)) ?? '',
    result: o.result,
    feedback: o.feedback,
    notes: o.notes,
    citedMemoryIds: o.citedMemoryIds.map(String),
    createdMemoryId: o.createdMemoryId ? String(o.createdMemoryId) : null,
    isSeed: o.isSeed,
    createdAt: o.createdAt.toISOString(),
  }));
}
