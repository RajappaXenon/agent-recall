import { z } from 'zod';
import { BaseDocSchema } from './common.js';

export const AgentStatusSchema = z.enum(['active', 'paused']);

export const AgentSchema = BaseDocSchema.extend({
  name: z.string(),
  description: z.string(),
  status: AgentStatusSchema,
});
export type Agent = z.infer<typeof AgentSchema>;

export const AgentWithStatsSchema = AgentSchema.extend({
  stats: z.object({
    memoryCount: z.number().int(),
    taskCount: z.number().int(),
    successfulOutcomes: z.number().int(),
    lastActivityAt: z.string().nullable(),
  }),
});
export type AgentWithStats = z.infer<typeof AgentWithStatsSchema>;

export const CreateAgentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  status: AgentStatusSchema.default('active'),
});
export const UpdateAgentSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  status: AgentStatusSchema.optional(),
});
export type CreateAgentInput = z.input<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
