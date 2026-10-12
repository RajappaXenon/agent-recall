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

## Outcome policy (contextual)
Verified outcomes adjust the fused score, but only for questions like the one the outcome was recorded on:

```
final   = rrf × (1 + 0.15 · s · context)
s       = +1 verified_success, −1 verified_failure, 0 otherwise
context = clamp((cos(query, closest outcome question) − 0.61) / (0.71 − 0.61), 0, 1)
```

- **The outcome question.** When an outcome is recorded, the question it answered (the task goal) is embedded with Voyage (`input_type: "query"`) and stored on the outcome. `seed` and `embed:backfill` embed older outcomes.
- **The match.** At search time the query embedding (already computed for semantic search) is compared with the outcome questions behind each verified memory. Only outcomes that match the status count: worked outcomes for `verified_success`, failed ones for `verified_failure`. The closest one sets the context.
- **Thresholds.** 0.61 and 0.71 come from `npm run calibrate -w backend`, which uses 24 question pairs in `src/eval/calibration-pairs.ts`. These pairs are unrelated to the seed data and the benchmark. The rule was fixed before measuring:
  - low = the highest cosine of a different-problem pair (0.607);
  - high = the median cosine of a same-problem pair (0.706).

  The two groups did not overlap: the lowest same-problem pair scored 0.628. Rerun the calibration if the embedding model changes.
- **No match, no signal.** If the semantic component didn't run, there is no query embedding, so no outcome signal is applied and the response says so. A verified memory whose outcome question isn't embedded gets no adjustment either.
- **Explanations.** Each hybrid result explains the decision ("verified success on a similar question: closest outcome question …, similarity 0.95, weight 1.00" or "recorded on a different question"). It also returns `policyContext`, `rrf`, `policyMultiplier`, `final` and `rankBeforePolicy`.
- **Verification rules.** Only an explicit recorded outcome (`POST /api/tasks/:id/outcome`) can change `verification.status`. A procedure that once worked is not flipped by a later failure; the failure is kept in `outcomeIds`.
- **Comparison.** `applyOutcomePolicy` (default `true`) can be switched off in the Playground to compare orderings.

### Why it changed (measured)
The first policy was global: `final = rrf × (1 + 0.15·s)` for every query. The retrieval benchmark showed that ×1.15 is large compared with RRF, where adjacent ranks differ by about 1.6%. A verified procedure therefore jumped above the right answer even for unrelated questions.

Ten held-out questions were committed (`528dd1d`) before the contextual policy was written. They were not used to choose its thresholds. Hybrid nDCG@5 on the seed benchmark (34 questions):

| | no outcome signals | global ×1.15 | contextual |
|---|---|---|---|
| Dev (24) | 0.852 | 0.702 | 0.829 |
| Held-out (10) | 0.913 | 0.689 | 0.885 |
| Questions whose first direct answer moved | | 21 | 3 |

- **What improved:** the contextual policy removes almost all of the collateral damage.
- **What it does not do:** it does not beat plain hybrid on this benchmark. The remaining loss is the "should we scale out?" questions (one dev, one held-out). There, the recorded *failure* of scaling out is exactly what the asker needs, and the penalty for a verified failure pushes it down. Changing how failures are treated is a separate decision. It would have to be checked on new held-out questions, because these have now been seen.

"Learning" here means updating persisted memories and these ranking signals. No model weights change.

## Fallbacks (always labelled)
| Situation | Behaviour |
|---|---|
| `memories_search` missing or not queryable | Keyword returns `engine: "fallback_regex"` with the warning "Fallback — not Atlas Search", and the UI shows a warning pill |
| Voyage key missing, embedding fails, or `memories_vector` not queryable | Semantic returns `engine: "unavailable"` with the reason |
| Semantic unavailable during hybrid | Hybrid fuses keyword only and says "Hybrid degraded to keyword-only" |
