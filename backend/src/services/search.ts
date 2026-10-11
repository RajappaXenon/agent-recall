import { MongoServerError, type Document, type ObjectId } from 'mongodb';
import type {
  Engine,
  Explanation,
  HighlightFragment,
  SearchFilters,
  SearchMode,
  SearchResponse,
  SearchResponseBase,
  SearchResult,
  VerificationStatus,
} from '@agent-recall/shared';
import { config } from '../config.js';
import {
  atlasKeywordSearch,
  atlasVectorSearch,
  memoriesRepo,
  regexFallbackSearch,
  retrievalLogsRepo,
  toObjectId,
  type SearchHit,
} from '../db/repositories/index.js';
import { listMemorySearchIndexes, SEARCH_INDEX_NAME, VECTOR_INDEX_NAME } from '../db/search-indexes.js';
import { toMemory } from '../lib/serialize.js';
import { embedQuery, isVoyageConfigured } from './embeddings.js';
import { logEvent, type Actor } from './events.js';
import { applyOutcomePolicy, POLICY_WEIGHT, reciprocalRankFusion, type RankedList } from './rrf.js';

export interface SearchOptions {
  query: string;
  filters: SearchFilters;
  limit: number;
  applyOutcomePolicy: boolean;
  /** DEMO_MODE only: force the keyword index to be treated as unavailable (labelled in warnings). */
  forceKeywordFallback?: boolean;
  /** Worker steps: makes the retrieval log / retrievalCount side effects idempotent. */
  idempotencyKey?: string;
  /** Tests only: query a different index name to exercise the missing-index path without touching real indexes. */
  indexNames?: { search?: string; vector?: string };
}

const COMPONENT_LIMIT = 20;
const now = () => performance.now();
const ms = (start: number) => Math.round((performance.now() - start) * 10) / 10;

// ── Index availability (cached 30 s; Atlas returns empty results for a missing index, so we must check) ──
let indexCache: { at: number; search: boolean; vector: boolean; vectorStatus: string } | null = null;
export async function indexAvailability(force = false) {
  if (!force && indexCache && Date.now() - indexCache.at < 30_000) return indexCache;
  let list: Awaited<ReturnType<typeof listMemorySearchIndexes>>;
  try {
    list = await listMemorySearchIndexes();
  } catch (err) {
    // A transient listing error shouldn't turn every search into a 500: reuse the last known state.
    if (indexCache) return indexCache;
    throw err;
  }
  const s = list.find((i) => i.name === SEARCH_INDEX_NAME);
  const v = list.find((i) => i.name === VECTOR_INDEX_NAME);
  indexCache = { at: Date.now(), search: Boolean(s?.queryable), vector: Boolean(v?.queryable), vectorStatus: v ? v.status : 'missing' };
  return indexCache;
}

// ── Query terms (for explanations and the regex fallback) ──
const STOP = new Set(
  'a an and are as at be before by did do does for from had has have how i in is it its of on or our so that the their them then there these this to was we were what when where which who why will with you your after similar issue resolve resolved started'.split(
    ' ',
  ),
);
export function queryTerms(q: string): string[] {
  const raw = q.toLowerCase().match(/[a-z0-9][a-z0-9_.=:-]*[a-z0-9]|[a-z0-9]/g) ?? [];
  return [...new Set(raw.filter((t) => t.length > 1 && !STOP.has(t)))];
}

// ── Filters ──
function searchFilters(f: SearchFilters): Document[] {
  const out: Document[] = [];
  if (f.agentId) out.push({ equals: { path: 'agentId', value: toObjectId(f.agentId, 'Agent') } });
  if (f.types?.length) out.push({ in: { path: 'type', value: f.types } });
  if (f.verification?.length) out.push({ in: { path: 'verification.status', value: f.verification } });
  if (f.tags?.length) out.push({ in: { path: 'tags', value: f.tags } });
  if (f.from || f.to) out.push({ range: { path: 'createdAt', ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } });
  return out;
}

function vectorFilter(f: SearchFilters): Document {
  const and: Document[] = [];
  if (f.agentId) and.push({ agentId: { $eq: toObjectId(f.agentId, 'Agent') } });
  if (f.types?.length) and.push({ type: { $in: f.types } });
  if (f.verification?.length) and.push({ 'verification.status': { $in: f.verification } });
  // tags/from/to are not vector filter fields; applied post-search (documented in the response warnings).
  return and.length ? { $and: and } : {};
}

function mongoFilter(f: SearchFilters): Document {
  const out: Document = {};
  if (f.agentId) out.agentId = toObjectId(f.agentId, 'Agent');
  if (f.types?.length) out.type = { $in: f.types };
  if (f.verification?.length) out['verification.status'] = { $in: f.verification };
  if (f.tags?.length) out.tags = { $in: f.tags };
  if (f.from || f.to) out.createdAt = { ...(f.from ? { $gte: new Date(f.from) } : {}), ...(f.to ? { $lte: new Date(f.to) } : {}) };
  return out;
}

// ── Explanations ──
const FIELD_LABEL: Record<string, string> = { title: 'title', content: 'content', tags: 'tags' };

/** Reads Atlas `scoreDetails` (Lucene explain tree) and lists which fields/terms matched. */
export function summarizeScoreDetails(details: Document | undefined): { fields: string[]; terms: string[] } {
  const fields = new Set<string>();
  const terms = new Set<string>();
  const walk = (node: Document | undefined) => {
    if (!node) return;
    const desc = String(node.description ?? '');
    // Atlas format: "weight($type:string/title:timeout in 7)"; multi fields carry "$multi/exact" in the path.
    for (const m of desc.matchAll(/weight\((?:\$type:\w+\/)?(\S+?):(\S+) in \d+\)/g)) {
      const rawField = m[1]!;
      const base = rawField.split('$')[0]!.split('/')[0]!;
      const exact = /exact/.test(rawField);
      fields.add(exact ? `${FIELD_LABEL[base] ?? base} (exact token)` : (FIELD_LABEL[base] ?? base));
      terms.add(m[2]!);
    }
    for (const child of (node.details ?? []) as Document[]) walk(child);
  };
  walk(details);
  return { fields: [...fields], terms: [...terms] };
}

function termPresence(query: string, doc: { title: string; content: string; tags: string[] }) {
  const text = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
  const terms = queryTerms(query);
  return { present: terms.filter((t) => text.includes(t)), absent: terms.filter((t) => !text.includes(t)) };
}

function toFragments(h: Document[] | undefined): HighlightFragment[][] | undefined {
  if (!h?.length) return undefined;
  return h
    .filter((x) => x.path === 'content' || (typeof x.path === 'object' && x.path?.value === 'content'))
    .map((x) => (x.texts as { value: string; type: string }[]).map((t) => ({ value: t.value, type: t.type === 'hit' ? ('hit' as const) : ('text' as const) })));
}

// ── Mode runners (no logging) ──
interface ModeRun extends Omit<SearchResponseBase, 'logId' | 'applyOutcomePolicy'> {
  hits: SearchHit[];
}

async function runKeyword(orgId: ObjectId, o: SearchOptions, limit: number): Promise<ModeRun> {
  const start = now();
  const warnings: string[] = [];
  const avail = await indexAvailability();
  const searchUsable = o.indexNames?.search ? true : avail.search;
  if (!searchUsable || o.forceKeywordFallback) {
    warnings.push(
      o.forceKeywordFallback
        ? 'Fallback — not Atlas Search. Forced by the demo fallback switch (DEMO_MODE); results come from a regex scan.'
        : `Fallback — not Atlas Search. Index ${SEARCH_INDEX_NAME} is missing or not queryable; results come from a regex scan. Run npm run setup:indexes -w backend.`,
    );
    const hits = await regexFallbackSearch(orgId, { terms: queryTerms(o.query), filter: mongoFilter(o.filters), limit });
    return { mode: 'keyword', engine: 'fallback_regex', hits, results: [], latencyMs: { keyword: ms(start), total: ms(start) }, warnings };
  }
  const should: Document[] = [
    { text: { query: o.query, path: 'title', score: { boost: { value: 3 } } } },
    { text: { query: o.query, path: 'content' } },
    { text: { query: o.query, path: { value: 'content', multi: 'exact' } } },
    { text: { query: o.query, path: 'tags' } },
  ];
  let hits = await atlasKeywordSearch(orgId, { should, filter: searchFilters(o.filters), limit, highlightPath: 'content', indexName: o.indexNames?.search });
  let engine: Engine = 'atlas_search';
  if (o.indexNames?.search && hits.length === 0) {
    // A non-existent index returns no results rather than an error: treat it as missing (test path).
    const list = await listMemorySearchIndexes();
    if (!list.some((i) => i.name === o.indexNames?.search && i.queryable)) {
      engine = 'fallback_regex';
      warnings.push(`Fallback — not Atlas Search. Index ${o.indexNames.search} is missing or not queryable; results come from a regex scan.`);
      hits = await regexFallbackSearch(orgId, { terms: queryTerms(o.query), filter: mongoFilter(o.filters), limit });
    }
  }
  return { mode: 'keyword', engine, hits, results: [], latencyMs: { keyword: ms(start), total: ms(start) }, warnings };
}

async function runSemantic(orgId: ObjectId, o: SearchOptions, limit: number): Promise<ModeRun & { embedCached?: boolean }> {
  const start = now();
  const warnings: string[] = [];
  const unavailable = (reason: string): ModeRun => ({
    mode: 'semantic',
    engine: 'unavailable',
    hits: [],
    results: [],
    latencyMs: { total: ms(start) },
    warnings: [reason],
  });
  if (!isVoyageConfigured()) return unavailable('Semantic search unavailable: VOYAGE_API_KEY is not set.');
  const avail = await indexAvailability();
  if (!o.indexNames?.vector && !avail.vector) {
    return unavailable(`Semantic search unavailable: vector index ${VECTOR_INDEX_NAME} is ${avail.vectorStatus === 'missing' ? 'missing' : `not queryable (${avail.vectorStatus})`}. Run npm run setup:indexes -w backend.`);
  }
  const embedStart = now();
  let vector: number[];
  let cached = false;
  try {
    const r = await embedQuery(o.query);
    vector = r.vector;
    cached = r.cached;
  } catch (err) {
    return unavailable(`Semantic search unavailable: query embedding failed (${(err as Error).message}).`);
  }
  const embedMs = ms(embedStart);
  const vecStart = now();
  // Tags and dates are not vector-index filter fields, so they are applied afterwards; over-fetch
  // in that case so a selective filter doesn't leave the result empty.
  const postFilter = Boolean(o.filters.tags?.length || o.filters.from || o.filters.to);
  let hits: SearchHit[];
  try {
    hits = await atlasVectorSearch(orgId, {
      queryVector: vector,
      filter: vectorFilter(o.filters),
      limit: postFilter ? 200 : Math.max(limit, COMPONENT_LIMIT),
      numCandidates: postFilter ? 1000 : 200,
      indexName: o.indexNames?.vector,
    });
  } catch (err) {
    return unavailable(`Semantic search unavailable: $vectorSearch failed (${(err as Error).message.slice(0, 160)}).`);
  }
  if (o.indexNames?.vector && hits.length === 0) {
    const list = await listMemorySearchIndexes();
    if (!list.some((i) => i.name === o.indexNames?.vector && i.queryable)) {
      return unavailable(`Semantic search unavailable: vector index ${o.indexNames.vector} is missing or not queryable.`);
    }
  }
  if (o.filters.tags?.length || o.filters.from || o.filters.to) {
    const tags = o.filters.tags;
    const from = o.filters.from ? new Date(o.filters.from) : null;
    const to = o.filters.to ? new Date(o.filters.to) : null;
    hits = hits.filter((h) => (!tags?.length || h.tags.some((t) => tags.includes(t))) && (!from || h.createdAt >= from) && (!to || h.createdAt <= to));
    warnings.push('Tag and date filters were applied after vector search (they are not vector index filter fields).');
  }
  hits = hits.slice(0, limit);
  return {
    mode: 'semantic',
    engine: 'atlas_vector_search',
    hits,
    results: [],
    latencyMs: { embed: embedMs, vector: ms(vecStart), total: ms(start) },
    warnings,
    embedCached: cached,
  };
}

// ── Result shaping ──
function keywordResults(run: ModeRun, query: string): SearchResult[] {
  return run.hits.map((h, i) => {
    const memory = toMemory(h);
    if (run.engine === 'fallback_regex') {
      const p = termPresence(query, h);
      return {
        memory,
        rank: i + 1,
        score: h._score,
        scoreKind: 'regex',
        sources: [{ mode: 'keyword', rank: i + 1, score: h._score }],
        explanation: {
          summary: `Regex fallback: ${p.present.length} of ${p.present.length + p.absent.length} query terms found. Not Atlas Search.`,
          details: [`Terms found: ${p.present.join(', ') || 'none'}`],
          queryTermsPresent: p.present,
          queryTermsAbsent: p.absent,
        },
      };
    }
    const sd = summarizeScoreDetails(h._scoreDetails);
    const explanation: Explanation = {
      summary: sd.fields.length ? `Matched ${sd.terms.slice(0, 6).join(', ')} in ${sd.fields.join(', ')}` : 'Matched by Atlas Search',
      details: [`Atlas Search score ${h._score.toFixed(3)} (BM25, title boosted ×3)`, ...(sd.fields.length ? [`Fields: ${sd.fields.join(', ')}`] : [])],
      matchedFields: sd.fields,
    };
    return {
      memory,
      rank: i + 1,
      score: h._score,
      scoreKind: 'search',
      sources: [{ mode: 'keyword', rank: i + 1, score: h._score }],
      highlights: toFragments(h._highlights),
      explanation,
    };
  });
}

function semanticResults(run: ModeRun, query: string): SearchResult[] {
  return run.hits.map((h, i) => {
    const p = termPresence(query, h);
    return {
      memory: toMemory(h),
      rank: i + 1,
      score: h._score,
      scoreKind: 'vector',
      sources: [{ mode: 'semantic', rank: i + 1, score: h._score }],
      explanation: {
        summary:
          p.present.length === 0
            ? `Matched by meaning only: none of the query terms appear literally`
            : `Matched by meaning; ${p.present.length} of ${p.present.length + p.absent.length} query terms also appear literally`,
        details: [
          `Vector search score ${h._score.toFixed(4)} (cosine, normalised by Atlas to 0–1)`,
          `Embedding model ${config.VOYAGE_MODEL} · ${config.VOYAGE_DIMENSIONS} dims`,
          ...(p.absent.length ? [`Not in text: ${p.absent.join(', ')}`] : []),
        ],
        queryTermsPresent: p.present,
        queryTermsAbsent: p.absent,
      },
    };
  });
}

function base(run: ModeRun, results: SearchResult[], applyPolicy: boolean): SearchResponseBase {
  return {
    mode: run.mode,
    engine: run.engine,
    results,
    latencyMs: run.latencyMs,
    warnings: run.warnings,
    logId: null,
    applyOutcomePolicy: applyPolicy,
    ...('embedCached' in run && run.embedCached !== undefined ? { embedCached: run.embedCached as boolean } : {}),
  };
}

async function hybrid(orgId: ObjectId, o: SearchOptions): Promise<SearchResponse> {
  const start = now();
  const [kw, sem] = await Promise.all([runKeyword(orgId, o, COMPONENT_LIMIT), runSemantic(orgId, o, COMPONENT_LIMIT)]);
  const fuseStart = now();
  const lists: RankedList[] = [
    { mode: 'keyword', items: kw.hits.map((h) => ({ id: String(h._id), score: h._score })) },
    { mode: 'semantic', items: sem.hits.map((h) => ({ id: String(h._id), score: h._score })) },
  ];
  const docs = new Map<string, SearchHit>();
  for (const h of [...kw.hits, ...sem.hits]) if (!docs.has(String(h._id))) docs.set(String(h._id), h);
  const kwById = new Map(kw.hits.map((h) => [String(h._id), h]));
  const fused = reciprocalRankFusion(lists);
  const ranked = applyOutcomePolicy(fused, (id) => docs.get(id)!.verification.status as VerificationStatus, o.applyOutcomePolicy).slice(0, o.limit);
  const fuseMs = ms(fuseStart);

  // Component warnings stay on their own columns; the hybrid response says how they affected fusion.
  const warnings: string[] = [];
  if (sem.engine === 'unavailable') warnings.push(`Hybrid degraded to keyword-only: ${sem.warnings[0] ?? 'the semantic component did not run.'}`);
  if (kw.engine === 'fallback_regex') warnings.push('Hybrid keyword component used the regex fallback, not Atlas Search.');

  const results: SearchResult[] = ranked.map((r) => {
    const doc = docs.get(r.id)!;
    const status = doc.verification.status;
    const policyNote =
      r.multiplier === 1
        ? o.applyOutcomePolicy
          ? 'no outcome adjustment (unverified)'
          : 'outcome policy off'
        : `× ${r.multiplier.toFixed(2)} (${status === 'verified_success' ? 'verified success' : 'verified failure'})`;
    const parts = r.sources.map((s) => `${s.mode === 'keyword' ? 'Keyword' : 'Semantic'} rank ${s.rank}`);
    return {
      memory: toMemory(doc),
      rank: r.rank,
      score: r.final,
      scoreKind: 'final',
      sources: r.sources,
      highlights: toFragments(kwById.get(r.id)?._highlights),
      rrf: r.rrf,
      policyMultiplier: r.multiplier,
      final: r.final,
      rankBeforePolicy: r.rankBeforePolicy,
      explanation: {
        summary: `${parts.join(' · ')} → RRF ${r.rrf.toFixed(4)} → final ${r.final.toFixed(4)}`,
        details: [
          ...r.sources.map((s) => `${s.mode === 'keyword' ? 'Keyword' : 'Semantic'}: rank ${s.rank}, contributes 1/(60+${s.rank}) = ${(1 / (60 + s.rank)).toFixed(4)}`),
          r.sources.length === 1 ? `Found by ${r.sources[0]!.mode} only` : 'Found by both modes',
          `Outcome policy: ${policyNote}; final = rrf × (1 + ${POLICY_WEIGHT}·s)`,
          ...(r.rankBeforePolicy !== r.rank ? [`Moved from rank ${r.rankBeforePolicy} to ${r.rank} by the outcome policy`] : []),
        ],
      },
    };
  });

  return {
    mode: 'hybrid',
    engine: 'rrf',
    results,
    latencyMs: {
      ...(sem.latencyMs.embed !== undefined ? { embed: sem.latencyMs.embed } : {}),
      keyword: kw.latencyMs.total,
      ...(sem.engine !== 'unavailable' ? { vector: sem.latencyMs.vector } : {}),
      fuse: fuseMs,
      total: ms(start),
    },
    warnings,
    logId: null,
    applyOutcomePolicy: o.applyOutcomePolicy,
    components: {
      keyword: base(kw, keywordResults(kw, o.query).slice(0, o.limit), o.applyOutcomePolicy),
      semantic: base(sem, semanticResults(sem, o.query).slice(0, o.limit), o.applyOutcomePolicy),
    },
  };
}

/** Runs a search, writes a retrieval log + event, increments retrievalCount on returned memories. */
export async function search(orgId: ObjectId, mode: SearchMode, o: SearchOptions, actor: Actor, userId: ObjectId | null): Promise<SearchResponse> {
  let res: SearchResponse;
  if (mode === 'keyword') {
    const run = await runKeyword(orgId, o, o.limit);
    res = base(run, keywordResults(run, o.query), o.applyOutcomePolicy);
  } else if (mode === 'semantic') {
    const run = await runSemantic(orgId, o, o.limit);
    res = base(run, semanticResults(run, o.query), o.applyOutcomePolicy);
  } else {
    res = await hybrid(orgId, o);
  }

  // A worker step that reruns after a crash passes its idempotency key. Insert first: the unique
  // `retrieval_idempotency` index makes this atomic, so two workers on the same step can't both
  // count the retrieval (find-then-insert would race and fail the task on the duplicate).
  let log: Awaited<ReturnType<typeof retrievalLogsRepo.insertOne>>;
  try {
    log = await retrievalLogsRepo.insertOne(orgId, {
    ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}),
    query: o.query,
    mode,
    engine: res.engine,
    results: res.results.map((r) => ({ memoryId: toObjectId(r.memory.id), rank: r.rank, score: r.score, sources: r.sources })),
    latencyMs: res.latencyMs as Record<string, number>,
    applyOutcomePolicy: o.applyOutcomePolicy,
    filters: o.filters as Record<string, unknown>,
    warnings: res.warnings,
    userId,
  });
  } catch (err) {
    if (o.idempotencyKey && err instanceof MongoServerError && err.code === 11000) {
      const prior = (await retrievalLogsRepo.find(orgId, { idempotencyKey: o.idempotencyKey }, { limit: 1 }))[0];
      if (prior) {
        res.logId = prior._id.toHexString();
        return res;
      }
    }
    throw err;
  }
  res.logId = log._id.toHexString();

  const ids = res.results.map((r) => toObjectId(r.memory.id));
  if (ids.length) {
    await memoriesRepo.updateMany(orgId, { _id: { $in: ids } }, { $inc: { retrievalCount: 1 } });
    for (const r of res.results) r.memory.retrievalCount += 1;
  }
  await logEvent(orgId, {
    type: 'search.run',
    status: res.warnings.some((w) => w.startsWith('Fallback') || w.includes('unavailable')) ? 'warning' : 'info',
    actor,
    summary: `${mode[0]!.toUpperCase()}${mode.slice(1)} search: "${o.query.slice(0, 80)}" → ${res.results.length} results`,
    details: { mode, engine: res.engine, logId: res.logId, latencyMs: res.latencyMs.total, resultCount: res.results.length },
  });
  return res;
}
