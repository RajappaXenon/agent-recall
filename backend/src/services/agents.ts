import type { ObjectId } from 'mongodb';
import type { AgentWithStats, CreateAgentInput, UpdateAgentInput } from '@agent-recall/shared';
import type { AgentDoc } from '../db/collections.js';
import { agentsRepo, eventsRepo, memoriesRepo, outcomesRepo, tasksRepo } from '../db/repositories/index.js';
import { notFound } from '../lib/errors.js';
import { toAgent } from '../lib/serialize.js';
import { logEvent, type Actor } from './events.js';

async function countBy(orgId: ObjectId, repo: typeof memoriesRepo | typeof tasksRepo | typeof outcomesRepo, match: Record<string, unknown> = {}) {
  const rows = await repo.aggregate<{ _id: ObjectId; n: number }>(orgId, [{ $match: match }, { $group: { _id: '$agentId', n: { $sum: 1 } } }]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

export async function withStats(orgId: ObjectId, agents: AgentDoc[]): Promise<AgentWithStats[]> {
  const [memories, tasks, outcomes, lastEvents] = await Promise.all([
    countBy(orgId, memoriesRepo, { archived: false }),
    countBy(orgId, tasksRepo),
    countBy(orgId, outcomesRepo, { result: 'worked' }),
    eventsRepo.aggregate<{ _id: ObjectId; at: Date }>(orgId, [
      { $match: { agentId: { $ne: null } } },
      { $group: { _id: '$agentId', at: { $max: '$createdAt' } } },
    ]),
  ]);
  const last = new Map(lastEvents.map((r) => [String(r._id), r.at]));
  return agents.map((a) => {
    const k = String(a._id);
    return {
      ...toAgent(a),
      stats: {
        memoryCount: memories.get(k) ?? 0,
        taskCount: tasks.get(k) ?? 0,
        successfulOutcomes: outcomes.get(k) ?? 0,
        lastActivityAt: last.get(k)?.toISOString() ?? null,
      },
    };
  });
}

export async function listAgents(orgId: ObjectId) {
  return withStats(orgId, await agentsRepo.find(orgId, {}, { sort: { createdAt: 1 } }));
}

export async function getAgent(orgId: ObjectId, id: string) {
  const agent = await agentsRepo.findById(orgId, id);
  if (!agent) throw notFound('Agent');
  return (await withStats(orgId, [agent]))[0]!;
}

export async function createAgent(orgId: ObjectId, input: CreateAgentInput, actor: Actor, isSeed = false) {
  const agent = await agentsRepo.insertOne(orgId, {
    name: input.name,
    description: input.description ?? '',
    status: input.status ?? 'active',
    isSeed,
  });
  await logEvent(orgId, { type: 'agent.created', status: 'success', actor, summary: `Agent created: ${agent.name}`, agentId: agent._id, isSeed });
  return agent;
}

export async function updateAgent(orgId: ObjectId, id: string, input: UpdateAgentInput, actor: Actor) {
  const $set: Partial<AgentDoc> = {};
  if (input.name !== undefined) $set.name = input.name;
  if (input.description !== undefined) $set.description = input.description;
  if (input.status !== undefined) $set.status = input.status;
  const agent = await agentsRepo.updateById(orgId, id, { $set });
  if (!agent) throw notFound('Agent');
  await logEvent(orgId, { type: 'agent.updated', actor, summary: `Agent updated: ${agent.name}`, agentId: agent._id, details: { fields: Object.keys($set) } });
  return getAgent(orgId, id);
}
