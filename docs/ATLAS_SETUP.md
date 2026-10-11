# MongoDB Atlas setup

Agent Recall uses one Atlas cluster for development, tests and deployment. Tests are isolated by a `__test__` organization inside the same collections, because Search and Vector Search indexes are per collection and lower tiers allow only a few.

## 1. Cluster and access

1. Create a cluster. Any tier with Atlas Search works; free and flex tiers cap the number of search indexes.
2. **Database Access:** create a database user with read/write on your database (`DB_NAME`, default `agent_recall`).
3. **Network Access:** add your current IP. For a Render deployment, add Render's outbound IPs. For a hackathon, `0.0.0.0/0` is a known shortcut; treat it as a limitation.
4. Copy the connection string into `.env` as `MONGODB_URI`. Never commit it.

Troubleshooting:
- **`querySrv ECONNREFUSED`** is a DNS problem with the `mongodb+srv` lookup, not an access-list problem. The app falls back to `DNS_SERVERS` (or 1.1.1.1 / 8.8.8.8) when Node's resolver is loopback-only.
- **`Server selection timed out`** usually means the IP is missing from the access list.

## 2. Indexes: `npm run setup:indexes -w backend`

The script does the following:
- creates all regular indexes (SPEC §3, plus the unique `outcome_once_per_task` and the partial unique `retrieval_idempotency`)
- prints the server version and the number of existing search indexes in `DB_NAME`
- creates the two indexes below with `createSearchIndex`
- polls `listSearchIndexes` until both report `queryable: true`, timing out after 10 minutes

To have it enforce the search-index limit for your tier, set `ATLAS_TIER=M0|FLEX|M10…`. The driver cannot read the tier itself.

### `memories_search` (type `search`)

```json
{ "mappings": { "dynamic": false, "fields": {
  "title":   { "type": "string", "analyzer": "lucene.english",
               "multi": { "exact": { "type": "string", "analyzer": "lucene.whitespace" } } },
  "content": { "type": "string", "analyzer": "lucene.english",
               "multi": { "exact": { "type": "string", "analyzer": "lucene.whitespace" } } },
  "tags":    [ { "type": "string" }, { "type": "token" } ],
  "type":    { "type": "token" },
  "orgId":   { "type": "objectId" },
  "agentId": { "type": "objectId" },
  "archived":{ "type": "boolean" },
  "verification": { "type": "document", "fields": { "status": { "type": "token" } } },
  "createdAt": { "type": "date" } } } }
```

### `memories_vector` (type `vectorSearch`)

```json
{ "fields": [
  { "type": "vector", "path": "embedding.vector", "numDimensions": 1024, "similarity": "cosine" },
  { "type": "filter", "path": "orgId" }, { "type": "filter", "path": "agentId" },
  { "type": "filter", "path": "type" },  { "type": "filter", "path": "archived" },
  { "type": "filter", "path": "verification.status" } ] }
```

`numDimensions` comes from `VOYAGE_DIMENSIONS`. If you change the model or dimensions, the script detects the mismatch and stops. Then run:

```bash
npm run setup:indexes -w backend -- --recreate   # drops and recreates both search indexes (only when you run it)
npm run embed:backfill -w backend
```

### Creating them in the Atlas UI instead

Go to **Atlas → your cluster → Atlas Search → Create Search Index**:

1. **Atlas Search → JSON Editor.** Database `DB_NAME`, collection `memories`, name `memories_search`. Paste the first definition.
2. **Atlas Vector Search → JSON Editor.** Same collection, name `memories_vector`. Paste the second definition.
3. Wait until both show **Active / Queryable**. The integration pill in the app turns green once `listSearchIndexes` reports `queryable: true`.

## 3. Data

```bash
npm run seed -w backend          # idempotent; embeds live when VOYAGE_API_KEY is set
npm run embed:backfill -w backend   # anything pending, failed, or embedded with another model
npm run demo:reset -w backend    # deletes non-seed docs in the demo org only, then re-seeds
```

Atlas Search indexing is near-real-time. New memories become searchable after a short delay, so the app and tests poll `GET /api/memories/:id/searchable` rather than sleeping.
