# Agent Recall — progress log

Newest phase at the bottom. Every "done" item was run or looked at; command output quoted where it matters.

## Phase 0 — Foundations (2026-10-11)

### Done
- npm workspaces `shared`, `backend`, `frontend`; strict TS (`tsconfig.base.json`, `noUncheckedIndexedAccess`); ESLint 9 flat config (rule blocks routes/services from importing raw collections).
- `shared`: Zod schemas for errors, pagination, health/ready, session, agents, memories, integration status.
- Backend:
  - `config.ts`: Zod-validated env, loads root `.env`, `scrubSecrets`/`redactUri` so the URI never reaches logs.
  - `db/client.ts` (driver, ping, actionable error text for IP-access-list / auth failures), `db/collections.ts` (doc types for all collections), `db/repositories/` (`ScopedRepository` adds `orgId` to every filter/insert/update/aggregate; `identityRepo` for orgs/users incl. demo + `__test__` orgs), `db/indexes.ts` (all SPEC §3 regular indexes, ensured at API start), `db/search-indexes.ts` (definitions + `listSearchIndexes`).
  - Fastify 5 + Zod type provider, central error handler (`{ error: { code, message } }`), CORS allowlist, `@fastify/rate-limit`, Swagger at `/docs`, demo JWT auth (`POST /api/auth/demo-login`, `GET /api/auth/me`), `/api/health`, `/api/ready` (live ping), `/api/integrations/status` (live probes, 60 s cache, `?refresh=true`).
- Frontend design system (docs/DESIGN.md):
  - Tokens in `src/styles/tokens.css` (RGB channels → Tailwind with opacity), mapped in `tailwind.config.ts`, shadcn variables derived from them. Geist Sans / Geist Mono from the `geist` package.
  - Components (all on `/dev/ui`): Button, Input, Textarea, Field, Select, Combobox, SegmentedControl, Tabs, Badge (+ MemoryType, Verification, Engine, Demo data), StatusDot, ScoreBar, LatencyChip, Panel, PageHeader, MetricTile (sparkline), ResultRow, DataTable, Drawer, Dialog, Popover, Tooltip, CommandPalette, Toast, Skeleton (row/table/tile shapes), EmptyState, ErrorState, Timeline, AudioPlayer, Switch, Checkbox, chart kit for Recharts.
  - App shell: 240 px sidebar ↔ 64 px rail (auto-collapses < 1280), mobile sheet < 768, header with breadcrumb, ⌘K / Ctrl K palette, integration pill + popover, demo-auth notice. Routes for every page (placeholders built on EmptyState).
  - `npm run screenshots -w frontend` (Playwright): starts API + Vite if needed, 19 shot definitions × 3 viewports into `frontend/screenshots/` (git-ignored).

### Gate
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (no output) |
| `npm run build` | pass (`✓ built in 38.86s`) |
| `/api/health` | `{"status":"ok","uptimeS":1} [200]` |
| `/docs` | `[200] text/html`; `/docs/json` returns OpenAPI 3.0.3 |
| `/api/ready` confirms Atlas | pass (after `.env` added, see Phase 1): `{"status":"ready","mongo":{"connected":true,"latencyMs":176,…,"detail":"ping ok"}} [200]` |
| Screenshot review (shell + `/dev/ui`) | done, see below |

### Screenshot review (DESIGN §11)
Round 1 findings → fixes:
1. Primary buttons rendered white text on violet (fails AA). Cause: tailwind-merge treated `text-body`/`text-dense` as colour classes and dropped `text-primary-foreground`. Fix: `extendTailwindMerge` with the custom type scale and colour tokens.
2. Full-page shots only captured the viewport (content scrolled inside `<main>`). Fix: document scrolling with a sticky sidebar and header.
3. Breadcrumb showed "Overview › Design system" for a non-nav route and truncated to "Ov… › Design…" on mobile. Fix: non-nav routes show only their own crumb; the parent crumb is hidden < 640 px.
4. Empty-state copy broke `npm run seed -w backend` across lines. Fix: `Cmd` inline code (monospace, nowrap).
5. Demo-auth notice wrapped awkwardly under the org name. Fix: its own warning-tinted strip; icon + tooltip in the rail.
6. Checked result checkbox was a filled square without a mark. Fix: Radix Checkbox with a check icon.
7. Header used a translucent blur (glass effect, DESIGN §9). Fix: solid `--bg`.

Round 2: re-shot `/dev/ui` at 1440/1024/390; issues above resolved. `--text-faint` (contrast ≈ 3.8:1 on `--surface`) is used only for placeholders, axis ticks and chevrons, never body text.

### Not done / blockers
- None remaining (Atlas confirmed during Phase 1).

### Commands run
```
npm install
npx playwright install chromium
npm run typecheck && npm run lint && npm run build
npm run screenshots -w frontend
npm run screenshots -w frontend -- --only=dev-ui
curl localhost:4000/api/health | /api/ready | /docs | /docs/json | /api/nope
```

## Phase 1 — Memory core (2026-10-11)

### Done
- Voyage embedding service (`services/embeddings.ts`): `POST {VOYAGE_BASE_URL}/embeddings`, `input_type` document/query, `output_dimension`, 20 s timeout, backoff on 429/5xx, batches of 64, query LRU (200), content-hash skip, live integration probe. Checked against docs.voyageai.com: `voyage-3.5` supports 1024 dims.
- Memory + agent services and routes (CRUD, archive, filters, sort, pagination, agent stats), events service, serializers.
- Scripts: `setup:indexes`, `seed` (idempotent upsert by `seedKey`: 3 agents, 26 memories, 2 seeded outcomes), `embed:backfill`, `demo:reset` (deletes non-seed docs in the demo org only, then re-seeds).
- Tests: `test/repositories.test.ts` (cross-org isolation in `__test__` and `__test__:b` orgs, cleaned up after), `test/unit.test.ts`.
- Frontend: Memory Explorer (filters, sort, pagination, search box), detail drawer (Content · Provenance · Related · Retrievals · Embedding), create/edit dialog, archive. Related/Retrievals tabs and the search box call Phase 2 endpoints.
- Shared search schemas (Phase 2 contract).

### Issues found and fixed
1. **`querySrv ECONNREFUSED`**: Node's resolver on this Windows machine is `127.0.0.1` (no DNS server there); the OS resolver (10.1.60.1) works. `db/client.ts` now detects a loopback-only resolver that fails the SRV lookup and switches this process to `DNS_SERVERS` (new optional env) or 1.1.1.1/8.8.8.8, logging it. Error text now distinguishes DNS failures from IP-access-list failures.
2. **Server selection timeout**: TCP 27017 to the Atlas host timed out while 27017 to portquiz.net was open → IP access list. The user added the IP.
3. **Voyage HTTP 403** on all 26 seed embeddings: the key is an Atlas model API key, which needs `VOYAGE_BASE_URL=https://ai.mongodb.com/v1`. Updated that line in `.env` (key untouched); the 403 message now says which base URL to use.

### Gate
| Check | Result |
|---|---|
| Both search indexes queryable | `✓ memories_search queryable (READY) · ✓ memories_vector queryable (READY)` (setup:indexes, 51.1 s) |
| Creating a memory stores an embedding | `POST /api/memories` → `"embeddingStatus":"ready","embedding":{"provider":"voyage","model":"voyage-3.5","dimensions":1024,…}` |
| Repository tests prove cross-org isolation | `Test Files 2 passed (2) · Tests 9 passed (9)` |
| Seed idempotent | second run: `embeddings: 0 embedded, 26 already current, 0 failed` |
| Integration status | mongodb connected (18 ms), atlas_search / atlas_vector_search connected, voyage connected (117 ms), llm + elevenlabs not configured |
| typecheck / lint | pass |

### Not done / blockers
- `LLM_API_KEY` empty → Phase 3 answers will be labelled template answers until it is set. ElevenLabs not configured (optional).
- Atlas tier unknown to the driver; `ATLAS_TIER` unset, so the limit check only reports counts.

### Commands run
```
npm run setup:indexes -w backend
npm run seed -w backend            (×2, idempotency)
npm run embed:backfill -w backend
npm test -w backend                (vitest run)
curl POST /api/auth/demo-login, GET /api/agents, POST /api/memories, GET /api/integrations/status?refresh=true
npm run screenshots -w frontend -- --only=memories
npm run demo:reset -w backend      (removed the gate-check memory)
npm run typecheck && npm run lint
```

## Phase 2 — Retrieval (2026-10-11)

### Done
- `services/rrf.ts`: Reciprocal Rank Fusion (k = 60, dedupe, ranks only, deterministic ties) + outcome policy `final = rrf × (1 + 0.15·s)`.
- `services/search.ts`: keyword (`$search`, compound should over title×3 / content / content `multi: exact` / tags, highlights, `scoreDetails` parsed into matched fields), semantic (Voyage query embedding with LRU, `$vectorSearch` numCandidates 200, literal-term presence explanation), hybrid (both top-20 in parallel, RRF, policy, `components` returned so the Playground columns and trace share one run). Per-stage measured latencies. Every search writes `retrieval_logs`, an event, and increments `retrievalCount`.
- Fallbacks: keyword → `fallback_regex` with "Fallback — not Atlas Search" warning; semantic → `unavailable` with reason; hybrid → "degraded to keyword-only". `forceKeywordFallback` exists only when `DEMO_MODE=true` and is labelled as forced.
- Tenant-scoped `$search` / `$vectorSearch` helpers in `db/repositories/memory-search.ts` inject `orgId` + `archived:false` into the search stage itself.
- Routes: `POST /api/search/{keyword,semantic,hybrid}`, `GET /api/search/logs`, `GET /api/memories/:id/related` (taxonomic links both ways + vector neighbours), `/retrievals`, `/searchable`.
- Search Playground: query panel, filters popover, outcome-policy switch with formula tooltip, three columns, Retrieval Trace (SVG, stroke width linear in RRF contribution, dashed stubs labelled `K15`/`S12` for sources outside the visible top 10, dashed lines for fallback engines), hover highlight across columns with 30% dim, FLIP re-ordering (300 ms) when the policy toggles, row stagger (40 ms) + line draw (400 ms) after Run all, reduced-motion respected, tabs + `K3 · S3` rank chips below 1280 px, Why-this-result panel, selection panel.
- `docs/RANKING.md`.

### Design decision
- Column order is **Keyword | Hybrid | Semantic** (DESIGN.md mock shows K | S | H). With hybrid in the middle every trace line goes to an adjacent gutter; with K | S | H the keyword lines would have to pass behind the semantic panel.

### Gate
| Check | Result |
|---|---|
| RRF unit tests (dedupe, rank math, no raw-score mixing, policy) | `test/rrf.test.ts` 10/10 |
| Each mode returns the seeded pool-timeout memories | `test/search.integration.test.ts` (own `__test__` data, polls `/searchable` until indexed): keyword `atlas_search`, semantic `atlas_vector_search` (also finds the paraphrased "hung under load" memory), hybrid `rrf` with exact RRF math checked per result |
| Fallback labelled when index dropped | Tested by querying a non-existent index name (dropping the real index needs user approval): `engine: fallback_regex`, warning "Fallback — not Atlas Search"; vector missing → semantic `unavailable`, hybrid "degraded to keyword-only" |
| Full suite | backend `Tests 27 passed (27)`, frontend `Tests 2 passed (2)`; typecheck, lint, build pass |
| Live demo query (API) | hybrid: verified fix procedure K3·S3 → rank 1 (was 2 before policy); "Scale out API pods" (verified_failure) drops out of the hybrid top 8; semantic surfaces "Billing service hung…" which shares no keywords |

### Screenshot review
Round 1 → fixes:
1. Red "↓ from 1" badges on unverified memories that only moved because verified ones rose — misleading. Movement badges now appear only when the policy multiplier ≠ 1.
2. Column headers crowded ("Seman…", wrapped "1323 ms", "Key…" in fallback). Run became an icon button with tooltip; latency nowrap; title no longer shrinks.
3. Hover did not dim other rows: the entrance animation's `fill-mode: both` pinned opacity at 1. Changed to `backwards`. Verified with a Playwright probe (`opacity: 0.3` on non-hovered rows).
4. Hybrid fallback column repeated the keyword warning; hybrid now only states how components affected fusion.
5. Trace lines at rest were busy (70% opacity) → 50%; dimmed lines 8%.
6. Query textarea clipped on mobile → 4 rows below 1280 px.
Round 2: re-shot `search*` at 1440/1024/390; all resolved.

### Commands run
```
npx vitest run (backend), npm test, npm run typecheck, npm run lint, npm run build
npm run screenshots -w frontend -- --only=search   (×2), --only=search-hover
curl POST /api/search/{keyword,semantic,hybrid} with the demo query
```

## Phase 3 — Learning loop (2026-10-11)

### Done
- LLM provider (`services/llm/`): Anthropic Messages API via `@anthropic-ai/sdk` 0.133. Checked against the bundled Claude API reference: default model `claude-opus-5-5` (`.env.example`, config default and the user's `.env` corrected from my earlier `claude-sonnet-5-5`), thinking omitted (always adaptive on this model), `output_config.effort: "medium"` set explicitly, 30 s timeout, server-side refusal fallback enabled (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), `stop_reason: "refusal"` handled. Typed SDK errors mapped to `{ code, message }`; provider bodies never reach clients. Token-free connectivity probe (`models.retrieve`).
- Prompt safety: memories go in as `<memory id type verification>` blocks; the system prompt states memory text is reference data and never instructions; `</memory>` inside content is escaped; citations are kept only if they reference a supplied id.
- Without `LLM_API_KEY`: extractive answer labelled "Template answer (LLM not configured)", model `template (no LLM)`, shown with a warning badge in the UI.
- `POST /api/answers` (qa task: running → completed/failed with output), `GET /api/tasks`, `GET /api/tasks/:id` (with outcome), `GET /api/tasks/:id/checkpoints`, `POST /api/tasks/:id/outcome`.
- Outcome rules (`services/outcomes.ts`): outcome insert + usefulness + procedural verification in one MongoDB transaction; worked → `verified_success`; failed → `verified_failure` only if never verified successful (otherwise the failure is appended to `outcomeIds`); only procedural memories are verified; new episodic memory ("Resolved: …" / "Attempted, failed: …") with `provenance: { kind: "outcome", outcomeId, citedMemoryIds }` and `sourceTaskId`, embedded; events for each change. Unique index `outcome_once_per_task` → second outcome is a 409.
- `GET /api/memories/:id/searchable` drives "Indexing…" → "Searchable" in the UI.
- Playground answer flow: agent picker, answer with numbered citation chips (hover highlights the memory in the evidence list and in all three result columns), evidence list with Cited / Not cited, Listen (disabled with reason until ElevenLabs), Regenerate, "Did this work?" (Worked / Failed, Helpful / Not helpful, notes), outcome summary with verification changes, new memory card with live searchable state, "Search again".
- `npm run demo:e2e -w backend`: §0 steps 1–6 through the Fastify routes (inject: same auth/validation/handlers as HTTP).

### Gate — `npm run demo:e2e -w backend` (real output, abbreviated)
```
Step 2  keyword  engine=atlas_search        #1 Checkout API timed out… search 25.73 · #3 Fix connection pool exhaustion… verified_success
        semantic engine=atlas_vector_search #1 Checkout API timed out… vector 0.7991 · #2 Resolved: checkout timeouts gone…
        hybrid   engine=rrf                 #1 Fix connection pool exhaustion… final 0.0365 [K3·S3] verified_success
Step 3  mode=template · model=template (no LLM) · citations: 3
Step 4  outcome … result=worked · usefulness updated on 3 memories
Step 5  new memory "Resolved: Our API started timing out after a database connection pool change"
        type=episodic provenance=outcome embedding=ready
        verification: "Fix connection pool exhaustion…" verified_success → verified_success (Already verified; outcome added as further evidence)
        searchable after 1.2 s (keyword=true, vector=true)
Step 6  new outcome memory: hybrid rank 1 (keyword #1, semantic #1, policy ×1.15)
        outcome policy on vs off: 7 of 10 results change position
✔ demo:e2e finished in 5.7s
```
- Tests: backend `Test Files 5 passed (5) · Tests 33 passed (33)` (adds `outcomes.integration.test.ts`: worked/failed rules, never un-verify, procedural only, 409 on second outcome, cross-tenant 404). Test env forces `LLM_API_KEY=''` so tests never call a paid model.

### Notes / not done
- `LLM_API_KEY` is empty, so the live LLM path is not verified yet (template path verified). Integration status reports `llm: not_configured`.
- SPEC §0 says the cited procedure "becomes verified" while §13 seeds it as already `verified_success`; following §13, the demo outcome adds evidence (outcomeIds 1 → 2) rather than flipping status. The flip itself is covered by `outcomes.integration.test.ts`.
- `demo:reset` run after the gate so the demo org is back to seed state.

### Commands run
```
npm install @anthropic-ai/sdk -w backend
npm run demo:e2e -w backend (×2), npm run demo:reset -w backend (×3)
npm test, npm run typecheck, npm run lint
node frontend/scripts/screenshots.mjs --only=search-a / --only=search-outcome
```

## Phase 4 — Recovery (2026-10-11)

### Done
- `backend/src/worker.ts` (separate process): claims playbook tasks with `findOneAndUpdate` (status queued/running, lease empty or expired → `running`, `workerId`, `leaseExpiresAt = now + LEASE_MS`, `$inc attempt`), heartbeats the lease every `LEASE_MS/3` only while `workerId` matches, resumes at `max(stepIndex)+1` from checkpoints, logs `task.resumed` when `attempt > 1`.
- Per step: execution record → deterministic step → transaction { insert checkpoint (`idempotencyKey = taskId:stepIndex`, unique) ; `updateOne({_id, workerId, currentStep: i}, {currentStep: i+1})` }; no match / duplicate key ⇒ lease lost ⇒ stop. Step 1's hybrid search is keyed by the same idempotency key (retrieval log + retrievalCount not duplicated on rerun; unique partial index `retrieval_idempotency`).
- Playbook "Diagnose connection-pool incident": collect symptoms → retrieve similar incidents (hybrid) → match the verified procedure → draft remediation → summarize.
- SIGTERM/SIGINT: finish the current step, release the lease, exit 0. DEMO_MODE crash: `POST /api/dev/worker/crash` writes a request in `worker_control`; the worker checks between steps and calls `process.exit(1)` without releasing its lease.
- Cross-tenant claim isolated in `db/repositories/worker.ts`; everything after a claim uses the task's own `orgId`. General workers never claim tasks from `__test__*` orgs (tests run org-scoped workers via `WORKER_ORG_ID`).
- `npm run worker:supervised -w backend`: restarts a crashed worker as a new process (new worker id), like systemd/k8s — used for the live demo.
- API: `POST /api/tasks` (queue playbook), `GET /api/tasks/:id/checkpoints`, `GET /api/dev/status` (demo flag + live worker heartbeats), `GET /api/events` (filters, pagination), `GET /api/agents/:id/tasks|outcomes`.
- UI: Task detail (status, progress, attempts, worker + liveness, live lease countdown, step timeline with checkpoint time/worker/attempt and real step output, "Worker crashed — resumed from step N by worker-x" marker, orphaned-task marker while waiting for the lease, Crash worker button in DEMO_MODE, Run again, output, task events). Agents page (list with stats, Run playbook, Tasks / Memories / Outcomes tabs, create agent). Shared `EventRow`.

### Gate
- `backend/test/recovery.e2e.test.ts` against Atlas: spawns the real worker (`node --import tsx src/worker.ts`, step delay 1.5 s, lease 4 s), waits for 2 checkpoints, SIGKILLs it, asserts the task is still `running` with exactly 2 checkpoints and the dead worker's lease, spawns a second worker, waits for completion, asserts checkpoints `[0,1,2,3,4]` with unique idempotency keys (0–1 by worker A, 2–4 by worker B), steps 0 and 1 executed exactly once (from `step_executions`), attempt 2, and the resume log line. Result: `✓ … 12958ms · Tests 1 passed (1)`; re-run with the demo worker running concurrently: `✓ 12709ms`, demo worker claimed 0 test tasks.
- Live demo through the API (dev server + supervised worker, lease 15 s, step delay 4 s): crash requested during step 3 → `worker-34af … crash requested: exiting with code 1 after step 3 (lease not released)` → supervisor restart → `worker-55ff resuming task … at step 4 (attempt 2; 3 checkpoint(s) restored)` → completed; checkpoints `0:worker-34af@1 1:worker-34af@1 2:worker-34af@1 3:worker-55ff@2 4:worker-55ff@2`.
- Full suite: backend `Test Files 6 passed (6) · Tests 34 passed (34)`, frontend 2/2; typecheck, lint, build pass.

### Screenshot review (task detail, agents)
1. Resume marker timestamp showed step 4's checkpoint time → now the `task.resumed` event time.
2. Marker title enlarged (17 px semibold, warning colour, body in primary text) for across-the-room legibility; icon kept on the timeline axis.
3. Step 5 summary cut mid-word → word-boundary ellipsis.
4. Timeline panel stretched to the output column height → `self-start`.
5. "1 tasks" → singular/plural.

### Housekeeping
- A `files.zip` (copies of DESIGN/CLAUDE/SPEC docs, no secrets) had been swept into a commit by `git add -A`; removed from tracking, `*.zip` ignored. No remote exists.

### Commands run
```
npx vitest run test/recovery.e2e.test.ts (×2), npm test, npm run typecheck, npm run lint, npm run build
npm run worker:supervised -w backend; curl POST /api/tasks, POST /api/dev/worker/crash, GET /api/tasks/:id(/checkpoints)
node frontend/scripts/screenshots.mjs --only=task-resumed (×2), --only=agents
```

## Phase 5 — Dashboards (2026-10-11)

### Done
- `GET /api/overview`: total memories (seed/live split), indexed (embedding ready ÷ total), successful outcomes (worked ÷ recorded), retrieval success rate (worked ÷ outcomes recorded, `null` → "—" when none), 14-day cumulative sparklines, 30-day activity (memories created per day; memories returned by searches per day, from `retrieval_logs`), type distribution, recent episodic experiences, recent searches. Every metric carries `source: seed | live | mixed | none` → "Demo data" / "Demo + live" badges.
- `GET /api/learning`: outcomes per ISO week (12 weeks), totals, most useful (helpful feedback, Laplace score), most retrieved, verified procedures with their outcome evidence, recurring problems (episodic tags minus record-type tags, with resolved counts), feedback history.
- Pages: Overview "Memory Intelligence", Learning & Insights, Activity Log (grouped by day, type/status filters, links to task/memory, pagination, live refresh), Settings & Integrations (live probes + Refresh, per-integration detail/meta, setup steps when not connected, audio section, workspace/demo/worker facts). Agents page from Phase 4. Explorer: `tag` URL filter, unknown-agent filter label.
- Charts (dataviz skill followed): palettes run through `validate_palette.js` on the dark surface. Results: the DESIGN.md hexes sit above the dark lightness band (kept: DESIGN.md is binding); semantic violet vs taxonomic blue are ΔE 2.5 (deutan) and no ordering of the four type colours passes, so type identity is never colour-only (icon + label + value on every bar); created vs retrieved have very different scales → two single-series charts on a shared axis, not two colours on one; worked/failed status colours are ΔE 7.0 deutan → legend, 2 px gaps and a hatch texture on "failed". Every chart has hover tooltips and a Table view.

### Gate
- All pages render real data from Atlas with skeleton / empty / error states (verified in screenshots, incl. explorer empty state and not-found).
- Screenshot review at 1440 / 1024 / 390 (46 shots). Round 1 → fixes:
  1. Recent-searches query column squeezed to ~20 chars while numeric columns wasted space → fixed-layout table, widths on headers, engine/latency/results hidden on narrow screens.
  2. Sparklines min–max scaled made 26 → 27 look like a cliff → zero baseline, flat series hidden, lighter fill.
  3. Chart/table toggles took their own row above each chart → moved into panel headers.
  4. Retrieved-per-day y-axis labels clipped on mobile ("20"/"60" for 120/60) → no negative margin, explicit axis width.
  5. "By type" panel had empty space under the chart → taller chart, thicker bars.
  6. Outcome memories created from template answers nested the previous memory's text ("Recommendation applied: - Resolved: … Question: …") → template outcomes record which memories were followed; template answers skip "Question:" lines.
  7. "1 times", "1 tasks" → singular forms.
  Round 2 re-shot overview/learning at all widths: resolved.
- `npm test`: backend 34/34, frontend 2/2; typecheck, lint, build pass. `demo:reset` afterwards (removed the screenshot/e2e outcome memories and tasks).

### Commands run
```
npm run demo:e2e -w backend; node frontend/scripts/screenshots.mjs (full), --only=overview, --only=learning
node <dataviz>/scripts/validate_palette.js … --mode dark --surface "#151923"  (4 runs)
npm test, npm run typecheck, npm run lint, npm run build, npm run demo:reset -w backend
```

## Phase 6 — Audio (2026-10-11)

### Done
- Checked docs.elevenlabs.io: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` (`xi-api-key`, `output_format` default `mp3_44100_128`, body `{ text, model_id }`, default model `eleven_multilingual_v2`), `GET /v1/voices/{voice_id}` for the probe.
- `services/tts.ts`: streaming synthesis (30 s timeout), provider errors mapped to safe messages, live probe (fetches the configured voice) feeding integration status with voice name / model.
- `GET /api/integrations/elevenlabs/status`, `POST /api/audio/speech` (auth, Zod max 2500 chars, 10/min per user via a `preHandler` rate limit keyed by user id, streams `audio/mpeg`, `Cache-Control: no-store`, nothing stored, `audio.generated` event without content).
- UI: shared `ListenButton` (generate on demand, loading state, double-click blocked, play/pause, progress, Export audio, Retry on error; disabled with a tooltip pointing to Settings when not connected) beside Playground answers, task output and memory content. Settings "Audio (ElevenLabs)" section: status, voice, model, Test voice, setup steps. The answer text is reused; no second LLM call.

### Gate
- Without a key (verified live):
  - `GET /api/integrations/elevenlabs/status?refresh=true` → `"status":"not_configured","detail":"ELEVENLABS_API_KEY is not set. Listen / Export audio are disabled."`
  - `POST /api/audio/speech` → `{"error":{"code":"TTS_NOT_CONFIGURED",…}} [503]`; 2501 chars → `VALIDATION_ERROR [400]`
  - Listen buttons render disabled with the explanation (Settings / answer screenshots).
- With a real key (verified later in Phase 7, after the user added `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`):
  - probe: `elevenlabs: connected — Voice "George - Warm, Captivating Storyteller" · eleven_multilingual_v2`
  - `POST /api/audio/speech` (135 chars) → `HTTP 200 · 155524 bytes · 2.16 s`, `content-type: audio/mpeg`, `cache-control: no-store`, body starts with an `ID3` tag; event `Audio generated (135 characters) {"characters":135,"model":"eleven_multilingual_v2"}` (no content stored)
  - UI (Playwright, Settings → Test voice): button enabled → `/api/audio/speech` 200 `audio/mpeg` → button label `Pause` (playing).
- Backend tests still 34/34.

## Phase 7 — Ship (2026-10-11)

### Done
- `README.md` (what it does, architecture, repo tree, commands, env, deploy, limitations), `docs/DEMO.md` (click-by-click script incl. crash moment and troubleshooting), `docs/ATLAS_SETUP.md` (access, DNS/IP troubleshooting, both index definitions, Atlas UI steps, recreate flow), `docs/RANKING.md` (Phase 2).
- Deployment config: `render.yaml` (web service `agent-recall-api`, health check `/api/health`, binds `0.0.0.0:$PORT`; background worker `agent-recall-worker`; secrets `sync: false`), `frontend/vercel.json` (workspace build, SPA rewrite to `index.html`).
- Production build smoke test: `node backend/dist/server.js` → `/api/health` 200, `/api/ready` `connected: true` (23 ms); `NODE_ENV=production node dist/worker.js` starts. Fixed: the production `JWT_SECRET` guard lived in shared config and would have crashed the worker on Render; moved to the API server.
- Final screenshot review (46 shots, 3 widths) and "remove one accessory" pass:
  | Screen | Removed |
  |---|---|
  | Search Playground | decorative ⏎ glyph inside "Run all" |
  | Memory Explorer | green dot on every "Embedded" row (only pending/failed keep a dot) |
  | Overview | redundant "Settings" button on Integration health |
  | Learning & Insights | bars under "Most retrieved" that repeated the count |
  | Agents | repeated robot icon on each agent row |
  | Task detail | step-5 summary that duplicated the Output panel |
  | Settings | meta values already present in the status line |
- Screenshot script: waits for the Run-all re-render before ticking rows (a race had ticked the wrong row in one shot; the backend recorded exactly what was ticked).

### Final gate (real output)
```
npm run typecheck   → backend + frontend tsc --noEmit: no errors
npm run lint        → eslint . : no output (clean)
npm test            → backend  Test Files 6 passed (6) · Tests 34 passed (34)   (Atlas, no skips)
                      frontend Test Files 1 passed (1) · Tests 2 passed (2)
npm run build       → shared + backend tsc, frontend vite "✓ built in 3.42s"
npm run demo:e2e    → keyword atlas_search 434 ms · semantic atlas_vector_search 310 ms · hybrid rrf 163 ms
                      new memory "Resolved: Our API started timing out after a database connection pool change"
                      searchable after 1.3 s (keyword=true, vector=true) · new outcome memory hybrid rank 1
                      outcome policy on vs off: 5 of 10 results change position · ✔ finished in 5.0s
recovery.e2e.test.ts → ✓ (SIGKILL after 2 checkpoints, resumed by a second worker, steps 0–1 executed once)
```

### Deployment
- **Not deployed**: no Render / Vercel credentials or account access in this session (account-level action → user's call). Manual steps:
  1. Render → New → Blueprint → this repo (`render.yaml`). Set secrets: `MONGODB_URI`, `FRONTEND_URL` (the Vercel URL), `VOYAGE_API_KEY` (+ `VOYAGE_BASE_URL=https://ai.mongodb.com/v1` for Atlas model keys), `LLM_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.
  2. Atlas → Network Access → add Render's outbound IPs (service → Connect → Outbound) or `0.0.0.0/0` (known limitation).
  3. Vercel → New Project → root `frontend/` (picks up `vercel.json`) → env `VITE_API_URL=https://<render-api>.onrender.com` → deploy.
  4. Verify: `curl https://<api>/api/ready` shows `connected: true`; open the Vercel URL → header pill.

## Final report

**Works (verified live against the user's Atlas cluster):** demo auth; memories/agents CRUD with Voyage embeddings; Atlas Search and Vector Search indexes (queryable); keyword / semantic / hybrid (RRF + outcome policy) retrieval with explanations, labelled fallbacks, retrieval logs; Search Playground with Retrieval Trace; grounded answers (template mode) with citations; outcome loop (verification rules, outcome → episodic memory, searchable polling, re-ranking); checkpointed worker with leases and real crash recovery; Overview / Learning / Activity / Agents / Task detail / Settings on real data; ElevenLabs Listen / Export / Test voice with a real key.

**Integrations:** MongoDB Atlas, Atlas Search, Atlas Vector Search, Voyage (Atlas model API key via `https://ai.mongodb.com/v1`), ElevenLabs — each confirmed by live probe and real calls. **Anthropic: not verified** — `LLM_API_KEY` is empty, so answers use the labelled template path (code path for the real model is implemented and typed against SDK 0.133; the test env forces template mode).

**Known limitations:** demo auth only; Atlas tier not readable by the driver (`ATLAS_TIER`); playbook steps deterministic (no LLM); seeded fix procedure is already verified per SPEC §13, so the live demo adds evidence rather than flipping status (the flip is covered by tests); not deployed.

## Post-ship review (2026-10-11)

This was a full review of the backend (security, correctness and performance) and the frontend. Three parallel read-only reviewers did the reading, alongside `npm audit`. Every finding below was checked against the code before fixing. Each fix was verified by tests, live API calls or a browser probe.

### Dependencies
- **Upgrades:**
  - `@fastify/jwt` 9 → 10.2.4: critical `fast-jwt` advisories (unsigned-token, algorithm-confusion and cache-confusion bypasses).
  - `@fastify/swagger-ui` 5 → 6.1.2: high `@fastify/static` path and route-guard bypass.
  - `react-router-dom` 6 → 7.18.4: open-redirect advisories.
  - `vitest` 2 → 5: dev only (tinypool, esbuild, vite).
- `npm audit --omit=dev`: **0 vulnerabilities**.
- 7 dev-only advisories remain, from Tailwind 3 (`braces`, `micromatch`, `postcss-selector-parser`). Fixing them needs a Tailwind 4 migration of the design system. Not done; documented.

### Security fixes
| Issue | Fix | Verified |
|---|---|---|
| `trustProxy: true` let clients spoof `X-Forwarded-For` and bypass every per-IP rate limit | trust exactly one proxy hop | live: rotating spoofed entries behind a proxy → `200 ×20, 429 ×4` |
| Anyone with a demo token could drive unbounded LLM, TTS and embedding spend | process-wide per-minute budgets (`lib/cost-guard.ts`); answers return `429 BUDGET_EXCEEDED` | unit test |
| `<memory>` escaping only handled the exact string `</memory>`. This allowed stored prompt injection and forged `verification="verified_success"` blocks. | XML-escape `& < > "` in titles, content and attributes | unit test with hostile payloads |
| `render.yaml` shipped `DEMO_MODE=true`, which made the worker-crash endpoint public | default `false`, documented | config |
| Voyage response text and raw worker errors reached clients and events | clients get a status code and a fixed reason; the provider body is logged server-side, scrubbed; worker errors are scrubbed and made generic | code |
| `/dev/status` exposed other tenants' task ids | return only ids owned by the caller's org | code |
| `/api/ready` returned driver detail, including the cluster host, publicly | generic detail in production | code |
| Unbounded `page` (`1e300` caused a driver error and a 500) | `max(1000)` everywhere | live: `400 VALIDATION_ERROR` |
| Expensive routes only had the global limit | per-route limits on agent create, memory edit, related, overview, learning and integration refresh | code |
| A placeholder `JWT_SECRET` was accepted in production | reject `change-me*` and `dev-only*` values and anything under 32 characters | code |
| No security headers on the SPA | CSP, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy in `vercel.json` | config |
| Unique indexes were created fire-and-forget at startup | awaited before `listen` | code |

Verified unchanged:
- Tenant isolation holds.
- `alg=none`, bad-signature, expired and missing tokens all return 401.
- There are no secrets in git or its history.

### Correctness and reliability fixes
- **Outcome race:** statuses were read before the transaction, so concurrent "worked" and "failed" outcomes could demote a verified procedure. They are now read inside the transaction, so a write conflict retries with fresh data. Regression test: concurrent outcomes always end `verified_success`.
- **Outcome partial failure:** memory creation ran after the commit. It could fail, or block for about 84 s on Voyage, and a retry then got 409 forever. Fixes:
  - A retry now finishes the outcome.
  - A unique `memory_once_per_outcome` index prevents duplicates.
  - Embedding moved to the background.
  - `/searchable` waits for the vector while an embedding is pending.
  - Regression test added.
- **Search idempotency race:** find-then-insert could fail a playbook task with a duplicate-key error. It now inserts first on the unique index and reuses the existing log on error 11000. Regression test: concurrent runs produce one log.
- **Worker:**
  - The poll loop backs off on transient database errors instead of killing the process.
  - Transient step errors release the lease for another attempt instead of permanently failing the task.
  - A `MAX_ATTEMPTS = 5` cap stops poison tasks.
  - The lease is checked at step start.
  - The main loop owns shutdown, which removes the SIGTERM-while-idle race.
  - The test-org exclusion is refreshed every 60 s.
  - The supervisor registers its signal handlers once.
- **Embeddings:**
  - One failed batch used to mark every memory failed; batches now succeed or fail independently.
  - The backfill no longer loads vectors.
  - Query-path embedding is 2 attempts × 8 s instead of 3 × 20 s.
- **Search:**
  - Tag and date filters were applied after only 20 vector hits; it now over-fetches when post-filtering.
  - The regex fallback scored an arbitrary 200 documents; it now scores 1000 sorted documents and includes tags.
  - A transient `listSearchIndexes` error reuses the last known state instead of returning a 500.
- **Indexes:**
  - New indexes: `retrieval_logs {orgId, results.memoryId, createdAt}`, `events {orgId, agentId|taskId, createdAt}`, `tasks {orgId, createdAt}`, `memories {orgId, relations.targetMemoryId}`, `outcomes {orgId, agentId, createdAt}`, and a unique seed key.
  - Agent stats aggregate only the listed agents.
- **API:** LLM errors now map to 429 (rate limited), 422 (refused), 504 (timeout) and 502 (other).
- **Insights:**
  - Activity counts exclude archived memories, consistent with the totals.
  - The source is reported honestly as `none` when there is no data.
  - Procedure evidence is fetched by id, not only from the last 50 outcomes.

### Frontend fixes
- **Explorer search dropped URL filters and closed the drawer** (stale `params` closure). URL updates are now functional. Browser-verified: `?type=episodic&tag=checkout` becomes `…&q=pool+timeout`.
- **`?q=` was only read on mount.** It now re-runs on change, once per query.
- **Policy toggle race** (out-of-order responses, unsubmitted text). Each column now has a request sequence number, and toggles re-run the last submitted request. Browser-verified: 5 fast toggles end consistent with the switch.
- **"Why this result" showed stale numbers after a toggle.** It now derives from the current results.
- **Listen replayed the previous answer after Regenerate.** The player is now keyed by text.
- **The Retrieval Trace re-measured on every hover** because its `engines` object was unstable. Now memoised.
- **The task page could miss the final checkpoint when polling stopped.** It now refetches on completion.
- **Smaller fixes:**
  - The tag filter was invisible; it now has a removable chip.
  - Activity polls only on page 1.
  - The answer is grounded in a snapshot of the selection.
  - A `NaN` page number is clamped.
- **API client:** binary requests now share the auth, 401 and network handling, and a late 401 no longer discards a newer token.
- **Command palette:** removed the never-provided context (a conditional hook).
- **Accessibility and markup:**
  - Table rows use `aria-current` instead of `aria-selected`.
  - Result selection has `aria-pressed`.
  - The label no longer wraps two buttons.
  - The rail's warning icon has a role.
  - Refresh and play failures are surfaced.
- **Other:**
  - The chart tick component no longer remounts on every render.
  - The screenshot script reports states that never loaded instead of swallowing timeouts.

### Verification (real output)
```
npm run typecheck   → no errors
npm run lint        → clean
npm test            → backend Test Files 6 passed (6) · Tests 40 passed (40)   (Atlas; +6 new: prompt escaping ×2, budget, outcome race, outcome resume, search idempotency)
                      frontend Tests 2 passed (2)
npm run build       → ✓ built
npm audit --omit=dev → found 0 vulnerabilities
npm run demo:e2e    → all 6 steps; outcome memory embedding=pending → searchable after 1.2 s (keyword=true, vector=true); rank 1
live crash demo     → worker-8ccb exit 1 after step 3 → worker-399d resumed at step 4 (3 checkpoints restored) → completed attempt 2
screenshots         → 46 captured, no "did not appear" warnings (React Router 7)
```

### Remaining risks
- **Auth:** demo auth (a shared demo user, with the JWT in localStorage) is not production authentication.
- **Seed data:** seed records can be edited by any demo user; `demo:reset` restores them.
- **SIGTERM:** the graceful SIGTERM path was not exercised on this Windows machine, because Node can't deliver SIGTERM to a child process here. The logic was reviewed, and the SIGKILL recovery path is tested.
- **Stuck QA tasks:** a QA task can stay `running` if the API process dies mid-LLM call, because no worker owns QA tasks.
- **Seeding:** running `npm run seed` alone (without `demo:reset`) resets seed verification while live outcomes still cite those memories.
- **Unverified and undeployed:** the Anthropic path is still unverified (no `LLM_API_KEY`), and nothing is deployed.
- **Dev dependencies:** the Tailwind 3 advisories remain.

## Groq LLM provider (2026-10-11)

- Added Groq (OpenAI-compatible, checked against console.groq.com/docs) as an LLM provider: `GROQ_API_KEY`, `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `GROQ_BASE_URL`.
- Order: preferred provider (`LLM_PROVIDER`, default anthropic) if its key is set, then the other. Anthropic → Groq fallback on auth, billing ("credit balance too low"), rate limit, timeout or outage; never on a refusal. No keys → labelled template answer.
- Answers carry `provider` and `fallbackReason`; the UI badge shows "Claude · model" or "Groq · model" and "Fallback provider". Integration probe reports the provider in use (token-free `GET /models/{model}`).
- Groq errors map to the same codes; provider bodies stay in server logs; Groq calls count toward the LLM budget.
- Tests: `test/llm-providers.test.ts` (fetch stubbed, no network): Groq-only, Anthropic no-credit → Groq, refusal not retried, `LLM_PROVIDER=groq`, template. Full suite: backend 45/45, frontend 2/2; typecheck, lint, build pass.
- Not verified live yet: needs `GROQ_API_KEY` in `.env`.

### Groq verified live (2026-10-11)
- Account key cannot access `llama-3.3-70b-versatile` (Groq 404 `model_not_found`); `GET /models` showed `openai/gpt-oss-120b` available → default changed to `openai/gpt-oss-120b` (code, `.env.example`, `render.yaml`, README, user `.env` GROQ_MODEL line). gpt-oss requests send `reasoning_effort: "low"`, `include_reasoning: false`, `max_completion_tokens: 4000`.
- Fixed: probe URL-encoded the `/` in the model id (false "not found"); gpt-oss cites as `【mem:id】` → citations normalised to `[mem:id]` for every provider (unit test); answer panel renders `**bold**` and `` `code` `` safely.
- Live: probe `connected — Groq reachable · openai/gpt-oss-120b (179 ms)`; `/api/answers` provider=groq, ~1.2 s, 2/3 memories cited; `demo:e2e` all steps with the Groq answer; UI header "Groq · openai/gpt-oss-120b", citation chips working.
- Full suite: backend 46/46, frontend 2/2; typecheck, lint, build pass. Demo data reset.
