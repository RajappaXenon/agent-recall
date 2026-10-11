# How Agent Recall ranks memories

Three retrieval modes run against the same `memories` collection. All three always filter by the caller's `orgId` and `archived: false`, and every search writes a `retrieval_logs` entry.

## Keyword: Atlas Search
`$search` on the `memories_search` index with a `compound.should` over:

| Clause | Why |
|---|---|
| `title` (boost ×3) | Titles are short and specific |
| `content` (`lucene.english`) | Stemmed full-text match |
| `content` via `multi: "exact"` (`lucene.whitespace`) | Keeps identifiers like `maxPoolSize=10` or `ECONNRESET` intact |
| `tags` | Curated labels |

Score: Atlas `searchScore` (BM25). The explanation lists which fields and terms matched, read from `scoreDetails`.

## Semantic: Atlas Vector Search
The query is embedded with Voyage AI (`input_type: "query"`), then `$vectorSearch` runs on `memories_vector` (`numCandidates` 200). Score: Atlas `vectorSearchScore` (cosine, normalised by Atlas to 0–1). The explanation shows which query terms do and don't appear literally in the memory, computed rather than guessed.

## Hybrid: Reciprocal Rank Fusion
Keyword and semantic each return their top 20 in parallel. Results are deduplicated by memory id and fused in application code:

```
rrf(d) = Σ over modes m that returned d of  1 / (60 + rank_m(d))      (rank starts at 1)
```

Only ranks are fused. Raw BM25 and cosine scores live on different scales and are **never added together**; they're kept per source in `sources` for display. A memory found by both modes outranks one found by a single mode at a similar rank. That difference is what the Retrieval Trace in the Search Playground draws.

## Outcome policy
Verified outcomes adjust the fused score:

```
final = rrf × (1 + 0.15 · s)
s = +1  verification.status = verified_success
s = −1  verification.status = verified_failure
s =  0  otherwise
```

- Only an explicit recorded outcome (`POST /api/tasks/:id/outcome`) can change `verification.status`. Nothing is inferred.
- A procedure that once worked is not flipped to `verified_failure` by a later failure; the failure is recorded in `outcomeIds` instead.
- The response returns `rrf`, `policyMultiplier`, `final` and `rankBeforePolicy`, so the effect is always visible.
- `applyOutcomePolicy` (default `true`) can be switched off in the Playground to compare the two orderings.
- 0.15 is a deliberately small weight: at most about one or two positions for adjacent results, never enough to lift an irrelevant memory over a relevant one.

"Learning" here means updating persisted memories and these ranking signals. No model weights change.

## Fallbacks (always labelled)
| Situation | Behaviour |
|---|---|
| `memories_search` missing or not queryable | Keyword returns `engine: "fallback_regex"` with the warning "Fallback — not Atlas Search", and the UI shows a warning pill |
| Voyage key missing, embedding fails, or `memories_vector` not queryable | Semantic returns `engine: "unavailable"` with the reason |
| Semantic unavailable during hybrid | Hybrid fuses keyword only and says "Hybrid degraded to keyword-only" |
