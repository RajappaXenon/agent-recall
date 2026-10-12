/**
 * Calibration pairs for the contextual outcome policy (services/rrf.ts CONTEXT_LOW / CONTEXT_HIGH).
 *
 * Deliberately unrelated to the seed memories and to the benchmark questions, so choosing the
 * similarity thresholds cannot leak benchmark labels. Each pair is two questions an engineer might
 * ask; `same` means one fix would answer both, `different` means they need different fixes
 * (mostly hard negatives from the same technology area).
 *
 * Run: npm run calibrate -w backend
 */
export const CALIBRATION_PAIRS: { a: string; b: string; same: boolean }[] = [
  // same problem, different words
  { same: true, a: 'Kafka consumer lag spikes after we added partitions to the topic', b: 'Our consumers fall behind ever since the partition count was increased. How did we handle that?' },
  { same: true, a: 'Postgres replica falls hours behind during the nightly vacuum', b: 'Read replica replication delay grows while autovacuum runs at night' },
  { same: true, a: 'S3 uploads fail with SlowDown errors during the bulk import', b: 'Bulk import to object storage gets throttled with 503 slow down responses' },
  { same: true, a: 'Node service runs out of memory after upgrading the image library', b: 'Heap keeps growing until the pod is OOM-killed since we bumped the image processing package' },
  { same: true, a: 'TLS handshakes fail after the certificate was rotated', b: 'Clients reject the connection with certificate errors right after we renewed the cert' },
  { same: true, a: 'Elasticsearch cluster goes red after a node restart', b: 'Search cluster health turns red with unassigned shards whenever one data node reboots' },
  { same: true, a: 'Cron job runs twice when we have two replicas', b: 'Scheduled task executes on both instances so emails are sent in duplicate' },
  { same: true, a: 'Frontend bundle size doubled after adding the charting library', b: 'Our JavaScript bundle got twice as big once the chart package was added. What did we do last time?' },
  { same: true, a: 'gRPC calls hit deadline exceeded after enabling the service mesh sidecar', b: 'Since the mesh proxy was injected, RPCs time out with DEADLINE_EXCEEDED' },
  { same: true, a: 'Login page is slow because bcrypt cost factor is too high', b: 'Password hashing takes almost a second per sign-in after raising the work factor' },
  { same: true, a: 'Disk fills up on build agents from leftover Docker layers', b: 'CI runners run out of space because old container images are never pruned' },
  { same: true, a: 'Webhook deliveries are retried forever when the receiver returns 500', b: 'Failed webhooks keep retrying endlessly against an endpoint that errors' },

  // different problems, often the same technology area
  { same: false, a: 'Kafka consumer lag spikes after we added partitions to the topic', b: 'Kafka broker disk fills up because retention is set to forever' },
  { same: false, a: 'Postgres replica falls hours behind during the nightly vacuum', b: 'Postgres rejects new connections because max_connections was reached' },
  { same: false, a: 'S3 uploads fail with SlowDown errors during the bulk import', b: 'S3 bucket policy accidentally made objects public' },
  { same: false, a: 'Node service runs out of memory after upgrading the image library', b: 'Node service CPU pegged at 100% because of a regex backtracking bug' },
  { same: false, a: 'TLS handshakes fail after the certificate was rotated', b: 'DNS records still point at the old load balancer after migration' },
  { same: false, a: 'Elasticsearch cluster goes red after a node restart', b: 'Elasticsearch queries return stale results because the refresh interval is too long' },
  { same: false, a: 'Cron job runs twice when we have two replicas', b: 'Cron job never runs because the timezone is set to UTC instead of local time' },
  { same: false, a: 'Frontend bundle size doubled after adding the charting library', b: 'Charts render blank in Safari because of an unsupported date format' },
  { same: false, a: 'gRPC calls hit deadline exceeded after enabling the service mesh sidecar', b: 'gRPC message exceeds the 4 MB maximum size limit' },
  { same: false, a: 'Login page is slow because bcrypt cost factor is too high', b: 'Users are logged out every few minutes because the session cookie domain is wrong' },
  { same: false, a: 'Disk fills up on build agents from leftover Docker layers', b: 'Docker builds are slow because the layer cache is invalidated by copying the whole repo first' },
  { same: false, a: 'Webhook deliveries are retried forever when the receiver returns 500', b: 'Webhook signatures fail verification because the body was re-serialised' },
];
