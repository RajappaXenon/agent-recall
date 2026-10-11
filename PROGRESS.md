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
