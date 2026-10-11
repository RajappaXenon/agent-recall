import type { ObjectId } from 'mongodb';
import type { MemoryType, VerificationStatus, EmbeddingStatus } from '@agent-recall/shared';
import { getDb } from './client.js';

/** Fields every tenant-owned document carries. */
export interface BaseDoc {
  _id: ObjectId;
  orgId: ObjectId;
  isSeed: boolean;
  /** Stable key for seed records so `seed` / `demo:reset` can upsert instead of duplicating. */
  seedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDoc extends BaseDoc {
  email: string;
  name: string;
}

export interface AgentDoc extends BaseDoc {
  name: string;
  description: string;
  status: 'active' | 'paused';
}

export interface MemoryDoc extends BaseDoc {
  agentId: ObjectId;
  title: string;
  content: string;
  type: MemoryType;
  tags: string[];
  sourceTaskId?: ObjectId | null;
  provenance: { kind: 'manual' | 'seed' | 'outcome' | 'task'; outcomeId?: ObjectId; citedMemoryIds?: ObjectId[] };
  verification: { status: VerificationStatus; outcomeIds: ObjectId[]; verifiedAt?: Date | null };
  usefulness: { helpful: number; notHelpful: number };
  relations?: { targetMemoryId: ObjectId; label: string }[];
  embedding?: {
    vector: number[];
    provider: 'voyage';
    model: string;
    dimensions: number;
    contentHash: string;
    embeddedAt: Date;
  } | null;
  embeddingStatus: EmbeddingStatus;
  embeddingError?: string | null;
  retrievalCount: number;
  archived: boolean;
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface TaskStepDoc {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface TaskDoc extends BaseDoc {
  kind: 'qa' | 'playbook';
  agentId: ObjectId;
  goal: string;
  input: Record<string, unknown>;
  status: TaskStatus;
  currentStep: number;
  steps: TaskStepDoc[];
  memoryIds: ObjectId[];
  output: Record<string, unknown> | null;
  error: string | null;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  attempt: number;
  completedAt?: Date | null;
}

export interface CheckpointDoc extends BaseDoc {
  taskId: ObjectId;
  stepIndex: number;
  stepName: string;
  output: Record<string, unknown>;
  idempotencyKey: string;
  workerId: string;
  attempt: number;
}

export interface StepExecutionDoc extends BaseDoc {
  taskId: ObjectId;
  stepIndex: number;
  workerId: string;
  attempt: number;
}

export interface OutcomeDoc extends BaseDoc {
  taskId: ObjectId;
  agentId: ObjectId;
  result: 'worked' | 'failed';
  feedback: 'helpful' | 'not_helpful' | null;
  notes: string;
  citedMemoryIds: ObjectId[];
  createdMemoryId: ObjectId | null;
  userId: ObjectId;
}

export interface RetrievalLogDoc extends BaseDoc {
  query: string;
  mode: 'keyword' | 'semantic' | 'hybrid';
  engine: string;
  results: { memoryId: ObjectId; rank: number; score: number; sources: { mode: string; rank: number; score: number }[] }[];
  latencyMs: Record<string, number>;
  applyOutcomePolicy: boolean;
  filters: Record<string, unknown>;
  warnings: string[];
  userId: ObjectId | null;
  idempotencyKey?: string;
}

export interface EventDoc extends BaseDoc {
  type: string;
  status: 'info' | 'success' | 'warning' | 'error';
  actor: { kind: 'user' | 'agent' | 'worker' | 'system'; id: string | null; name: string };
  agentId: ObjectId | null;
  taskId: ObjectId | null;
  memoryId: ObjectId | null;
  summary: string;
  details: Record<string, unknown>;
}

export type BenchmarkConfig = 'keyword' | 'semantic' | 'hybrid' | 'hybrid_policy';
export interface BenchmarkMetrics {
  hitAt1: number;
  mrrAt10: number;
  recallAt5: number;
  ndcgAt5: number;
}

export interface BenchmarkRunDoc extends BaseDoc {
  version: string;
  userId: ObjectId | null;
  durationMs: number;
  corpus: { seedMemories: number; nonSeedMemories: number; missingSeedKeys: string[] };
  engines: Record<'keyword' | 'semantic', string>;
  warnings: string[];
  overall: Record<BenchmarkConfig, BenchmarkMetrics>;
  byCategory: Record<string, { queries: number; metrics: Record<BenchmarkConfig, BenchmarkMetrics> }>;
  latencyMs: Record<'keyword' | 'semantic' | 'hybrid', { p50: number; p95: number }>;
  queries: {
    id: string;
    category: string;
    query: string;
    relevantCount: number;
    excludedNonSeedHits: number;
    perConfig: Record<BenchmarkConfig, { metrics: BenchmarkMetrics; firstAnswerRank: number | null; top: { key: string; title: string | null; grade: number }[] }>;
  }[];
}

export const COLLECTIONS = {
  organizations: 'organizations',
  users: 'users',
  agents: 'agents',
  memories: 'memories',
  tasks: 'tasks',
  checkpoints: 'checkpoints',
  stepExecutions: 'step_executions',
  outcomes: 'outcomes',
  retrievalLogs: 'retrieval_logs',
  events: 'events',
  benchmarkRuns: 'benchmark_runs',
} as const;

/**
 * Raw collection accessors. Only modules inside src/db/ may import this;
 * routes and services go through the orgId-scoped repositories.
 */
export async function rawCollections() {
  const db = await getDb();
  return {
    organizations: db.collection<OrganizationDoc>(COLLECTIONS.organizations),
    users: db.collection<UserDoc>(COLLECTIONS.users),
    agents: db.collection<AgentDoc>(COLLECTIONS.agents),
    memories: db.collection<MemoryDoc>(COLLECTIONS.memories),
    tasks: db.collection<TaskDoc>(COLLECTIONS.tasks),
    checkpoints: db.collection<CheckpointDoc>(COLLECTIONS.checkpoints),
    stepExecutions: db.collection<StepExecutionDoc>(COLLECTIONS.stepExecutions),
    outcomes: db.collection<OutcomeDoc>(COLLECTIONS.outcomes),
    retrievalLogs: db.collection<RetrievalLogDoc>(COLLECTIONS.retrievalLogs),
    events: db.collection<EventDoc>(COLLECTIONS.events),
    benchmarkRuns: db.collection<BenchmarkRunDoc>(COLLECTIONS.benchmarkRuns),
  };
}
export type RawCollections = Awaited<ReturnType<typeof rawCollections>>;
