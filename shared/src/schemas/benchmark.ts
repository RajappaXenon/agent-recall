import { z } from 'zod';
import { IdSchema } from './common.js';
import { EngineSchema } from './search.js';

/** keyword / semantic alone, hybrid RRF without outcome signals, and hybrid RRF with the outcome policy. */
export const BenchmarkConfigSchema = z.enum(['keyword', 'semantic', 'hybrid', 'hybrid_policy']);
export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

export const BenchmarkCategorySchema = z.enum(['paraphrase', 'identifier', 'fix']);
export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;

export const BenchmarkMetricsSchema = z.object({
  /** Share of queries whose top result is a direct answer (grade 3). */
  hitAt1: z.number(),
  /** Mean reciprocal rank of the first direct answer within the top 10 (0 if none). */
  mrrAt10: z.number(),
  /** Share of all labelled memories (grade ≥ 1) that appear in the top 5. */
  recallAt5: z.number(),
  /** Graded nDCG@5 with gains 2^grade − 1. */
  ndcgAt5: z.number(),
});
export type BenchmarkMetrics = z.infer<typeof BenchmarkMetricsSchema>;

const PerConfig = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ keyword: item, semantic: item, hybrid: item, hybrid_policy: item });

export const BenchmarkSplitSchema = z.enum(['dev', 'holdout']);

export const BenchmarkQueryResultSchema = z.object({
  id: z.string(),
  split: BenchmarkSplitSchema.default('dev'),
  category: BenchmarkCategorySchema,
  query: z.string(),
  relevantCount: z.number().int(),
  excludedNonSeedHits: z.number().int(),
  perConfig: PerConfig(
    z.object({
      metrics: BenchmarkMetricsSchema,
      firstAnswerRank: z.number().int().nullable(),
      top: z.array(z.object({ key: z.string(), title: z.string().nullable(), grade: z.number().int() })),
    }),
  ),
});
export type BenchmarkQueryResult = z.infer<typeof BenchmarkQueryResultSchema>;

export const BenchmarkRunSummarySchema = z.object({
  id: IdSchema,
  version: z.string(),
  /** Which outcome policy ranked the hybrid + outcomes column (runs before this field: global ×1.15). */
  rankingPolicy: z.string().default('global-v1'),
  createdAt: z.string(),
  durationMs: z.number(),
  queryCount: z.number().int(),
  engines: z.object({ keyword: EngineSchema, semantic: EngineSchema }),
  warnings: z.array(z.string()),
  overall: PerConfig(BenchmarkMetricsSchema),
});
export type BenchmarkRunSummary = z.infer<typeof BenchmarkRunSummarySchema>;

export const BenchmarkRunSchema = BenchmarkRunSummarySchema.extend({
  corpus: z.object({ seedMemories: z.number().int(), nonSeedMemories: z.number().int(), missingSeedKeys: z.array(z.string()) }),
  byCategory: z.record(z.object({ queries: z.number().int(), metrics: PerConfig(BenchmarkMetricsSchema) })),
  bySplit: z.record(z.object({ queries: z.number().int(), metrics: PerConfig(BenchmarkMetricsSchema) })).default({}),
  latencyMs: z.object({
    keyword: z.object({ p50: z.number(), p95: z.number() }),
    semantic: z.object({ p50: z.number(), p95: z.number() }),
    hybrid: z.object({ p50: z.number(), p95: z.number() }),
  }),
  queries: z.array(BenchmarkQueryResultSchema),
});
export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>;

export const BenchmarkSetResponseSchema = z.object({
  version: z.string(),
  labellingRule: z.string(),
  queries: z.array(
    z.object({
      id: z.string(),
      split: BenchmarkSplitSchema,
      category: BenchmarkCategorySchema,
      query: z.string(),
      relevant: z.array(z.object({ key: z.string(), title: z.string().nullable(), grade: z.number().int() })),
    }),
  ),
});
export type BenchmarkSetResponse = z.infer<typeof BenchmarkSetResponseSchema>;
