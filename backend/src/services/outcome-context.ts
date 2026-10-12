import type { ObjectId } from 'mongodb';
import type { OutcomeDoc } from '../db/collections.js';
import { outcomesRepo, tasksRepo, type SearchHit } from '../db/repositories/index.js';
import { config } from '../config.js';
import { embedQuery, isVoyageConfigured } from './embeddings.js';
import { contextWeight, cosine } from './rrf.js';

export interface OutcomeContext {
  /** Cosine between the search query and the closest question this memory's outcome evidence was recorded on. */
  similarity: number;
  weight: number;
  question: string;
}

const current = (o: Pick<OutcomeDoc, 'questionEmbedding'>) =>
  Boolean(o.questionEmbedding && o.questionEmbedding.model === config.VOYAGE_MODEL && o.questionEmbedding.dimensions === config.VOYAGE_DIMENSIONS);

/** Embeds the question an outcome answered (best effort: without it the outcome simply gives no ranking signal). */
export async function embedOutcomeQuestion(orgId: ObjectId, outcomeId: ObjectId, question: string): Promise<boolean> {
  if (!isVoyageConfigured()) return false;
  try {
    const { vector } = await embedQuery(question);
    await outcomesRepo.updateById(orgId, outcomeId, {
      $set: { question, questionEmbedding: { vector, model: config.VOYAGE_MODEL, dimensions: config.VOYAGE_DIMENSIONS, embeddedAt: new Date() } },
    });
    return true;
  } catch (err) {
    console.warn(`[outcome-context] could not embed outcome ${outcomeId.toHexString()}: ${(err as Error).message}`);
    return false;
  }
}

/** Embeds the questions of outcomes that have none (or one from another model). Used by seed and embed:backfill. */
export async function backfillOutcomeQuestions(orgId: ObjectId): Promise<{ embedded: number; failed: number }> {
  const outcomes = await outcomesRepo.find(orgId, {}, { projection: { 'questionEmbedding.vector': 0 } });
  const stale = outcomes.filter((o) => !current(o));
  const tasks = await tasksRepo.findByIds(orgId, stale.map((o) => o.taskId));
  const goal = new Map(tasks.map((t) => [t._id.toHexString(), t.goal]));
  let embedded = 0;
  let failed = 0;
  for (const o of stale) {
    const q = o.question ?? goal.get(o.taskId.toHexString());
    if (!q) continue;
    if (await embedOutcomeQuestion(orgId, o._id, q)) embedded += 1;
    else failed += 1;
  }
  return { embedded, failed };
}

/**
 * For each verified memory among the candidates, finds the outcome questions behind its verification
 * (worked outcomes for verified_success, failed ones for verified_failure) and returns the closest one
 * to the current query with its context weight.
 */
export async function outcomeContexts(orgId: ObjectId, queryVector: number[], hits: SearchHit[]): Promise<Map<string, OutcomeContext>> {
  const verified = hits.filter((h) => h.verification.status !== 'unverified' && h.verification.outcomeIds.length);
  const out = new Map<string, OutcomeContext>();
  if (!verified.length) return out;
  const ids = [...new Set(verified.flatMap((h) => h.verification.outcomeIds.map(String)))];
  const outcomes = await outcomesRepo.findByIds(orgId, ids);
  const byId = new Map(outcomes.map((o) => [o._id.toHexString(), o]));
  for (const h of verified) {
    const want = h.verification.status === 'verified_success' ? 'worked' : 'failed';
    let best: OutcomeContext | null = null;
    for (const oid of h.verification.outcomeIds) {
      const o = byId.get(String(oid));
      if (!o || o.result !== want || !current(o) || !o.question) continue;
      const similarity = cosine(queryVector, o.questionEmbedding!.vector);
      if (!best || similarity > best.similarity) best = { similarity, weight: contextWeight(similarity), question: o.question };
    }
    if (best) out.set(String(h._id), best);
  }
  return out;
}
