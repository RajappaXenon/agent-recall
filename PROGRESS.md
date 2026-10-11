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
