import type { ObjectId } from 'mongodb';
import type { Engine, MemoryRelatedResponse, MemoryRetrievalsResponse, ScoreKind, SearchableResponse } from '@agent-recall/shared';
import type { MemoryDoc } from '../db/collections.js';
import { atlasKeywordSearch, atlasVectorSearch, memoriesRepo, memoryWithVector, retrievalLogsRepo, toObjectId } from '../db/repositories/index.js';
import { notFound } from '../lib/errors.js';
import { indexAvailability } from './search.js';

const summary = (m: MemoryDoc) => ({
  id: m._id.toHexString(),
  title: m.title,
  type: m.type,
  isSeed: m.isSeed,
  verification: {
    status: m.verification.status,
    outcomeIds: m.verification.outcomeIds.map(String),
    verifiedAt: m.verification.verifiedAt ? m.verification.verifiedAt.toISOString() : null,
  },
});

/** Taxonomic relations (both directions) plus nearest neighbours by vector. */
export async function relatedMemories(orgId: ObjectId, id: string): Promise<MemoryRelatedResponse> {
  const oid = toObjectId(id, 'Memory');
  const memory = await memoryWithVector(orgId, oid);
  if (!memory) throw notFound('Memory');

  const outgoingIds = (memory.relations ?? []).map((r) => r.targetMemoryId);
  const [outgoing, incoming] = await Promise.all([
    memoriesRepo.findByIds(orgId, outgoingIds),
    memoriesRepo.find(orgId, { 'relations.targetMemoryId': oid, archived: false }, { projection: { 'embedding.vector': 0 } }),
  ]);
  const byId = new Map(outgoing.map((m) => [String(m._id), m]));
  const relations: MemoryRelatedResponse['relations'] = [
    ...(memory.relations ?? []).flatMap((r) => {
      const m = byId.get(String(r.targetMemoryId));
      return m ? [{ memory: summary(m), label: r.label, direction: 'outgoing' as const }] : [];
    }),
    ...incoming.map((m) => ({
      memory: summary(m),
      label: m.relations?.find((r) => String(r.targetMemoryId) === id)?.label ?? 'related',
      direction: 'incoming' as const,
    })),
  ];

  let neighbors: MemoryRelatedResponse['neighbors'];
  const avail = await indexAvailability();
  if (!memory.embedding?.vector) {
    neighbors = { engine: 'unavailable', reason: `This memory has no embedding yet (status ${memory.embeddingStatus}).`, items: [] };
  } else if (!avail.vector) {
    neighbors = { engine: 'unavailable', reason: 'Vector index is not queryable. Run npm run setup:indexes -w backend.', items: [] };
  } else {
    const hits = await atlasVectorSearch(orgId, { queryVector: memory.embedding.vector, filter: {}, limit: 6, numCandidates: 100 });
    neighbors = {
      engine: 'atlas_vector_search',
      reason: null,
      items: hits.filter((h) => String(h._id) !== id).slice(0, 5).map((h) => ({ memory: summary(h), score: h._score })),
    };
  }
  return { relations, neighbors };
}

/** Every logged search that returned this memory, newest first. */
export async function memoryRetrievals(orgId: ObjectId, id: string): Promise<MemoryRetrievalsResponse> {
  const oid = toObjectId(id, 'Memory');
  if (!(await memoriesRepo.findById(orgId, oid))) throw notFound('Memory');
  const rows = await retrievalLogsRepo.aggregate<{
    _id: ObjectId;
    query: string;
    mode: 'keyword' | 'semantic' | 'hybrid';
    engine: Engine;
    createdAt: Date;
    r: { rank: number; score: number };
  }>(orgId, [
    { $match: { 'results.memoryId': oid } },
    { $sort: { createdAt: -1 } },
    { $limit: 50 },
    { $unwind: '$results' },
    { $match: { 'results.memoryId': oid } },
    { $project: { query: 1, mode: 1, engine: 1, createdAt: 1, r: '$results' } },
  ]);
  const kindOf = (mode: string, engine: string): ScoreKind =>
    engine === 'fallback_regex' ? 'regex' : mode === 'keyword' ? 'search' : mode === 'semantic' ? 'vector' : 'final';
  return {
    items: rows.map((x) => ({
      logId: x._id.toHexString(),
      query: x.query,
      mode: x.mode,
      engine: x.engine,
      rank: x.r.rank,
      score: x.r.score,
      scoreKind: kindOf(x.mode, x.engine),
      createdAt: x.createdAt.toISOString(),
    })),
  };
}

/**
 * Whether a memory is retrievable right now through each index. Atlas indexing is
 * near-real-time, so a newly written memory may take a few seconds to appear.
 */
export async function searchability(orgId: ObjectId, id: string): Promise<SearchableResponse> {
  const oid = toObjectId(id, 'Memory');
  const memory = await memoryWithVector(orgId, oid);
  if (!memory) throw notFound('Memory');
  const avail = await indexAvailability();

  let keyword = false;
  if (avail.search) {
    const hits = await atlasKeywordSearch(orgId, {
      should: [{ phrase: { query: memory.title, path: 'title' } }],
      filter: [],
      limit: 20,
    });
    keyword = hits.some((h) => String(h._id) === id);
  }
  let vector = false;
  if (avail.vector && memory.embedding?.vector) {
    const hits = await atlasVectorSearch(orgId, { queryVector: memory.embedding.vector, filter: {}, limit: 5, numCandidates: 50 });
    vector = hits.some((h) => String(h._id) === id);
  }
  const needsVector = memory.embeddingStatus === 'ready';
  const searchable = keyword && (vector || !needsVector);
  const detail = searchable
    ? needsVector
      ? 'Retrievable by keyword and semantic search.'
      : `Retrievable by keyword search; no embedding (${memory.embeddingStatus}).`
    : `Indexing: keyword ${keyword ? 'ready' : 'pending'}, vector ${vector ? 'ready' : needsVector ? 'pending' : 'n/a'}.`;
  return { memoryId: id, keyword, vector, embeddingStatus: memory.embeddingStatus, searchable, checkedAt: new Date().toISOString(), detail };
}
