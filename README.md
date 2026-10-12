# Agent Recall

**Give AI agents a memory worth remembering.**

Agent Recall is a memory engine for AI agents. It stores experiences in MongoDB Atlas and retrieves them three ways:
- keyword, with Atlas Search
- semantic, with Voyage AI embeddings and Atlas Vector Search
- hybrid, with Reciprocal Rank Fusion

It then grounds answers in what it retrieved and records whether they worked. Those verified outcomes feed back into future ranking. Multi-step agent tasks run on a separate worker with checkpoints, and survive a real process crash without repeating completed steps.

Built for the MongoDB "Harness Engineering & Model Wrangling" hackathon.

## What it does

| | |
|---|---|
| **Search Playground** | One query through keyword, semantic and hybrid retrieval side by side. The Retrieval Trace draws how each memory's keyword and semantic ranks fuse into its hybrid rank. Every result explains why it came back. |
| **Grounded answers** | Answers are grounded in selected memories, which go into the prompt as untrusted `<memory>` blocks, and the answer cites them. The model is Claude (`claude-opus-5-5`) or Groq (`openai/gpt-oss-120b`), with Groq as the automatic fallback. Without any LLM key, the answer is a clearly labelled template answer. |
| **Learning loop** | "Did this work?" records an outcome. A successful outcome verifies the cited procedure, the outcome becomes a new episodic memory, and the contextual outcome policy `final = rrf × (1 + 0.15·s·context)` ranks memories verified on similar questions higher. No model weights change. |
| **Retrieval benchmark** | 24 hand-labelled questions (paraphrased problems, exact identifiers, "what fixed this before?") run through the real search pipeline. It reports Hit@1, MRR@10, Recall@5, graded nDCG@5 and latency for keyword, semantic, hybrid, and hybrid with outcome signals, on the Benchmarks page and via `npm run benchmark -w backend`. |
| **MCP server** | `mcp/` exposes the memory to any MCP client (Claude Code, Claude Desktop, other agents): `recall`, `get_memory`, `ask`, `record_outcome`, `remember`, `check_searchable`. An agent can recall a past fix, get a cited recommendation and record whether it worked, all without opening the UI. |
| **Crash-safe tasks** | The worker claims tasks with a lease and commits a checkpoint and the step advance in one transaction. If the worker is killed mid-run, another worker resumes from the last checkpoint. |
| **Honest UI** | Every number is computed from stored data. Engine pills and fallback warnings are always shown, seeded records carry a "Demo data" badge, and integrations are "connected" only after a live probe. |

## Architecture

```
frontend (React, Vite, Tailwind, TanStack Query, Recharts)
   │  /api (JWT demo auth)
   ▼
backend API (Fastify 5, Zod, Swagger at /docs) ──► MongoDB Atlas  (memories + memories_search + memories_vector,
   │                                                  tasks, checkpoints, outcomes, retrieval_logs, events …)
   ├─► Voyage AI (embeddings)    ├─► Anthropic (answers)    └─► ElevenLabs (optional audio)
backend worker (separate process) ──► MongoDB Atlas (lease claim, heartbeat, transactional checkpoints)
MCP server (mcp/, stdio) ──► backend API  (same auth, org scoping, rate limits and activity log)
```

```
shared/    Zod schemas + API types used by both sides
backend/   src/server.ts  src/worker.ts  src/config.ts
           src/db/        client, collections, orgId-scoped repositories, indexes, search indexes
           src/services/  embeddings, search, rrf, llm, answers, outcomes, playbook, insights, tts, integrations
           src/routes/    one Fastify plugin per domain
           src/scripts/   setup-indexes, seed, embed-backfill, demo-reset, demo-e2e, worker-supervised
           test/          unit, RRF, search/outcome integration, recovery e2e (real worker processes)
           src/eval/      labelled benchmark set and IR metrics
frontend/  src/app (shell, router)  src/pages  src/components  src/lib
           scripts/screenshots.mjs (Playwright design QA)
mcp/       src/index.ts (MCP server)  src/smoke.ts (end-to-end check through a real MCP client)
docs/      SPEC.md  DESIGN.md  RANKING.md  DEMO.md  ATLAS_SETUP.md
```

Every database read and write goes through repositories that require `orgId`. Integration tests run inside a dedicated `__test__` organization in the same collections, because search indexes are per collection.

Each module has its own README with setup, layout, data flow and common tasks:

| Module | README | In one line |
|---|---|---|
| API, worker, scripts | [backend/README.md](backend/README.md) | Fastify API, search and ranking, answers, outcomes, crash-safe worker, seed and benchmark scripts |
| Web app | [frontend/README.md](frontend/README.md) | React screens, design system, how data is fetched |
| API contract | [shared/README.md](shared/README.md) | Zod schemas and types used by both sides |
| MCP server | [mcp/README.md](mcp/README.md) | Agent Recall as memory for Claude Code and other MCP clients |
| Demo video | [demo-video/README.md](demo-video/README.md) | How the 60-second tutorial was recorded and built |

## Run it locally

Requirements: Node 20 or later and a MongoDB Atlas cluster. Voyage, Anthropic and ElevenLabs keys are optional, but semantic search needs Voyage.

```bash
npm install
cp .env.example .env            # fill MONGODB_URI, DB_NAME, VOYAGE_API_KEY (+ LLM_API_KEY, ELEVENLABS_* optional)
npm run setup:indexes -w backend    # creates search + vector indexes, waits until queryable
npm run seed -w backend             # demo org, 4 agents, 59 memories across 13 incident stories, 13 seeded outcomes (isSeed: true)
npm run dev                         # API on :4000, web on :5173
npm run worker:supervised -w backend   # task worker (restarts after a crash, for the demo)
```

Open http://localhost:5173. Demo auth signs you in automatically. It is **not production-secure**, and the UI says so.

| Command | What it does |
|---|---|
| `npm run dev` | Frontend (Vite) and API (Fastify) together |
| `npm run worker -w backend` | Task worker, separate process |
| `npm run worker:supervised -w backend` | Worker that is restarted as a new process after a crash |
| `npm run setup:indexes -w backend [-- --recreate]` | Regular, Atlas Search and Vector Search indexes, polled until `queryable: true` |
| `npm run seed -w backend` | Idempotent demo data (upserted by `seedKey`) |
| `npm run embed:backfill -w backend` | Embeds memories that are missing or have a stale embedding |
| `npm run demo:reset -w backend` | Deletes non-seed data in the demo org only, then re-seeds |
| `npm run demo:e2e -w backend` | Runs demo steps 1–6 through the API and prints the real results |
| `npm run calibrate -w backend` | Measures Voyage similarity on the calibration question pairs and derives the outcome-policy thresholds |
| `npm run benchmark -w backend` | Runs the labelled retrieval benchmark on the demo org, stores the run and prints the metrics table |
| `npm run smoke -w mcp` | Starts the MCP server over stdio and runs recall → ask → record_outcome → check_searchable through a real MCP client |
| `npm run screenshots -w frontend` | Playwright screenshots of every route and state at 1440, 1024 and 390 px |
| `npm run typecheck && npm run lint && npm test && npm run build` | The full check |

## Use it from Claude Code (MCP)

The repo ships a project-scoped `.mcp.json`. With `npm run dev` running, start Claude Code in the repo root, approve the `agent-recall` server, then ask something like *"Orders API keeps hitting 504s after we shrank the DB pool. Check Agent Recall for how we fixed it before."*

To add it to another MCP client, run the server with Node:

```json
{ "mcpServers": { "agent-recall": {
    "command": "node", "args": ["--import", "tsx", "<repo>/mcp/src/index.ts"],
    "env": { "AGENT_RECALL_API_URL": "http://localhost:4000", "AGENT_RECALL_AGENT": "Engineering Assistant" } } } }
```

- **`AGENT_RECALL_TOKEN`:** optional. Without it the server signs in with demo auth, which works only when the API runs with `AUTH_MODE=demo`.
- **Data handling:** the server calls the REST API only and never connects to MongoDB itself. It returns memory text inside escaped `<memory>` blocks, marked as reference data, not instructions.

## Retrieval benchmark

The labels are in `backend/src/eval/benchmark-set.ts`, together with the labelling rule.
- **Labelling:** each question's grades were written from what the question asks, before the first run, and were not tuned afterwards.
- **Isolation:** runs call the search code with no side effects (no retrieval logs, no retrieval counts), one query at a time.
- **Scoring:** memories created after seeding have no labels, so they are left out of scoring, and the run reports how many were left out.

Hybrid nDCG@5, Oct 11, 2026. There are 24 dev questions, plus 10 held-out questions committed before the contextual policy and not used to tune it:

| | Keyword | Semantic | Hybrid | Hybrid + global ×1.15 | Hybrid + contextual outcomes |
|---|---|---|---|---|---|
| Dev | 0.738 | 0.919 | 0.852 | 0.702 | 0.829 |
| Held-out | 0.877 | 0.888 | 0.913 | 0.689 | 0.885 |

The benchmark showed that the original outcome boost lifted verified procedures above the right answer for unrelated questions. The outcome policy is now **contextual**: an outcome only counts for questions similar to the one it was recorded on. The similarity thresholds were calibrated on separate question pairs (`npm run calibrate -w backend`).
- **Effect:** this removes almost all of that damage; the top answer now moves on 3 questions instead of 21.
- **Remaining gap:** it does not yet beat plain hybrid, because a recorded failure of "scale out" is demoted on questions where that failure is the useful answer.

Details are in `docs/RANKING.md`.

## Environment

See `.env.example`.
- **Required:** `MONGODB_URI`, `DB_NAME`, `JWT_SECRET`, `FRONTEND_URL`.
- **Semantic search:** `VOYAGE_API_KEY`, `VOYAGE_MODEL` (`voyage-3.5`), `VOYAGE_DIMENSIONS` (1024) and `VOYAGE_BASE_URL`. Atlas "model API keys" use `https://ai.mongodb.com/v1`.
- **LLM answers:** `LLM_API_KEY` and `LLM_MODEL` for Anthropic, and/or `GROQ_API_KEY` and `GROQ_MODEL` (default `openai/gpt-oss-120b`) for Groq. With only a Groq key, Groq answers. With both, Anthropic answers and Groq takes over if an Anthropic call fails (no credit, bad key, rate limit, outage; never on a refusal). `LLM_PROVIDER=groq` makes Groq the first choice.
- **Optional audio:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`.
- **Worker and demo:** `DEMO_MODE` enables the crash button. `LEASE_MS` and `DEMO_STEP_DELAY_MS` tune the worker.
- **DNS:** if Node cannot resolve `mongodb+srv` records (`querySrv ECONNREFUSED`), set `DNS_SERVERS`.

The frontend reads only `VITE_API_URL`.

## Deploy

- **API and worker on Render:** `render.yaml` defines a web service (health check `/api/health`) and a background worker. Set the `sync: false` secrets in the Render dashboard.
- **Frontend on Vercel:** set the project root to `frontend/`. `vercel.json` builds the workspace and rewrites routes to `index.html`. Set `VITE_API_URL` to the Render API URL, and set the API's `FRONTEND_URL` to the Vercel URL for CORS.
- **Atlas:** use the same cluster. Allow Render's outbound IPs under Network Access (see `docs/ATLAS_SETUP.md`).

## Security notes

- The API trusts exactly one proxy hop (Render). Rate limits use the client IP the proxy appends; client-supplied `X-Forwarded-For` entries can't bypass them.
- Paid providers have process-wide per-minute budgets (LLM 30, TTS 20, embedding calls 240) on top of the per-route limits, because demo auth gives anyone a token.
- Memory text goes into prompts XML-escaped inside `<memory>` blocks, and the system prompt marks it as data, never instructions.
- `render.yaml` ships `DEMO_MODE=false`. Set it to `true` only for a live demo: it exposes the worker-crash endpoint to every demo user.
- Provider error bodies stay in server logs; clients get a status code and a fixed reason.

## Known limitations

- Demo auth only: one seeded user per org, a JWT with no password.
- The Atlas cluster tier cannot be read by the driver. Set `ATLAS_TIER` so `setup:indexes` enforces search-index limits.
- Playbook steps are deterministic (no LLM) so they are idempotent. Q&A answers use the LLM.
- Without `LLM_API_KEY`, answers are labelled template answers. Without ElevenLabs, audio buttons are disabled with an explanation.
- Seed records can be edited or archived by any demo user; `npm run demo:reset -w backend` restores them.
- Dev-only advisories remain in Tailwind CSS 3's file watcher (`braces` / `micromatch`); fixing them needs a Tailwind 4 migration. Production dependencies audit clean.
- More details are in `PROGRESS.md`.
