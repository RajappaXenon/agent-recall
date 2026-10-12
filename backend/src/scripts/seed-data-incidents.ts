import type { SeedMemory, SeedOutcome } from './seed-data.js';

/**
 * Additional demo stories (isSeed: true like the rest of the seed). Each story has the shape the
 * demo needs: what happened, why, the fix that was verified by an outcome, and sometimes an
 * attempt that failed. Topics are deliberately different from the original pool-timeout story so
 * the demo can show many kinds of problems, and they avoid the topics of the benchmark questions.
 */
export const INCIDENT_MEMORIES: SeedMemory[] = [
  // ── Kafka: consumer group rebalance storm ──────────────────────────────────
  {
    key: 'ep-kafka-lag',
    agent: 'engineering',
    type: 'episodic',
    title: 'Order events piled up while the consumer group kept rebalancing',
    content:
      'After the order-enrichment step was added to the fulfilment consumer, lag on the orders-events topic grew to 2.4 million messages in two hours. Consumers logged "CommitFailedException: Commit cannot be completed since the group has already rebalanced" and members left and rejoined the group roughly every five minutes. Fulfilment emails went out up to three hours late.',
    tags: ['incident', 'kafka', 'consumer-lag', 'rebalance', 'fulfilment'],
    daysAgo: 21,
    helpful: 2,
  },
  {
    key: 'ep-kafka-rootcause',
    agent: 'engineering',
    type: 'episodic',
    title: 'Root cause: poll loop slower than max.poll.interval.ms',
    content:
      'Each poll returned up to max.poll.records=500 messages and the new enrichment call took about 900 ms per message, so one batch took far longer than max.poll.interval.ms=300000. The broker considered the consumer dead, revoked its partitions and triggered a rebalance; uncommitted offsets were reprocessed by the next owner, which also timed out. The eager assignor stopped every consumer during each rebalance.',
    tags: ['root-cause', 'kafka', 'max.poll.interval.ms', 'max.poll.records', 'rebalance'],
    daysAgo: 20,
    relations: [{ to: 'ep-kafka-lag', label: 'explains' }],
  },
  {
    key: 'proc-kafka-fix',
    agent: 'engineering',
    type: 'procedural',
    title: 'Stop a Kafka consumer rebalance loop caused by slow processing',
    content:
      '1. Compare worst-case batch time (max.poll.records × per-message time) with max.poll.interval.ms.\n2. Lower max.poll.records (we use 50) so one poll finishes well inside the interval.\n3. Move slow calls out of the poll loop: enrich in bounded parallel batches, then commit.\n4. Raise max.poll.interval.ms to 600000 only as headroom, not as the fix.\n5. Switch partition.assignment.strategy to CooperativeStickyAssignor so a rebalance does not stop every consumer.\n6. Alert on consumer group rebalance rate and on lag growth for 10 minutes.',
    tags: ['runbook', 'kafka', 'max.poll.records', 'cooperative-sticky', 'consumer-lag'],
    daysAgo: 19,
    verification: 'verified_success',
    helpful: 3,
    relations: [{ to: 'ep-kafka-rootcause', label: 'fixes' }],
  },
  {
    key: 'proc-kafka-partitions',
    agent: 'operations',
    type: 'procedural',
    title: 'Add partitions to clear consumer lag',
    content:
      '1. Increase the topic partition count (we went from 12 to 48).\n2. Scale the consumer deployment to match.\n3. Watch lag for 30 minutes.\nNote from the fulfilment incident: this made it worse. Processing per message was the bottleneck, so more partitions meant more members and longer rebalances, and lag kept growing.',
    tags: ['runbook', 'kafka', 'partitions', 'scaling'],
    daysAgo: 20,
    verification: 'verified_failure',
    notHelpful: 2,
  },
  {
    key: 'ep-kafka-resolution',
    agent: 'engineering',
    type: 'episodic',
    title: 'Resolved: fulfilment consumer lag cleared after poll tuning',
    content:
      'Applied the rebalance fix: max.poll.records=50, enrichment moved to bounded parallel batches, cooperative-sticky assignment. Rebalances stopped, the 2.4M backlog drained in 40 minutes and lag stayed under 1,000 messages through the weekend peak.',
    tags: ['resolution', 'kafka', 'consumer-lag', 'verified'],
    daysAgo: 18,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'proc-kafka-fix', label: 'applied' }],
  },

  // ── Kubernetes: OOMKilled after a runtime upgrade ──────────────────────────
  {
    key: 'ep-oom-image',
    agent: 'engineering',
    type: 'episodic',
    title: 'Image resizer pods OOMKilled after the Node 20 upgrade',
    content:
      'After the base image moved from Node 18 to Node 20 together with sharp 0.33, image-resizer pods restarted about 30 times an hour with reason OOMKilled and exit code 137. The JavaScript heap stayed near 300 MB in heap snapshots while container memory climbed steadily to the 1 GiB limit. Thumbnails failed with 502s during each restart.',
    tags: ['incident', 'kubernetes', 'oomkilled', 'exit-137', 'nodejs', 'memory'],
    daysAgo: 34,
    helpful: 1,
  },
  {
    key: 'ep-oom-rootcause',
    agent: 'engineering',
    type: 'episodic',
    title: 'Root cause: native memory growth in libvips, not the JS heap',
    content:
      'Memory outside the V8 heap grew: libvips (used by sharp) kept its operation cache, and glibc created one malloc arena per thread, fragmenting native memory under concurrent resizes. RSS rose until the kernel OOM killer stopped the container. Heap snapshots looked healthy, which hid the problem for a day.',
    tags: ['root-cause', 'memory', 'libvips', 'malloc', 'rss'],
    daysAgo: 33,
    relations: [{ to: 'ep-oom-image', label: 'explains' }],
  },
  {
    key: 'proc-oom-fix',
    agent: 'engineering',
    type: 'procedural',
    title: 'Fix native memory growth that gets Node pods OOMKilled',
    content:
      '1. Compare RSS with heap used (process.memoryUsage()) to tell native growth from a JS leak.\n2. Set MALLOC_ARENA_MAX=2 in the container environment.\n3. For sharp: sharp.cache(false) and sharp.concurrency(1) per worker.\n4. Set --max-old-space-size to about half the container limit so V8 collects before the cgroup limit.\n5. Load-test 30 minutes and confirm RSS plateaus.\n6. Alert when container memory stays above 85% of the limit.',
    tags: ['runbook', 'kubernetes', 'oomkilled', 'MALLOC_ARENA_MAX', 'nodejs'],
    daysAgo: 32,
    verification: 'verified_success',
    helpful: 3,
    relations: [{ to: 'ep-oom-rootcause', label: 'fixes' }],
  },
  {
    key: 'proc-oom-raise-limit',
    agent: 'operations',
    type: 'procedural',
    title: 'Raise the memory limit when pods are OOMKilled',
    content:
      '1. Double the container memory limit.\n2. Redeploy and watch restarts.\nNote from the image resizer incident: restarts stopped for about three hours and then came back, because memory kept growing. It only delayed the crash and doubled the node cost.',
    tags: ['runbook', 'kubernetes', 'memory', 'limits'],
    daysAgo: 33,
    verification: 'verified_failure',
    notHelpful: 2,
  },
  {
    key: 'ep-oom-resolution',
    agent: 'engineering',
    type: 'episodic',
    title: 'Resolved: image resizer memory flat after allocator and cache changes',
    content:
      'With MALLOC_ARENA_MAX=2, the sharp cache disabled and --max-old-space-size=512, RSS plateaued at about 620 MB under peak load. No OOMKilled restarts in the following two weeks; the limit went back to 1 GiB.',
    tags: ['resolution', 'kubernetes', 'memory', 'verified'],
    daysAgo: 30,
    verification: 'verified_success',
    helpful: 1,
    relations: [{ to: 'proc-oom-fix', label: 'applied' }],
  },

  // ── TLS: expired certificate ────────────────────────────────────────────────
  {
    key: 'ep-cert-expired',
    agent: 'operations',
    type: 'episodic',
    title: 'Partner API down for 47 minutes: TLS certificate expired',
    content:
      'Partner integrations failed with "x509: certificate has expired or is not yet valid" on api-partners. cert-manager had been failing to renew for 30 days: the DNS-01 challenge could not write the TXT record because the Route 53 IAM role it used had been rotated. Nobody was alerted because only HTTP availability was monitored, and it stayed green until the expiry minute.',
    tags: ['incident', 'tls', 'certificate', 'cert-manager', 'x509'],
    daysAgo: 64,
    helpful: 2,
  },
  {
    key: 'proc-cert-runbook',
    agent: 'operations',
    type: 'procedural',
    title: 'Renew an expired or stuck TLS certificate',
    content:
      '1. kubectl get certificate -A and kubectl describe certificaterequest to find the failing challenge.\n2. Fix the issuer credentials (DNS provider role or secret), then cmctl renew <certificate>.\n3. Verify with openssl s_client -connect host:443 and check notAfter.\n4. Alert when certmanager_certificate_expiration_timestamp_seconds is less than 14 days away.\n5. Add a synthetic check that validates the certificate chain, not only HTTP status.',
    tags: ['runbook', 'tls', 'cert-manager', 'certificate', 'openssl'],
    daysAgo: 63,
    verification: 'verified_success',
    helpful: 3,
    relations: [{ to: 'ep-cert-expired', label: 'fixes' }],
  },
  {
    key: 'ep-cert-resolution',
    agent: 'operations',
    type: 'episodic',
    title: 'Resolved: partner certificate renewed and expiry alerts added',
    content:
      'Restored the Route 53 role for the issuer, ran cmctl renew, and the new certificate was served within four minutes. Expiry alerts at 14 days and a chain-validating synthetic check now cover all public hostnames.',
    tags: ['resolution', 'tls', 'certificate', 'verified'],
    daysAgo: 63,
    verification: 'verified_success',
    relations: [{ to: 'proc-cert-runbook', label: 'applied' }],
  },

  // ── Payments: duplicate webhooks ────────────────────────────────────────────
  {
    key: 'ep-webhook-dupes',
    agent: 'support',
    type: 'episodic',
    title: 'Customers charged twice: payment webhooks processed more than once',
    content:
      'Fourteen tickets in one afternoon reported double charges or duplicate orders. The payment provider retried payment_intent.succeeded because our webhook endpoint took about 12 seconds to respond (the provider times out after 10). The handler created the order and captured payment on every delivery, so each retry fulfilled the order again.',
    tags: ['incident', 'payments', 'webhooks', 'duplicates', 'customer-impact'],
    daysAgo: 47,
    helpful: 2,
  },
  {
    key: 'proc-webhook-idempotency',
    agent: 'engineering',
    type: 'procedural',
    title: 'Make payment webhook handling idempotent',
    content:
      '1. Acknowledge the webhook with 200 within two seconds and process it from a queue.\n2. Store each provider event id in a processed_events collection with a unique index on eventId; skip duplicates.\n3. Send an Idempotency-Key on every outbound charge or refund call.\n4. Verify the webhook signature before enqueueing.\n5. Run a nightly reconciliation of orders against provider charges.',
    tags: ['runbook', 'payments', 'webhooks', 'idempotency', 'unique-index'],
    daysAgo: 46,
    verification: 'verified_success',
    helpful: 4,
    relations: [{ to: 'ep-webhook-dupes', label: 'fixes' }],
  },
  {
    key: 'sem-idempotency',
    agent: 'research',
    type: 'semantic',
    title: 'At-least-once delivery and idempotency keys',
    content:
      'Webhooks and message queues deliver at least once: a timeout or lost acknowledgement causes a redelivery of the same event. Consumers must therefore be idempotent, meaning processing an event twice has the same effect as once. The usual tool is an idempotency key: a unique id recorded on first processing, checked before side effects.',
    tags: ['concept', 'idempotency', 'at-least-once', 'webhooks'],
    daysAgo: 90,
  },
  {
    key: 'ep-webhook-resolution',
    agent: 'support',
    type: 'episodic',
    title: 'Resolved: no duplicate charges after idempotent webhooks shipped',
    content:
      'After the queue plus processed_events unique index shipped, provider retries were skipped as duplicates (312 in the first week) and no new double-charge tickets were opened. The 14 affected customers were refunded through the reconciliation report.',
    tags: ['resolution', 'payments', 'webhooks', 'verified'],
    daysAgo: 44,
    verification: 'verified_success',
    relations: [{ to: 'proc-webhook-idempotency', label: 'applied' }],
  },

  // ── API: rate limiter blocking a whole office ───────────────────────────────
  {
    key: 'ep-ratelimit-nat',
    agent: 'support',
    type: 'episodic',
    title: 'Enterprise customer locked out with HTTP 429 Too Many Requests',
    content:
      'A customer with about 2,000 employees reported that the dashboard failed for everyone each morning with HTTP 429 Too Many Requests. All their traffic left through one corporate NAT address, and the gateway limited requests to 100 per minute per IP, so one office shared a single bucket.',
    tags: ['incident', 'rate-limit', '429', 'nat', 'enterprise'],
    daysAgo: 12,
    helpful: 1,
  },
  {
    key: 'proc-ratelimit-keys',
    agent: 'engineering',
    type: 'procedural',
    title: 'Rate limit by API key or user, not only by client IP',
    content:
      '1. Key authenticated limits by API key or user id; keep per-IP limits only for unauthenticated routes.\n2. Add per-tenant quotas sized from the contract.\n3. Return Retry-After and X-RateLimit-Remaining headers so clients back off.\n4. Allow-list known corporate egress ranges only as a temporary measure.\n5. Chart 429s per tenant to catch the next shared-IP customer.',
    tags: ['runbook', 'rate-limit', '429', 'api-gateway'],
    daysAgo: 11,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'ep-ratelimit-nat', label: 'fixes' }],
  },

  // ── MongoDB transactions: WriteConflict under contention ────────────────────
  {
    key: 'ep-writeconflict',
    agent: 'engineering',
    type: 'episodic',
    title: 'Inventory reservations failed with WriteConflict during the flash sale',
    content:
      'During the 10:00 flash sale the reserve-stock endpoint returned 500s for about 18% of requests. Logs showed "WriteConflict error: this operation conflicted with another operation. Please retry your operation or multi-document transaction." with the TransientTransactionError label. Every reservation updated the same stock document for the one discounted product.',
    tags: ['incident', 'mongodb', 'transactions', 'WriteConflict', 'flash-sale'],
    daysAgo: 74,
    helpful: 2,
  },
  {
    key: 'proc-txn-retry',
    agent: 'engineering',
    type: 'procedural',
    title: 'Handle WriteConflict in MongoDB transactions',
    content:
      '1. Run transactions with session.withTransaction(), which retries on TransientTransactionError and UnknownTransactionCommitResult.\n2. Keep transactions short: no network calls or user input inside them.\n3. For a hot counter, use a conditional update ({ stock: { $gte: n } } with $inc: { stock: -n }) outside a transaction, or split the counter into buckets.\n4. Return 409 with a retry hint instead of 500 when retries are exhausted.\n5. Track transaction retries and aborts in metrics.',
    tags: ['runbook', 'mongodb', 'transactions', 'withTransaction', 'TransientTransactionError'],
    daysAgo: 73,
    verification: 'verified_success',
    helpful: 3,
    relations: [{ to: 'ep-writeconflict', label: 'fixes' }],
  },

  // ── Frontend: blank page in older Safari ────────────────────────────────────
  {
    key: 'ep-safari-blank',
    agent: 'support',
    type: 'episodic',
    title: 'Checkout page blank for Safari 15 users after release 7.3',
    content:
      'After release 7.3, customers on older iPhones saw an empty checkout page. Sentry showed "SyntaxError: Invalid regular expression: invalid group specifier name" from the bundle: a new date parser used a regex lookbehind, which Safari supports only from 16.4. Other browsers were fine, so internal testing missed it.',
    tags: ['incident', 'frontend', 'safari', 'browser-compatibility', 'regex'],
    daysAgo: 9,
    helpful: 2,
  },
  {
    key: 'proc-browser-compat',
    agent: 'engineering',
    type: 'procedural',
    title: 'Catch browser compatibility breaks before release',
    content:
      '1. Declare supported browsers in .browserslistrc (we include safari >= 15) and build with that target.\n2. Lint with eslint-plugin-compat so unsupported APIs fail CI.\n3. Avoid regex lookbehind in client code, or transpile it.\n4. Run the Playwright smoke suite on WebKit as well as Chromium for every release candidate.\n5. Alert on new SyntaxError groups in Sentry by browser version.',
    tags: ['runbook', 'frontend', 'browserslist', 'webkit', 'playwright'],
    daysAgo: 8,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'ep-safari-blank', label: 'fixes' }],
  },

  // ── CI: flaky tests around daylight saving time ─────────────────────────────
  {
    key: 'ep-flaky-dst',
    agent: 'engineering',
    type: 'episodic',
    title: 'Billing tests fail every year on the daylight saving weekend',
    content:
      'The invoice period tests failed on the last Sunday of March and passed again on Monday. They built dates with new Date() in the runner local time zone, so a day that was 23 hours long produced an off-by-one billing period. Retrying the job hid the failure each year.',
    tags: ['incident', 'ci', 'flaky-tests', 'timezone', 'dst'],
    daysAgo: 160,
  },
  {
    key: 'proc-fake-clock',
    agent: 'engineering',
    type: 'procedural',
    title: 'Make time-dependent tests deterministic',
    content:
      '1. Set TZ=UTC for the test runner.\n2. Freeze time with fake timers (vi.useFakeTimers / jest.useFakeTimers) and set the system time explicitly.\n3. Add explicit cases for DST transitions and month ends in the zones customers use.\n4. Never auto-retry a failing test without recording it as flaky.',
    tags: ['runbook', 'ci', 'testing', 'timezone'],
    daysAgo: 158,
    relations: [{ to: 'ep-flaky-dst', label: 'fixes' }],
  },

  // ── Security: leaked cloud key ──────────────────────────────────────────────
  {
    key: 'ep-leaked-key',
    agent: 'operations',
    type: 'episodic',
    title: 'Cloud access key leaked in a public fork: crypto-mining bill',
    content:
      'A developer pushed a test script with a long-lived AWS access key to a public fork. Nine minutes later instances were launched in eu-west-3 for crypto mining. GitHub secret scanning raised an alert, but it went to an unwatched mailbox; the key was revoked after six hours and the bill was about $3,800.',
    tags: ['incident', 'security', 'leaked-credentials', 'aws', 'secret-scanning'],
    daysAgo: 115,
    helpful: 1,
  },
  {
    key: 'proc-secret-rotation',
    agent: 'operations',
    type: 'procedural',
    title: 'Respond to a leaked credential',
    content:
      '1. Revoke or deactivate the credential immediately; do not wait to investigate.\n2. Search CloudTrail (or the provider audit log) for every call made with it and terminate what it created.\n3. Rotate anything the credential could read.\n4. Route secret-scanning alerts to the on-call channel and enable push protection.\n5. Replace long-lived keys in CI with OIDC federation.',
    tags: ['runbook', 'security', 'credentials', 'incident-response'],
    daysAgo: 114,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'ep-leaked-key', label: 'fixes' }],
  },

  // ── Cost: CDN cache busting ─────────────────────────────────────────────────
  {
    key: 'ep-egress-cost',
    agent: 'operations',
    type: 'episodic',
    title: 'Data transfer bill tripled after a cache-busting change',
    content:
      'Cloud egress costs tripled in October. The image CDN cache hit ratio had fallen from 94% to 31% after the web app started appending ?v=<timestamp> to every image URL to work around a stale avatar bug, so almost every request went to the origin bucket.',
    tags: ['incident', 'cost', 'cdn', 'cache', 'egress'],
    daysAgo: 52,
  },
  {
    key: 'proc-cdn-cache',
    agent: 'operations',
    type: 'procedural',
    title: 'Keep CDN cache hit ratio high for static assets',
    content:
      '1. Version assets by content hash in the file name, not by timestamp query strings.\n2. Exclude unknown query parameters from the CDN cache key.\n3. Serve hashed assets with Cache-Control: public, max-age=31536000, immutable.\n4. Purge single objects for urgent fixes instead of busting every URL.\n5. Alert when the cache hit ratio drops by more than 10 points in a day.',
    tags: ['runbook', 'cdn', 'cache', 'cost'],
    daysAgo: 50,
    relations: [{ to: 'ep-egress-cost', label: 'fixes' }],
  },

  // ── Scheduling: duplicate cron runs ─────────────────────────────────────────
  {
    key: 'ep-cron-double',
    agent: 'operations',
    type: 'episodic',
    title: 'Invoice emails sent twice after scaling the scheduler',
    content:
      'Customers received every invoice email twice for a week. The notifications service had been scaled from one to two replicas for availability, and each replica ran the same in-process node-cron schedule at 02:00, so both sent the batch.',
    tags: ['incident', 'cron', 'duplicates', 'email', 'scaling'],
    daysAgo: 27,
    helpful: 1,
  },
  {
    key: 'proc-cron-lock',
    agent: 'engineering',
    type: 'procedural',
    title: 'Run a scheduled job exactly once across replicas',
    content:
      '1. Prefer a platform scheduler (Kubernetes CronJob with concurrencyPolicy: Forbid) over in-process cron in a scaled service.\n2. If the job must run in the service, take a lock first: insert { job, runDate } into a job_runs collection with a unique index and only the winner runs.\n3. Make the job idempotent anyway (record sent invoice ids).\n4. Alert when a job runs zero or more than one time per period.',
    tags: ['runbook', 'cron', 'distributed-lock', 'unique-index', 'idempotency'],
    daysAgo: 26,
    verification: 'verified_success',
    helpful: 2,
    relations: [{ to: 'ep-cron-double', label: 'fixes' }],
  },

  // ── Taxonomy and research notes ─────────────────────────────────────────────
  {
    key: 'tax-incident-causes',
    agent: 'operations',
    type: 'taxonomic',
    title: 'Taxonomy of production incident triggers',
    content:
      'Most incidents in our reviews start from one of six triggers. Configuration change (a tuned setting, a new dependency version). Capacity (traffic peaks, contention on a hot record). Expiry (certificates, credentials, quotas). Duplication (retries, at-least-once delivery, replicas running the same job). Client compatibility (old browsers, SDK versions). Leaked or misused credentials.',
    tags: ['taxonomy', 'incident', 'root-cause'],
    daysAgo: 15,
    relations: [
      { to: 'ep-cert-expired', label: 'expiry' },
      { to: 'ep-webhook-dupes', label: 'duplication' },
      { to: 'ep-cron-double', label: 'duplication' },
      { to: 'ep-safari-blank', label: 'client compatibility' },
      { to: 'ep-leaked-key', label: 'credentials' },
      { to: 'ep-writeconflict', label: 'capacity' },
    ],
  },
  {
    key: 'sem-chunking',
    agent: 'research',
    type: 'semantic',
    title: 'Chunk long runbooks before embedding them',
    content:
      'Embedding a whole long runbook as one vector blurs its steps together, so a question about step 7 matches weakly. Splitting documents into sections of a few hundred tokens, keeping the title in each chunk, improves retrieval of specific steps. Short memories like incident notes can stay whole.',
    tags: ['retrieval', 'embeddings', 'chunking'],
    daysAgo: 22,
  },
];

/** Outcomes recorded on the stories above: they verify (or fail) the procedures and create resolution memories. */
export const INCIDENT_OUTCOMES: SeedOutcome[] = [
  {
    key: 'outcome-kafka-fix',
    agent: 'engineering',
    query: 'Kafka consumers keep rebalancing and lag is growing after we added a slow processing step. What fixed it?',
    answer: 'Lower max.poll.records, move the slow enrichment out of the poll loop, use cooperative-sticky assignment and alert on rebalance rate.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Backlog drained in 40 minutes, no rebalances since.',
    cited: ['proc-kafka-fix', 'ep-kafka-rootcause'],
    createdMemory: 'ep-kafka-resolution',
    daysAgo: 18,
  },
  {
    key: 'outcome-kafka-partitions',
    agent: 'operations',
    query: 'Consumer lag keeps growing on the orders topic. Should we add more partitions?',
    answer: 'Increase partitions from 12 to 48 and scale consumers to match.',
    result: 'failed',
    feedback: 'not_helpful',
    notes: 'Lag kept growing and rebalances took longer. Per-message processing time was the bottleneck.',
    cited: ['proc-kafka-partitions'],
    createdMemory: null,
    daysAgo: 20,
  },
  {
    key: 'outcome-oom-fix',
    agent: 'engineering',
    query: 'Our Node pods get OOMKilled with exit code 137 but the heap looks fine. What worked last time?',
    answer: 'Native memory growth: set MALLOC_ARENA_MAX=2, disable the sharp cache, cap --max-old-space-size, and confirm RSS plateaus under load.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'RSS flat at about 620 MB, no OOMKilled restarts for two weeks.',
    cited: ['proc-oom-fix', 'ep-oom-rootcause'],
    createdMemory: 'ep-oom-resolution',
    daysAgo: 30,
  },
  {
    key: 'outcome-oom-raise-limit',
    agent: 'operations',
    query: 'Pods keep getting OOMKilled. Should we just give them more memory?',
    answer: 'Double the container memory limit and redeploy.',
    result: 'failed',
    feedback: 'not_helpful',
    notes: 'Crashes came back after about three hours; memory kept growing.',
    cited: ['proc-oom-raise-limit'],
    createdMemory: null,
    daysAgo: 33,
  },
  {
    key: 'outcome-cert',
    agent: 'operations',
    query: 'Clients get "certificate has expired" errors on our API. How did we fix the expired certificate before?',
    answer: 'Find the failing cert-manager challenge, fix the issuer credentials, run cmctl renew, then add expiry alerts at 14 days.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'New certificate served in four minutes.',
    cited: ['proc-cert-runbook'],
    createdMemory: 'ep-cert-resolution',
    daysAgo: 63,
  },
  {
    key: 'outcome-webhooks',
    agent: 'support',
    query: 'Customers say they were charged twice for one order. What fixed duplicate payments last time?',
    answer: 'Make webhook processing idempotent: acknowledge fast, queue the work, store provider event ids under a unique index, and send idempotency keys on charges.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'No new double-charge tickets; 312 retries skipped as duplicates in a week.',
    cited: ['proc-webhook-idempotency', 'sem-idempotency'],
    createdMemory: 'ep-webhook-resolution',
    daysAgo: 44,
  },
  {
    key: 'outcome-ratelimit',
    agent: 'support',
    query: 'A big customer gets 429 Too Many Requests for the whole office every morning. How do we fix it?',
    answer: 'Their users share one NAT IP: key rate limits by API key or user instead of IP, and add per-tenant quotas.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Customer unblocked the same day.',
    cited: ['proc-ratelimit-keys'],
    createdMemory: null,
    daysAgo: 11,
  },
  {
    key: 'outcome-writeconflict',
    agent: 'engineering',
    query: 'Our MongoDB transactions fail with WriteConflict under load. What did we do last time?',
    answer: 'Use withTransaction for automatic retries, keep transactions short, and update the hot stock counter with a conditional $inc outside the transaction.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Error rate on reserve-stock went from 18% to 0.1% at the next sale.',
    cited: ['proc-txn-retry'],
    createdMemory: null,
    daysAgo: 72,
  },
  {
    key: 'outcome-safari',
    agent: 'engineering',
    query: 'Some users see a blank page after the release, only on older iPhones. What fixed this before?',
    answer: 'An unsupported regex lookbehind broke the bundle in Safari 15: build for the browserslist targets, lint with eslint-plugin-compat, and smoke-test on WebKit.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Hotfix 7.3.1 restored checkout for Safari 15.',
    cited: ['proc-browser-compat'],
    createdMemory: null,
    daysAgo: 8,
  },
  {
    key: 'outcome-leaked-key',
    agent: 'operations',
    query: 'A cloud access key was pushed to a public repository. What are the steps?',
    answer: 'Revoke it immediately, audit its calls in CloudTrail, delete what it created, rotate dependent secrets, and route secret-scanning alerts to on-call.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Key revoked within 5 minutes in the drill.',
    cited: ['proc-secret-rotation'],
    createdMemory: null,
    daysAgo: 100,
  },
  {
    key: 'outcome-cron',
    agent: 'engineering',
    query: 'A scheduled job runs twice since we added a second replica. How do we make it run once?',
    answer: 'Move it to a Kubernetes CronJob with concurrencyPolicy Forbid, or take a unique-index lock on job and run date before running.',
    result: 'worked',
    feedback: 'helpful',
    notes: 'Single invoice email per customer since.',
    cited: ['proc-cron-lock'],
    createdMemory: null,
    daysAgo: 25,
  },
];
