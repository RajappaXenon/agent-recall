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
| **Learning loop** | "Did this work?" records an outcome. A successful outcome verifies the cited procedure, the outcome becomes a new episodic memory, and the outcome policy `final = rrf × (1 + 0.15·s)` ranks verified procedures higher. No model weights change. |
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
```

```
shared/    Zod schemas + API types used by both sides
backend/   src/server.ts  src/worker.ts  src/config.ts
           src/db/        client, collections, orgId-scoped repositories, indexes, search indexes
           src/services/  embeddings, search, rrf, llm, answers, outcomes, playbook, insights, tts, integrations
           src/routes/    one Fastify plugin per domain
           src/scripts/   setup-indexes, seed, embed-backfill, demo-reset, demo-e2e, worker-supervised
           test/          unit, RRF, search/outcome integration, recovery e2e (real worker processes)
frontend/  src/app (shell, router)  src/pages  src/components  src/lib
           scripts/screenshots.mjs (Playwright design QA)
docs/      SPEC.md  DESIGN.md  RANKING.md  DEMO.md  ATLAS_SETUP.md
```

Every database read and write goes through repositories that require `orgId`. Integration tests run inside a dedicated `__test__` organization in the same collections, because search indexes are per collection.

## Run it locally

Requirements: Node 20 or later and a MongoDB Atlas cluster. Voyage, Anthropic and ElevenLabs keys are optional, but semantic search needs Voyage.

```bash
npm install
cp .env.example .env            # fill MONGODB_URI, DB_NAME, VOYAGE_API_KEY (+ LLM_API_KEY, ELEVENLABS_* optional)
npm run setup:indexes -w backend    # creates search + vector indexes, waits until queryable
npm run seed -w backend             # demo org, 3 agents, 26 memories, 2 seeded outcomes (isSeed: true)
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
| `npm run screenshots -w frontend` | Playwright screenshots of every route and state at 1440, 1024 and 390 px |
| `npm run typecheck && npm run lint && npm test && npm run build` | The full check |

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
