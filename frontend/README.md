# frontend: Agent Recall web app

A React single-page app for inspecting agent memory. It shows:
- how keyword, semantic and hybrid search rank results;
- grounded answers;
- recorded outcomes;
- crash-safe tasks;
- measured benchmarks.

It talks only to the backend API. It holds no secrets; its only setting is `VITE_API_URL`.

**Stack:** React 18, Vite 6, TypeScript (strict), Tailwind 3 with design tokens, Radix primitives, TanStack Query 5, React Router 7, Recharts, Lucide icons and sonner toasts.

## Run it

```bash
npm run dev                       # from the repo root: API (:4000) + this app (:5173)
# or only the frontend, with the API already running:
npm run dev -w frontend
```

Open http://localhost:5173. On first load the app signs in with demo auth automatically.

| Script | Purpose |
|---|---|
| `dev` | Vite dev server; `/api` is proxied to `http://localhost:4000` |
| `build` | Typecheck, then a production build into `dist/` |
| `preview` | Serve the production build (port 4173, `/api` proxied) |
| `typecheck` / `test` | Strict TypeScript / Vitest |
| `screenshots` | Playwright screenshots of every route and key state at 1440, 1024 and 390 px into `screenshots/` (git-ignored); `-- --only=search` filters by name |

In production, set `VITE_API_URL` to the API origin (for example the Render URL). If it is unset, requests go to the same origin.

## Layout

```
src/
  main.tsx              React root, QueryClient, router, toaster
  app/
    router.tsx          routes (pages are lazy-loaded)
    nav.ts              sidebar items and breadcrumbs
    AppShell.tsx        sidebar + header + page outlet
    Sidebar.tsx, CommandPalette.tsx (Ctrl/⌘ K), IntegrationPill.tsx (live integration status)
  pages/                one file per screen (table below)
  components/
    ui/                 design-system primitives: Button, Badge, Panel, MetricTile, Tabs, Dialog/Drawer,
                        SegmentedControl, ScoreBar, LatencyChip, Skeleton, EmptyState/ErrorState, Timeline …
    search/             ResultColumn, RetrievalTrace (SVG rank lines), WhyPanel, AnswerFlow (answer + outcome)
    memory/             MemoryDrawer and its tabs, MemoryForm, ExplorerSearch
    charts/             Recharts wrappers with a table view for each chart (chart-kit = shared styling)
    activity/, audio/   EventRow; ListenButton and VoiceSettings (ElevenLabs)
  lib/
    api.ts              fetch wrapper: base URL, bearer token, demo login + retry on 401, ApiError
    queries.ts          TanStack Query hooks and query keys (agents, memories, tasks, events, integrations)
    tokens.ts           design tokens for JS (mode and memory-type colours, icons)
    utils.ts, hooks.ts  formatting helpers, cn(), useMediaQuery
  styles/
    tokens.css          colour, radius and type tokens (CSS variables): the single source of colour
    globals.css         Tailwind layers and base styles
scripts/screenshots.mjs Playwright design-QA script
```

## Screens

| Route | Page | What it shows |
|---|---|---|
| `/` | Overview | Memory metrics, activity charts, type distribution, recent experiences, integration health |
| `/memories` | Memory Explorer | Searchable memory list; a drawer with Content, Provenance, Related, Retrievals and Embedding tabs; create and edit |
| `/search` | Search Playground | One query through keyword, semantic and hybrid side by side, with the Retrieval Trace. Then "Use in agent task" for a grounded answer, and "Did this work?" to record an outcome |
| `/agents` | Agents | Agents with their memories, tasks and outcomes; run the crash-safe playbook |
| `/tasks/:id` | Task detail | Step timeline with checkpoints; shows when a crashed worker was resumed by another |
| `/learning` | Learning & Insights | Outcomes over time, verified procedures and their evidence, most useful and most retrieved memories |
| `/benchmarks` | Benchmarks | Labelled retrieval benchmark: metrics per configuration, dev/held-out split, outcome-policy effect, run history |
| `/activity` | Activity Log | Audit trail of searches, answers, outcomes, verification and worker events |
| `/settings` | Settings & Integrations | Live integration probes, voice settings |
| `/dev/ui` | Design system | Every UI primitive in one page (for design review) |

## How data flows

- **Server state** lives in TanStack Query. Every request goes through `lib/api.ts` (`api.get/post/patch`); hooks in `lib/queries.ts` wrap common reads. Mutations invalidate the matching query keys.
- **Auth:**
  1. `api.ts` keeps the demo JWT in `localStorage` (or memory if storage is blocked).
  2. On a 401 it signs in again once and retries.
  3. The sidebar shows "Demo auth — not production-secure".
- **Types** come from `@agent-recall/shared`, the same Zod schemas the API validates with, so a response shape change breaks the build instead of the UI.
- **Errors:** API errors become `ApiError(status, code, message)`. Pages render `ErrorState` with the server's message and a Retry button.

## Design rules (from `docs/DESIGN.md`)

- **Colours:** only from tokens (`tokens.css`, Tailwind classes or `tokenColor()` in JS); never a raw hex in a component. Mode colours are consistent everywhere: keyword blue, semantic teal, hybrid violet.
- **Memory types:** always shown with colour **and** icon.
- **Layout:** rows inside panels rather than a wall of cards; cards only for metric tiles.
- **Honest UI:**
  - engine pills and fallback warnings are always visible;
  - seed records carry a "Demo data" badge;
  - missing values show "—", never a placeholder number;
  - every chart has a table view.
- **Loading:** skeletons match the final layout, so nothing shifts when data loads.
- **Phone width:** every screen must work at 390 px with no horizontal page scroll. Check with `npm run screenshots -w frontend`.

## Common tasks

- **Add a page.** Create `src/pages/MyPage.tsx` (start with `PageHeader` and `Panel`), lazy-import it in `app/router.tsx`, and add a sidebar item in `app/nav.ts`.
- **Call a new endpoint.** Add its schema in `shared/`, then `useQuery({ queryKey: [...], queryFn: () => api.get<Type>('/api/...') })`.
- **Add a primitive.** Put it in `components/ui/`, use tokens only, and add an example to `pages/DevUi.tsx`.
