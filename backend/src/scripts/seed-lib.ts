import type { ObjectId } from 'mongodb';
import type { AgentDoc, MemoryDoc } from '../db/collections.js';
import { ensureRegularIndexes } from '../db/indexes.js';
import {
  agentsRepo,
  eventsRepo,
  identityRepo,
  memoriesRepo,
  outcomesRepo,
  tasksRepo,
} from '../db/repositories/index.js';
import { isVoyageConfigured } from '../services/embeddings.js';
import { embedMany } from '../services/memories.js';
import { backfillOutcomeQuestions } from '../services/outcome-context.js';
import { SEED_AGENTS, SEED_MEMORIES, SEED_OUTCOMES, type AgentKey } from './seed-data.js';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const seedActor = { kind: 'system' as const, id: null, name: 'seed' };

export interface SeedResult {
  orgId: ObjectId;
  agents: number;
  memories: number;
  outcomes: number;
  embedding: { embedded: number; skipped: number; failed: number } | 'skipped: VOYAGE_API_KEY not set';
}

/**
 * Idempotent: upserts every seed record by seedKey and resets it to its seeded
 * state (verification, usefulness, retrievalCount). Embeddings are kept when the
 * content hash, model and dimensions still match.
 */
export async function seedDemo(): Promise<SeedResult> {
  await ensureRegularIndexes();
  const { org } = await identityRepo.ensureDemoIdentity();
  const orgId = org._id;

  // Agents
  const agentIds = {} as Record<AgentKey, ObjectId>;
  for (const [key, a] of Object.entries(SEED_AGENTS) as [AgentKey, (typeof SEED_AGENTS)[AgentKey]][]) {
    const doc = await agentsRepo.upsertSeed(orgId, `agent-${key}`, {
      name: a.name,
      description: a.description,
      status: 'active',
      createdAt: daysAgo(200),
    } as Parameters<typeof agentsRepo.upsertSeed>[2]);
    agentIds[key] = (doc as AgentDoc)._id;
    await eventsRepo.upsertSeed(orgId, `evt-agent-${key}`, {
      type: 'agent.created',
      status: 'success',
      actor: seedActor,
      summary: `Agent created: ${a.name}`,
      agentId: doc._id,
      taskId: null,
      memoryId: null,
      details: {},
      createdAt: daysAgo(200),
    });
  }

  // Memories (pass 1: content; pass 2: relations once every id is known)
  const memIds: Record<string, ObjectId> = {};
  for (const m of SEED_MEMORIES) {
    const doc = await memoriesRepo.upsertSeed(
      orgId,
      m.key,
      {
        agentId: agentIds[m.agent],
        title: m.title,
        content: m.content,
        type: m.type,
        tags: m.tags,
        sourceTaskId: null,
        provenance: { kind: 'seed' },
        verification: { status: m.verification ?? 'unverified', outcomeIds: [], verifiedAt: m.verification && m.verification !== 'unverified' ? daysAgo(m.daysAgo) : null },
        usefulness: { helpful: m.helpful ?? 0, notHelpful: m.notHelpful ?? 0 },
        relations: [],
        embedding: null,
        embeddingStatus: 'pending',
        retrievalCount: 0,
        archived: false,
        createdAt: daysAgo(m.daysAgo),
      },
      ['embedding', 'embeddingStatus'],
    );
    memIds[m.key] = doc._id;
    await eventsRepo.upsertSeed(orgId, `evt-mem-${m.key}`, {
      type: 'memory.created',
      status: 'success',
      actor: seedActor,
      summary: `Memory created: ${m.title}`,
      agentId: agentIds[m.agent],
      taskId: null,
      memoryId: doc._id,
      details: { type: m.type, provenance: 'seed' },
      createdAt: daysAgo(m.daysAgo),
    });
  }
  for (const m of SEED_MEMORIES) {
    const relations = (m.relations ?? []).map((r) => ({ targetMemoryId: memIds[r.to]!, label: r.label }));
    await memoriesRepo.updateById(orgId, memIds[m.key]!, { $set: { relations } });
  }

  // Seeded Q&A tasks + outcomes that verified / failed the procedures
  for (const o of SEED_OUTCOMES) {
    const cited = o.cited.map((k) => memIds[k]!);
    const task = await tasksRepo.upsertSeed(orgId, `task-${o.key}`, {
      kind: 'qa',
      agentId: agentIds[o.agent],
      goal: o.query,
      input: { query: o.query },
      status: 'completed',
      currentStep: 1,
      steps: [{ name: 'Grounded answer', status: 'completed' }],
      memoryIds: cited,
      output: { answer: o.answer, citations: cited.map(String), model: 'seed (not an LLM call)' },
      error: null,
      workerId: null,
      leaseExpiresAt: null,
      attempt: 1,
      completedAt: daysAgo(o.daysAgo),
      createdAt: daysAgo(o.daysAgo),
    });
    const { user } = await identityRepo.ensureDemoIdentity();
    const outcome = await outcomesRepo.upsertSeed(orgId, o.key, {
      taskId: task._id,
      agentId: agentIds[o.agent],
      result: o.result,
      feedback: o.feedback,
      notes: o.notes,
      citedMemoryIds: cited,
      createdMemoryId: o.createdMemory ? memIds[o.createdMemory]! : null,
      userId: user._id,
      createdAt: daysAgo(o.daysAgo),
    });
    const procedural = SEED_MEMORIES.filter((m) => o.cited.includes(m.key) && m.type === 'procedural').map((m) => memIds[m.key]!);
    await memoriesRepo.updateMany(orgId, { _id: { $in: procedural } }, { $addToSet: { 'verification.outcomeIds': outcome._id } });
    if (o.createdMemory) {
      await memoriesRepo.updateById(orgId, memIds[o.createdMemory]!, {
        $set: { provenance: { kind: 'outcome', outcomeId: outcome._id, citedMemoryIds: cited }, sourceTaskId: task._id },
        $addToSet: { 'verification.outcomeIds': outcome._id },
      });
    }
    await eventsRepo.upsertSeed(orgId, `evt-${o.key}`, {
      type: 'outcome.recorded',
      status: o.result === 'worked' ? 'success' : 'error',
      actor: seedActor,
      summary: `Outcome recorded: ${o.result === 'worked' ? 'worked' : 'failed'} — ${o.query}`,
      agentId: agentIds[o.agent],
      taskId: task._id,
      memoryId: null,
      details: { result: o.result, feedback: o.feedback, citedMemoryIds: cited.map(String) },
      createdAt: daysAgo(o.daysAgo),
    });
  }

  // Embeddings (live Voyage calls; skipped without a key → memories stay `pending`)
  let embedding: SeedResult['embedding'] = 'skipped: VOYAGE_API_KEY not set';
  if (isVoyageConfigured()) {
    const all = (await memoriesRepo.find(orgId, { isSeed: true })) as MemoryDoc[];
    embedding = await embedMany(orgId, all);
    await backfillOutcomeQuestions(orgId);
  }

  return { orgId, agents: Object.keys(agentIds).length, memories: SEED_MEMORIES.length, outcomes: SEED_OUTCOMES.length, embedding };
}
