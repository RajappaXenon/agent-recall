import { ObjectId, type Filter, type Sort } from 'mongodb';
import type { CreateMemoryInput, MemoryListQuery, MemoryType, UpdateMemoryInput } from '@agent-recall/shared';
import type { MemoryDoc } from '../db/collections.js';
import { agentsRepo, memoriesRepo, toObjectId, type NewDoc } from '../db/repositories/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { contentHash, documentText, embedDocuments, embeddingModel, isVoyageConfigured } from './embeddings.js';
import { logEvent, type Actor } from './events.js';

/** Embeds one memory and stores the vector. Never throws: a failure marks the memory `failed` and logs an event. */
export async function embedMemory(orgId: ObjectId, memory: MemoryDoc, opts: { force?: boolean } = {}): Promise<MemoryDoc['embeddingStatus']> {
  const { model, dimensions } = embeddingModel();
  const hash = contentHash(memory.title, memory.content, memory.tags);
  if (
    !opts.force &&
    memory.embedding &&
    memory.embedding.contentHash === hash &&
    memory.embedding.model === model &&
    memory.embedding.dimensions === dimensions &&
    memory.embeddingStatus === 'ready'
  ) {
    return 'ready';
  }
  if (!isVoyageConfigured()) {
    await memoriesRepo.updateById(orgId, memory._id, { $set: { embeddingStatus: 'pending', embeddingError: 'VOYAGE_API_KEY not set' } });
    return 'pending';
  }
  try {
    const [vector] = await embedDocuments([documentText(memory.title, memory.content, memory.tags)]);
    await memoriesRepo.updateById(orgId, memory._id, {
      $set: {
        embedding: { vector: vector!, provider: 'voyage', model, dimensions, contentHash: hash, embeddedAt: new Date() },
        embeddingStatus: 'ready',
        embeddingError: null,
      },
    });
    return 'ready';
  } catch (err) {
    const message = (err as Error).message;
    await memoriesRepo.updateById(orgId, memory._id, { $set: { embeddingStatus: 'failed', embeddingError: message } });
    await logEvent(orgId, {
      type: 'memory.embedding_failed',
      status: 'error',
      actor: { kind: 'system', id: null, name: 'embeddings' },
      summary: `Embedding failed for "${memory.title}"`,
      memoryId: memory._id,
      agentId: memory.agentId,
      details: { error: message, model },
    });
    return 'failed';
  }
}

/** Batch embedding for backfills and seeding. Returns counts. */
export async function embedMany(orgId: ObjectId, memories: MemoryDoc[]): Promise<{ embedded: number; skipped: number; failed: number }> {
  const { model, dimensions } = embeddingModel();
  const todo = memories.filter((m) => {
    const hash = contentHash(m.title, m.content, m.tags);
    return !(m.embedding && m.embedding.contentHash === hash && m.embedding.model === model && m.embedding.dimensions === dimensions && m.embeddingStatus === 'ready');
  });
  const skipped = memories.length - todo.length;
  if (todo.length === 0) return { embedded: 0, skipped, failed: 0 };
  // Batch by batch: a failure only marks its own batch, earlier vectors are kept.
  let embedded = 0;
  let failed = 0;
  for (let start = 0; start < todo.length; start += 64) {
    const batch = todo.slice(start, start + 64);
    try {
      const vectors = await embedDocuments(batch.map((m) => documentText(m.title, m.content, m.tags)));
      const now = new Date();
      await Promise.all(
        batch.map((m, i) =>
          memoriesRepo.updateById(orgId, m._id, {
            $set: {
              embedding: { vector: vectors[i]!, provider: 'voyage', model, dimensions, contentHash: contentHash(m.title, m.content, m.tags), embeddedAt: now },
              embeddingStatus: 'ready',
              embeddingError: null,
            },
          }),
        ),
      );
      embedded += batch.length;
    } catch (err) {
      const message = (err as Error).message;
      await memoriesRepo.updateMany(orgId, { _id: { $in: batch.map((m) => m._id) } }, { $set: { embeddingStatus: 'failed', embeddingError: message } });
      failed += batch.length;
    }
  }
  return { embedded, skipped, failed };
}

export async function assertAgent(orgId: ObjectId, agentId: string | ObjectId) {
  const agent = await agentsRepo.findById(orgId, agentId);
  if (!agent) throw new AppError(400, 'AGENT_NOT_FOUND', 'Agent not found in this organization.');
  return agent;
}

async function assertRelationTargets(orgId: ObjectId, relations: { targetMemoryId: string; label: string }[] | undefined) {
  if (!relations?.length) return [];
  const ids = relations.map((r) => toObjectId(r.targetMemoryId, 'Related memory'));
  const found = await memoriesRepo.findByIds(orgId, ids);
  if (found.length !== new Set(ids.map(String)).size) throw new AppError(400, 'RELATION_NOT_FOUND', 'A related memory does not exist in this organization.');
  return relations.map((r, i) => ({ targetMemoryId: ids[i]!, label: r.label }));
}

export async function createMemory(
  orgId: ObjectId,
  input: CreateMemoryInput & { tags: string[] },
  actor: Actor,
  extra: Partial<Pick<NewDoc<MemoryDoc>, 'provenance' | 'sourceTaskId' | 'isSeed' | 'createdAt' | 'verification' | 'usefulness'>> = {},
  opts: { embed?: boolean } = {},
): Promise<MemoryDoc> {
  const agent = await assertAgent(orgId, input.agentId);
  const relations = await assertRelationTargets(orgId, input.relations);
  const doc = await memoriesRepo.insertOne(orgId, {
    agentId: agent._id,
    title: input.title,
    content: input.content,
    type: input.type,
    tags: input.tags,
    sourceTaskId: extra.sourceTaskId ?? null,
    provenance: extra.provenance ?? { kind: 'manual' },
    verification: extra.verification ?? { status: 'unverified', outcomeIds: [], verifiedAt: null },
    usefulness: extra.usefulness ?? { helpful: 0, notHelpful: 0 },
    relations,
    embedding: null,
    embeddingStatus: 'pending',
    retrievalCount: 0,
    archived: false,
    isSeed: extra.isSeed,
    createdAt: extra.createdAt,
  });
  await logEvent(orgId, {
    type: 'memory.created',
    status: 'success',
    actor,
    summary: `Memory created: ${doc.title}`,
    agentId: doc.agentId,
    memoryId: doc._id,
    details: { type: doc.type, provenance: doc.provenance.kind },
    isSeed: doc.isSeed,
  });
  if (opts.embed !== false) {
    doc.embeddingStatus = await embedMemory(orgId, doc);
  }
  return (await memoriesRepo.findById(orgId, doc._id)) ?? doc;
}

export async function updateMemory(orgId: ObjectId, id: string, input: UpdateMemoryInput, actor: Actor): Promise<MemoryDoc> {
  const existing = await memoriesRepo.findById(orgId, id);
  if (!existing) throw notFound('Memory');
  const $set: Partial<MemoryDoc> = {};
  if (input.title !== undefined) $set.title = input.title;
  if (input.content !== undefined) $set.content = input.content;
  if (input.type !== undefined) $set.type = input.type;
  if (input.tags !== undefined) $set.tags = input.tags;
  if (input.relations !== undefined) $set.relations = await assertRelationTargets(orgId, input.relations);
  const updated = await memoriesRepo.updateById(orgId, id, { $set });
  if (!updated) throw notFound('Memory');
  await logEvent(orgId, {
    type: 'memory.updated',
    actor,
    summary: `Memory edited: ${updated.title}`,
    agentId: updated.agentId,
    memoryId: updated._id,
    details: { fields: Object.keys($set) },
  });
  await embedMemory(orgId, updated);
  return (await memoriesRepo.findById(orgId, id))!;
}

export async function archiveMemory(orgId: ObjectId, id: string, actor: Actor): Promise<MemoryDoc> {
  const updated = await memoriesRepo.updateById(orgId, id, { $set: { archived: true } });
  if (!updated) throw notFound('Memory');
  await logEvent(orgId, {
    type: 'memory.archived',
    status: 'warning',
    actor,
    summary: `Memory archived: ${updated.title}`,
    agentId: updated.agentId,
    memoryId: updated._id,
  });
  return updated;
}

const SORTS: Record<MemoryListQuery['sort'], Sort> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  usefulness: { 'usefulness.helpful': -1, 'usefulness.notHelpful': 1, createdAt: -1 },
  retrievals: { retrievalCount: -1, createdAt: -1 },
};

export async function listMemories(orgId: ObjectId, q: MemoryListQuery) {
  const filter: Filter<MemoryDoc> = {};
  if (!q.includeArchived) filter.archived = false;
  if (q.agentId) filter.agentId = toObjectId(q.agentId, 'Agent');
  if (q.type) filter.type = q.type as MemoryType;
  if (q.verification) filter['verification.status'] = q.verification;
  if (q.tag) filter.tags = q.tag;
  const [items, total] = await Promise.all([
    memoriesRepo.find(orgId, filter, {
      sort: SORTS[q.sort],
      skip: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      projection: { 'embedding.vector': 0 },
    }),
    memoriesRepo.count(orgId, filter),
  ]);
  return { items, total };
}

export const newObjectId = () => new ObjectId();
