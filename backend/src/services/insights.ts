import type { ObjectId } from 'mongodb';
import type { DataSource, LearningResponse, MemoryType, OverviewResponse } from '@agent-recall/shared';
import { agentsRepo, memoriesRepo, outcomesRepo, retrievalLogsRepo, tasksRepo } from '../db/repositories/index.js';
import { usefulnessScore } from '../lib/serialize.js';

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const lastDays = (n: number) => [...Array(n).keys()].map((i) => dayKey(new Date(Date.now() - (n - 1 - i) * DAY)));

function sourceOf(seed: number, live: number): DataSource {
  if (seed === 0 && live === 0) return 'none';
  if (live === 0) return 'seed';
  if (seed === 0) return 'live';
  return 'mixed';
}

async function countByDay(
  repo: typeof memoriesRepo | typeof outcomesRepo | typeof retrievalLogsRepo,
  orgId: ObjectId,
  match: Record<string, unknown>,
  since: Date,
  sumExpr: unknown = 1,
): Promise<Map<string, number>> {
  const rows = await repo.aggregate<{ _id: string; n: number }>(orgId, [
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: sumExpr } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Every number is computed from stored documents; nothing is estimated. */
export async function overview(orgId: ObjectId): Promise<OverviewResponse> {
  const WINDOW = 30;
  const SPARK = 14;
  const since = new Date(Date.now() - (WINDOW - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const sparkSince = new Date(Date.now() - (SPARK - 1) * DAY);
  sparkSince.setUTCHours(0, 0, 0, 0);

  const [total, seed, ready, outcomes, outcomesSeed, worked, byTypeRows, createdByDay, retrievedByDay, beforeSpark, workedByDay, workedBefore] = await Promise.all([
    memoriesRepo.count(orgId, { archived: false }),
    memoriesRepo.count(orgId, { archived: false, isSeed: true }),
    memoriesRepo.count(orgId, { archived: false, embeddingStatus: 'ready' }),
    outcomesRepo.count(orgId),
    outcomesRepo.count(orgId, { isSeed: true }),
    outcomesRepo.count(orgId, { result: 'worked' }),
    memoriesRepo.aggregate<{ _id: MemoryType; n: number }>(orgId, [{ $match: { archived: false } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    countByDay(memoriesRepo, orgId, {}, since),
    countByDay(retrievalLogsRepo, orgId, {}, since, { $size: '$results' }),
    memoriesRepo.count(orgId, { archived: false, createdAt: { $lt: sparkSince } }),
    countByDay(outcomesRepo, orgId, { result: 'worked' }, sparkSince),
    outcomesRepo.count(orgId, { result: 'worked', createdAt: { $lt: sparkSince } }),
  ]);

  const cumulative = (start: number, perDay: Map<string, number>) => {
    let acc = start;
    return lastDays(SPARK).map((d) => (acc += perDay.get(d) ?? 0));
  };
  const createdSpark = await countByDay(memoriesRepo, orgId, { archived: false }, sparkSince);
  const liveRetrievals = await retrievalLogsRepo.count(orgId, { createdAt: { $gte: since } });

  const [experiences, searches, agents] = await Promise.all([
    memoriesRepo.find(orgId, { archived: false, type: 'episodic' }, { sort: { createdAt: -1 }, limit: 6, projection: { 'embedding.vector': 0 } }),
    retrievalLogsRepo.find(orgId, {}, { sort: { createdAt: -1 }, limit: 8 }),
    agentsRepo.find(orgId, {}),
  ]);
  const agentName = new Map(agents.map((a) => [String(a._id), a.name]));
  const typeCount = new Map(byTypeRows.map((r) => [r._id, r.n]));

  return {
    metrics: {
      totalMemories: { value: total, of: null, source: sourceOf(seed, total - seed), spark: cumulative(beforeSpark, createdSpark), seed, live: total - seed },
      indexed: { value: ready, of: total, source: sourceOf(seed, total - seed), spark: [] },
      successfulOutcomes: { value: worked, of: outcomes, source: sourceOf(outcomesSeed, outcomes - outcomesSeed), spark: cumulative(workedBefore, workedByDay) },
      retrievalSuccessRate: {
        value: outcomes > 0 ? worked / outcomes : null,
        of: outcomes,
        source: sourceOf(outcomesSeed, outcomes - outcomesSeed),
        spark: [],
      },
    },
    activity: lastDays(WINDOW).map((date) => ({ date, created: createdByDay.get(date) ?? 0, retrieved: retrievedByDay.get(date) ?? 0 })),
    activitySource: liveRetrievals > 0 ? 'mixed' : 'seed',
    byType: (['semantic', 'episodic', 'taxonomic', 'procedural'] as MemoryType[]).map((type) => ({ type, count: typeCount.get(type) ?? 0 })),
    recentExperiences: experiences.map((m) => ({
      id: String(m._id),
      title: m.title,
      agentName: agentName.get(String(m.agentId)) ?? '—',
      verification: m.verification.status,
      isSeed: m.isSeed,
      createdAt: m.createdAt.toISOString(),
    })),
    recentSearches: searches.map((s) => ({
      id: String(s._id),
      query: s.query,
      mode: s.mode,
      engine: s.engine as OverviewResponse['recentSearches'][number]['engine'],
      resultCount: s.results.length,
      latencyMs: typeof s.latencyMs.total === 'number' ? s.latencyMs.total : null,
      createdAt: s.createdAt.toISOString(),
    })),
    windowDays: WINDOW,
  };
}

// Tags that describe the record rather than the problem.
const GENERIC_TAGS = new Set(['incident', 'outcome', 'worked', 'failed', 'resolution', 'verified', 'root-cause', 'runbook', 'taxonomy', 'test', 'process']);

export async function learning(orgId: ObjectId): Promise<LearningResponse> {
  const WEEKS = 12;
  const since = new Date(Date.now() - WEEKS * 7 * DAY);
  const [weekly, totals, useful, retrieved, procedures, tagRows, outcomes] = await Promise.all([
    outcomesRepo.aggregate<{ _id: { week: string; result: 'worked' | 'failed' }; n: number }>(orgId, [
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { week: { $dateToString: { format: '%G-W%V', date: '$createdAt' } }, result: '$result' }, n: { $sum: 1 } } },
    ]),
    outcomesRepo.aggregate<{ _id: null; worked: number; failed: number; helpful: number; notHelpful: number; seed: number; n: number }>(orgId, [
      {
        $group: {
          _id: null,
          worked: { $sum: { $cond: [{ $eq: ['$result', 'worked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$result', 'failed'] }, 1, 0] } },
          helpful: { $sum: { $cond: [{ $eq: ['$feedback', 'helpful'] }, 1, 0] } },
          notHelpful: { $sum: { $cond: [{ $eq: ['$feedback', 'not_helpful'] }, 1, 0] } },
          seed: { $sum: { $cond: ['$isSeed', 1, 0] } },
          n: { $sum: 1 },
        },
      },
    ]),
    memoriesRepo.find(
      orgId,
      { archived: false, $expr: { $gt: [{ $add: ['$usefulness.helpful', '$usefulness.notHelpful'] }, 0] } },
      { sort: { 'usefulness.helpful': -1, 'usefulness.notHelpful': 1 }, limit: 6, projection: { 'embedding.vector': 0 } },
    ),
    memoriesRepo.find(orgId, { archived: false, retrievalCount: { $gt: 0 } }, { sort: { retrievalCount: -1 }, limit: 6, projection: { 'embedding.vector': 0 } }),
    memoriesRepo.find(orgId, { archived: false, type: 'procedural', 'verification.status': 'verified_success' }, { sort: { 'verification.verifiedAt': -1 }, projection: { 'embedding.vector': 0 } }),
    memoriesRepo.aggregate<{ _id: string; n: number; resolved: number }>(orgId, [
      { $match: { archived: false, type: 'episodic' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', n: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ['$verification.status', 'verified_success'] }, 1, 0] } } } },
      { $sort: { n: -1, _id: 1 } },
      { $limit: 30 },
    ]),
    outcomesRepo.find(orgId, {}, { sort: { createdAt: -1 }, limit: 50 }),
  ]);

  const tasks = await tasksRepo.findByIds(orgId, [...new Set(outcomes.map((o) => String(o.taskId)))]);
  const goal = new Map(tasks.map((t) => [String(t._id), t.goal]));

  // Week labels for the window (ISO weeks), oldest first.
  const weeks: string[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * DAY);
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const wk = Math.ceil(((tmp.getTime() - yearStart.getTime()) / DAY + 1) / 7);
    weeks.push(`${tmp.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`);
  }
  const wk = (w: string, r: 'worked' | 'failed') => weekly.find((x) => x._id.week === w && x._id.result === r)?.n ?? 0;
  const t = totals[0];

  const ref = (m: (typeof useful)[number]) => ({ id: String(m._id), title: m.title, type: m.type, verification: m.verification.status, isSeed: m.isSeed });

  return {
    outcomesOverTime: weeks.map((week) => ({ week, worked: wk(week, 'worked'), failed: wk(week, 'failed') })),
    outcomeTotals: {
      worked: t?.worked ?? 0,
      failed: t?.failed ?? 0,
      helpful: t?.helpful ?? 0,
      notHelpful: t?.notHelpful ?? 0,
      source: sourceOf(t?.seed ?? 0, (t?.n ?? 0) - (t?.seed ?? 0)),
    },
    mostUseful: useful.map((m) => ({ ...ref(m), helpful: m.usefulness.helpful, notHelpful: m.usefulness.notHelpful, score: Number(usefulnessScore(m.usefulness).toFixed(3)) })),
    mostRetrieved: retrieved.map((m) => ({ ...ref(m), retrievalCount: m.retrievalCount })),
    verifiedProcedures: procedures.map((m) => ({
      ...ref(m),
      verifiedAt: m.verification.verifiedAt ? m.verification.verifiedAt.toISOString() : null,
      evidence: outcomes
        .filter((o) => m.verification.outcomeIds.some((id) => String(id) === String(o._id)))
        .map((o) => ({
          outcomeId: String(o._id),
          taskId: String(o.taskId),
          question: goal.get(String(o.taskId)) ?? '',
          result: o.result,
          createdAt: o.createdAt.toISOString(),
          isSeed: o.isSeed,
        })),
    })),
    recurringProblems: tagRows
      .filter((r) => !GENERIC_TAGS.has(r._id))
      .slice(0, 8)
      .map((r) => ({ tag: r._id, count: r.n, resolved: r.resolved })),
    feedback: outcomes.slice(0, 12).map((o) => ({
      id: String(o._id),
      taskId: String(o.taskId),
      question: goal.get(String(o.taskId)) ?? '',
      result: o.result,
      feedback: o.feedback,
      notes: o.notes,
      isSeed: o.isSeed,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}
