import { rawCollections } from '../collections.js';
import type {
  AgentDoc,
  CheckpointDoc,
  EventDoc,
  MemoryDoc,
  OutcomeDoc,
  RetrievalLogDoc,
  StepExecutionDoc,
  TaskDoc,
} from '../collections.js';
import { ScopedRepository } from './base.js';

export { identityRepo, DEMO_ORG_SLUG, DEMO_USER_EMAIL, TEST_ORG_SLUG } from './identity.js';
export { toObjectId, assertOrgId, type NewDoc } from './base.js';

export const agentsRepo = new ScopedRepository<AgentDoc>(async () => (await rawCollections()).agents);
export const memoriesRepo = new ScopedRepository<MemoryDoc>(async () => (await rawCollections()).memories);
export const tasksRepo = new ScopedRepository<TaskDoc>(async () => (await rawCollections()).tasks);
export const checkpointsRepo = new ScopedRepository<CheckpointDoc>(async () => (await rawCollections()).checkpoints);
export const stepExecutionsRepo = new ScopedRepository<StepExecutionDoc>(
  async () => (await rawCollections()).stepExecutions,
);
export const outcomesRepo = new ScopedRepository<OutcomeDoc>(async () => (await rawCollections()).outcomes);
export const retrievalLogsRepo = new ScopedRepository<RetrievalLogDoc>(async () => (await rawCollections()).retrievalLogs);
export const eventsRepo = new ScopedRepository<EventDoc>(async () => (await rawCollections()).events);
export { atlasKeywordSearch, atlasVectorSearch, regexFallbackSearch, memoryWithVector, type SearchHit } from './memory-search.js';
