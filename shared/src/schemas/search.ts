import { z } from 'zod';
import { IdSchema } from './common.js';
import { MemorySchema, MemoryTypeSchema, VerificationStatusSchema } from './memory.js';

export const SearchModeSchema = z.enum(['keyword', 'semantic', 'hybrid']);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const EngineSchema = z.enum(['atlas_search', 'atlas_vector_search', 'rrf', 'fallback_regex', 'unavailable']);
export type Engine = z.infer<typeof EngineSchema>;

export const ScoreKindSchema = z.enum(['search', 'vector', 'rrf', 'final', 'regex']);
export type ScoreKind = z.infer<typeof ScoreKindSchema>;

export const SearchFiltersSchema = z.object({
  agentId: IdSchema.optional(),
  types: z.array(MemoryTypeSchema).max(4).optional(),
  verification: z.array(VerificationStatusSchema).max(3).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export const SearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(1000),
  filters: SearchFiltersSchema.default({}),
  limit: z.number().int().min(1).max(20).default(10),
  applyOutcomePolicy: z.boolean().default(true),
});
export type SearchRequest = z.input<typeof SearchRequestSchema>;

export const HighlightFragmentSchema = z.object({ value: z.string(), type: z.enum(['hit', 'text']) });
export type HighlightFragment = z.infer<typeof HighlightFragmentSchema>;

export const SourceSchema = z.object({ mode: z.enum(['keyword', 'semantic']), rank: z.number().int(), score: z.number() });

export const ExplanationSchema = z.object({
  summary: z.string(),
  details: z.array(z.string()),
  matchedFields: z.array(z.string()).optional(),
  queryTermsPresent: z.array(z.string()).optional(),
  queryTermsAbsent: z.array(z.string()).optional(),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const SearchResultSchema = z.object({
  memory: MemorySchema,
  rank: z.number().int(),
  score: z.number(),
  scoreKind: ScoreKindSchema,
  sources: z.array(SourceSchema),
  highlights: z.array(z.array(HighlightFragmentSchema)).optional(),
  explanation: ExplanationSchema,
  /** Hybrid only: raw RRF, the outcome-policy multiplier and the final score. */
  rrf: z.number().optional(),
  policyMultiplier: z.number().optional(),
  final: z.number().optional(),
  /** Hybrid only: rank before the outcome policy was applied. */
  rankBeforePolicy: z.number().int().optional(),
  /** Hybrid, verified memories: how close this query is to the question the outcome was recorded on. */
  policyContext: z.object({ similarity: z.number(), weight: z.number(), question: z.string() }).optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const LatencySchema = z.object({
  embed: z.number().optional(),
  keyword: z.number().optional(),
  vector: z.number().optional(),
  fuse: z.number().optional(),
  total: z.number(),
});

const SearchResponseBase = z.object({
  mode: SearchModeSchema,
  engine: EngineSchema,
  results: z.array(SearchResultSchema),
  latencyMs: LatencySchema,
  warnings: z.array(z.string()),
  logId: IdSchema.nullable(),
  applyOutcomePolicy: z.boolean(),
  embedCached: z.boolean().optional(),
});
export type SearchResponseBase = z.infer<typeof SearchResponseBase>;

export const SearchResponseSchema = SearchResponseBase.extend({
  /** Hybrid only: the component keyword / semantic runs that were fused. */
  components: z.object({ keyword: SearchResponseBase, semantic: SearchResponseBase }).optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const RetrievalLogSchema = z.object({
  id: IdSchema,
  query: z.string(),
  mode: SearchModeSchema,
  engine: EngineSchema,
  resultCount: z.number().int(),
  topMemoryIds: z.array(IdSchema),
  latencyMs: z.record(z.number()),
  applyOutcomePolicy: z.boolean(),
  warnings: z.array(z.string()),
  isSeed: z.boolean(),
  createdAt: z.string(),
});
export type RetrievalLog = z.infer<typeof RetrievalLogSchema>;

const MemorySummarySchema = MemorySchema.pick({ id: true, title: true, type: true, verification: true, isSeed: true });

export const MemoryRelatedResponseSchema = z.object({
  relations: z.array(z.object({ memory: MemorySummarySchema, label: z.string(), direction: z.enum(['outgoing', 'incoming']) })),
  neighbors: z.object({
    engine: EngineSchema,
    reason: z.string().nullable(),
    items: z.array(z.object({ memory: MemorySummarySchema, score: z.number() })),
  }),
});
export type MemoryRelatedResponse = z.infer<typeof MemoryRelatedResponseSchema>;

export const MemoryRetrievalsResponseSchema = z.object({
  items: z.array(
    z.object({
      logId: IdSchema,
      query: z.string(),
      mode: SearchModeSchema,
      engine: EngineSchema,
      rank: z.number().int(),
      score: z.number(),
      scoreKind: ScoreKindSchema,
      createdAt: z.string(),
    }),
  ),
});
export type MemoryRetrievalsResponse = z.infer<typeof MemoryRetrievalsResponseSchema>;

export const SearchableResponseSchema = z.object({
  memoryId: IdSchema,
  keyword: z.boolean(),
  vector: z.boolean(),
  embeddingStatus: z.enum(['pending', 'ready', 'failed']),
  searchable: z.boolean(),
  checkedAt: z.string(),
  detail: z.string(),
});
export type SearchableResponse = z.infer<typeof SearchableResponseSchema>;
