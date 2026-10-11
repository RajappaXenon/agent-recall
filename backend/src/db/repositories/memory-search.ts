import type { Document, ObjectId } from 'mongodb';
import { rawCollections, type MemoryDoc } from '../collections.js';
import { SEARCH_INDEX_NAME, VECTOR_INDEX_NAME } from '../search-indexes.js';
import { assertOrgId } from './base.js';

/**
 * Atlas Search / Vector Search stages must be the first pipeline stage, so they
 * can't go through ScopedRepository.aggregate. These helpers inject the tenant
 * filter (orgId + archived:false) into the search stage itself.
 */

export type SearchHit = MemoryDoc & { _score: number; _highlights?: Document[]; _scoreDetails?: Document };

/** Atlas Search `$search` with compound.should clauses supplied by the caller. */
export async function atlasKeywordSearch(
  orgId: ObjectId,
  opts: { should: Document[]; filter: Document[]; limit: number; highlightPath?: string; indexName?: string },
): Promise<SearchHit[]> {
  const { memories } = await rawCollections();
  const pipeline: Document[] = [
    {
      $search: {
        index: opts.indexName ?? SEARCH_INDEX_NAME,
        compound: {
          should: opts.should,
          minimumShouldMatch: 1,
          filter: [{ equals: { path: 'orgId', value: assertOrgId(orgId) } }, { equals: { path: 'archived', value: false } }, ...opts.filter],
        },
        ...(opts.highlightPath ? { highlight: { path: opts.highlightPath, maxNumPassages: 1 } } : {}),
        scoreDetails: true,
      },
    },
    { $limit: opts.limit },
    {
      $set: {
        _score: { $meta: 'searchScore' },
        _highlights: { $meta: 'searchHighlights' },
        _scoreDetails: { $meta: 'searchScoreDetails' },
      },
    },
    { $project: { 'embedding.vector': 0 } },
  ];
  return (await memories.aggregate(pipeline).toArray()) as SearchHit[];
}

/** Atlas Vector Search `$vectorSearch`, pre-filtered by tenant. */
export async function atlasVectorSearch(
  orgId: ObjectId,
  opts: { queryVector: number[]; filter: Document; limit: number; numCandidates: number; indexName?: string },
): Promise<SearchHit[]> {
  const { memories } = await rawCollections();
  const tenant = { orgId: { $eq: assertOrgId(orgId) }, archived: { $eq: false } };
  const filter = Object.keys(opts.filter).length ? { $and: [tenant, opts.filter] } : tenant;
  const pipeline: Document[] = [
    {
      $vectorSearch: {
        index: opts.indexName ?? VECTOR_INDEX_NAME,
        path: 'embedding.vector',
        queryVector: opts.queryVector,
        numCandidates: opts.numCandidates,
        limit: opts.limit,
        filter,
      },
    },
    { $set: { _score: { $meta: 'vectorSearchScore' } } },
    { $project: { 'embedding.vector': 0 } },
  ];
  return (await memories.aggregate(pipeline).toArray()) as SearchHit[];
}

/** Labelled fallback (NOT Atlas Search): case-insensitive regex over title/content within the tenant. */
export async function regexFallbackSearch(orgId: ObjectId, opts: { terms: string[]; filter: Document; limit: number }): Promise<SearchHit[]> {
  const { memories } = await rawCollections();
  if (opts.terms.length === 0) return [];
  const escaped = opts.terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(escaped.join('|'), 'i');
  const docs = await memories
    .find(
      { ...opts.filter, orgId: assertOrgId(orgId), archived: false, $or: [{ title: re }, { content: re }] },
      { projection: { 'embedding.vector': 0 }, limit: 200 },
    )
    .toArray();
  // Score = number of distinct query terms present (a plain count, labelled "regex").
  const scored = docs.map((d) => {
    const text = `${d.title} ${d.content}`.toLowerCase();
    const score = opts.terms.filter((t) => text.includes(t.toLowerCase())).length;
    return { ...d, _score: score } as SearchHit;
  });
  return scored.sort((a, b) => b._score - a._score || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, opts.limit);
}

/** Loads one memory with its vector (for neighbours / searchability checks). */
export async function memoryWithVector(orgId: ObjectId, id: ObjectId): Promise<MemoryDoc | null> {
  const { memories } = await rawCollections();
  return memories.findOne({ _id: id, orgId: assertOrgId(orgId) });
}
