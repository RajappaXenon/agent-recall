# Agent Recall — Design system

The UI is judged on stage in seconds. It should feel like a precise instrument for inspecting memory, not a generic admin dashboard. Build the design system first (Phase 0), then every screen from it.

## 1. Direction
- **Concept: "an instrument panel for memory."** Dense where data matters, calm everywhere else. Every element shows something real: a rank, a score, a provenance link, a status.
- **Spend boldness in one place: the Retrieval Trace** (§5) in the Search Playground. Everything around it stays quiet and disciplined.
- **Hierarchy through surface and type, not decoration.** Depth comes from surface steps and 1px borders. Shadows only on overlays (drawer, dialog, popover, command palette).
- **Rows and panels, not a wall of cards.** Results, memories, events and tasks are list rows inside panels. Cards are reserved for metric tiles and integration tiles.
- **Honest UI is premium UI.** Engine pills, "Demo data" badges, real latencies and real scores are designed in as first-class elements, not afterthoughts.

## 2. Tokens
Define as CSS variables in `frontend/src/styles/tokens.css`, map them in `tailwind.config.ts`, and theme shadcn/ui from the same variables. No raw hex values in components.

**Surfaces and text**
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0D12` | App background |
| `--sidebar` | `#10131A` | Sidebar |
| `--surface` | `#151923` | Panels |
| `--surface-raised` | `#1B2130` | Hovered rows, inputs, nested panels |
| `--surface-overlay` | `#1F2636` | Drawer, dialog, popover |
| `--border` | `#232A3A` | Default 1px borders |
| `--border-strong` | `#2E3649` | Focused panels, dividers that separate sections |
| `--text` | `#E8EAF0` | Primary text |
| `--text-muted` | `#9AA3B5` | Secondary text |
| `--text-faint` | `#6B7385` | Tertiary, placeholders, axis labels |

**Accents and status**
| Token | Value | Use |
|---|---|---|
| `--accent` | `#8B7CFF` | Primary actions, selection, hybrid mode |
| `--accent-2` | `#43D9C3` | Semantic search mode, secondary highlights |
| `--keyword` | `#6BA8FF` | Keyword search mode |
| `--success` | `#3FCF8E` | Verified success, connected |
| `--warning` | `#F5C451` | Fallback, building, pending |
| `--danger` | `#F06A6A` | Verified failure, error |

Mode colours (keyword blue, semantic teal, hybrid violet) are used consistently everywhere a search mode appears: tabs, pills, chart series, Retrieval Trace lines.

**Memory types** — always colour **plus** a Lucide icon, never colour alone:
semantic `#A99BFF` + `Lightbulb` · episodic `#F2906B` + `History` · taxonomic `#5AB8F2` + `Network` · procedural `#43D9C3` + `ListChecks`.

**Type**
- Family: Geist Sans (package `geist`) for all UI text; Geist Mono only for things that really are code: memory ids, error strings, config keys, JSON. Not for decorative labels.
- Scale (px / line-height / weight): page title 22/28/600 · section title 15/22/600 · body 14/20/400 · dense row 13/18/400 · caption 12/16/500. Numbers in metrics and tables use `font-variant-numeric: tabular-nums`.
- Sentence case everywhere. No all-caps eyebrow labels. Body text max ~72 characters per line.

**Space, radius, elevation**
- 4px grid. Panel padding 16–20px. Row height 44px (dense 36px). Gap between panels 16px.
- Radius by hierarchy: 6px controls/badges · 10px panels/tiles · 14px drawers/dialogs. Not one radius for everything.
- Focus: 2px `--accent` ring with 2px offset on every interactive element.
- Shadow only on overlays: `0 12px 32px rgba(0,0,0,.45)`.

## 3. App shell
```
┌──────────┬───────────────────────────────────────────────────────────┐
│ ◆ Agent  │ Search Playground / Hybrid        [⌘K Search memories] ● 5/6 │
│   Recall │───────────────────────────────────────────────────────────│
│          │                                                           │
│ Overview │   page content, max-width 1440, 24px gutters              │
│ Memory   │                                                           │
│ Search ◀ │                                                           │
│ Agents   │                                                           │
│ Learning │                                                           │
│ Activity │                                                           │
│          │                                                           │
│ Settings │                                                           │
│ Demo org │                                                           │
└──────────┴───────────────────────────────────────────────────────────┘
```
- Sidebar 240px, collapsible to 64px icon rail; active item gets a `--surface-raised` fill and a 2px accent bar on the left. Workspace switcher and "Demo auth" notice at the bottom.
- Header 56px: breadcrumb left; ⌘K command palette (memory search + page navigation) centre-right; integration pill ("5 of 6 connected", colour = worst non-optional status) opening a popover with per-integration status.
- Breakpoints: ≥1280 full layout · 768–1279 collapsed sidebar, Playground panels become tabs · <768 sidebar becomes a sheet, single column.

## 4. Screens
**Search Playground (signature screen)**
```
┌ Query ────────────────────────────────────────────────────────────────┐
│ Our API started timing out after a database connection pool change…   │
│ [Filters ▾]  [Outcome policy ●on]                        [Run all ⏎]  │
└───────────────────────────────────────────────────────────────────────┘
┌ Keyword  atlas_search 38ms ┐┌ Semantic  vector 112ms ┐┌ Hybrid  rrf 151ms ┐
│ 1 Pool timeout error text  ││ 1 API timeouts after…  ││ 1 API timeouts…   │
│ 2 Thread pool exhaustion   ││ 2 Service hung under…  ││ 2 Pool fix proc…  │
│ 3 Pool fix procedure       ││ 3 Pool fix procedure   ││ 3 Pool timeout…   │
│   …        Retrieval Trace lines connect the same memory across columns │
└────────────────────────────┘└────────────────────────┘└───────────────────┘
┌ Why this result ──────────────────────┐┌ Selected (2)  [Use in agent task] ┐
│ Keyword rank 3 · Semantic rank 3       ││ …                                 │
│ RRF 0.0323 → final 0.0371 (verified)   ││                                   │
└────────────────────────────────────────┘└───────────────────────────────────┘
```
- Result row: rank number, type icon, title (one line), highlighted excerpt (two lines, matched terms in `--text` on a subtle accent tint), verification badge, score with its kind ("vector 0.842", "search 7.31", "rrf 0.0323"), and a thin score bar scaled within that column only.
- Panel header: mode name in mode colour, engine pill, measured latency. Fallback engines show a warning-coloured pill ("Fallback — not Atlas Search") and a one-line reason.
- Answer view (after "Use in agent task"): answer text with inline citation chips that highlight the cited memory on hover; evidence list; Listen button; outcome block (Worked / Failed, Helpful / Not helpful, notes). After submit, the new memory row appears with an "Indexing…" state that resolves to "Searchable".

**Overview "Memory Intelligence"**: a row of four metric tiles (value, measured denominator or comparison, small sparkline; "—" when there's no data, never a fake number); then a two-thirds/one-third grid: memory activity chart + type distribution; recent agent experiences (rows) + integration health tiles; recent searches table.

**Memory Explorer**: toolbar (search, mode segmented control, filter chips, sort), dense table-style rows, right-side drawer (560px) with tabs: Content · Provenance · Related · Retrievals · Embedding.

**Task detail**: vertical step timeline; each completed step shows its checkpoint (time, worker id). A resumed task shows a clear "Worker crashed — resumed from step 3 by worker-b7f2" marker on the timeline. This is the second demo moment; make it legible from across a room.

**Agents, Learning & Insights, Activity Log, Settings**: same row/panel language. Activity Log is a timeline grouped by day with event-type icons and links.

## 5. The Retrieval Trace (the memorable element)
After a search, an SVG layer draws curved connector lines from each memory's row in the Keyword and Semantic columns to its row in the Hybrid column, coloured by source mode, with stroke width proportional to that source's RRF contribution. Memories found by only one mode have only one line; that difference is the whole story of hybrid search, made visible.
- Hovering any row highlights that memory in all three columns and its lines; everything else dims to 30%.
- Toggling the outcome policy animates rows to their new hybrid positions (300ms), so the effect of verified outcomes is visible.
- Built from real ranks in the API response. If a mode didn't run or fell back, its lines are absent or dashed with a label.
- At tablet/mobile widths, replace the lines with per-row "K3 · S3" rank chips.

## 6. Components (build in Phase 0, show them all on a `/dev/ui` page)
Button (primary, secondary, ghost, destructive; sm/md) · Input, Textarea, Select, Combobox · SegmentedControl · Tabs · Badge (memory type, verification, engine, "Demo data") · StatusDot with text label · ScoreBar · LatencyChip · Panel (header with title, meta, actions) · MetricTile · ResultRow · DataTable (sortable, sticky header) · Drawer · Dialog · Popover · Tooltip · CommandPalette · Toast · Skeleton (shaped like the content it replaces) · EmptyState (icon, one sentence, one action) · ErrorState (what failed, how to fix, Retry) · Timeline · AudioPlayer.

Charts (Recharts): no chart borders, horizontal gridlines only in `--border`, axis text `--text-faint` 12px, mode/type colours from tokens, custom tooltip on `--surface-overlay`, no 3D, no pie charts with more than four slices (type distribution as horizontal bar is preferred).

## 7. Motion
- Responses to user action: 120–180ms ease-out (drawer slide, dialog fade-scale from 98%, row hover background).
- One orchestrated moment: when "Run all" completes, columns fill top-down (40ms stagger) and Retrieval Trace lines draw in (400ms). Nothing else animates on load.
- Respect `prefers-reduced-motion`: no line-draw or reordering animation, instant states.

## 8. Copy
Plain, specific, sentence case. Buttons say what happens ("Run all", "Record outcome", "Archive memory"), and toasts reuse the same verb ("Memory archived"). Empty states invite action ("No memories yet. Create one or load the demo data."). Errors say what happened and how to fix it ("Vector index not found. Run npm run setup:indexes, then refresh."). No marketing language inside the app.

## 9. Avoid
Purple-to-blue gradient washes, glow effects, glassmorphism, identical rounded cards for everything, all-caps eyebrows, `→` appended to buttons, emoji icons, giant hero numbers with gradient text, decorative monospace labels, animations on every hover, lorem ipsum, placeholder charts.

## 10. Quality floor
WCAG AA contrast for all text (check `--text-faint` usages; never use it for body text). Full keyboard navigation including the drawer, palette and Playground selection. Visible focus. Labels on every icon button. No layout shift when data loads (skeletons match final size). Seed data is rich enough that every screen looks populated.

## 11. Design QA loop (required)
- Add Playwright and `npm run screenshots -w frontend`, which starts the app against the seeded database and captures every route plus key states (Playground after "Run all", hybrid row hovered, answer + outcome view, memory drawer open, task resumed after crash, an empty state, a fallback state) at 1440×900, 1024×768 and 390×844, into `frontend/screenshots/` (git-ignored).
- At the end of Phases 0, 2, 5 and 7, run it, **open and look at the screenshots**, and critique them against this file: alignment, spacing rhythm, hierarchy, truncation, contrast, consistency of mode/type colours, anything that looks templated. Fix the issues, re-shoot, and note what changed in `PROGRESS.md`.
- Before finishing, do one "remove one accessory" pass: delete the least useful decorative element on each screen.
