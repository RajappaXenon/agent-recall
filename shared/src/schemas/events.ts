import { z } from 'zod';
import { IdSchema, IsoDateSchema } from './common.js';

export const EventStatusSchema = z.enum(['info', 'success', 'warning', 'error']);

export const EventSchema = z.object({
  id: IdSchema,
  type: z.string(),
  status: EventStatusSchema,
  actor: z.object({ kind: z.enum(['user', 'agent', 'worker', 'system']), id: z.string().nullable(), name: z.string() }),
  agentId: IdSchema.nullable(),
  taskId: IdSchema.nullable(),
  memoryId: IdSchema.nullable(),
  summary: z.string(),
  details: z.record(z.unknown()),
  isSeed: z.boolean(),
  createdAt: IsoDateSchema,
});
export type AppEvent = z.infer<typeof EventSchema>;

export const EventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  type: z.string().max(60).optional(),
  typePrefix: z.string().max(40).optional(),
  status: EventStatusSchema.optional(),
  agentId: IdSchema.optional(),
  taskId: IdSchema.optional(),
  memoryId: IdSchema.optional(),
});
export type EventListQuery = z.infer<typeof EventListQuerySchema>;
