# Agent Recall — Specification

Tagline: **Give AI agents a memory worth remembering.**

## 0. The demo story (everything serves this)
1. An Engineering Assistant agent hits a problem: "Our API started timing out after a database connection pool change. How did we resolve a similar issue before?"
2. It retrieves past experience with keyword, semantic and hybrid search, and the user can see why each memory came back.
3. It drafts a recommendation grounded in the selected memories, citing them.
4. The user records whether it worked.
5. The verified outcome becomes a new memory, and the cited procedure becomes verified.
6. Searching again shows the new memory and the outcome-aware ranking.
7. Separately, a multi-step task survives a real worker crash and resumes from its last checkpoint without repeating completed steps.
8. Optionally, the answer can be played or downloaded as audio via ElevenLabs.

If time runs short, cut from the bottom of §1, never from this story.

## 1. Scope tiers
- **Tier 1 (demo-critical):** scaffold, demo auth, memories CRUD + embeddings, Atlas Search / Vector Search indexes, Search Playground (keyword, semantic, hybrid, explanations), grounded answer, outcome feedback loop, integration status, seed + demo scripts.
- **Tier 2:** task worker with checkpoints and crash recovery, Activity Log, Overview dashboard, Agents page, Memory Explorer filters/pagination/detail drawer.
- **Tier 3:** Learning & Insights page, ElevenLabs playback/export, deployment configs, mobile polish.

## 2. Stack and layout
```
/
├─ CLAUDE.md  PROGRESS.md  README.md  .env.example  .gitignore  render.yaml
├─ docs/  SPEC.md  RANKING.md  DEMO.md  ATLAS_SETUP.md
├─ shared/    src/schemas/*.ts   (Zod schemas + inferred types)
├─ backend/   src/server.ts  src/worker.ts  src/config.ts
│             src/db/ (client, collections, repositories, indexes)
│             src/services/ (embeddings, search, hybrid, llm, tts, integrations, tasks)
│             src/routes/   src/scripts/ (setup-indexes, seed, embed-backfill, demo-reset, demo-e2e)
│             test/
└─ frontend/  src/app (router, layout)  src/pages  src/components  src/lib/api.ts
```
- Database: the user's MongoDB Atlas cluster (`MONGODB_URI`, `DB_NAME` in `.env`), used for development, tests and the deployed app. Atlas clusters are replica sets, so transactions are available. Tests are isolated by a dedicated `__test__` org in the same collections (see CLAUDE.md), because search indexes are per collection and lower tiers cap how many you can create. `setup:indexes` prints the cluster tier and the number of existing search indexes, and stops with a clear message if creating two more would exceed the tier's limit.
- LLM: provider interface in `services/llm/`, first implementation Anthropic Messages API (`LLM_PROVIDER=anthropic`, `LLM_MODEL` configurable).
- No microservices, queues or Kubernetes. Two processes: API and worker.

## 3. Data model
All documents carry `orgId`, `createdAt`, `updatedAt`, and `isSeed` (default false).

| Collection | Purpose | Key fields |
|---|---|---|
| `organizations` | Tenant boundary | name |
| `users` | Demo login identity | email, name, orgId |
| `agents` | Agents that own memories and tasks | name, description, status |
| `memories` | The memory store | see below |
| `tasks` | Q&A answers and multi-step playbook runs | kind (`qa`\|`playbook`), agentId, goal, input, status (`queued`\|`running`\|`completed`\|`failed`), currentStep, steps[] (name, status), memoryIds, output, error, workerId, leaseExpiresAt, attempt |
| `checkpoints` | One per completed step; the source of truth for resume | taskId, stepIndex, output, idempotencyKey, workerId |
| `outcomes` | Explicit user verdicts | taskId, result (`worked`\|`failed`), feedback (`helpful`\|`not_helpful`), notes, citedMemoryIds, createdMemoryId |
| `retrieval_logs` | Every search run | query, mode, engine, results[] (memoryId, rank, score, sources), latencyMs per stage, applyOutcomePolicy |
| `events` | Activity log + audit trail (replaces separate memory_events/audit_logs) | type, status, actor, agentId, taskId, memoryId, details |

`memories`:
```
{ _id, orgId, agentId, title, content, type: "semantic"|"episodic"|"taxonomic"|"procedural",
  tags: string[], sourceTaskId?, provenance: { kind: "manual"|"seed"|"outcome"|"task", outcomeId?, citedMemoryIds? },
  verification: { status: "unverified"|"verified_success"|"verified_failure", outcomeIds: [], verifiedAt? },
  usefulness: { helpful: 0, notHelpful: 0 },     // score shown as (helpful+1)/(helpful+notHelpful+2)
  relations?: [{ targetMemoryId, label }],       // taxonomic links
  embedding?: { vector: number[], provider: "voyage", model, dimensions, contentHash, embeddedAt },
  embeddingStatus: "pending"|"ready"|"failed",
  retrievalCount: 0, archived: false, isSeed, createdAt, updatedAt }
```
Regular indexes (create in `setup:indexes`): `{orgId,archived,type}`, `{orgId,agentId,createdAt:-1}`, `{orgId,sourceTaskId}`, `{orgId,"verification.status"}`, tasks `{status,leaseExpiresAt}`, tasks `{orgId,agentId,createdAt:-1}`, checkpoints `{taskId,stepIndex}` **unique**, events `{orgId,createdAt:-1}`, retrieval_logs `{orgId,createdAt:-1}`, outcomes `{orgId,taskId}`.

## 4. Atlas indexes
Created by `npm run setup:indexes` with `collection.createSearchIndex(...)`, then polled via `listSearchIndexes` until `queryable: true` (timeout with a clear message). Also documented in `docs/ATLAS_SETUP.md` with Atlas UI steps.

`memories_search` (type `search`):
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
The `exact` multi-analyzer keeps tokens like `maxPoolSize=10` or `ECONNRESET` intact for identifier matching.

`memories_vector` (type `vectorSearch`), `numDimensions` taken from `VOYAGE_DIMENSIONS` at setup time:
```json
{ "fields": [
  { "type": "vector", "path": "embedding.vector", "numDimensions": 1024, "similarity": "cosine" },
  { "type": "filter", "path": "orgId" }, { "type": "filter", "path": "agentId" },
  { "type": "filter", "path": "type" },  { "type": "filter", "path": "archived" },
  { "type": "filter", "path": "verification.status" } ] }
```
If `VOYAGE_MODEL` or `VOYAGE_DIMENSIONS` changes, the setup script must detect the mismatch, explain it, and offer `--recreate` plus `embed:backfill`.

## 5. Retrieval
All three modes accept `{ query, filters: { agentId?, types?, verification?, tags?, from?, to? }, limit (default 10) }`, always add `orgId` + `archived:false` filters, write a `retrieval_logs` entry and an event, increment `retrievalCount` on returned memories, and return:
```
{ mode, engine: "atlas_search"|"atlas_vector_search"|"rrf"|"fallback_regex"|"unavailable",
  results: [{ memory, rank, score, scoreKind, sources: [{ mode, rank, score }], highlights?, explanation }],
  latencyMs: { embed?, keyword?, vector?, fuse?, total }, warnings: [] }
```
- **Keyword:** `$search` on `memories_search`, `compound.should` over `title` (boost 3), `content`, `content` via `multi: "exact"`, `tags`; `compound.filter` for tenant and filters. Request `highlight` on content and `scoreDetails: true`; return `searchScore`, highlights, and a readable summary of `scoreDetails` (which fields matched) as the explanation.
- **Semantic:** embed the query with Voyage (`input_type: "query"`), then `$vectorSearch` on `memories_vector` (`numCandidates` 200, `limit` 20, filters pre-applied). Return `vectorSearchScore`. Explanation: cosine similarity score, embedding model, and that the match is by meaning, plus which query terms do or don't appear literally (computed, not invented).
- **Hybrid:** run keyword and semantic (top 20 each) in parallel, fuse with Reciprocal Rank Fusion in application code: `rrf = Σ 1/(60 + rank_m)` across the modes a memory appears in (rank starts at 1). Deduplicate by memory id; keep each source rank and raw score in `sources`. Never add raw scores across modes. Then apply the outcome policy below. Explanation lists the contributing modes and ranks. (Stretch: also run MongoDB's native `$rankFusion` stage if the cluster supports it and show both orderings.)
- **Outcome policy** (document in `docs/RANKING.md` and in a UI tooltip): `final = rrf × (1 + 0.15·s)` where `s = +1` for `verified_success`, `−1` for `verified_failure`, `0` otherwise. Return both `rrf` and `final`. `applyOutcomePolicy` (default true) can be toggled in the Playground so the demo can show its effect.
- **Fallbacks:** if the search index is missing or not queryable, keyword mode returns `engine: "fallback_regex"` with a warning and the UI shows "Fallback — not Atlas Search". If Voyage or the vector index is unavailable, semantic returns `engine: "unavailable"` with the reason; hybrid degrades to keyword-only and says so. Never hide a fallback.

**Embedding service** (`services/embeddings`): official Voyage REST API, `input_type: "document"` for memories, `"query"` for searches. Defaults to confirm against current docs: `VOYAGE_MODEL=voyage-3.5`, `VOYAGE_DIMENSIONS=1024`. Skip re-embedding when `contentHash` + model + dimensions are unchanged. Batch backfills. Timeouts and retries with backoff; on failure set `embeddingStatus: "failed"` and log an event, without failing the memory write. Small in-memory LRU cache for query embeddings.

## 6. Grounded answers and the learning loop
- `POST /api/answers { agentId, query, memoryIds }` creates a `qa` task, loads the selected memories (tenant-checked), and calls the LLM with the memories wrapped as untrusted `<memory id>` blocks. The model must cite memory ids; the response returns `{ taskId, answer, citations: [memoryId], model }`. It runs synchronously with a 30s timeout (it's one call). Without an LLM key, return a clearly labelled extractive "Template answer (LLM not configured)" built from the memories.
- `POST /api/tasks/:id/outcome { result: "worked"|"failed", feedback?, notes? }`:
  1. Inserts an `outcomes` document.
  2. Updates `usefulness` on cited memories from `feedback`.
  3. If `worked`: marks cited **procedural** memories `verified_success` (append outcomeId). If `failed`: marks them `verified_failure` only if they were never verified successful; otherwise records the failure in `outcomeIds` without flipping status. Only an explicit outcome can verify anything.
  4. Creates a new **episodic** memory ("Resolved: …" or "Attempted, failed: …") with the query, answer summary, result and notes, `provenance: { kind: "outcome", outcomeId, citedMemoryIds }`, `sourceTaskId`, embeds it.
  5. Logs events for each change.
- Atlas Search indexing is near-real-time but not instant. The UI shows the new memory as "Indexing…" and polls a `GET /api/memories/:id/searchable` endpoint (runs a targeted `$search` / `$vectorSearch` for that id) until it's retrievable.

## 7. Task worker and crash recovery
- `backend/src/worker.ts` is its own process. It polls for `playbook` tasks where `status ∈ {queued, running}` and the lease is empty or expired, and claims one with `findOneAndUpdate` setting `status: running`, `workerId`, `leaseExpiresAt = now + LEASE_MS` (default 15000), `$inc: { attempt: 1 }`. A heartbeat extends the lease every `LEASE_MS/3` only while `workerId` still matches.
- On claim, load checkpoints for the task and resume at `max(stepIndex) + 1`. Log a `task.resumed` event when attempt > 1.
- Per step: execute, then in one transaction insert the checkpoint (`idempotencyKey = taskId:stepIndex`, unique index makes a duplicate a no-op) and `updateOne({ _id, workerId, currentStep: i }, { $set: { currentStep: i+1 } })`. If that update matches nothing, the lease was lost: stop without further work.
- Steps are deterministic and side effects are keyed by the idempotency key, so a completed step is never redone; an interrupted step may rerun, which is fine because it never committed.
- Demo playbook "Diagnose connection-pool incident", 5 steps: collect symptoms → retrieve similar incidents (hybrid search) → match the verified procedure → draft remediation → summarize. `DEMO_STEP_DELAY_MS` (default 4000) makes it easy to crash mid-run.
- Graceful shutdown on SIGTERM: finish the current step, release the lease. SIGKILL simulates a crash.
- Demo helper (only when `DEMO_MODE=true`): `POST /api/dev/worker/crash` sets a flag the worker checks between steps and then calls `process.exit(1)` — a real process exit. The UI shows worker id, attempts, lease, and a checkpoint timeline per task.
- **Required test** `backend/test/recovery.e2e.test.ts`: spawn the worker as a child process with a short step delay, wait until 2 checkpoints exist, SIGKILL it, assert the task is still `running` with 2 checkpoints, spawn a new worker with a short lease, wait for completion, assert 5 checkpoints with unique step indexes and that steps 0–1 were executed exactly once (count per-step execution records written by the worker).

## 8. Integration status
`GET /api/integrations/status` returns, per integration, `{ status: "connected"|"not_configured"|"error"|"index_missing"|"index_building", detail, checkedAt, optional }`, cached 60s, with `?refresh=true` to re-probe:
- MongoDB: `ping`.
- Atlas Search / Vector Search: `listSearchIndexes` → present and `queryable`.
- Voyage: a one-word embedding call; also report model and dimensions and whether they match the vector index.
- LLM: a minimal request to the provider.
- ElevenLabs (`optional: true`): fetch the configured voice.

## 9. ElevenLabs (optional, Tier 3)
- `GET /api/integrations/elevenlabs/status` and `POST /api/audio/speech { text }` (auth required, max 2500 chars, rate limit 10/min per user). The backend calls the ElevenLabs text-to-speech endpoint for `ELEVENLABS_VOICE_ID` with `ELEVENLABS_MODEL_ID` (confirm current model names in their docs) and streams back `audio/mpeg`. Nothing is stored. Log an `audio.generated` event (no audio content).
- Reuse the existing answer text; never ask the LLM for a second "voice" response.
- Frontend: a "Listen" icon button beside answers (Playground, task results, memory detail) that generates on demand, shows loading, blocks double clicks, plays/pauses, offers "Export audio" (download), and retries on error. If not configured, the button is disabled with a tooltip pointing to Settings. Text features never depend on it.
- Settings page section: status, voice, model, "Test voice", setup steps. No microphone or speech input.

## 10. API (all under `/api`, Swagger at `/docs`)
- `GET /health` (liveness), `GET /ready` (Mongo reachable)
- `POST /auth/demo-login` → JWT for the seeded demo user (`AUTH_MODE=demo`; the UI header shows "Demo auth — not production-secure")
- `GET /integrations/status`
- `GET /overview` (metrics computed from data; each tagged `seed`/`live`/`mixed`)
- Agents: `GET/POST /agents`, `GET/PATCH /agents/:id`, `GET /agents/:id/memories|tasks|outcomes`
- Memories: `GET/POST /memories` (filters, sort, pagination), `GET/PATCH /memories/:id`, `POST /memories/:id/archive`, `GET /memories/:id/related` (vector neighbours + taxonomic relations), `GET /memories/:id/retrievals`, `GET /memories/:id/searchable`
- Search: `POST /search/keyword`, `POST /search/semantic`, `POST /search/hybrid`, `GET /search/logs`
- Answers/tasks: `POST /answers`, `POST /tasks` (playbook), `GET /tasks`, `GET /tasks/:id`, `GET /tasks/:id/checkpoints`, `POST /tasks/:id/outcome`
- `GET /learning` (analytics), `GET /events` (filterable, paginated)
- `GET /integrations/elevenlabs/status`, `POST /audio/speech`
- `POST /dev/worker/crash` (DEMO_MODE only)

Every route: Zod-validated input and output, `orgId` scoping, pagination where listing, central error format.

## 11. UI
The full design system, screen layouts, the Retrieval Trace, motion, copy rules and the screenshot QA loop are in `docs/DESIGN.md`, which takes precedence over anything below on visual matters. This section lists what each screen must contain.

Layout: persistent left sidebar (Overview, Memory Explorer, Search Playground, Agents, Learning & Insights, Activity Log, Settings & Integrations), compact header (breadcrumb, global memory search that jumps to the Explorer, integration status pill, workspace menu with demo-auth notice).

- **Search Playground (highest priority).** Editable query prefilled with the demo query; filters; "Run all" plus per-mode buttons; three side-by-side panels (tabs on narrow screens): Keyword, Semantic, Hybrid. Each result: title, highlighted excerpt, type, source task, verification badge, rank, real score with its kind, mode-specific latency. Panel headers show the `engine` and any fallback warning. Selecting a result opens the explanation panel (sources, ranks, score details, outcome-policy effect). Toggle for the outcome policy. Checkbox selection → "Use in agent task" opens the answer flow: answer with inline citations, evidence list, Listen button, and "Did this work?" (Worked / Failed + Helpful / Not helpful + notes). After submitting, show the new memory with "Indexing…" → "Searchable", and a "Search again" button.
- **Overview "Memory Intelligence"** ("Understand what your agents remember, retrieve, and learn."): actions Explore memories / Run search demo; metric cards (total memories, indexed = embeddingStatus ready, successful outcomes, retrieval success rate = outcomes `worked` ÷ outcomes recorded, showing "—" when there are none); charts: memory created vs retrieved over time, distribution by type; recent agent experiences; recent searches; integration health. Seed-derived numbers carry a "Demo data" label.
- **Memory Explorer:** search with mode selector, filters, sort (relevance/newest/usefulness), pagination, result count and timing; detail drawer with full content, provenance, related memories, retrieval history, verification and outcomes, embedding status/model, edit, archive; create-memory dialog.
- **Agents:** list with memory count, recent activity, successful outcomes; create agent; detail with tabs for memories, tasks, outcomes; "Run playbook" button.
- **Task detail:** step list, checkpoint timeline, worker id, attempts, lease, events, output, crash/resume indicators.
- **Learning & Insights:** outcomes over time, most useful and most retrieved memories, verified procedures with their evidence, recurring problems (by tag), feedback history.
- **Activity Log:** chronological event timeline with type/status filters and links to the agent/task/memory.
- **Settings & Integrations:** live status for each integration with Refresh, setup instructions, ElevenLabs section.

## 12. Phases and gates
Each phase ends with its gate, a `PROGRESS.md` update and a commit.

| Phase | Build | Gate |
|---|---|---|
| 0 Foundations | Workspaces, config with Zod-validated env, Mongo client, repositories with `orgId` scoping, Fastify skeleton, `/health`, `/ready`, Swagger, demo auth, regular indexes, design tokens + Geist, shadcn theming, all §6 components on `/dev/ui`, app shell with sidebar/header/⌘K/routes, Playwright `screenshots` script, `PROGRESS.md`, `.env.example` | `typecheck` + `build` pass; `/api/ready` confirms the Atlas connection; `/docs` loads; screenshot review of shell + `/dev/ui` done (DESIGN §11) |
| 1 Memory core | Memories + agents CRUD, embedding service, `setup:indexes`, `seed`, `embed:backfill`, basic Explorer + create/edit/archive | Creating a memory stores an embedding (when key present); both search indexes report queryable on the Atlas cluster; repository tests prove cross-org isolation |
| 2 Retrieval | Keyword, semantic, hybrid + outcome policy, retrieval logs, explanations, fallbacks, integration status, Search Playground with the Retrieval Trace | Tests: RRF unit tests (dedupe, rank math, no raw-score mixing, policy); integration test showing each mode returns the seeded pool-timeout memories; fallback labelled when index dropped; Playground screenshot review done |
| 3 Learning loop | Answers, citations, outcomes, verification rules, outcome memory creation, searchable polling, `demo:e2e` | `npm run demo:e2e` executes §0 steps 1–6 through the API and prints each step's real result |
| 4 Recovery | Worker, leases, checkpoints, transactions, demo playbook, crash endpoint, task detail UI | `recovery.e2e.test.ts` passes against the Atlas cluster |
| 5 Dashboards | Overview, Agents, Activity Log, Learning & Insights, Explorer polish | All pages render real data with skeleton/empty/error states; screenshot review at all three widths done |
| 6 Audio | ElevenLabs endpoints, Listen/Export UI, Settings section | Works with a real key; with no key the app works and the button is disabled with an explanation |
| 7 Ship | Lint clean, tests, README, `docs/DEMO.md` (click-by-click demo script), `docs/ATLAS_SETUP.md`, `render.yaml`, Vercel config, final report | Full command list in CLAUDE.md passes; deployment verified by hitting real URLs, or precise manual steps if credentials are missing; final screenshot review + "remove one accessory" pass |

Behind schedule: drop Learning & Insights to a single panel, then ElevenLabs, then deployment. Never drop Phases 2–4.

## 13. Seed data
- One org, one demo user, agents: Research Agent, Engineering Assistant, Operations Analyst.
- About 25 memories across all four types. Must include:
  - Episodic: an incident where an API timed out after a connection-pool change, its root cause (pool too small for the new concurrency plus connections not returned in a cursor loop), and the verified resolution.
  - Procedural: the step-by-step fix (raise `maxPoolSize`, set `minPoolSize`, set `waitQueueTimeoutMS`, close cursors, add pool metrics alerts), `verified_success` with a seeded outcome.
  - Semantic: the exact error text, e.g. `Timed out while checking out a connection from connection pool` with `maxPoolSize=10, waitQueueTimeoutMS=2000`, and what each setting means.
  - Plausible distractors that share words but not meaning (thread-pool exhaustion in an ML worker, Redis client timeouts, a DNS timeout) and ones that share meaning but not words (e.g. "service hung under load after a driver config tweak"), so the three modes genuinely differ. The differences must come from real retrieval, not hand-arranged results.
- Seed embeddings are generated live through Voyage when the key exists; otherwise memories are seeded with `embeddingStatus: "pending"` and `embed:backfill` fills them later.

## 14. Environment variables (`.env.example`)
Required: `NODE_ENV`, `PORT`, `MONGODB_URI`, `DB_NAME`, `FRONTEND_URL` (CORS origin), `JWT_SECRET`, `AUTH_MODE=demo`.
Required for live semantic search: `VOYAGE_API_KEY`, `VOYAGE_MODEL`, `VOYAGE_DIMENSIONS`.
Required for LLM answers (otherwise template answers): `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`.
Optional: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `DEMO_MODE`, `LEASE_MS`, `DEMO_STEP_DELAY_MS`, `LOG_LEVEL`.
Frontend: `VITE_API_URL` only.

## 15. Deployment
- Frontend → Vercel (SPA rewrite to `index.html`, `VITE_API_URL`).
- Backend → Render via `render.yaml`: a web service (binds `0.0.0.0` and `$PORT`, health check `/api/health`) and a background worker running `worker.ts`. Secrets in Render env.
- Database → the same Atlas cluster already set up during development (indexes and seed exist). In Atlas → Network Access, allow Render's outbound IPs (or 0.0.0.0/0 for the hackathon, noted as a known limitation).
- Graceful shutdown in both processes. Explicit CORS allowlist.

## 16. Final report (end of Phase 7)
Report: what works (with the demo script), architecture and repo tree, the actual output of typecheck/lint/test/build, which live integrations were verified and how, which need manual configuration, required env vars, Atlas index setup steps, deployed URLs only if verified, and known limitations (including demo auth).
