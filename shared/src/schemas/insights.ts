import { z } from 'zod';
import { IdSchema, IsoDateSchema } from './common.js';
import { MemoryTypeSchema, VerificationStatusSchema } from './memory.js';
import { EngineSchema, SearchModeSchema } from './search.js';

/** Where a number comes from: only seeded records, only live activity, or both. */
export const DataSourceSchema = z.enum(['seed', 'live', 'mixed', 'none']);
export type DataSource = z.infer<typeof DataSourceSchema>;

const Metric = z.object({ value: z.number().nullable(), of: z.number().nullable(), source: DataSourceSchema, spark: z.array(z.number()) });

export const OverviewResponseSchema = z.object({
  metrics: z.object({
    totalMemories: Metric.extend({ seed: z.number(), live: z.number() }),
    indexed: Metric,
    successfulOutcomes: Metric,
    retrievalSuccessRate: Metric,
  }),
  activity: z.array(z.object({ date: z.string(), created: z.number(), retrieved: z.number() })),
  activitySource: DataSourceSchema,
  byType: z.array(z.object({ type: MemoryTypeSchema, count: z.number() })),
  recentExperiences: z.array(
    z.object({ id: IdSchema, title: z.string(), agentName: z.string(), verification: VerificationStatusSchema, isSeed: z.boolean(), createdAt: IsoDateSchema }),
  ),
  recentSearches: z.array(
    z.object({ id: IdSchema, query: z.string(), mode: SearchModeSchema, engine: EngineSchema, resultCount: z.number(), latencyMs: z.number().nullable(), createdAt: IsoDateSchema }),
  ),
  windowDays: z.number(),
});
export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;

const MemoryRef = z.object({
  id: IdSchema,
  title: z.string(),
  type: MemoryTypeSchema,
  verification: VerificationStatusSchema,
  isSeed: z.boolean(),
});

export const LearningResponseSchema = z.object({
  outcomesOverTime: z.array(z.object({ week: z.string(), worked: z.number(), failed: z.number() })),
  outcomeTotals: z.object({ worked: z.number(), failed: z.number(), helpful: z.number(), notHelpful: z.number(), source: DataSourceSchema }),
  mostUseful: z.array(MemoryRef.extend({ helpful: z.number(), notHelpful: z.number(), score: z.number() })),
  mostRetrieved: z.array(MemoryRef.extend({ retrievalCount: z.number() })),
  verifiedProcedures: z.array(
    MemoryRef.extend({
      verifiedAt: IsoDateSchema.nullable(),
      evidence: z.array(z.object({ outcomeId: IdSchema, taskId: IdSchema, question: z.string(), result: z.enum(['worked', 'failed']), createdAt: IsoDateSchema, isSeed: z.boolean() })),
    }),
  ),
  recurringProblems: z.array(z.object({ tag: z.string(), count: z.number(), resolved: z.number() })),
  feedback: z.array(
    z.object({
      id: IdSchema,
      taskId: IdSchema,
      question: z.string(),
      result: z.enum(['worked', 'failed']),
      feedback: z.enum(['helpful', 'not_helpful']).nullable(),
      notes: z.string(),
      isSeed: z.boolean(),
      createdAt: IsoDateSchema,
    }),
  ),
});
export type LearningResponse = z.infer<typeof LearningResponseSchema>;
