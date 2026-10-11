import type { ObjectId } from 'mongodb';
import type { TaskDoc } from '../db/collections.js';
import { memoriesRepo, tasksRepo, toObjectId } from '../db/repositories/index.js';
import { assertAgent } from './memories.js';
import { logEvent, type Actor } from './events.js';
import { queryTerms, search } from './search.js';

export const PLAYBOOK_NAME = 'Diagnose connection-pool incident';
export const PLAYBOOK_STEPS = [
  'Collect symptoms',
  'Retrieve similar incidents',
  'Match the verified procedure',
  'Draft remediation',
  'Summarize',
] as const;

export const DEFAULT_SYMPTOMS =
  'Checkout API p99 jumped from 180 ms to 8 s after this morning’s deploy reduced maxPoolSize. Logs show MongoWaitQueueTimeoutError: Timed out while checking out a connection from connection pool.';

export interface StepContext {
  task: TaskDoc;
  /** Outputs of earlier steps, loaded from checkpoints (the source of truth on resume). */
  previous: Record<number, Record<string, unknown>>;
  idempotencyKey: string;
  workerId: string;
}

type StepFn = (ctx: StepContext) => Promise<Record<string, unknown>>;

/**
 * Steps are deterministic functions of the task input and earlier checkpoints.
 * Their only side effects are keyed by the step's idempotency key, so a step that
 * was interrupted before committing can safely run again.
 */
export const STEP_FNS: StepFn[] = [
  // 0. Collect symptoms
  async ({ task }) => {
    const symptoms = String(task.input.symptoms ?? DEFAULT_SYMPTOMS);
    const terms = queryTerms(symptoms).slice(0, 12);
    const identifiers = terms.filter((t) => /[=_]|[a-z][A-Z]|error|timeout/i.test(t));
    return { symptoms, terms, identifiers };
  },
  // 1. Retrieve similar incidents (hybrid search)
  async ({ task, previous, idempotencyKey, workerId }) => {
    const symptoms = String(previous[0]?.symptoms ?? task.input.symptoms ?? DEFAULT_SYMPTOMS);
    const res = await search(
      task.orgId,
      'hybrid',
      { query: symptoms, filters: {}, limit: 8, applyOutcomePolicy: true, idempotencyKey },
      { kind: 'worker', id: workerId, name: workerId },
      null,
    );
    return {
      engine: res.engine,
      logId: res.logId,
      warnings: res.warnings,
      results: res.results.map((r) => ({
        memoryId: r.memory.id,
        title: r.memory.title,
        type: r.memory.type,
        verification: r.memory.verification.status,
        rank: r.rank,
        final: r.final ?? r.score,
        sources: r.sources.map((s) => `${s.mode === 'keyword' ? 'K' : 'S'}${s.rank}`).join('·'),
      })),
    };
  },
  // 2. Match the verified procedure
  async ({ task, previous }) => {
    const results = (previous[1]?.results ?? []) as { memoryId: string; title: string; type: string; verification: string; rank: number }[];
    const candidates = results.filter((r) => r.type === 'procedural');
    const verified = candidates.find((r) => r.verification === 'verified_success');
    const avoid = candidates.filter((r) => r.verification === 'verified_failure').map((r) => ({ memoryId: r.memoryId, title: r.title }));
    if (!verified) return { procedure: null, avoid, note: 'No verified procedure among the retrieved memories.' };
    const doc = await memoriesRepo.findById(task.orgId, toObjectId(verified.memoryId));
    return {
      procedure: { memoryId: verified.memoryId, title: verified.title, rank: verified.rank, outcomeCount: doc?.verification.outcomeIds.length ?? 0 },
      avoid,
    };
  },
  // 3. Draft remediation (deterministic, from the procedure text)
  async ({ task, previous }) => {
    const procedure = previous[2]?.procedure as { memoryId: string; title: string } | null | undefined;
    if (!procedure) return { steps: [], text: 'No verified procedure found; escalate to the on-call database owner.' };
    const doc = await memoriesRepo.findById(task.orgId, toObjectId(procedure.memoryId));
    const steps = (doc?.content ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*\d+\.\s*/, '').trim())
      .filter((l) => l.length > 0 && !/^note/i.test(l))
      .slice(0, 6);
    return { steps, text: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), basedOn: procedure.memoryId };
  },
  // 4. Summarize
  async ({ previous }) => {
    const incidents = ((previous[1]?.results ?? []) as { title: string; type: string }[]).filter((r) => r.type === 'episodic').slice(0, 3);
    const procedure = previous[2]?.procedure as { title: string; outcomeCount: number } | null;
    const avoid = (previous[2]?.avoid ?? []) as { title: string }[];
    const steps = (previous[3]?.steps ?? []) as string[];
    const summary = [
      `Similar incidents: ${incidents.map((i) => i.title).join('; ') || 'none found'}.`,
      procedure ? `Apply the verified procedure "${procedure.title}" (${procedure.outcomeCount} recorded outcome${procedure.outcomeCount === 1 ? '' : 's'}).` : 'No verified procedure available.',
      avoid.length ? `Avoid: ${avoid.map((a) => a.title).join('; ')} (verified failure).` : null,
      steps.length ? `First step: ${steps[0]}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return { summary };
  },
];

export async function createPlaybookTask(orgId: ObjectId, input: { agentId: string; symptoms?: string }, actor: Actor): Promise<TaskDoc> {
  const agent = await assertAgent(orgId, input.agentId);
  const task = await tasksRepo.insertOne(orgId, {
    kind: 'playbook',
    agentId: agent._id,
    goal: PLAYBOOK_NAME,
    input: { symptoms: input.symptoms?.trim() || DEFAULT_SYMPTOMS, playbook: 'pool-incident' },
    status: 'queued',
    currentStep: 0,
    steps: PLAYBOOK_STEPS.map((name) => ({ name, status: 'pending' as const })),
    memoryIds: [],
    output: null,
    error: null,
    workerId: null,
    leaseExpiresAt: null,
    attempt: 0,
    completedAt: null,
  });
  await logEvent(orgId, {
    type: 'task.queued',
    actor,
    summary: `Playbook queued: ${PLAYBOOK_NAME}`,
    agentId: agent._id,
    taskId: task._id,
    details: { steps: PLAYBOOK_STEPS.length },
  });
  return task;
}
