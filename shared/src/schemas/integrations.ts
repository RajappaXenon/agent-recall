import { z } from 'zod';

export const IntegrationStatusValueSchema = z.enum([
  'connected',
  'not_configured',
  'error',
  'index_missing',
  'index_building',
]);
export type IntegrationStatusValue = z.infer<typeof IntegrationStatusValueSchema>;

export const IntegrationKeySchema = z.enum([
  'mongodb',
  'atlas_search',
  'atlas_vector_search',
  'voyage',
  'llm',
  'elevenlabs',
]);
export type IntegrationKey = z.infer<typeof IntegrationKeySchema>;

export const IntegrationStatusSchema = z.object({
  key: IntegrationKeySchema,
  name: z.string(),
  status: IntegrationStatusValueSchema,
  detail: z.string(),
  checkedAt: z.string(),
  latencyMs: z.number().nullable(),
  optional: z.boolean(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationsResponseSchema = z.object({
  integrations: z.array(IntegrationStatusSchema),
  cached: z.boolean(),
});
export type IntegrationsResponse = z.infer<typeof IntegrationsResponseSchema>;
