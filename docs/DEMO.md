# Demo script (about 6 minutes)

This is a click-by-click walkthrough of the demo story in SPEC §0. Every number you see on screen is live. Don't quote expected values from this script; read them off the screen.

## Before you go on stage

1. Reset the demo data and warm up the caches:
   ```bash
   npm run demo:reset -w backend
   npm run dev
   npm run worker:supervised -w backend      # second terminal; keep it visible for the crash moment
   ```
   The crash button needs `DEMO_MODE=true` in `.env` (on a deployed instance it is `false` by default).
2. Open http://localhost:5173 in a 1440-wide window. Check the header pill: it should show MongoDB, Atlas Search, Atlas Vector Search and Voyage as connected. If a pill is yellow or red, open **Settings & Integrations** and click **Refresh**.
3. Optional: run the search once off-screen so the first query embedding is cached.

## 1. The problem (20 s)

- Open **Search Playground**. The query is prefilled: *"Our API started timing out after a database connection pool change. How did we resolve a similar issue before?"*
- Say: an Engineering Assistant agent has hit a problem it has seen before. Can it remember?

## 2. Retrieve: keyword, semantic, hybrid (90 s)

- Click **Run all** (or press Enter). Three columns fill top-down and the Retrieval Trace lines draw in.
- Point at each panel header: the engine pill (`atlas_search`, `vector_search`, `rrf`) and the measured latency.
- Point out how the columns differ:
  - **Keyword** ranks the literal match first. It also pulls in "DNS resolution timeouts", which shares words but not meaning.
  - **Semantic** finds "Billing service hung under load after a driver config tweak", which shares no keywords with the query.
- Hover the top **Hybrid** row ("Fix connection pool exhaustion…"). Its lines light up to its keyword and semantic ranks, and everything else dims. Say: a memory found by both modes wins, and stroke width is that mode's RRF contribution.
- Click the row. **Why this result** shows the keyword rank and score, the semantic rank and score, the RRF value, the outcome policy multiplier (×1.15, verified) and the final score.
- Toggle **Outcome policy** off and on. The hybrid rows animate between orderings. Say: verified outcomes move results, and here is exactly how much.

## 3. Grounded answer (40 s)

- Tick the checkboxes on the verified fix procedure and the "Resolved: checkout timeouts…" memory in the Hybrid column. Click **Use in agent task**.
- The answer appears with numbered citation chips. Hover a chip: the memory highlights in the evidence list and in the result columns.
- With `LLM_API_KEY` set, the answer comes from Claude. Without it, a yellow badge says **Template answer (LLM not configured)**.
- Optional: click **Listen** (needs ElevenLabs; otherwise the tooltip explains why it's disabled).

## 4–5. Record that it worked; the loop closes (40 s)

- Under **Did this work?** click **Worked** and **Helpful**, type a note ("Raised maxPoolSize to 80, closed cursors"), then click **Record outcome**.
- The summary shows the cited procedure's verification and the **New memory** card ("Resolved: …"). Its status goes from **Indexing…** to **Searchable** once Atlas has indexed it, usually 1–2 s.

## 6. Search again (30 s)

- Click **Search again**. The new episodic memory now appears in the results. Click it to show its provenance (outcome, cited memories, source task).
- Optional: open **Learning & Insights** to see the outcome in "Outcomes over time" and the procedure's evidence list.

## 7. Crash recovery (90 s)

- Open **Agents** → **Engineering Assistant** → **Run playbook**. You land on the task page.
- Wait for 2 checkpoints. Each step shows its time, worker id and attempt.
- Click **Crash worker**. After the current step commits, the worker calls `process.exit(1)` for real. Point at the worker terminal: `crash requested: exiting with code 1` and then `[supervisor] … starting a new worker process`.
- On screen, the lease counts down. The new worker can't claim the task until the dead worker's lease expires (15 s).
- When the lease expires, the timeline shows **"Worker crashed — resumed from step N by worker-xxxx"**. Completed steps are restored from checkpoints and not re-executed. The task completes on attempt 2.
- Optional proof: `npx vitest run test/recovery.e2e.test.ts` (in `backend/`) SIGKILLs a real worker process and asserts that steps 1–2 ran exactly once.

## 8. Wrap (20 s)

- **Overview** shows every number computed from Atlas, with "Demo + live" badges once live data exists.
- **Activity Log** shows the whole story as an audit trail: searches, the answer, the outcome, verification, the crash and the resume.

## More scenarios (swap one in for variety)

The seed has 12 more incident stories beyond the pool timeout. Each has an incident and a fix procedure; most also have a root cause, a verified outcome and a resolution, and two have an attempt that failed. A fourth agent, **Support Agent**, owns the customer-reported ones.

Every question below is worded differently from its memories. All were run through hybrid search on 2026-10-11, and the incident or its fix came back at rank 1.

| Kind of issue | Ask this (Search Playground, Run all) | What comes back first |
|---|---|---|
| Streaming / Kafka | *Our event stream consumers keep getting kicked out of the group and the backlog explodes. How did we fix that?* | Kafka rebalance resolution, incident and fix procedure (verified) |
| Kubernetes memory | *Containers restart with exit code 137 even though the heap snapshot looks small* | Native-memory OOMKilled fix (verified), then the incident |
| TLS / expiry | *Partners cannot connect, they say our HTTPS cert is no longer valid* | Certificate resolution, the 47-minute outage, the renewal runbook |
| Payments / duplicates | *A shopper paid once but the card shows two charges* | Idempotent webhook fix (verified) and the double-charge incident |
| API rate limiting | *One corporate customer gets too many requests errors for every employee* | The HTTP 429 / shared-NAT incident, then "rate limit by API key" |
| MongoDB transactions | *Stock reservation calls error out under heavy concurrent sales on Mongo transactions* | WriteConflict flash-sale incident and the withTransaction runbook |
| Frontend compatibility | *After the latest deploy iPhone users on old iOS just see an empty screen* | Safari 15 blank checkout (regex lookbehind) |
| Flaky CI | *Tests only fail one weekend in spring and pass on retry* | Daylight-saving billing tests and the fake-clock procedure |
| Security | *Someone committed an AWS secret to GitHub, what do we do right now?* | Leaked-key incident and the credential response runbook |
| Cloud cost | *Why did our CDN bandwidth bill jump so much this month?* | Egress bill tripled after cache busting, then the CDN cache procedure |
| Scheduling | *Nightly job sends every customer two copies of the same email* | Duplicate invoice emails and "run a job exactly once" |

**Learning from a failed attempt.** Ask *"Pods keep crashing out of memory, should we just raise the memory limit?"* With the outcome policy off, "Raise the memory limit when pods are OOMKilled" ranks near the top. With it on, that procedure was verified as a **failure** on a very similar question, so it drops. The verified native-memory fix moves to #1, and "Why this result" quotes the earlier question and its similarity. *"Lag on our Kafka topic is huge, would more partitions help?"* behaves the same way.

To show a fix that worked, ask an answer task and record **Worked**. The same question asked again then ranks that fix higher, and other kinds of questions are unaffected.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Header pill red on MongoDB | Add your IP under Atlas → Network Access. If you see `querySrv ECONNREFUSED`, set `DNS_SERVERS`. |
| Keyword panel says "Fallback — not Atlas Search" | The `memories_search` index isn't queryable. Run `npm run setup:indexes -w backend`. |
| Semantic panel says "unavailable" | Check `VOYAGE_API_KEY` and `VOYAGE_BASE_URL`, then run `embed:backfill`. |
| Task stays queued | No worker is running. The task page says so; start `npm run worker:supervised -w backend`. |
| Want a clean slate | `npm run demo:reset -w backend` |
