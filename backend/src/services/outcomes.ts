import { MongoServerError, type ObjectId } from 'mongodb';
import type { OutcomeRequest, OutcomeResponse, VerificationStatus } from '@agent-recall/shared';
import { getClient } from '../db/client.js';
import type { MemoryDoc } from '../db/collections.js';
import { memoriesRepo, outcomesRepo, tasksRepo, toObjectId } from '../db/repositories/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { toMemory } from '../lib/serialize.js';
import { logEvent, type Actor } from './events.js';
import { createMemory } from './memories.js';

const stripCitations = (s: string) => s.replace(/\s*\[mem:[a-f0-9]{24}\]/g, '').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Records an explicit outcome for a QA task (SPEC §6):
 * 1. insert outcome  2. usefulness from feedback  3. verification rules for cited procedural memories
 * (1–3 in one transaction)  4. new episodic memory with provenance, embedded  5. events.
 * Only an explicit outcome can verify anything.
 */
export async function recordOutcome(
  orgId: ObjectId,
  userId: ObjectId,
  taskId: string,
  req: { result: 'worked' | 'failed'; feedback?: 'helpful' | 'not_helpful'; notes: string },
  actor: Actor,
): Promise<OutcomeResponse> {
  const task = await tasksRepo.findById(orgId, toObjectId(taskId, 'Task'));
  if (!task) throw notFound('Task');
  if (task.kind !== 'qa' || task.status !== 'completed') {
    throw new AppError(409, 'TASK_NOT_ANSWERED', 'Outcomes can only be recorded for a completed answer task.');
  }
  const answer = String(task.output?.answer ?? '');
  const citedIds = ((task.output?.citations as string[] | undefined) ?? []).map((id) => toObjectId(id));
  // If the answer cited nothing, the outcome applies to every memory it was grounded in.
  const cited = citedIds.length ? citedIds : task.memoryIds;
  const citedDocs = (await memoriesRepo.find(orgId, { _id: { $in: cited } }, { projection: { 'embedding.vector': 0 } })) as MemoryDoc[];

  const now = new Date();
  const verificationChanges: OutcomeResponse['verificationChanges'] = [];
  let outcomeId: ObjectId | undefined;

  const session = (await getClient()).startSession();
  try {
    await session.withTransaction(async () => {
      verificationChanges.length = 0;
      const outcome = await outcomesRepo.insertOne(
        orgId,
        {
          taskId: task._id,
          agentId: task.agentId,
          result: req.result,
          feedback: req.feedback ?? null,
          notes: req.notes,
          citedMemoryIds: cited,
          createdMemoryId: null,
          userId,
        },
        session,
      );
      outcomeId = outcome._id;

      if (req.feedback) {
        await memoriesRepo.updateMany(
          orgId,
          { _id: { $in: cited } },
          { $inc: req.feedback === 'helpful' ? { 'usefulness.helpful': 1 } : { 'usefulness.notHelpful': 1 } },
          session,
        );
      }

      for (const m of citedDocs.filter((d) => d.type === 'procedural')) {
        const from = m.verification.status;
        let to: VerificationStatus = from;
        let note: string;
        if (req.result === 'worked') {
          to = 'verified_success';
          note = from === 'verified_success' ? 'Already verified; outcome added as further evidence' : 'Verified by a successful outcome';
        } else if (from === 'verified_success') {
          note = 'Failure recorded as evidence; status kept because it was verified successful before';
        } else {
          to = 'verified_failure';
          note = 'Marked as a verified failure';
        }
        await memoriesRepo.updateById(
          orgId,
          m._id,
          {
            $set: { 'verification.status': to, ...(to !== from ? { 'verification.verifiedAt': now } : {}) },
            $addToSet: { 'verification.outcomeIds': outcome._id },
          },
          session,
        );
        verificationChanges.push({ memoryId: String(m._id), title: m.title, from, to, note });
      }
    });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      throw new AppError(409, 'OUTCOME_EXISTS', 'An outcome has already been recorded for this task.');
    }
    throw err;
  } finally {
    await session.endSession();
  }

  // 4. The outcome becomes a new episodic memory (outside the transaction: embedding is an external call).
  const worked = req.result === 'worked';
  // Title from the problem statement (first sentence), not the trailing question.
  const problem = (task.goal.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? task.goal).replace(/[.!?]$/, '');
  const title = clip(`${worked ? 'Resolved' : 'Attempted, failed'}: ${problem}`, 160);
  const content = [
    `Question: ${task.goal}`,
    `Recommendation applied: ${clip(stripCitations(answer.replace(/^Template answer \(LLM not configured\)\.[^\n]*\n/, '')), 900)}`,
    `Result: ${worked ? 'worked' : 'did not work'}${req.feedback ? ` (${req.feedback === 'helpful' ? 'helpful' : 'not helpful'})` : ''}.`,
    req.notes ? `Notes: ${req.notes}` : null,
    citedDocs.length ? `Based on: ${citedDocs.map((d) => d.title).join('; ')}.` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const created = await createMemory(
    orgId,
    { agentId: String(task.agentId), title, content, type: 'episodic', tags: ['outcome', worked ? 'worked' : 'failed'] },
    actor,
    {
      provenance: { kind: 'outcome', outcomeId: outcomeId!, citedMemoryIds: cited },
      sourceTaskId: task._id,
      verification: { status: worked ? 'verified_success' : 'verified_failure', outcomeIds: [outcomeId!], verifiedAt: now },
    },
  );
  await outcomesRepo.updateById(orgId, outcomeId!, { $set: { createdMemoryId: created._id } });

  // 5. Events.
  await logEvent(orgId, {
    type: 'outcome.recorded',
    status: worked ? 'success' : 'error',
    actor,
    summary: `Outcome recorded: ${worked ? 'worked' : 'failed'} — ${clip(task.goal, 80)}`,
    agentId: task.agentId,
    taskId: task._id,
    memoryId: created._id,
    details: { result: req.result, feedback: req.feedback ?? null, outcomeId: String(outcomeId), citedMemoryIds: cited.map(String) },
  });
  for (const c of verificationChanges.filter((v) => v.from !== v.to)) {
    await logEvent(orgId, {
      type: 'memory.verified',
      status: c.to === 'verified_success' ? 'success' : 'error',
      actor,
      summary: `${c.title}: ${c.from} → ${c.to}`,
      agentId: task.agentId,
      taskId: task._id,
      memoryId: toObjectId(c.memoryId),
      details: { from: c.from, to: c.to, outcomeId: String(outcomeId) },
    });
  }

  return {
    outcomeId: String(outcomeId),
    taskId: String(task._id),
    result: req.result,
    createdMemory: toMemory(created),
    verificationChanges,
    usefulnessUpdated: req.feedback ? cited.map(String) : [],
  };
}

export type { OutcomeRequest };
