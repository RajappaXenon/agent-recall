import type { MemoryType, VerificationStatus } from '@agent-recall/shared';

/**
 * Demo seed (SPEC §13). Everything here is written with isSeed: true and shown
 * with a "Demo data" badge. Retrieval differences between modes come from these
 * texts going through real Atlas Search / Vector Search, not from arranged results.
 */

export type AgentKey = 'research' | 'engineering' | 'operations';

export const SEED_AGENTS: Record<AgentKey, { name: string; description: string }> = {
  research: {
    name: 'Research Agent',
    description: 'Collects and summarises technical background: retrieval methods, embedding models, evaluation notes.',
  },
  engineering: {
    name: 'Engineering Assistant',
    description: 'Helps engineers debug production incidents and applies proven fixes from past experience.',
  },
  operations: {
    name: 'Operations Analyst',
    description: 'Tracks SLOs, on-call load and incident process; turns reviews into runbooks.',
  },
};

export interface SeedMemory {
  key: string;
  agent: AgentKey;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  daysAgo: number;
  verification?: VerificationStatus;
  relations?: { to: string; label: string }[];
  helpful?: number;
  notHelpful?: number;
}

export const SEED_MEMORIES: SeedMemory[] = [
  // ── The pool-timeout story (Engineering Assistant) ─────────────────────────
  {
    key: 'ep-pool-incident',
    agent: 'engineering',
    type: 'episodic',
    title: 'Checkout API timed out after connection pool change',
    content:
      'About 20 minutes after deploy 4.12 the checkout API started returning 504s. The deploy had lowered the MongoDB driver maxPoolSize from 100 to 10 to reduce the number of Atlas connections. p99 latency went from 180 ms to 9 s during the evening peak and logs filled with "Timed out while checking out a connection from connection pool". Rolling the deploy back restored latency within minutes.',
    tags: ['incident', 'mongodb', 'connection-pool', 'api-timeout', 'checkout'],
    daysAgo: 58,
    helpful: 3,
  },
  {
    key: 'ep-pool-rootcause',
    agent: 'engineering',
    type: 'episodic',
    title: 'Root cause: pool too small for new concurrency, plus cursors never closed',
    content:
      'Post-incident analysis of the checkout timeouts found two causes that compounded. First, maxPoolSize=10 was far below real concurrency: the new async batch endpoint pushed each instance to about 60 concurrent database operations. Second, the order-export loop opened a find() cursor per page and broke out early without calling cursor.close(), so those connections stayed checked out until the server-side cursor timed out after 10 minutes. Requests queued for a connection until waitQueueTimeoutMS=2000 expired.',
    tags: ['root-cause', 'mongodb', 'connection-pool', 'cursor-leak', 'checkout'],
    daysAgo: 57,
    helpful: 2,
    relations: [{ to: 'ep-pool-incident', label: 'explains' }],
  },
  {
    key: 'proc-pool-fix',
    agent: 'engineering',
    type: 'procedural',
    title: 'Fix connection pool exhaustion after a pool size change',
    content:
      '1. Size the pool for peak concurrency per instance: set maxPoolSize to roughly 1.3× the measured peak of concurrent operations (we use 80), and check instances × maxPoolSize stays under the cluster connection limit.\n2. Set minPoolSize (10) so warm connections exist before traffic spikes.\n3. Raise waitQueueTimeoutMS to 5000 so short bursts queue instead of failing, and keep it below the API gateway timeout.\n4. Close every cursor: wrap cursor iteration in try/finally and call cursor.close(), or use for await so early exits release the connection.\n5. Add pool metrics alerts: alert when checked-out connections stay above 80% of maxPoolSize for 5 minutes or when ConnectionCheckOutFailed events appear.\n6. Load-test the change before rollout and watch p99 latency.',
    tags: ['runbook', 'mongodb', 'connection-pool', 'maxPoolSize', 'waitQueueTimeoutMS'],
    daysAgo: 56,
    verification: 'verified_success',
    helpful: 4,
    relations: [
      { to: 'ep-pool-rootcause', label: 'fixes' },
      { to: 'sem-pool-error', label: 'resolves error' },
    ],
  },
  {
    key: 'ep-pool-resolution',
    agent: 'engineering',
    type: 'episodic',
    title: 'Resolved: checkout timeouts gone after pool fix procedure',
    content:
      'Applied the pool fix procedure the day after the incident: maxPoolSize=80, minPoolSize=10, waitQueueTimeoutMS=5000, export cursors closed in a finally block, and alerts on pool checkout failures. p99 latency returned to 190 ms and there were no wait-queue timeouts across the next 14 evening peaks.',
    tags: ['resolution', 'mongodb', 'connection-pool', 'checkout', 'verified'],
    daysAgo: 55,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'proc-pool-fix', label: 'applied' }],
  },
  {
    key: 'sem-pool-error',
    agent: 'engineering',
    type: 'semantic',
    title: 'MongoWaitQueueTimeoutError: what it means',
    content:
      'Exact error text: "MongoWaitQueueTimeoutError: Timed out while checking out a connection from connection pool" seen with maxPoolSize=10, waitQueueTimeoutMS=2000. It means every connection in the client pool was in use and the operation waited in the queue longer than waitQueueTimeoutMS. maxPoolSize caps open connections per MongoClient per server; minPoolSize keeps that many connections open while idle; waitQueueTimeoutMS bounds how long an operation waits for a free connection; maxIdleTimeMS closes connections idle longer than the limit.',
    tags: ['mongodb', 'error', 'connection-pool', 'maxPoolSize=10', 'waitQueueTimeoutMS=2000'],
    daysAgo: 54,
    helpful: 3,
  },
  {
    key: 'sem-pool-sizing',
    agent: 'engineering',
    type: 'semantic',
    title: 'How to size driver connection pools',
    content:
      'Total connections opened against a cluster ≈ application instances × maxPoolSize × servers contacted. Each MongoClient keeps its own pool, so one client per process. A pool smaller than peak concurrency serialises work and shows up as latency, not errors, until the wait queue times out. A pool far larger than needed wastes server memory per connection. Measure concurrent operations at peak and leave about 30% headroom.',
    tags: ['mongodb', 'capacity', 'connection-pool'],
    daysAgo: 50,
  },
  {
    key: 'ep-billing-hung',
    agent: 'engineering',
    type: 'episodic',
    title: 'Billing service hung under load after a driver config tweak',
    content:
      'During the March month-end run the billing service stopped answering shortly after someone trimmed the database client settings in values.yaml to "save resources". Requests piled up waiting on the data layer while CPU stayed near idle. Restarting pods helped for a few minutes each time. Reverting the client settings to the previous values made the service responsive again.',
    tags: ['incident', 'billing', 'latency', 'config'],
    daysAgo: 190,
  },
  {
    key: 'ep-redis-timeout',
    agent: 'engineering',
    type: 'episodic',
    title: 'Redis client timeouts during cache warm-up',
    content:
      'After the session cache moved to a new Redis node, ioredis raised ETIMEDOUT for about ten minutes on every deploy. The connection timeout was 500 ms and the client connection pool reconnected in a tight loop while the node loaded its RDB snapshot. Raising connectTimeout to 5 s and adding a readiness check on the cache fixed the deploy-time errors.',
    tags: ['incident', 'redis', 'timeout', 'cache'],
    daysAgo: 120,
  },
  {
    key: 'ep-threadpool',
    agent: 'research',
    type: 'episodic',
    title: 'Thread pool exhaustion in the ML feature worker',
    content:
      'The feature extraction worker used a ThreadPoolExecutor with max_workers=8 and blocking pandas calls. Under a backfill every thread in the pool was busy and new jobs timed out after 30 s. Moving the CPU-heavy transforms to a process pool and capping the backfill rate removed the timeouts. Nothing to do with the database.',
    tags: ['ml', 'python', 'thread-pool', 'timeout'],
    daysAgo: 95,
  },
  {
    key: 'ep-dns-timeout',
    agent: 'engineering',
    type: 'episodic',
    title: 'DNS resolution timeouts after VPC resolver change',
    content:
      'Calls from the API to the payment provider timed out intermittently after the VPC switched to a new DNS resolver. getaddrinfo EAI_AGAIN errors appeared in bursts. The resolver was rate limiting; enabling a local DNS cache on each node and lowering lookup concurrency fixed it.',
    tags: ['incident', 'dns', 'network', 'timeout', 'api'],
    daysAgo: 140,
  },
  {
    key: 'ep-atlas-ip',
    agent: 'engineering',
    type: 'episodic',
    title: 'Staging could not reach Atlas after NAT gateway change',
    content:
      'Every staging service failed health checks with MongoServerSelectionError after the network team replaced the NAT gateway. The new egress IP was not in the Atlas IP access list, so the cluster refused connections before authentication. Adding the new egress IP under Atlas Network Access restored connectivity in about a minute.',
    tags: ['incident', 'mongodb', 'atlas', 'network', 'staging'],
    daysAgo: 80,
  },
  {
    key: 'sem-server-selection',
    agent: 'engineering',
    type: 'semantic',
    title: 'Server selection errors versus wait queue timeouts',
    content:
      'MongoServerSelectionError means the driver could not find a suitable server within serverSelectionTimeoutMS: usually network reachability, DNS, the IP access list or the cluster being down. A wait queue timeout means the server was reachable but every pooled connection was busy. The first is a connectivity problem; the second is a capacity problem.',
    tags: ['mongodb', 'error', 'troubleshooting'],
    daysAgo: 79,
  },
  {
    key: 'proc-slow-query',
    agent: 'engineering',
    type: 'procedural',
    title: 'Diagnose a slow MongoDB query',
    content:
      '1. Reproduce with the exact filter and sort.\n2. Run explain("executionStats") and compare totalDocsExamined with nReturned.\n3. Look for COLLSCAN or an in-memory SORT stage.\n4. Add or adjust a compound index following equality, sort, range order.\n5. Re-run explain and confirm the IXSCAN plan is chosen.\n6. Check the Atlas Query Profiler for the same shape after deploy.',
    tags: ['runbook', 'mongodb', 'performance', 'indexes'],
    daysAgo: 70,
  },
  {
    key: 'proc-rollback',
    agent: 'engineering',
    type: 'procedural',
    title: 'Roll back a bad deploy',
    content:
      '1. Announce the rollback in the incident channel.\n2. Run the release tool with the previous version tag.\n3. Watch error rate and p99 latency for 10 minutes.\n4. Keep the failed build for analysis; do not delete it.\n5. Open a follow-up ticket with the timeline.',
    tags: ['runbook', 'deploy', 'rollback'],
    daysAgo: 110,
    helpful: 1,
  },
  {
    key: 'tax-db-connectivity',
    agent: 'engineering',
    type: 'taxonomic',
    title: 'Taxonomy of database connectivity failures',
    content:
      'Database connectivity failures fall into four groups. Pool exhaustion: the server is reachable but no pooled connection is free (wait queue timeouts). Network reachability: DNS, routing, IP access lists (server selection errors). Authentication: wrong credentials or missing roles. Server-side limits: connection caps per tier, slow operations holding connections.',
    tags: ['taxonomy', 'mongodb', 'troubleshooting'],
    daysAgo: 60,
    relations: [
      { to: 'sem-pool-error', label: 'pool exhaustion' },
      { to: 'ep-atlas-ip', label: 'network reachability' },
      { to: 'ep-dns-timeout', label: 'network reachability' },
      { to: 'sem-server-selection', label: 'defines' },
    ],
  },

  // ── Operations Analyst ─────────────────────────────────────────────────────
  {
    key: 'proc-scale-out',
    agent: 'operations',
    type: 'procedural',
    title: 'Scale out API pods when latency spikes',
    content:
      '1. When p99 latency exceeds the SLO for 10 minutes, double the API replica count.\n2. Watch latency for 15 minutes.\n3. Scale back down after the peak.\nNote from the pool incident: scaling out made things worse, because each new pod opened its own pool against an already saturated database.',
    tags: ['runbook', 'scaling', 'latency', 'kubernetes'],
    daysAgo: 62,
    verification: 'verified_failure',
    notHelpful: 2,
  },
  {
    key: 'sem-checkout-slo',
    agent: 'operations',
    type: 'semantic',
    title: 'Checkout API service level objectives',
    content:
      'Checkout API SLOs: p99 latency under 400 ms measured at the gateway, 99.9% of requests successful over 30 days. The error budget is about 43 minutes per month. Paging starts when the 1-hour burn rate exceeds 14×.',
    tags: ['slo', 'checkout', 'latency'],
    daysAgo: 100,
  },
  {
    key: 'proc-incident-review',
    agent: 'operations',
    type: 'procedural',
    title: 'Run a blameless incident review',
    content:
      '1. Collect the timeline from alerts, deploys and chat within 48 hours.\n2. Identify contributing factors, not a single culprit.\n3. Record what helped detection and recovery.\n4. Turn each fix into an owned action item with a due date.\n5. Store the verified fix as a runbook so agents can retrieve it.',
    tags: ['process', 'incident-review', 'runbook'],
    daysAgo: 130,
  },
  {
    key: 'tax-severity',
    agent: 'operations',
    type: 'taxonomic',
    title: 'Incident severity levels',
    content:
      'SEV1: customer-facing outage or data loss, page immediately. SEV2: major degradation such as checkout p99 above 2 s, page during business and evening hours. SEV3: partial degradation with a workaround. SEV4: internal tooling issues. The checkout pool incident was classified SEV2.',
    tags: ['taxonomy', 'incident', 'severity'],
    daysAgo: 150,
    relations: [{ to: 'ep-pool-incident', label: 'example of SEV2' }],
  },
  {
    key: 'ep-campaign-peak',
    agent: 'operations',
    type: 'episodic',
    title: 'Evening traffic doubled during the autumn campaign',
    content:
      'The autumn marketing campaign doubled evening checkout traffic for two weeks. Autoscaling kept CPU healthy, but database connection count rose with the replica count. Capacity planning now includes database connections per replica, not only CPU and memory.',
    tags: ['capacity', 'traffic', 'checkout'],
    daysAgo: 40,
  },
  {
    key: 'ep-alert-noise',
    agent: 'operations',
    type: 'episodic',
    title: 'Pager noise from disk usage warnings',
    content:
      'On-call received 40 low-value disk usage pages in one week from log volumes at 75%. Changing the alert to fire at 90% with a 30-minute duration, and routing the 75% warning to a ticket queue, cut pages by 80% without missing a real disk-full event.',
    tags: ['on-call', 'alerting', 'noise'],
    daysAgo: 25,
  },

  // ── Research Agent ─────────────────────────────────────────────────────────
  {
    key: 'sem-rrf',
    agent: 'research',
    type: 'semantic',
    title: 'Reciprocal Rank Fusion',
    content:
      'Reciprocal Rank Fusion combines ranked lists without comparing their raw scores: each item scores the sum over lists of 1 / (k + rank), with k = 60 by convention. Items ranked well by several retrievers rise; items found by only one still count. It is robust because BM25 scores and cosine similarities live on different scales.',
    tags: ['retrieval', 'hybrid-search', 'ranking'],
    daysAgo: 35,
  },
  {
    key: 'sem-keyword-vs-vector',
    agent: 'research',
    type: 'semantic',
    title: 'When keyword search beats semantic search',
    content:
      'Lexical search wins on exact identifiers: error codes, configuration keys like maxPoolSize=10, version numbers and product names, which embeddings tend to blur. Semantic search wins when the same problem is described in different words. Hybrid retrieval keeps both strengths.',
    tags: ['retrieval', 'search', 'embeddings'],
    daysAgo: 33,
  },
  {
    key: 'sem-input-type',
    agent: 'research',
    type: 'semantic',
    title: 'Query versus document input types for embeddings',
    content:
      'Voyage embedding models accept input_type "query" or "document". Each prepends a short retrieval prompt so that questions and passages land close together in the vector space. Use "document" when indexing memories and "query" when embedding a search.',
    tags: ['embeddings', 'voyage', 'retrieval'],
    daysAgo: 30,
  },
  {
    key: 'tax-memory-types',
    agent: 'research',
    type: 'taxonomic',
    title: 'Types of agent memory',
    content:
      'Episodic memories record specific experiences with time and outcome. Semantic memories hold facts and definitions. Procedural memories hold step-by-step methods that can be verified by outcomes. Taxonomic memories organise concepts into categories and link related memories.',
    tags: ['taxonomy', 'memory', 'agents'],
    daysAgo: 45,
  },
  {
    key: 'ep-embedding-eval',
    agent: 'research',
    type: 'episodic',
    title: 'Evaluated embedding models on internal runbooks',
    content:
      'Compared three embedding models on 120 runbook questions written by on-call engineers. Pure vector search missed questions that hinged on an exact error code; pure keyword search missed paraphrased symptoms. Fusing both rankings answered the most questions in the top three results.',
    tags: ['evaluation', 'embeddings', 'retrieval'],
    daysAgo: 28,
    relations: [],
  },
];

/** Seeded outcomes: the verified procedure and the failed scale-out runbook. */
export const SEED_OUTCOMES = [
  {
    key: 'outcome-pool-fix',
    agent: 'engineering' as AgentKey,
    query: 'Checkout is timing out after we reduced maxPoolSize. What fixed this before?',
    answer:
      'Raise maxPoolSize to cover peak concurrency, set minPoolSize, raise waitQueueTimeoutMS, close cursors in the export loop and alert on pool checkout failures.',
    result: 'worked' as const,
    feedback: 'helpful' as const,
    notes: 'p99 back to 190 ms after rollout.',
    cited: ['proc-pool-fix', 'sem-pool-error'],
    createdMemory: 'ep-pool-resolution',
    daysAgo: 55,
  },
  {
    key: 'outcome-scale-out',
    agent: 'operations' as AgentKey,
    query: 'Latency is above SLO during the evening peak. Should we scale out?',
    answer: 'Double API replicas and watch p99 for 15 minutes.',
    result: 'failed' as const,
    feedback: 'not_helpful' as const,
    notes: 'More pods meant more pools against a saturated database. Latency got worse.',
    cited: ['proc-scale-out'],
    createdMemory: null,
    daysAgo: 57,
  },
];
