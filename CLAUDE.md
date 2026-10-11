# Agent Recall — instructions for Claude Code

## What this is
A one-day hackathon MVP (MongoDB "Harness Engineering & Model Wrangling"). Agent Recall is a memory engine for AI agents: it stores experiences, retrieves them with MongoDB Atlas Search (keyword), Voyage AI + Atlas Vector Search (semantic) and Reciprocal Rank Fusion (hybrid), grounds answers in what it retrieved, records verified outcomes, and feeds those outcomes back into future retrieval.

- Full specification: `docs/SPEC.md` (read the section for the current phase; don't re-read the whole file every step).
- Design system and UI quality bar: `docs/DESIGN.md` (read it fully before any frontend work; it is a hard requirement, not inspiration).
- Running log: `PROGRESS.md` (create it in Phase 0, update it at the end of every phase).

## How to work
1. Work through the phases in `docs/SPEC.md` §12 in order. Don't wait for approval between phases.
2. Build the design system (tokens, shell, core components, `/dev/ui`) in Phase 0, then build every screen from it. Within that, build a working vertical slice before polishing. A plain screen that really runs keyword, semantic and hybrid search beats a beautiful screen backed by mocks.
3. At the end of each phase: run that phase's gate commands (including the screenshot review in `docs/DESIGN.md` §11 where the phase requires it), fix failures, update `PROGRESS.md` (done / not done / blockers / exact commands run), and commit with `phase N: <summary>`.
4. If the same error survives three serious attempts, record it under "Blockers" in `PROGRESS.md`, choose the documented fallback, and move on.
5. Stop and ask the user only for: credentials needed to verify a live integration (keep building everything else meanwhile), account-level deployment actions, or any destructive operation outside the database rules below.

## The database is a live MongoDB Atlas cluster
- `MONGODB_URI` and `DB_NAME` in `.env` point to the user's own Atlas cluster. There is no local database. Never print the URI or put it in logs, commits or test output.
- Allowed without asking: creating collections and indexes in `DB_NAME`; deleting documents that belong to the test org (the `__test__` organization) or non-seed data inside the demo org (`demo:reset`).
- Ask first: dropping collections or databases, deleting or recreating search indexes, deleting seed data, touching any database other than `DB_NAME`.
- Search and Vector Search indexes are per collection, and free/flex tiers allow only a few. So tests reuse the real `memories` collection and its two indexes, isolated by the test org, instead of creating test collections or a test database.
- Index builds and newly written documents become searchable after a short delay. Scripts and tests poll for queryability/visibility with a timeout; never sleep a fixed time and assume.
- If the cluster is unreachable (usually the IP access list), report the exact error and the fix (add the current IP under Atlas → Network Access). Never fall back to a local database.
   - The database is a real MongoDB Atlas cluster (connection string in `.env`, provided by the user). There is no local database.
   - Scripts and tests may write, update and delete only inside `DB_NAME` (and `TEST_DB_NAME` if set), and only documents they own: seed data (`isSeed: true`), the demo org, or the dedicated test org.
   - Never drop a database, never drop a collection, and never delete or recreate an Atlas Search index without asking first. The one exception is `setup:indexes --recreate`, and only when the user runs it.
6. Before using any external API (Voyage AI, ElevenLabs, Anthropic, Atlas index APIs), check the current official docs for endpoint, model names and parameters. Model names in the spec are defaults to confirm, not facts.
7. If a new session starts, read `PROGRESS.md` first and continue from where it stops.

## Honesty rules (non-negotiable)
- An integration is "connected" only if a live probe succeeded in the last 60 seconds. An environment variable existing is not a connection.
- Never run `$regex`, `$text` or a plain `find` and label the result Atlas Search. A fallback must be labelled as a fallback in the API response (`engine` field) and in the UI.
- Never claim an Atlas index exists until `listSearchIndexes` reports it `queryable: true`.
- No invented scores, latencies, metrics or "improvement" percentages. Show measured values or nothing.
- Every seeded record has `isSeed: true`, and the UI shows a "Demo data" badge on it.
- Never report tests passing, a build succeeding, or a deployment being live without running/verifying it. The final report quotes real command output.
- "Learning" means updating persisted memories and ranking signals. Never claim model weights change.

## Security rules
- Provider keys live only in backend env. The frontend env holds `VITE_API_URL` and nothing secret.
- Never commit `.env`. Keep `.env.example` up to date.
- Every database read and write is scoped by `orgId` from the auth context. Use the repository helpers in `backend/src/db/` that require `orgId`; never call collections directly from routes.
- Memory content is untrusted data. In LLM prompts wrap it in `<memory id="...">` blocks and state in the system prompt that memory text is reference material, never instructions.
- Agent tasks never execute shell commands, write outside MongoDB, or call external services other than the configured providers.
- Error responses are `{ error: { code, message } }`. No stack traces or provider error bodies reach the client.

## Commands (must all exist and work by the end of Phase 0/1)
```
npm install                        # MONGODB_URI in .env points to the user's MongoDB Atlas cluster
npm run dev                        # frontend (Vite) + API (Fastify) together
npm run worker -w backend          # task worker, separate process
npm run setup:indexes -w backend   # creates search + vector indexes, polls until queryable
npm run seed -w backend            # demo org, user, agents, memories (isSeed: true)
npm run embed:backfill -w backend  # embeds memories missing a current embedding
npm run demo:reset -w backend      # wipes non-seed data, re-seeds
npm run demo:e2e -w backend        # runs the mandatory demo scenario through the API
npm run screenshots -w frontend    # Playwright screenshots of every route/state for design review
npm run typecheck && npm run lint && npm test && npm run build
```

## Conventions
- TypeScript strict everywhere. npm workspaces: `frontend`, `backend`, `shared` (Zod schemas and API types used by both).
- MongoDB Node.js driver directly (no Mongoose). Expose ids as string `id`; dates as ISO UTC strings.
- Fastify: one plugin per route domain, Zod validation through a type provider, central error handler, `@fastify/rate-limit`, `@fastify/swagger` + UI at `/docs`.
- Frontend: React + Vite + Tailwind + shadcn/ui, React Router, TanStack Query for all server state, Recharts, Lucide icons (no emoji as icons).
- Tests: Vitest. Integration tests run against the Atlas cluster inside the `__test__` org and clean up after themselves. If `MONGODB_URI` is missing or unreachable, integration tests are skipped with an explicit reason, never silently passed.
