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
| `/api/ready` confirms Atlas | **blocked**: `{"status":"not_ready","mongo":{"connected":false,…,"detail":"MONGODB_URI is not set in .env"}} [503]` |
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
- **No `.env` / `MONGODB_URI`.** `/api/ready` cannot confirm the Atlas connection until it exists. Everything else in Phase 0 is verified.

### Commands run
```
npm install
npx playwright install chromium
npm run typecheck && npm run lint && npm run build
npm run screenshots -w frontend
npm run screenshots -w frontend -- --only=dev-ui
curl localhost:4000/api/health | /api/ready | /docs | /docs/json | /api/nope
```
