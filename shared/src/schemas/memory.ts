import { z } from 'zod';
import { BaseDocSchema, IdSchema, IsoDateSchema } from './common.js';

export const MemoryTypeSchema = z.enum(['semantic', 'episodic', 'taxonomic', 'procedural']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export const MEMORY_TYPES = MemoryTypeSchema.options;

export const VerificationStatusSchema = z.enum(['unverified', 'verified_success', 'verified_failure']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const EmbeddingStatusSchema = z.enum(['pending', 'ready', 'failed']);
export type EmbeddingStatus = z.infer<typeof EmbeddingStatusSchema>;

export const ProvenanceSchema = z.object({
  kind: z.enum(['manual', 'seed', 'outcome', 'task']),
  outcomeId: IdSchema.optional(),
  citedMemoryIds: z.array(IdSchema).optional(),
});

export const MemorySchema = BaseDocSchema.extend({
  agentId: IdSchema,
  title: z.string(),
  content: z.string(),
  type: MemoryTypeSchema,
  tags: z.array(z.string()),
  sourceTaskId: IdSchema.nullable(),
  provenance: ProvenanceSchema,
  verification: z.object({
    status: VerificationStatusSchema,
    outcomeIds: z.array(IdSchema),
    verifiedAt: IsoDateSchema.nullable(),
  }),
  usefulness: z.object({ helpful: z.number().int(), notHelpful: z.number().int(), score: z.number() }),
  relations: z.array(z.object({ targetMemoryId: IdSchema, label: z.string() })),
  embedding: z
    .object({ provider: z.literal('voyage'), model: z.string(), dimensions: z.number().int(), embeddedAt: IsoDateSchema })
    .nullable(),
  embeddingStatus: EmbeddingStatusSchema,
  retrievalCount: z.number().int(),
  archived: z.boolean(),
});
export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemorySchema = z.object({
  agentId: IdSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(8000),
  type: MemoryTypeSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  relations: z.array(z.object({ targetMemoryId: IdSchema, label: z.string().max(60) })).max(20).default([]),
});
export type CreateMemoryInput = z.input<typeof CreateMemorySchema>;

export const UpdateMemorySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(8000).optional(),
  type: MemoryTypeSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  relations: z.array(z.object({ targetMemoryId: IdSchema, label: z.string().max(60) })).max(20).optional(),
});
export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;

export const MemorySortSchema = z.enum(['newest', 'oldest', 'usefulness', 'retrievals']);

export const MemoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  agentId: IdSchema.optional(),
  type: MemoryTypeSchema.optional(),
  verification: VerificationStatusSchema.optional(),
  tag: z.string().max(40).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sort: MemorySortSchema.default('newest'),
});
export type MemoryListQuery = z.infer<typeof MemoryListQuerySchema>;
