# backend: Agent Recall API, worker and scripts

The backend is one TypeScript package with two processes and a set of command-line scripts:

| Process | Entry | What it does |
|---|---|---|
| **API** | `src/server.ts` → `src/app.ts` | Fastify 5 REST API under `/api`, Swagger UI at `/docs` |
| **Worker** | `src/worker.ts` | Runs multi-step "playbook" tasks with leases and crash-safe checkpoints |
| **Scripts** | `src/scripts/*.ts` | Index setup, seeding, embedding backfill, demo reset, benchmark, calibration |

Everything is stored in **MongoDB Atlas**:
- **Keyword search:** Atlas Search.
- **Semantic search:** Atlas Vector Search over Voyage AI embeddings.
- **Answers:** Anthropic Claude or Groq writes them.
- **Audio:** ElevenLabs (optional) reads them aloud.

## Run it

From the repo root (npm workspaces):

```bash
npm install
cp .env.example .env                      # MONGODB_URI, DB_NAME, VOYAGE_API_KEY, optional LLM/Groq/ElevenLabs keys
npm run setup:indexes -w backend          # regular + Atlas Search + Vector Search indexes, waits until queryable
npm run seed -w backend                   # demo org: 4 agents, 59 memories, 13 outcomes (all isSeed: true)
npm run dev                               # API on :4000 (and the frontend on :5173)
npm run worker:supervised -w backend      # worker, restarted automatically after a crash
```

Open http://localhost:4000/docs for the interactive API reference.

| Script | Purpose |
|---|---|
| `dev` / `start` | API with reload (tsx) / compiled API |
| `worker` / `worker:supervised` / `worker:prod` | Worker once / with automatic restart / compiled |
| `setup:indexes [-- --recreate]` | Creates every index; `--recreate` drops and rebuilds the search indexes (ask before using on a shared cluster) |
| `seed` | Idempotent demo data, upserted by `seedKey` |
| `embed:backfill` | Embeds memories whose embedding is missing or stale, and embeds outcome questions |
| `demo:reset` | Deletes non-seed data in the demo org (keeps benchmark runs), then re-seeds |
| `demo:e2e` | Runs the demo story through the HTTP API and prints the real results |
| `benchmark` | Labelled retrieval benchmark on the demo org; stores the run |
| `calibrate` | Derives the outcome-policy similarity thresholds from calibration question pairs |
| `typecheck` / `test` / `build` | Strict TypeScript / Vitest / emit `dist/` |

## Layout

```
src/
  server.ts            starts the API (buildApp + listen)
  app.ts               Fastify setup: Zod type provider, CORS, rate limit, Swagger, auth, route plugins
  worker.ts            task worker process
  config.ts            all environment variables, validated with Zod at startup
  db/
    client.ts          MongoClient singleton (+ DNS_SERVERS fallback for SRV lookups)
    collections.ts     document types and raw collection access; only db/ may import it
    repositories/      orgId-scoped repositories: the only way routes/services touch data
    indexes.ts         regular indexes
    search-indexes.ts  Atlas Search + Vector Search index definitions and polling
  routes/              one Fastify plugin per domain (see "API" below)
  services/            business logic (search, answers, outcomes, worker steps …)
    llm/               Anthropic + Groq providers with automatic fallback
  plugins/             auth (JWT demo auth) and the central error handler
  lib/                 errors, serialization (ids → strings, dates → ISO), provider cost guard
  eval/                retrieval benchmark: labelled questions, metrics, calibration pairs
  scripts/             CLI scripts listed above; seed-data*.ts hold the demo content
test/                  Vitest: unit, Atlas integration (in the __test__ org), worker crash e2e
```

## How a request flows

1. **Auth.** `plugins/auth.ts` verifies the JWT (`AUTH_MODE=demo`: `POST /api/auth/demo-login` issues one for the seeded demo user) and sets `req.auth = { orgId, userId }`.
2. **Validation.** Each route declares Zod schemas from `@agent-recall/shared`; Fastify validates the body and serializes the response.
3. **Service.** The route calls a service with `req.auth.orgId`. Services use repositories such as `memoriesRepo.find(orgId, …)`, and every repository call adds `orgId` to its filter. Lint blocks routes and services from importing `db/collections.ts` directly.
4. **Errors.** Services throw `AppError(status, code, message)`. The error plugin returns `{ error: { code, message } }`; stack traces and provider error bodies never reach clients.
5. **Audit.** Significant actions call `logEvent()`. That is the Activity Log.

## Core concepts

**Memory** (`memories` collection)
- **Contents:** title, content, type, tags, an owning agent, a provenance (`seed`, `manual`, `outcome` or `task`) and a verification status (`unverified`, `verified_success` or `verified_failure`).
- **Embedding:** a Voyage embedding stored with its model, dimensions and a content hash, so stale embeddings can be detected.

**Search** (`services/search.ts`)
- **Keyword:** `$search` on the `memories_search` index (title boosted ×3, stemmed content, exact tokens, tags).
- **Semantic:** the query is embedded, then `$vectorSearch` runs on `memories_vector`.
- **Hybrid:**
  1. Runs both and fuses their ranks with Reciprocal Rank Fusion (`services/rrf.ts`, k = 60).
  2. Applies the contextual outcome policy: `final = rrf × (1 + 0.15 · s · context)`. A verified outcome only counts for questions similar to the one it was recorded on (`services/outcome-context.ts`).
- **Fallbacks:** if an index is missing, keyword falls back to a regex scan labelled `engine: "fallback_regex"`, and semantic reports `engine: "unavailable"`. Never silent.
- **Side effects:** `search()` writes a retrieval log and increments retrieval counts. `runSearch()` has no side effects and is used by the benchmark.
- **Details:** `docs/RANKING.md`.

**Grounded answers** (`services/answers.ts`, `services/llm/`)
- **Prompt:** selected memories go into the prompt as XML-escaped `<memory id="…">` blocks. The system prompt says memory text is reference material, never instructions.
- **Output:** the answer cites memories as `[mem:<id>]`.
- **Providers:** Anthropic first if configured, Groq on failure (or `LLM_PROVIDER=groq`). With no key, the answer is a clearly labelled template.

**Outcomes and learning** (`services/outcomes.ts`)
- **Recording:** `POST /api/tasks/:id/outcome` records worked or failed. In one transaction it updates usefulness counters and verifies cited procedural memories.
- **New memory:** it then creates an episodic memory describing what happened, and embeds the question for the contextual policy.
- **What "learning" means:** updated memories and ranking signals; no model weights change.

**Worker** (`worker.ts`, `services/tasks.ts`, `services/playbook.ts`)
- **Steps:** a playbook task has 5 steps: Collect symptoms, Retrieve similar incidents, Match the verified procedure, Draft remediation, Summarize.
- **Lease:** the worker claims a task with a lease (`LEASE_MS`) and heartbeats it.
- **Checkpoints:** it commits each step's checkpoint and the step advance in one transaction that only succeeds while it still holds the lease.
- **Crash recovery:** if the worker dies (`POST /api/dev/worker/crash` in `DEMO_MODE`), another worker resumes from the last checkpoint without repeating steps.

**Benchmark** (`eval/`, `services/benchmark.ts`)
- **Questions:** 34 labelled questions over the seed: 24 dev and 10 held-out.
- **Metrics:** Hit@1, MRR@10, Recall@5 and nDCG@5 for keyword, semantic, hybrid, and hybrid with outcomes.
- **Storage:** runs are stored in `benchmark_runs` and shown on the frontend Benchmarks page.

## API

All routes are under `/api` and need `Authorization: Bearer <token>`, except `health`, `ready` and `auth/demo-login`. Full schemas are at `/docs`.

| Area | Endpoints |
|---|---|
| System | `GET health`, `GET ready` (live Atlas ping), `GET integrations/status` (live probes, cached 60 s) |
| Auth | `POST auth/demo-login`, `GET auth/me` |
| Agents | `GET/POST agents`, `GET/PATCH agents/:id`, `GET agents/:id/memories|tasks|outcomes` |
| Memories | `GET/POST memories`, `GET/PATCH memories/:id`, `POST memories/:id/archive`, `GET memories/:id/related|retrievals|searchable` |
| Search | `POST search/keyword|semantic|hybrid`, `GET search/logs` |
| Answers and tasks | `POST answers`, `POST tasks` (queue a playbook), `GET tasks`, `GET tasks/:id`, `GET tasks/:id/checkpoints`, `POST tasks/:id/outcome` |
| Insights | `GET overview`, `GET learning`, `GET events` |
| Benchmarks | `GET benchmarks/set`, `POST benchmarks/runs`, `GET benchmarks/runs`, `GET benchmarks/runs/:id` |
| Audio | `GET integrations/elevenlabs/status`, `POST audio/speech` |
| Dev | `GET dev/status`, `POST dev/worker/crash` (`DEMO_MODE` only) |

Example:

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/demo-login | jq -r .token)
curl -s -X POST localhost:4000/api/search/hybrid -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"query":"pods restart with exit code 137","limit":3}' | jq '.results[].memory.title'
```

## Configuration

`src/config.ts` validates everything at startup; see `.env.example` in the repo root.

| Group | Variables |
|---|---|
| Required | `MONGODB_URI`, `DB_NAME`, `JWT_SECRET`, `FRONTEND_URL` |
| Embeddings | `VOYAGE_API_KEY`, `VOYAGE_MODEL` (voyage-3.5), `VOYAGE_DIMENSIONS` (1024), `VOYAGE_BASE_URL` |
| Answers | `LLM_API_KEY`, `LLM_MODEL` (Anthropic); `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`; `LLM_PROVIDER` |
| Audio | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` |
| Worker and demo | `DEMO_MODE` (crash button), `LEASE_MS` (15000), `DEMO_STEP_DELAY_MS` (4000) |
| Other | `PORT` (4000), `HOST`, `LOG_LEVEL`, `AUTH_MODE` (demo), `DNS_SERVERS`, `TEST_DB_NAME` |

## Rules that keep it correct

- **Org scoping.** Always pass `orgId` from `req.auth` and go through `db/repositories/`. Never query a collection directly from a route or service.
- **Untrusted memory text.** Wrap it in `<memory>` blocks for any LLM prompt.
- **Honest engines.** Label fallbacks in the `engine` field. Report an integration as connected only after a live probe.
- **Measured numbers.** No invented metrics: every number in a response is measured or computed from stored data.
- **Index delay.** Atlas indexes and new documents become searchable after a short delay. Poll (see `pollUntil` in `scripts/_util.ts` and `GET memories/:id/searchable`), never sleep a fixed time.
- **Secrets.** Never log `MONGODB_URI` or provider keys.

## Tests

```bash
npm test -w backend
```

- **Unit:** RRF, the contextual policy, benchmark metrics, seed integrity, LLM provider fallback with stubbed `fetch`.
- **Atlas integration:** search modes, outcome rules and tenant isolation. These run inside a dedicated `__test__` organization in the real collections and clean up after themselves. If `MONGODB_URI` or the indexes are unavailable they are **skipped with a printed reason**, never silently passed.
- **Worker crash e2e:** `recovery.e2e.test.ts` starts real worker processes, kills one mid-task and checks that another resumes from the checkpoint.

## Common tasks

- **Add an endpoint.**
  1. Add the Zod request/response schemas in `shared/src/schemas/` and rebuild shared (`npm run build -w shared`).
  2. Add a route in the matching `src/routes/*.ts` plugin, or create a plugin and register it in `app.ts`.
  3. Put the logic in `src/services/`, using repositories with `req.auth.orgId`.
- **Add a collection.** Add its document type in `db/collections.ts`, its indexes in `db/indexes.ts` and a `ScopedRepository` in `db/repositories/index.ts`. Then run `setup:indexes`.
- **Add demo data.** Edit `scripts/seed-data.ts` or `seed-data-incidents.ts`, then `npm run demo:reset -w backend`. `test/seed-data.test.ts` checks keys and links.
- **Change ranking.** Edit `services/rrf.ts` or `services/search.ts`, then run `npm run benchmark -w backend` and compare with earlier runs on the Benchmarks page.
