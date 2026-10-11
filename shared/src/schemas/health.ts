import { z } from 'zod';

export const HealthResponseSchema = z.object({ status: z.literal('ok'), uptimeS: z.number() });

export const ReadyResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  mongo: z.object({
    connected: z.boolean(),
    latencyMs: z.number().nullable(),
    checkedAt: z.string(),
    database: z.string(),
    detail: z.string(),
  }),
});
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
