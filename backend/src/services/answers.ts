import type { ObjectId } from 'mongodb';
import type { AnswerRequest, AnswerResponse } from '@agent-recall/shared';
import { memoriesRepo, tasksRepo, toObjectId } from '../db/repositories/index.js';
import { AppError } from '../lib/errors.js';
import { assertAgent } from './memories.js';
import { logEvent, type Actor } from './events.js';
import { groundedAnswer, LlmError } from './llm/index.js';

/** Creates a `qa` task, grounds an answer in the selected memories, and records the result on the task. */
export async function createAnswer(orgId: ObjectId, req: AnswerRequest, actor: Actor): Promise<AnswerResponse> {
  const agent = await assertAgent(orgId, req.agentId);
  const ids = [...new Set(req.memoryIds)].map((id) => toObjectId(id, 'Memory'));
  const docs = await memoriesRepo.find(orgId, { _id: { $in: ids }, archived: false }, { projection: { 'embedding.vector': 0 } });
  if (docs.length !== ids.length) throw new AppError(400, 'MEMORY_NOT_FOUND', 'One or more selected memories do not exist in this organization or are archived.');
  // Keep the caller's selection order.
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const memories = ids.map((id) => byId.get(String(id))!);

  const task = await tasksRepo.insertOne(orgId, {
    kind: 'qa',
    agentId: agent._id,
    goal: req.query,
    input: { query: req.query, memoryIds: ids.map(String) },
    status: 'running',
    currentStep: 0,
    steps: [{ name: 'Grounded answer', status: 'running' }],
    memoryIds: ids,
    output: null,
    error: null,
    workerId: null,
    leaseExpiresAt: null,
    attempt: 1,
    completedAt: null,
  });

  try {
    const result = await groundedAnswer(
      req.query,
      memories.map((m) => ({ id: String(m._id), title: m.title, type: m.type, verification: m.verification.status, content: m.content })),
    );
    await tasksRepo.updateById(orgId, task._id, {
      $set: {
        status: 'completed',
        currentStep: 1,
        steps: [{ name: 'Grounded answer', status: 'completed' }],
        output: { answer: result.answer, citations: result.citations, model: result.model, mode: result.mode, latencyMs: result.latencyMs, usage: result.usage ?? null },
        completedAt: new Date(),
      },
    });
    await logEvent(orgId, {
      type: 'answer.generated',
      status: 'success',
      actor,
      summary: `${result.mode === 'llm' ? 'Grounded answer' : 'Template answer'} for "${req.query.slice(0, 80)}" citing ${result.citations.length} memories`,
      agentId: agent._id,
      taskId: task._id,
      details: { model: result.model, mode: result.mode, latencyMs: result.latencyMs, citations: result.citations },
    });
    return {
      taskId: task._id.toHexString(),
      answer: result.answer,
      citations: result.citations,
      model: result.model,
      mode: result.mode,
      latencyMs: result.latencyMs,
      ...(result.servedBy ? { servedBy: result.servedBy } : {}),
    };
  } catch (err) {
    const message = err instanceof LlmError ? err.message : 'Answer generation failed.';
    await tasksRepo.updateById(orgId, task._id, {
      $set: { status: 'failed', error: message, steps: [{ name: 'Grounded answer', status: 'failed' }], completedAt: new Date() },
    });
    await logEvent(orgId, { type: 'answer.failed', status: 'error', actor, summary: `Answer failed: ${message}`, agentId: agent._id, taskId: task._id });
    throw new AppError(502, err instanceof LlmError ? err.code : 'LLM_ERROR', message);
  }
}
