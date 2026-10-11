import { z } from 'zod';
import { BaseDocSchema, IdSchema, IsoDateSchema } from './common.js';
import { MemorySchema } from './memory.js';

export const TaskStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskStepSchema = z.object({ name: z.string(), status: z.enum(['pending', 'running', 'completed', 'failed']) });

export const TaskSchema = BaseDocSchema.extend({
  kind: z.enum(['qa', 'playbook']),
  agentId: IdSchema,
  goal: z.string(),
  input: z.record(z.unknown()),
  status: TaskStatusSchema,
  currentStep: z.number().int(),
  steps: z.array(TaskStepSchema),
  memoryIds: z.array(IdSchema),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  workerId: z.string().nullable(),
  leaseExpiresAt: IsoDateSchema.nullable(),
  attempt: z.number().int(),
  completedAt: IsoDateSchema.nullable(),
  outcome: z
    .object({ id: IdSchema, result: z.enum(['worked', 'failed']), feedback: z.enum(['helpful', 'not_helpful']).nullable(), createdMemoryId: IdSchema.nullable(), createdAt: IsoDateSchema })
    .nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agentId: IdSchema.optional(),
  kind: z.enum(['qa', 'playbook']).optional(),
  status: TaskStatusSchema.optional(),
});

// ── Answers ──
export const AnswerRequestSchema = z.object({
  agentId: IdSchema,
  query: z.string().trim().min(1).max(1000),
  memoryIds: z.array(IdSchema).min(1).max(10),
});
export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

export const AnswerResponseSchema = z.object({
  taskId: IdSchema,
  answer: z.string(),
  citations: z.array(IdSchema),
  model: z.string(),
  mode: z.enum(['llm', 'template']),
  latencyMs: z.number(),
  servedBy: z.string().optional(),
});
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

// ── Outcomes ──
export const OutcomeRequestSchema = z.object({
  result: z.enum(['worked', 'failed']),
  feedback: z.enum(['helpful', 'not_helpful']).optional(),
  notes: z.string().trim().max(2000).default(''),
});
export type OutcomeRequest = z.input<typeof OutcomeRequestSchema>;

export const VerificationChangeSchema = z.object({
  memoryId: IdSchema,
  title: z.string(),
  from: z.enum(['unverified', 'verified_success', 'verified_failure']),
  to: z.enum(['unverified', 'verified_success', 'verified_failure']),
  note: z.string(),
});

export const OutcomeResponseSchema = z.object({
  outcomeId: IdSchema,
  taskId: IdSchema,
  result: z.enum(['worked', 'failed']),
  createdMemory: MemorySchema,
  verificationChanges: z.array(VerificationChangeSchema),
  usefulnessUpdated: z.array(IdSchema),
});
export type OutcomeResponse = z.infer<typeof OutcomeResponseSchema>;

export const CheckpointSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  stepIndex: z.number().int(),
  stepName: z.string(),
  output: z.record(z.unknown()),
  idempotencyKey: z.string(),
  workerId: z.string(),
  attempt: z.number().int(),
  createdAt: IsoDateSchema,
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const CreatePlaybookSchema = z.object({
  agentId: IdSchema,
  symptoms: z.string().trim().max(2000).optional(),
});
export type CreatePlaybookInput = z.infer<typeof CreatePlaybookSchema>;

export const DevStatusSchema = z.object({
  demoMode: z.boolean(),
  leaseMs: z.number().int(),
  stepDelayMs: z.number().int(),
  workers: z.array(z.object({ workerId: z.string(), pid: z.number().nullable(), currentTaskId: IdSchema.nullable(), lastSeen: IsoDateSchema })),
});
export type DevStatus = z.infer<typeof DevStatusSchema>;

export const OutcomeListItemSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  agentId: IdSchema,
  question: z.string(),
  result: z.enum(['worked', 'failed']),
  feedback: z.enum(['helpful', 'not_helpful']).nullable(),
  notes: z.string(),
  citedMemoryIds: z.array(IdSchema),
  createdMemoryId: IdSchema.nullable(),
  isSeed: z.boolean(),
  createdAt: IsoDateSchema,
});
export type OutcomeListItem = z.infer<typeof OutcomeListItemSchema>;
