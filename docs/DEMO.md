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

## If something goes wrong

| Symptom | Fix |
|---|---|
| Header pill red on MongoDB | Add your IP under Atlas → Network Access. If you see `querySrv ECONNREFUSED`, set `DNS_SERVERS`. |
| Keyword panel says "Fallback — not Atlas Search" | The `memories_search` index isn't queryable. Run `npm run setup:indexes -w backend`. |
| Semantic panel says "unavailable" | Check `VOYAGE_API_KEY` and `VOYAGE_BASE_URL`, then run `embed:backfill`. |
| Task stays queued | No worker is running. The task page says so; start `npm run worker:supervised -w backend`. |
| Want a clean slate | `npm run demo:reset -w backend` |
