import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, ListChecks, Play, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { MEMORY_TYPES, type Memory, type MemoryType, type SearchFilters, type SearchMode, type SearchResponse, type SearchResponseBase, type SearchResult, type VerificationStatus } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { useAgents } from '@/lib/queries';
import { useMediaQuery } from '@/lib/hooks';
import { MODE_META, TYPE_META } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Badge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/states';
import { ResultColumn } from '@/components/search/ResultColumn';
import { RetrievalTrace } from '@/components/search/RetrievalTrace';
import { POLICY_TOOLTIP, WhyPanel } from '@/components/search/WhyPanel';
import { AnswerFlow } from '@/components/search/AnswerFlow';

export const DEMO_QUERY = 'Our API started timing out after a database connection pool change. How did we resolve a similar issue before?';
const ALL = '__all__';
const COLUMN_ORDER: SearchMode[] = ['keyword', 'hybrid', 'semantic'];

type Columns = Partial<Record<SearchMode, SearchResponseBase>>;

export default function SearchPlayground() {
  const [params] = useSearchParams();
  const forceFallback = params.get('simulate') === 'fallback';
  const wide = useMediaQuery('(min-width: 1280px)');
  const agents = useAgents();

  const [query, setQuery] = React.useState(params.get('q') ?? DEMO_QUERY);
  const [filters, setFilters] = React.useState<SearchFilters>({});
  const [policy, setPolicy] = React.useState(true);
  const [columns, setColumns] = React.useState<Columns>({});
  const [loading, setLoading] = React.useState<Partial<Record<SearchMode, boolean>>>({});
  const [errors, setErrors] = React.useState<Partial<Record<SearchMode, string | null>>>({});
  const [runId, setRunId] = React.useState(0);
  const [animateTrace, setAnimateTrace] = React.useState(false);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<{ mode: SearchMode; id: string } | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  // Snapshot of the memories an answer is grounded in (unticking rows later must not change it).
  const [answering, setAnswering] = React.useState<Memory[] | null>(null);
  const [tab, setTab] = React.useState<SearchMode>('hybrid');
  const traceRef = React.useRef<HTMLDivElement>(null);

  const body = (p = policy) => ({ query: query.trim(), filters, limit: 10, applyOutcomePolicy: p, ...(forceFallback ? { forceKeywordFallback: true } : {}) });
  // The request behind what is on screen: a policy toggle re-runs *that* query, not unsubmitted edits.
  const lastBody = React.useRef<ReturnType<typeof body> | null>(null);
  // Only the newest response per column is applied (fast toggles must not land out of order).
  const seq = React.useRef<Record<SearchMode, number>>({ keyword: 0, semantic: 0, hybrid: 0 });
  const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Request failed.');

  const runAll = async () => {
    if (!query.trim()) return;
    setLoading({ keyword: true, semantic: true, hybrid: true });
    setErrors({});
    setSelected(null);
    setAnswering(null);
    const b = body();
    lastBody.current = b;
    const mine = (['keyword', 'semantic', 'hybrid'] as const).map((m) => ++seq.current[m])[2]!;
    try {
      const res = await api.post<SearchResponse>('/api/search/hybrid', b);
      if (seq.current.hybrid !== mine) return;
      setColumns({ keyword: res.components?.keyword, semantic: res.components?.semantic, hybrid: res });
      setRunId((n) => n + 1);
      setAnimateTrace(true);
      window.setTimeout(() => setAnimateTrace(false), 1400);
    } catch (e) {
      if (seq.current.hybrid === mine) setErrors({ keyword: errText(e), semantic: errText(e), hybrid: errText(e) });
    } finally {
      if (seq.current.hybrid === mine) setLoading({});
    }
  };

  const runOne = async (mode: SearchMode, override?: ReturnType<typeof body>) => {
    const b = override ?? body();
    if (!b.query) return;
    if (!override) lastBody.current = b;
    const mine = ++seq.current[mode];
    setLoading((l) => ({ ...l, [mode]: true }));
    setErrors((e) => ({ ...e, [mode]: null }));
    try {
      const res = await api.post<SearchResponse>(`/api/search/${mode}`, b);
      if (seq.current[mode] === mine) setColumns((c) => ({ ...c, [mode]: res }));
    } catch (e) {
      if (seq.current[mode] === mine) setErrors((x) => ({ ...x, [mode]: errText(e) }));
    } finally {
      if (seq.current[mode] === mine) setLoading((l) => ({ ...l, [mode]: false }));
    }
  };

  const togglePolicy = (on: boolean) => {
    setPolicy(on);
    if (columns.hybrid && lastBody.current) void runOne('hybrid', { ...lastBody.current, applyOutcomePolicy: on });
  };

  const onCheck = React.useCallback((id: string, on: boolean) => {
    setChecked((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const settle = React.useCallback(() => setLayoutVersion((v) => v + 1), []);

  // Every memory currently shown, for the selection panel.
  const shown = React.useMemo(() => {
    const m = new Map<string, SearchResult>();
    for (const mode of COLUMN_ORDER) for (const r of columns[mode]?.results ?? []) if (!m.has(r.memory.id)) m.set(r.memory.id, r);
    return m;
  }, [columns]);
  const selectedResults = [...checked].map((id) => shown.get(id)).filter((x): x is SearchResult => Boolean(x));
  const selection = React.useMemo(() => {
    if (!selected) return null;
    const result = columns[selected.mode]?.results.find((r) => r.memory.id === selected.id);
    return result ? { mode: selected.mode, result } : null;
  }, [selected, columns]);
  // Stable identity: a new object each render made the trace re-measure on every hover.
  const engines = React.useMemo(
    () => ({ keyword: columns.keyword?.engine, semantic: columns.semantic?.engine }),
    [columns.keyword?.engine, columns.semantic?.engine],
  );
  const ready = Boolean(columns.hybrid) && !loading.hybrid;
  const activeFilterCount = (filters.agentId ? 1 : 0) + (filters.types?.length ?? 0) + (filters.verification?.length ?? 0);

  const column = (mode: SearchMode, className?: string) => (
    <ResultColumn
      key={mode}
      mode={mode}
      data={columns[mode]}
      loading={Boolean(loading[mode])}
      error={errors[mode]}
      onRun={() => void runOne(mode)}
      runId={runId}
      hoveredId={hovered}
      onHover={setHovered}
      selectedId={selected?.id ?? null}
      onSelect={(r) => setSelected({ mode, id: r.memory.id })}
      checked={checked}
      onCheck={onCheck}
      showRankChips={!wide}
      onLayoutSettled={settle}
      className={className}
    />
  );

  return (
    <>
      <PageHeader title="Search Playground" description="Run one query through keyword, semantic and hybrid retrieval and see why each memory came back." />

      <Panel title="Query" className="mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAll();
          }}
          className="flex flex-col gap-3"
        >
          <Textarea
            aria-label="Query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void runAll();
              }
            }}
            rows={wide ? 2 : 4}
            className="min-h-0 text-body"
          />
          <div className="flex flex-wrap items-center gap-3">
            <FiltersPopover filters={filters} onChange={setFilters} agents={agents.data ?? []} count={activeFilterCount} />
            <div className="flex items-center gap-2 text-dense text-text">
              <Switch id="outcome-policy" checked={policy} onCheckedChange={togglePolicy} />
              <label htmlFor="outcome-policy">Outcome policy {policy ? 'on' : 'off'}</label>
              <Tooltip content={POLICY_TOOLTIP}>
                <button type="button" className="focus-ring rounded-full text-text-muted hover:text-text" aria-label="How the outcome policy works">
                  <Info className="size-3.5" aria-hidden />
                </button>
              </Tooltip>
            </div>
            {forceFallback && <Badge tone="warning">Fallback demo: keyword index treated as unavailable</Badge>}
            <div className="ml-auto flex items-center gap-2">
              {query !== DEMO_QUERY && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQuery(DEMO_QUERY)}>
                  Reset query
                </Button>
              )}
              <Button type="submit" variant="primary" loading={Boolean(loading.hybrid && loading.keyword)} disabled={!query.trim()}>
                {!(loading.hybrid && loading.keyword) && <Play aria-hidden />}
                Run all
              </Button>
            </div>
          </div>
        </form>
      </Panel>

      {ready && <span data-testid="results-ready" hidden />}

      {wide ? (
        <div ref={traceRef} className="relative grid grid-cols-3 gap-12">
          {COLUMN_ORDER.map((m) => column(m))}
          {columns.hybrid && (
            <RetrievalTrace
              containerRef={traceRef}
              hybrid={columns.hybrid.results}
              engines={engines}
              hoveredId={hovered}
              animate={animateTrace}
              layoutVersion={layoutVersion}
            />
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as SearchMode)}>
          <TabsList>
            {COLUMN_ORDER.map((m) => (
              <TabsTrigger key={m} value={m} className={cn(tab === m && MODE_META[m].text)}>
                {MODE_META[m].label}
                {columns[m] && <span className="tabular text-caption text-text-muted">{columns[m]!.results.length}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
          {COLUMN_ORDER.map((m) => (
            <TabsContent key={m} value={m} forceMount className={cn(tab !== m && 'hidden')}>
              {column(m)}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <WhyPanel selection={selection} columns={columns} />
        <Panel
          title={`Selected (${selectedResults.length})`}
          actions={
            <>
              {selectedResults.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setChecked(new Set())}>
                  <X aria-hidden />
                  Clear
                </Button>
              )}
              <Button size="sm" variant="primary" disabled={selectedResults.length === 0} onClick={() => setAnswering(selectedResults.map((r) => r.memory))}>
                <Sparkles aria-hidden />
                Use in agent task
              </Button>
            </>
          }
          flush
        >
          {selectedResults.length === 0 ? (
            <EmptyState icon={ListChecks} message="Tick results to ground an answer in them." className="py-6" />
          ) : (
            <ul>
              {selectedResults.map((r) => (
                <li key={r.memory.id} className="flex items-center gap-2 border-b border-border px-4 py-2 text-dense last:border-b-0">
                  <MemoryTypeBadge type={r.memory.type} compact />
                  <span className="min-w-0 flex-1 truncate text-text">{r.memory.title}</span>
                  <VerificationBadge status={r.memory.verification.status} />
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${r.memory.title}`} onClick={() => onCheck(r.memory.id, false)}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {answering && answering.length > 0 && (
        <AnswerFlow
          query={lastBody.current?.query ?? query.trim()}
          memories={answering}
          defaultAgentId={agents.data?.find((a) => a.name === 'Engineering Assistant')?.id ?? agents.data?.[0]?.id}
          onClose={() => setAnswering(null)}
          onHoverMemory={setHovered}
          onSearchAgain={() => {
            setAnswering(null);
            setChecked(new Set());
            void runAll();
          }}
        />
      )}
    </>
  );
}

function FiltersPopover({
  filters,
  onChange,
  agents,
  count,
}: {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  agents: { id: string; name: string }[];
  count: number;
}) {
  const toggle = <T extends string>(list: T[] | undefined, v: T) => {
    const s = new Set(list ?? []);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    return s.size ? [...s] : undefined;
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          <SlidersHorizontal aria-hidden />
          Filters
          {count > 0 && <Badge tone="accent">{count}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-text-muted">Agent</span>
            <Select
              size="sm"
              aria-label="Agent filter"
              value={filters.agentId ?? ALL}
              onValueChange={(v) => onChange({ ...filters, agentId: v === ALL ? undefined : v })}
              options={[{ value: ALL, label: 'All agents' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption text-text-muted">Types</legend>
            <div className="flex flex-wrap gap-1.5">
              {MEMORY_TYPES.map((t: MemoryType) => {
                const on = filters.types?.includes(t) ?? false;
                const Icon = TYPE_META[t].icon;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...filters, types: toggle(filters.types, t) })}
                    className={cn(
                      'focus-ring inline-flex h-7 items-center gap-1.5 rounded-control border px-2 text-caption transition-colors duration-fast',
                      on ? 'border-accent/50 bg-accent/10 text-text' : 'border-border-strong text-text-muted hover:text-text',
                    )}
                  >
                    <Icon className={cn('size-3.5', TYPE_META[t].text)} aria-hidden />
                    {TYPE_META[t].label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-caption text-text-muted">Verification</legend>
            <div className="flex flex-wrap gap-1.5">
              {(['verified_success', 'unverified', 'verified_failure'] as VerificationStatus[]).map((v) => {
                const on = filters.verification?.includes(v) ?? false;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...filters, verification: toggle(filters.verification, v) })}
                    className={cn('focus-ring rounded-control', on ? 'ring-1 ring-accent/60' : 'opacity-70 hover:opacity-100')}
                  >
                    <VerificationBadge status={v} />
                  </button>
                );
              })}
            </div>
          </fieldset>
          {count > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onChange({})}>
              Clear filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
