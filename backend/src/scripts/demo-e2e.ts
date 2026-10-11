/**
 * npm run demo:e2e -w backend
 *
 * Runs the demo story (SPEC §0 steps 1–6) through the HTTP API (Fastify inject:
 * same routes, auth, validation and error handling as the live server) against
 * the Atlas cluster, and prints each step's real result. Writes non-seed data into
 * the demo org; `npm run demo:reset -w backend` removes it.
 */
import type { AgentWithStats, AnswerResponse, Memory, OutcomeResponse, SearchResponse, SearchableResponse } from '@agent-recall/shared';
import { buildApp } from '../app.js';
import { ensureRegularIndexes } from '../db/indexes.js';
import { pollUntil, runScript } from './_util.js';

const QUERY = 'Our API started timing out after a database connection pool change. How did we resolve a similar issue before?';
const line = (s = '') => console.log(s);
const h = (n: number, title: string) => line(`\n── Step ${n}: ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);

runScript('demo:e2e', async () => {
  await ensureRegularIndexes();
  const app = await buildApp({ logger: false });
  let token = '';
  const call = async <T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> => {
    const res = await app.inject({ method, url, payload: body as object | undefined, headers: token ? { authorization: `Bearer ${token}` } : {} });
    const json = res.json() as T & { error?: { code: string; message: string } };
    if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${json.error?.code}: ${json.error?.message}`);
    return json;
  };

  try {
    // Sign in (demo auth) and pick the Engineering Assistant.
    const login = await call<{ token: string; org: { name: string } }>('POST', '/api/auth/demo-login');
    token = login.token;
    const { items: agents } = await call<{ items: AgentWithStats[] }>('GET', '/api/agents');
    const agent = agents.find((a) => a.name === 'Engineering Assistant');
    if (!agent) throw new Error('Engineering Assistant not found. Run npm run seed -w backend first.');
    line(`Signed in to ${login.org.name} (demo auth) · agent: ${agent.name} (${agent.stats.memoryCount} memories)`);

    h(1, 'The agent hits a problem');
    line(`Query: "${QUERY}"`);

    h(2, 'Retrieve past experience: keyword, semantic, hybrid');
    const show = (r: SearchResponse, n = 5) => {
      line(`  ${r.mode.padEnd(8)} engine=${r.engine} total=${r.latencyMs.total} ms${r.warnings.length ? ` warnings=${JSON.stringify(r.warnings)}` : ''}`);
      for (const x of r.results.slice(0, n)) {
        const src = x.sources.map((s) => `${s.mode[0]!.toUpperCase()}${s.rank}`).join('·');
        line(`    ${String(x.rank).padStart(2)}. ${x.memory.title.slice(0, 64).padEnd(64)} ${x.scoreKind} ${x.score.toFixed(4)} [${src}] ${x.memory.verification.status}`);
      }
    };
    const keyword = await call<SearchResponse>('POST', '/api/search/keyword', { query: QUERY, limit: 5 });
    show(keyword);
    const semantic = await call<SearchResponse>('POST', '/api/search/semantic', { query: QUERY, limit: 5 });
    show(semantic);
    const before = await call<SearchResponse>('POST', '/api/search/hybrid', { query: QUERY, limit: 10 });
    show(before);
    const why = before.results[0]!;
    line(`  why #1: ${why.explanation.summary}`);

    h(3, 'Draft a recommendation grounded in selected memories');
    // Select the top hybrid results that are the incident story: verified procedure + episodic incident/root cause.
    const selected = before.results
      .filter((r) => /pool/i.test(r.memory.title) && r.memory.verification.status !== 'verified_failure')
      .slice(0, 3)
      .map((r) => r.memory);
    line(`  selected: ${selected.map((m) => `"${m.title}" (${m.type}, ${m.verification.status})`).join('; ')}`);
    const answer = await call<AnswerResponse>('POST', '/api/answers', { agentId: agent.id, query: QUERY, memoryIds: selected.map((m) => m.id) });
    line(`  task ${answer.taskId} · mode=${answer.mode} · model=${answer.model} · ${answer.latencyMs} ms`);
    line(`  citations: ${answer.citations.length} → ${answer.citations.map((c) => selected.find((m) => m.id === c)?.title ?? c).join('; ')}`);
    line('  answer:');
    for (const l of answer.answer.split('\n')) line(`    ${l}`);

    h(4, 'The user records that it worked');
    const outcome = await call<OutcomeResponse>('POST', `/api/tasks/${answer.taskId}/outcome`, {
      result: 'worked',
      feedback: 'helpful',
      notes: 'Raised maxPoolSize to 80, closed export cursors; p99 back under 200 ms.',
    });
    line(`  outcome ${outcome.outcomeId} · result=${outcome.result} · usefulness updated on ${outcome.usefulnessUpdated.length} memories`);

    h(5, 'The outcome becomes a memory; the cited procedure is verified');
    const created: Memory = outcome.createdMemory;
    line(`  new memory ${created.id}: "${created.title}"`);
    line(`    type=${created.type} provenance=${created.provenance.kind} sourceTask=${created.sourceTaskId} embedding=${created.embeddingStatus}`);
    for (const c of outcome.verificationChanges) line(`  verification: "${c.title}" ${c.from} → ${c.to} (${c.note})`);
    if (outcome.verificationChanges.length === 0) line('  verification: no procedural memory was cited, so nothing was verified');
    const started = Date.now();
    const state = await pollUntil(
      async () => {
        const s = await call<SearchableResponse>('GET', `/api/memories/${created.id}/searchable`);
        return s.searchable ? s : null;
      },
      { timeoutMs: 120_000, intervalMs: 1000, label: 'the new memory to become searchable' },
    );
    line(`  searchable after ${((Date.now() - started) / 1000).toFixed(1)} s (keyword=${state.keyword}, vector=${state.vector})`);

    h(6, 'Search again: the new memory and outcome-aware ranking');
    const after = await call<SearchResponse>('POST', '/api/search/hybrid', { query: QUERY, limit: 10 });
    show(after, 10);
    const newRank = after.results.find((r) => r.memory.id === created.id);
    line(`  new outcome memory: ${newRank ? `hybrid rank ${newRank.rank} (${newRank.sources.map((s) => `${s.mode} #${s.rank}`).join(', ')}, policy ×${newRank.policyMultiplier?.toFixed(2)})` : 'not in the top 10'}`);
    for (const c of outcome.verificationChanges) {
      const b = before.results.find((r) => r.memory.id === c.memoryId);
      const a = after.results.find((r) => r.memory.id === c.memoryId);
      line(`  "${c.title}": rank ${b?.rank ?? '—'} → ${a?.rank ?? '—'} (final ${b?.final?.toFixed(4) ?? '—'} → ${a?.final?.toFixed(4) ?? '—'})`);
    }
    const off = await call<SearchResponse>('POST', '/api/search/hybrid', { query: QUERY, limit: 10, applyOutcomePolicy: false });
    const moved = after.results.filter((r) => {
      const o = off.results.find((x) => x.memory.id === r.memory.id);
      return o && o.rank !== r.rank;
    });
    line(`  outcome policy on vs off: ${moved.length} of ${after.results.length} results change position`);
    for (const r of moved.slice(0, 5)) {
      const o = off.results.find((x) => x.memory.id === r.memory.id)!;
      line(`    "${r.memory.title.slice(0, 60)}" ${o.rank} → ${r.rank} (×${r.policyMultiplier?.toFixed(2)})`);
    }
  } finally {
    await app.close();
  }
});
