# shared: API contract (Zod schemas and types)

This is the single definition of every request and response that crosses the API. It's used in two places:
- **backend:** Fastify validates request bodies and serializes responses with these Zod schemas (through `fastify-type-provider-zod`). They also generate the OpenAPI spec at `/docs`.
- **frontend:** imports the inferred TypeScript types, so a shape change fails `npm run typecheck` on both sides instead of at runtime.

There's no runtime logic here beyond the schemas themselves.

## Build

The backend and frontend import the compiled output (`dist/`), so rebuild after editing:

```bash
npm run build -w shared         # also run automatically by the root typecheck, test and build scripts
```

## Contents

| File | Defines |
|---|---|
| `common.ts` | `IdSchema` (24-hex ObjectId string), ISO dates, the error envelope `{ error: { code, message } }`, pagination helpers |
| `auth.ts` | Demo login response, session |
| `agent.ts` | Agent, agent with stats, create/update agent |
| `memory.ts` | Memory (types: episodic, semantic, procedural, taxonomic; verification status; embedding status), create/update, list query |
| `search.ts` | Search modes, engines (`atlas_search`, `atlas_vector_search`, `rrf`, `fallback_regex`, `unavailable`), request, result with explanation and RRF/outcome-policy fields, retrieval logs, searchability |
| `tasks.ts` | Grounded answer request/response, playbook tasks, checkpoints, outcome request/response |
| `events.ts` | Activity log events |
| `insights.ts` | Overview and Learning page payloads |
| `integrations.ts` | Live integration status |
| `health.ts` | Health and readiness |
| `benchmark.ts` | Benchmark configurations, metrics, per-question results, runs, the labelled set |

## Conventions

- **Ids** are strings (`IdSchema`), and **dates** are ISO 8601 UTC strings. The backend converts ObjectIds and Dates in `lib/serialize.ts`.
- **Types** are exported next to each schema: `export type Memory = z.infer<typeof MemorySchema>`. Request types use `z.input` where defaults apply.
- **New optional response fields** should be `.optional()` or have a `.default()`, so older stored documents still serialize.
- **Exports:** export every new schema file from `src/index.ts`.
