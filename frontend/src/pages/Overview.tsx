import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, Library, ScanSearch } from 'lucide-react';
import type { DataSource, OverviewResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { INTEGRATION_STATUS_LABEL, integrationTone, useIntegrations } from '@/lib/queries';
import { MODE_META } from '@/lib/tokens';
import { cn, formatNumber, formatRelative } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { MetricTile } from '@/components/ui/metric-tile';
import { Badge, DemoDataBadge, EngineBadge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { LatencyChip } from '@/components/ui/latency-chip';
import { MetricTileSkeleton, Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';
import { Cmd, EmptyState, ErrorState } from '@/components/ui/states';
import { ActivityCharts, TypeBars, useChartTable } from '@/components/charts/charts';

function SourceBadge({ source }: { source: DataSource }) {
  if (source === 'seed') return <DemoDataBadge />;
  if (source === 'mixed') return <Badge title="Includes seeded demo data and live activity">Demo + live</Badge>;
  return null;
}

export default function Overview() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get<OverviewResponse>('/api/overview'), refetchInterval: 30_000 });
  const integrations = useIntegrations();
  const d = q.data;
  const activityView = useChartTable('Memory activity');
  const typeView = useChartTable('Memories by type');

  return (
    <>
      <PageHeader
        title="Memory Intelligence"
        description="Understand what your agents remember, retrieve, and learn."
        actions={
          <>
            <Button asChild>
              <Link to="/memories">
                <Library aria-hidden />
                Explore memories
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link to="/search">
                <ScanSearch aria-hidden />
                Run search demo
              </Link>
            </Button>
          </>
        }
      />

      {q.isError && (
        <Panel className="mb-4">
          <ErrorState title="Could not load the overview." fix={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => void q.refetch()} />
        </Panel>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }).map((_, i) => <MetricTileSkeleton key={i} />)
        ) : (
          <>
            <MetricTile
              label="Total memories"
              value={formatNumber(d.metrics.totalMemories.value)}
              context={`${d.metrics.totalMemories.seed} seeded · ${d.metrics.totalMemories.live} live`}
              spark={d.metrics.totalMemories.spark}
              badge={<SourceBadge source={d.metrics.totalMemories.source} />}
            />
            <MetricTile
              label="Indexed"
              value={formatNumber(d.metrics.indexed.value)}
              context={`of ${d.metrics.indexed.of} have a current embedding`}
              badge={<SourceBadge source={d.metrics.indexed.source} />}
            />
            <MetricTile
              label="Successful outcomes"
              value={formatNumber(d.metrics.successfulOutcomes.value)}
              context={d.metrics.successfulOutcomes.of ? `of ${d.metrics.successfulOutcomes.of} recorded` : 'No outcomes recorded yet'}
              spark={d.metrics.successfulOutcomes.spark}
              sparkToken="success"
              badge={<SourceBadge source={d.metrics.successfulOutcomes.source} />}
            />
            <MetricTile
              label="Retrieval success rate"
              value={d.metrics.retrievalSuccessRate.value === null ? null : `${Math.round(d.metrics.retrievalSuccessRate.value * 100)}%`}
              context={d.metrics.retrievalSuccessRate.of ? `worked ÷ ${d.metrics.retrievalSuccessRate.of} outcomes recorded` : 'No outcomes recorded yet'}
              badge={<SourceBadge source={d.metrics.retrievalSuccessRate.source} />}
            />
          </>
        )}
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Memory activity"
          meta={d ? <>last {d.windowDays} days {d.activitySource === 'seed' && <DemoDataBadge />}</> : null}
          actions={activityView.toggle}
          className="xl:col-span-2"
        >
          {d ? <ActivityCharts data={d.activity} table={activityView.table} /> : <Skeleton className="h-[260px] w-full" />}
        </Panel>
        <Panel title="By type" meta={d ? <span className="tabular">{d.metrics.totalMemories.value} memories</span> : null} actions={typeView.toggle}>
          {d ? <TypeBars data={d.byType} table={typeView.table} /> : <Skeleton className="h-[180px] w-full" />}
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Recent agent experiences" flush className="xl:col-span-2">
          {!d ? (
            <TableRowsSkeleton rows={6} cols={3} />
          ) : d.recentExperiences.length === 0 ? (
            <EmptyState icon={History} message="No episodic memories yet. Record an outcome in the Search Playground to create one." />
          ) : (
            <ul>
              {d.recentExperiences.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <Link to={`/memories?open=${m.id}`} className="focus-ring flex items-center gap-3 px-4 py-2.5 hover:bg-surface-raised">
                    <MemoryTypeBadge type="episodic" compact />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-dense font-medium text-text">{m.title}</div>
                      <div className="text-caption font-normal text-text-muted">
                        {m.agentName} · {formatRelative(m.createdAt)}
                      </div>
                    </div>
                    <VerificationBadge status={m.verification} />
                    {m.isSeed && <DemoDataBadge className="hidden sm:inline-flex" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Integration health"
          flush
        >
          {integrations.isLoading ? (
            <TableRowsSkeleton rows={6} cols={2} />
          ) : (
            <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-1">
              {(integrations.data?.integrations ?? []).map((i) => (
                <li key={i.key} className="flex items-center justify-between gap-3 bg-surface px-4 py-2.5">
                  <span className="min-w-0 truncate text-dense text-text">
                    {i.name}
                    {i.optional && <span className="ml-1.5 text-caption font-normal text-text-muted">optional</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {i.latencyMs !== null && <LatencyChip ms={i.latencyMs} />}
                    <StatusDot tone={integrationTone(i)} label={INTEGRATION_STATUS_LABEL[i.status]} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent searches" meta={d ? <span className="tabular">{d.recentSearches.length}</span> : null} flush>
        {!d ? (
          <TableRowsSkeleton rows={5} cols={5} />
        ) : d.recentSearches.length === 0 ? (
          <EmptyState
            icon={ScanSearch}
            message={
              <>
                No searches yet. Run one in the <Link className="text-accent hover:underline" to="/search">Search Playground</Link> or with <Cmd>npm run demo:e2e -w backend</Cmd>.
              </>
            }
          />
        ) : (
          <div>
            <table className="w-full table-fixed text-left">
              <caption className="sr-only">Recent searches</caption>
              <thead>
                <tr className="text-caption text-text-muted">
                  <th scope="col" className="h-9 border-b border-border px-4 font-medium">Query</th>
                  <th scope="col" className="h-9 w-24 border-b border-border px-3 font-medium">Mode</th>
                  <th scope="col" className="h-9 w-36 border-b border-border px-3 font-medium max-md:hidden">Engine</th>
                  <th scope="col" className="h-9 w-20 border-b border-border px-3 text-right font-medium max-sm:hidden">Results</th>
                  <th scope="col" className="h-9 w-24 border-b border-border px-3 text-right font-medium max-md:hidden">Latency</th>
                  <th scope="col" className="h-9 w-24 border-b border-border px-4 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {d.recentSearches.map((s) => (
                  <tr key={s.id} className="h-row-dense border-b border-border text-dense last:border-b-0 hover:bg-surface-raised">
                    <td className="truncate px-4 text-text" title={s.query}>
                      {s.query}
                    </td>
                    <td className={cn('px-3 font-medium', MODE_META[s.mode].text)}>{MODE_META[s.mode].label}</td>
                    <td className="px-3 max-md:hidden">
                      <EngineBadge engine={s.engine} />
                    </td>
                    <td className="tabular px-3 text-right max-sm:hidden">{s.resultCount}</td>
                    <td className="px-3 text-right max-md:hidden">
                      <LatencyChip ms={s.latencyMs} />
                    </td>
                    <td className="whitespace-nowrap px-4 text-right text-text-muted">{formatRelative(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
