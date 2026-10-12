import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, ChevronRight, FlaskConical, Gauge, History, Play } from 'lucide-react';
import type { BenchmarkConfig, BenchmarkMetrics, BenchmarkQueryResult, BenchmarkRun, BenchmarkRunSummary, BenchmarkSetResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { cn, formatRelative } from '@/lib/utils';
import { tokenColor } from '@/lib/tokens';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge, DemoDataBadge, EngineBadge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { ChartFrame, useChartTable } from '@/components/charts/charts';
import { axisProps, ChartTooltip, gridProps } from '@/components/charts/chart-kit';

const CONFIGS: BenchmarkConfig[] = ['keyword', 'semantic', 'hybrid', 'hybrid_policy'];
const CONFIG_META: Record<BenchmarkConfig, { label: string; detail: string; token: string; hatched?: boolean }> = {
  keyword: { label: 'Keyword', detail: 'Atlas Search', token: 'keyword' },
  semantic: { label: 'Semantic', detail: 'Atlas Vector Search', token: 'accent-2' },
  hybrid: { label: 'Hybrid', detail: 'RRF, no outcome signals', token: 'accent' },
  hybrid_policy: { label: 'Hybrid + outcomes', detail: 'RRF × outcome policy', token: 'accent', hatched: true },
};
const METRICS: { key: keyof BenchmarkMetrics; label: string; pct: boolean; help: string }[] = [
  { key: 'hitAt1', label: 'Hit@1', pct: true, help: 'Share of questions whose top result is a direct answer' },
  { key: 'mrrAt10', label: 'MRR@10', pct: false, help: 'Mean of 1 / rank of the first direct answer (0 if not in the top 10)' },
  { key: 'recallAt5', label: 'Recall@5', pct: true, help: 'Share of all labelled memories that appear in the top 5' },
  { key: 'ndcgAt5', label: 'nDCG@5', pct: false, help: 'Graded ranking quality of the top 5 (1 = ideal order)' },
];
type Category = 'all' | 'paraphrase' | 'identifier' | 'fix';
const CATEGORY_LABEL: Record<Category, string> = { all: 'All', paraphrase: 'Paraphrased', identifier: 'Exact identifiers', fix: 'What fixed it' };

type Split = 'all' | 'dev' | 'holdout';
const SPLIT_LABEL: Record<Split, string> = { all: 'All questions', dev: 'Dev', holdout: 'Held-out' };
const POLICY_LABEL: Record<string, string> = {
  'global-v1': 'Outcome policy: global ×1.15',
  'contextual-v1': 'Outcome policy: contextual (question similarity)',
};

/** Macro average over the selected questions: the same aggregation the API uses. */
function averageOf(queries: BenchmarkQueryResult[], c: BenchmarkConfig): BenchmarkMetrics {
  const n = queries.length || 1;
  const avg = (k: keyof BenchmarkMetrics) => queries.reduce((sum, q) => sum + q.perConfig[c].metrics[k], 0) / n;
  return { hitAt1: avg('hitAt1'), mrrAt10: avg('mrrAt10'), recallAt5: avg('recallAt5'), ndcgAt5: avg('ndcgAt5') };
}

const fmt = (v: number, pct: boolean) => (pct ? `${Math.round(v * 1000) / 10}%` : v.toFixed(3));

function Swatch({ config }: { config: BenchmarkConfig }) {
  const m = CONFIG_META[config];
  return (
    <svg width="10" height="10" className="shrink-0 rounded-[2px]" aria-hidden>
      <rect width="10" height="10" fill={m.hatched ? `url(#hatch-${config})` : tokenColor(m.token)} />
      {m.hatched && <HatchDef id={`hatch-${config}`} token={m.token} />}
    </svg>
  );
}

function HatchDef({ id, token }: { id: string; token: string }) {
  return (
    <defs>
      <pattern id={id} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
        <rect width="5" height="5" fill={tokenColor(token, 0.9)} />
        <line x1="0" y1="0" x2="0" y2="5" stroke={tokenColor('surface')} strokeWidth="1.6" />
      </pattern>
    </defs>
  );
}

export default function Benchmarks() {
  const qc = useQueryClient();
  const runs = useQuery({ queryKey: ['benchmark-runs'], queryFn: () => api.get<{ items: BenchmarkRunSummary[] }>('/api/benchmarks/runs') });
  const [selected, setSelected] = React.useState<string | null>(null);
  const runId = selected ?? runs.data?.items[0]?.id ?? null;
  const run = useQuery({
    queryKey: ['benchmark-run', runId],
    queryFn: () => api.get<BenchmarkRun>(`/api/benchmarks/runs/${runId}`),
    enabled: Boolean(runId),
  });
  const start = useMutation({
    mutationFn: () => api.post<BenchmarkRun>('/api/benchmarks/runs'),
    onSuccess: (r) => {
      qc.setQueryData(['benchmark-run', r.id], r);
      setSelected(r.id);
      void qc.invalidateQueries({ queryKey: ['benchmark-runs'] });
      toast.success('Benchmark finished', { description: `${r.queryCount} queries in ${(r.durationMs / 1000).toFixed(1)} s` });
    },
    onError: (e) => toast.error('Benchmark failed', { description: e instanceof ApiError ? e.message : undefined }),
  });

  const r = run.data;
  const empty = runs.data && runs.data.items.length === 0;

  return (
    <>
      <PageHeader
        title="Retrieval Benchmarks"
        description="Labelled questions over the demo memories, run through the real search pipeline. Every number on this page is measured from a stored run."
        actions={
          <>
            <LabelledSetDialog />
            <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>
              {!start.isPending && <Play aria-hidden />}
              {start.isPending ? 'Running queries…' : 'Run benchmark'}
            </Button>
          </>
        }
      />

      {(runs.isError || run.isError) && (
        <Panel className="mb-4">
          <ErrorState
            title="Could not load benchmark runs."
            fix={(runs.error ?? run.error) instanceof ApiError ? (runs.error ?? run.error)!.message : undefined}
            onRetry={() => void (runs.isError ? runs.refetch() : run.refetch())}
          />
        </Panel>
      )}

      {empty ? (
        <Panel>
          <EmptyState
            icon={FlaskConical}
            message="No benchmark runs yet. Run the labelled questions through keyword, semantic and hybrid search."
            action={
              <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>
                Run benchmark
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <RunStrip run={r} />
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <ResultsPanel run={r} className="xl:col-span-2" />
            <MethodPanel />
          </div>
          <NdcgChartPanel run={r} />
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <PolicyEffectPanel run={r} className="xl:col-span-2" />
            <HistoryPanel runs={runs.data?.items} selected={runId} onSelect={setSelected} />
          </div>
          <QueriesPanel run={r} />
        </>
      )}
    </>
  );
}

function RunStrip({ run }: { run: BenchmarkRun | undefined }) {
  if (!run) return <Skeleton className="mb-4 h-5 w-[480px] max-w-full" />;
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-dense text-text-muted">
        <span className="text-text">Run {new Date(run.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span className="tabular">{run.queryCount} questions</span>
        <span className="tabular">{run.corpus.seedMemories} seed memories</span>
        <span className="tabular">{(run.durationMs / 1000).toFixed(1)} s</span>
        <span>{POLICY_LABEL[run.rankingPolicy] ?? run.rankingPolicy}</span>
        <EngineBadge engine={run.engines.keyword} />
        <EngineBadge engine={run.engines.semantic} />
        <DemoDataBadge />
      </div>
      {run.warnings.map((w) => (
        <p key={w} className="text-dense text-warning">
          {w}
        </p>
      ))}
    </div>
  );
}

function ResultsPanel({ run, className }: { run: BenchmarkRun | undefined; className?: string }) {
  const [cat, setCat] = React.useState<Category>('all');
  const [split, setSplit] = React.useState<Split>('all');
  const selected = run?.queries.filter((q) => (cat === 'all' || q.category === cat) && (split === 'all' || q.split === split)) ?? [];
  const metrics = !run || selected.length === 0 ? null : (Object.fromEntries(CONFIGS.map((c) => [c, averageOf(selected, c)])) as Record<BenchmarkConfig, BenchmarkMetrics>);
  const count = selected.length;
  const hasHoldout = run?.queries.some((q) => q.split === 'holdout') ?? false;
  const best = (k: keyof BenchmarkMetrics) => (metrics ? Math.max(...CONFIGS.map((c) => metrics[c][k])) : 0);
  const latency = (c: BenchmarkConfig) => (!run ? null : c === 'keyword' ? run.latencyMs.keyword : c === 'semantic' ? run.latencyMs.semantic : run.latencyMs.hybrid);
  return (
    <Panel
      title="Results by configuration"
      meta={run ? `${count} questions` : undefined}
      className={className}
      flush
    >
      <div className="flex flex-wrap gap-2 overflow-x-auto border-b border-border px-4 py-2">
        <SegmentedControl
          size="sm"
          aria-label="Question type"
          value={cat}
          onValueChange={setCat}
          options={(['all', 'paraphrase', 'identifier', 'fix'] as const).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
        />
        {hasHoldout && (
          <SegmentedControl
            size="sm"
            aria-label="Question split"
            value={split}
            onValueChange={setSplit}
            options={(['all', 'dev', 'holdout'] as const).map((v) => ({ value: v, label: SPLIT_LABEL[v] }))}
          />
        )}
      </div>
      {run && selected.length === 0 ? (
        <EmptyState icon={FlaskConical} message="No questions match this filter." />
      ) : !metrics ? (
        <TableRowsSkeleton rows={4} cols={6} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-dense">
            <caption className="sr-only">Benchmark metrics by search configuration for {CATEGORY_LABEL[cat]} questions</caption>
            <thead>
              <tr className="border-b border-border text-caption text-text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  Configuration
                </th>
                {METRICS.map((m) => (
                  <th key={m.key} scope="col" className="px-3 py-2 text-right font-medium" title={m.help}>
                    {m.label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-medium" title="Median search latency measured during the run">
                  p50 latency
                </th>
              </tr>
            </thead>
            <tbody>
              {CONFIGS.map((c) => (
                <tr key={c} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-2.5 font-normal">
                    <span className="flex items-center gap-2">
                      <Swatch config={c} />
                      <span className="text-text">{CONFIG_META[c].label}</span>
                      <span className="hidden text-caption font-normal text-text-muted sm:inline">{CONFIG_META[c].detail}</span>
                    </span>
                  </th>
                  {METRICS.map((m) => {
                    const v = metrics[c][m.key];
                    const top = v === best(m.key);
                    return (
                      <td key={m.key} className={cn('tabular px-3 py-2.5 text-right', top ? 'font-semibold text-text' : 'text-text-muted')}>
                        {fmt(v, m.pct)}
                      </td>
                    );
                  })}
                  <td className="tabular px-4 py-2.5 text-right text-text-muted">{c === 'hybrid_policy' ? '' : `${latency(c)?.p50 ?? '—'} ms`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-caption font-normal text-text-muted">
            Bold marks the best value in each column. Hybrid latency includes both component searches and the query embedding.
          </p>
        </div>
      )}
    </Panel>
  );
}

function MethodPanel() {
  return (
    <Panel title="How this is measured">
      <ul className="flex flex-col gap-2.5 text-dense text-text-muted">
        <li>
          Each question has hand-written labels: <span className="text-text">grade 3</span> for the memory that answers it, <span className="text-text">grade 1</span> for useful context.
          Labels were written before the first run.
        </li>
        <li>Questions are paraphrased problems, exact identifiers (error names, config keys), or "what fixed this before?".</li>
        <li>
          <span className="text-text">Held-out</span> questions were committed before the contextual outcome policy existed and were not used to choose its settings.
        </li>
        <li>
          Runs call the same search code as the Playground without logging, so they don't change retrieval counts. Memories created after seeding have no labels and are left out of
          scoring.
        </li>
        {METRICS.map((m) => (
          <li key={m.key}>
            <span className="text-text">{m.label}</span>: {m.help.toLowerCase()}.
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function NdcgChartPanel({ run }: { run: BenchmarkRun | undefined }) {
  const view = useChartTable('nDCG@5 by question type');
  const cats: Category[] = ['all', 'paraphrase', 'identifier', 'fix'];
  const data = run
    ? cats
        .filter((c) => c === 'all' || run.byCategory[c])
        .map((c) => {
          const m = c === 'all' ? run.overall : run.byCategory[c]!.metrics;
          return { category: CATEGORY_LABEL[c], ...Object.fromEntries(CONFIGS.map((k) => [k, Math.round(m[k].ndcgAt5 * 1000) / 1000])) };
        })
    : [];
  return (
    <Panel title="nDCG@5 by question type" meta="higher is better · 1 = ideal order" actions={run ? view.toggle : undefined} className="mb-4">
      {!run ? (
        <Skeleton className="h-[280px] w-full" />
      ) : (
        <ChartFrame
          title="nDCG@5 by question type"
          table={view.table}
          height={280}
          columns={[{ key: 'category', header: 'Question type' }, ...CONFIGS.map((c) => ({ key: c, header: CONFIG_META[c].label, align: 'right' as const }))]}
          rows={data}
          chart={
            <div className="flex h-full flex-col">
              <div className="mb-2 flex flex-wrap gap-4 text-caption text-text-muted" aria-hidden>
                {CONFIGS.map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <Swatch config={c} /> {CONFIG_META[c].label}
                  </span>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer>
                  <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
                    <defs>
                      <pattern id="bar-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                        <rect width="5" height="5" fill={tokenColor('accent', 0.9)} />
                        <line x1="0" y1="0" x2="0" y2="5" stroke={tokenColor('surface')} strokeWidth="1.6" />
                      </pattern>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="category" {...axisProps} />
                    <YAxis {...axisProps} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} width={36} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: tokenColor('surface-raised') }} />
                    {CONFIGS.map((c) => (
                      <Bar
                        key={c}
                        dataKey={c}
                        name={CONFIG_META[c].label}
                        fill={CONFIG_META[c].hatched ? 'url(#bar-hatch)' : tokenColor(CONFIG_META[c].token)}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          }
        />
      )}
    </Panel>
  );
}

function PolicyEffectPanel({ run, className }: { run: BenchmarkRun | undefined; className?: string }) {
  const moved = run?.queries.filter((q) => q.perConfig.hybrid.firstAnswerRank !== q.perConfig.hybrid_policy.firstAnswerRank) ?? [];
  const rank = (n: number | null) => n ?? 11;
  const up = moved.filter((q) => rank(q.perConfig.hybrid_policy.firstAnswerRank) < rank(q.perConfig.hybrid.firstAnswerRank));
  return (
    <Panel
      title="Effect of outcome signals"
      meta={run ? `${up.length} better · ${moved.length - up.length} worse · ${run.queryCount - moved.length} same` : undefined}
      className={className}
      flush
    >
      {!run ? (
        <TableRowsSkeleton rows={4} cols={3} />
      ) : moved.length === 0 ? (
        <EmptyState icon={Gauge} message="The outcome policy did not change the first direct answer for any question in this run." />
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {moved.map((q) => {
            const before = q.perConfig.hybrid.firstAnswerRank;
            const after = q.perConfig.hybrid_policy.firstAnswerRank;
            const better = rank(after) < rank(before);
            return (
              <li key={q.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                <Badge tone={better ? 'success' : 'danger'}>
                  {better ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
                  {better ? 'better' : 'worse'}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-dense text-text" title={q.query}>
                  {q.query}
                </span>
                <span className="tabular shrink-0 text-caption font-normal text-text-muted">
                  answer at rank {before ?? '—'} → {after ?? '—'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function HistoryPanel({ runs, selected, onSelect }: { runs: BenchmarkRunSummary[] | undefined; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <Panel title="Run history" meta={runs ? `${runs.length} runs` : undefined} flush>
      {!runs ? (
        <TableRowsSkeleton rows={4} cols={2} />
      ) : runs.length === 0 ? (
        <EmptyState icon={History} message="No runs yet." />
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {runs.map((r) => (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={r.id === selected}
                className={cn('focus-ring flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-raised', r.id === selected && 'bg-surface-raised')}
              >
                <span className="min-w-0 flex-1 truncate text-dense text-text">{formatRelative(r.createdAt)}</span>
                <span className="tabular text-caption font-normal text-text-muted">
                  {r.rankingPolicy === 'contextual-v1' ? 'contextual' : 'global'} · hybrid nDCG {r.overall.hybrid.ndcgAt5.toFixed(2)} · + outcomes {r.overall.hybrid_policy.ndcgAt5.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function QueriesPanel({ run }: { run: BenchmarkRun | undefined }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <Panel title="Per question" meta="rank of the first direct answer · — means not in the top 10" flush className="mb-4">
      {!run ? (
        <TableRowsSkeleton rows={8} cols={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed text-left text-dense">
            <caption className="sr-only">Rank of the first direct answer for each benchmark question and configuration</caption>
            <thead>
              <tr className="border-b border-border text-caption text-text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  Question
                </th>
                {CONFIGS.map((c) => (
                  <th key={c} scope="col" className="w-32 px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Swatch config={c} />
                      {c === 'hybrid_policy' ? '+ outcomes' : CONFIG_META[c].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.queries.map((q) => (
                <QueryRow key={q.id} q={q} open={open === q.id} onToggle={() => setOpen(open === q.id ? null : q.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function QueryRow({ q, open, onToggle }: { q: BenchmarkQueryResult; open: boolean; onToggle: () => void }) {
  const best = Math.min(...CONFIGS.map((c) => q.perConfig[c].firstAnswerRank ?? 99));
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-4 py-2">
          <button type="button" onClick={onToggle} aria-expanded={open} className="focus-ring flex w-full min-w-0 items-center gap-2 rounded-control text-left">
            <ChevronRight className={cn('size-3.5 shrink-0 text-text-muted transition-transform duration-fast', open && 'rotate-90')} aria-hidden />
            <Badge className="hidden md:inline-flex">{CATEGORY_LABEL[q.category]}</Badge>
            {q.split === 'holdout' && <Badge tone="accent" className="hidden md:inline-flex">held-out</Badge>}
            <span className="min-w-0 flex-1 truncate text-text" title={q.query}>
              {q.query}
            </span>
          </button>
        </td>
        {CONFIGS.map((c) => {
          const rank = q.perConfig[c].firstAnswerRank;
          const shown = rank !== null && rank <= 10 ? rank : null;
          return (
            <td key={c} className={cn('tabular px-3 py-2 text-right', shown !== null && shown === best ? 'font-semibold text-text' : 'text-text-muted')}>
              {shown ?? '—'}
            </td>
          );
        })}
      </tr>
      {open && (
        <tr className="border-b border-border bg-bg/40">
          <td colSpan={5} className="px-4 py-3">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {CONFIGS.map((c) => (
                <div key={c} className="min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5 text-caption text-text-muted">
                    <Swatch config={c} /> {CONFIG_META[c].label} · top 5
                  </div>
                  <ol className="flex flex-col gap-1">
                    {q.perConfig[c].top.map((t, i) => (
                      <li key={t.key} className="flex min-w-0 items-center gap-2 text-caption font-normal">
                        <span className="tabular w-3 shrink-0 text-text-muted">{i + 1}</span>
                        <span className={cn('min-w-0 flex-1 truncate', t.grade ? 'text-text' : 'text-text-muted')} title={t.title ?? t.key}>
                          {t.title ?? t.key}
                        </span>
                        {t.grade === 3 && <Badge tone="success">answer</Badge>}
                        {t.grade === 1 && <Badge>related</Badge>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            {q.excludedNonSeedHits > 0 && (
              <p className="mt-2 text-caption font-normal text-text-muted">{q.excludedNonSeedHits} unlabelled memories created after seeding were left out of scoring.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function LabelledSetDialog() {
  const [open, setOpen] = React.useState(false);
  const set = useQuery({ queryKey: ['benchmark-set'], queryFn: () => api.get<BenchmarkSetResponse>('/api/benchmarks/set'), enabled: open });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>View labelled questions</Button>
      </DialogTrigger>
      <DialogContent title="Labelled questions" description={set.data?.labellingRule} className="max-w-2xl">
        {!set.data ? (
          <TableRowsSkeleton rows={6} cols={2} />
        ) : (
          <ol className="flex flex-col gap-3">
            {set.data.queries.map((q) => (
              <li key={q.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge>{CATEGORY_LABEL[q.category]}</Badge>
                  <span className="text-dense text-text">{q.query}</span>
                </div>
                <ul className="flex flex-col gap-0.5 pl-1">
                  {q.relevant.map((m) => (
                    <li key={m.key} className="flex items-center gap-2 text-caption font-normal text-text-muted">
                      <Badge tone={m.grade === 3 ? 'success' : 'neutral'}>{m.grade === 3 ? 'answer' : 'related'}</Badge>
                      {m.title ?? m.key}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
