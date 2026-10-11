import type { ObjectId } from 'mongodb';
import type { Agent, Memory } from '@agent-recall/shared';
import type { AgentDoc, MemoryDoc } from '../db/collections.js';

export const sid = (id: ObjectId) => id.toHexString();
export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Laplace-smoothed usefulness: (helpful + 1) / (helpful + notHelpful + 2). */
export const usefulnessScore = (u: { helpful: number; notHelpful: number }) => (u.helpful + 1) / (u.helpful + u.notHelpful + 2);

export function toAgent(d: AgentDoc): Agent {
  return {
    id: sid(d._id),
    orgId: sid(d.orgId),
    isSeed: d.isSeed,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    name: d.name,
    description: d.description,
    status: d.status,
  };
}

export function toMemory(d: MemoryDoc): Memory {
  return {
    id: sid(d._id),
    orgId: sid(d.orgId),
    isSeed: d.isSeed,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    agentId: sid(d.agentId),
    title: d.title,
    content: d.content,
    type: d.type,
    tags: d.tags,
    sourceTaskId: d.sourceTaskId ? sid(d.sourceTaskId) : null,
    provenance: {
      kind: d.provenance.kind,
      ...(d.provenance.outcomeId ? { outcomeId: sid(d.provenance.outcomeId) } : {}),
      ...(d.provenance.citedMemoryIds ? { citedMemoryIds: d.provenance.citedMemoryIds.map(sid) } : {}),
    },
    verification: {
      status: d.verification.status,
      outcomeIds: d.verification.outcomeIds.map(sid),
      verifiedAt: isoOrNull(d.verification.verifiedAt),
    },
    usefulness: { ...d.usefulness, score: Number(usefulnessScore(d.usefulness).toFixed(4)) },
    relations: (d.relations ?? []).map((r) => ({ targetMemoryId: sid(r.targetMemoryId), label: r.label })),
    embedding: d.embedding
      ? { provider: 'voyage', model: d.embedding.model, dimensions: d.embedding.dimensions, embeddedAt: iso(d.embedding.embeddedAt) }
      : null,
    embeddingStatus: d.embeddingStatus,
    retrievalCount: d.retrievalCount,
    archived: d.archived,
  };
}
