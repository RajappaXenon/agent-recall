/**
 * Labelled retrieval benchmark over the demo seed (scripts/seed-data.ts).
 *
 * Labelling rule, applied per query before any run and not tuned afterwards:
 *   3 = the memory that directly answers the question (for "how did we fix it" questions:
 *       the procedure or resolution that worked; for "should we do X" the memory that records
 *       what happened when X was tried, even when that outcome was a failure)
 *   1 = useful supporting context (the incident, the root cause, a definition it relies on)
 *   unlabelled = not relevant
 * Memories are referenced by seed key, so the set is stable across `demo:reset`.
 *
 * Categories:
 *   paraphrase  the question shares few or no distinctive words with the answer
 *   identifier  the question hinges on an exact token: error name, config key, code
 *   fix         "what fixed this before?" questions, where outcome signals should matter
 */
export type BenchmarkCategory = 'paraphrase' | 'identifier' | 'fix';

export interface BenchmarkQuery {
  id: string;
  category: BenchmarkCategory;
  query: string;
  relevant: Record<string, 1 | 3>;
}

export const BENCHMARK_VERSION = 'seed-v1';

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // ── fix ──
  {
    id: 'fix-orders-504',
    category: 'fix',
    query: 'Orders API keeps hitting 504s after we shrank the database driver pool. How did we fix it before?',
    relevant: { 'proc-pool-fix': 3, 'ep-pool-resolution': 3, 'ep-pool-incident': 1, 'ep-pool-rootcause': 1, 'sem-pool-error': 1 },
  },
  {
    id: 'fix-checkout-maxpool',
    category: 'fix',
    query: 'Checkout is timing out after we reduced maxPoolSize. What worked last time?',
    relevant: { 'proc-pool-fix': 3, 'ep-pool-resolution': 3, 'ep-pool-incident': 1, 'ep-pool-rootcause': 1, 'sem-pool-error': 1 },
  },
  {
    id: 'fix-scale-out',
    category: 'fix',
    query: 'Latency is over target every evening. Should we just add more API replicas?',
    relevant: { 'proc-scale-out': 3, 'ep-campaign-peak': 1, 'sem-pool-sizing': 1 },
  },
  {
    id: 'fix-cursor-leak',
    category: 'fix',
    query: 'Connections stay checked out because export cursors are never closed. What was the fix?',
    relevant: { 'proc-pool-fix': 3, 'ep-pool-resolution': 3, 'ep-pool-rootcause': 1 },
  },
  {
    id: 'fix-redis-deploy',
    category: 'fix',
    query: 'The cache client errors for ten minutes on every deploy while the new node loads. How did we stop that?',
    relevant: { 'ep-redis-timeout': 3 },
  },
  {
    id: 'fix-pager-noise',
    category: 'fix',
    query: 'On-call keeps getting paged for log volumes that are only three quarters full. What did we change?',
    relevant: { 'ep-alert-noise': 3 },
  },

  // ── paraphrase ──
  {
    id: 'para-billing-freeze',
    category: 'paraphrase',
    query: 'A payments service froze during the end-of-month close after someone reduced its database settings to save money',
    relevant: { 'ep-billing-hung': 3, 'sem-pool-sizing': 1, 'tax-db-connectivity': 1 },
  },
  {
    id: 'para-egress-gateway',
    category: 'paraphrase',
    query: 'Nothing in the pre-production environment can talk to the database since networking swapped the outbound gateway',
    relevant: { 'ep-atlas-ip': 3, 'sem-server-selection': 1, 'tax-db-connectivity': 1 },
  },
  {
    id: 'para-pool-sizing',
    category: 'paraphrase',
    query: 'How many simultaneous database connections should each app replica keep open?',
    relevant: { 'sem-pool-sizing': 3, 'proc-pool-fix': 1, 'ep-campaign-peak': 1 },
  },
  {
    id: 'para-unreachable-vs-busy',
    category: 'paraphrase',
    query: "What's the difference between not being able to reach the cluster and every connection being busy?",
    relevant: { 'sem-server-selection': 3, 'tax-db-connectivity': 3, 'sem-pool-error': 1 },
  },
  {
    id: 'para-python-workers',
    category: 'paraphrase',
    query: 'Background jobs in the data science service all wait on busy threads and then give up',
    relevant: { 'ep-threadpool': 3 },
  },
  {
    id: 'para-slow-lookup',
    category: 'paraphrase',
    query: 'How do I work out why one database lookup takes so long?',
    relevant: { 'proc-slow-query': 3 },
  },
  {
    id: 'para-revert-release',
    category: 'paraphrase',
    query: 'Steps to go back to the previous version when a release breaks production',
    relevant: { 'proc-rollback': 3 },
  },
  {
    id: 'para-merge-rankings',
    category: 'paraphrase',
    query: 'How should we combine the result lists from a lexical retriever and an embedding retriever?',
    relevant: { 'sem-rrf': 3, 'sem-keyword-vs-vector': 1, 'ep-embedding-eval': 1 },
  },
  {
    id: 'para-postmortem',
    category: 'paraphrase',
    query: 'How do we look back on an outage without pointing fingers at people?',
    relevant: { 'proc-incident-review': 3 },
  },
  {
    id: 'para-memory-kinds',
    category: 'paraphrase',
    query: 'What different kinds of things can an AI assistant remember?',
    relevant: { 'tax-memory-types': 3 },
  },
  {
    id: 'para-marketing-push',
    category: 'paraphrase',
    query: 'Database connection count climbs whenever we autoscale for a big promotion',
    relevant: { 'ep-campaign-peak': 3, 'sem-pool-sizing': 1, 'proc-scale-out': 1 },
  },

  // ── identifier ──
  {
    id: 'id-waitqueue-error',
    category: 'identifier',
    query: 'MongoWaitQueueTimeoutError',
    relevant: { 'sem-pool-error': 3, 'sem-server-selection': 1, 'tax-db-connectivity': 1, 'ep-pool-rootcause': 1 },
  },
  {
    id: 'id-eai-again',
    category: 'identifier',
    query: 'getaddrinfo EAI_AGAIN',
    relevant: { 'ep-dns-timeout': 3 },
  },
  {
    id: 'id-ioredis-etimedout',
    category: 'identifier',
    query: 'ioredis ETIMEDOUT connectTimeout',
    relevant: { 'ep-redis-timeout': 3 },
  },
  {
    id: 'id-waitqueue-2000',
    category: 'identifier',
    query: 'waitQueueTimeoutMS=2000',
    relevant: { 'sem-pool-error': 3, 'ep-pool-rootcause': 1 },
  },
  {
    id: 'id-server-selection',
    category: 'identifier',
    query: 'MongoServerSelectionError serverSelectionTimeoutMS',
    relevant: { 'sem-server-selection': 3, 'ep-atlas-ip': 1, 'tax-db-connectivity': 1 },
  },
  {
    id: 'id-input-type',
    category: 'identifier',
    query: 'input_type "query" vs "document"',
    relevant: { 'sem-input-type': 3 },
  },
  {
    id: 'id-sev2',
    category: 'identifier',
    query: 'SEV2 definition',
    relevant: { 'tax-severity': 3 },
  },
];
