import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flag, ListChecks, Repeat2, ScanSearch, ThumbsUp } from 'lucide-react';
import type { LearningResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { MetricTile } from '@/components/ui/metric-tile';
import { Badge, DemoDataBadge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { MetricTileSkeleton, Skeleton, TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { OutcomeBars, useChartTable } from '@/components/charts/charts';

export default function Learning() {
  const q = useQuery({ queryKey: ['learning'], queryFn: () => api.get<LearningResponse>('/api/learning') });
  const d = q.data;
  const outcomeView = useChartTable('Outcomes per week');
  const t = d?.outcomeTotals;
  const recorded = t ? t.worked + t.failed : 0;

  return (
    <>
      <PageHeader
        title="Learning & Insights"
        description="What verified outcomes taught the memory store. Learning here means updated memories and ranking signals; no model weights change."
      />
      {q.isError && (
        <Panel className="mb-4">
          <ErrorState title="Could not load insights." fix={q.error instanceof ApiError ? q.error.message : undefined} onRetry={() => void q.refetch()} />
        </Panel>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {!t ? (
          Array.from({ length: 4 }).map((_, i) => <MetricTileSkeleton key={i} />)
        ) : (
          <>
            <MetricTile label="Outcomes recorded" value={recorded} context={`${t.worked} worked · ${t.failed} failed`} badge={t.source === 'seed' ? <DemoDataBadge /> : undefined} />
            <MetricTile label="Worked" value={recorded ? `${Math.round((t.worked / recorded) * 100)}%` : null} context={recorded ? `${t.worked} of ${recorded}` : 'No outcomes yet'} />
            <MetricTile label="Helpful feedback" value={t.helpful + t.notHelpful ? t.helpful : null} context={t.helpful + t.notHelpful ? `of ${t.helpful + t.notHelpful} rated` : 'No feedback yet'} />
            <MetricTile label="Verified procedures" value={d.verifiedProcedures.length} context="procedural memories with a successful outcome" />
          </>
        )}
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Outcomes over time" meta="last 12 weeks" actions={recorded ? outcomeView.toggle : undefined} className="xl:col-span-2">
          {d ? recorded ? <OutcomeBars data={d.outcomesOverTime} table={outcomeView.table} /> : <EmptyState icon={Flag} message="No outcomes recorded yet. Record one from the Search Playground." /> : <Skeleton className="h-[276px] w-full" />}
        </Panel>
        <Panel title="Recurring problems" meta="tags on episodic memories" flush>
          {!d ? (
            <TableRowsSkeleton rows={6} cols={2} />
          ) : d.recurringProblems.length === 0 ? (
            <EmptyState icon={Repeat2} message="No recurring problems yet." />
          ) : (
            <ul>
              {d.recurringProblems.map((p) => (
                <li key={p.tag} className="border-b border-border last:border-b-0">
                  <Link to={`/memories?type=episodic&tag=${encodeURIComponent(p.tag)}`} className="focus-ring flex items-center gap-3 px-4 py-2 hover:bg-surface-raised">
                    <span className="min-w-0 flex-1 truncate font-mono text-dense text-text">{p.tag}</span>
                    <span className="tabular text-caption font-normal text-text-muted">
                      {p.count} {p.count === 1 ? 'experience' : 'experiences'}
                    </span>
                    {p.resolved > 0 && <Badge tone="success">{p.resolved} resolved</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Verified procedures and their evidence" className="mb-4" flush>
        {!d ? (
          <TableRowsSkeleton rows={3} cols={3} />
        ) : d.verifiedProcedures.length === 0 ? (
          <EmptyState icon={ListChecks} message="No procedure has a successful outcome yet." />
        ) : (
          <ul>
            {d.verifiedProcedures.map((p) => (
              <li key={p.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <MemoryTypeBadge type="procedural" compact />
                  <Link to={`/memories?open=${p.id}`} className="focus-ring rounded-control text-dense font-medium text-text hover:underline">
                    {p.title}
                  </Link>
                  <VerificationBadge status={p.verification} />
                  {p.isSeed && <DemoDataBadge />}
                  <span className="ml-auto text-caption font-normal text-text-muted">verified {formatRelative(p.verifiedAt)}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 border-l border-border-strong pl-4">
                  {p.evidence.length === 0 && <li className="text-caption font-normal text-text-muted">Evidence outcomes are older than the last 50 recorded.</li>}
                  {p.evidence.map((e) => (
                    <li key={e.outcomeId} className="flex items-center gap-2 text-dense">
                      <Badge tone={e.result === 'worked' ? 'success' : 'danger'}>{e.result}</Badge>
                      <Link to={`/tasks/${e.taskId}`} className="focus-ring min-w-0 flex-1 truncate rounded-control text-text-muted hover:text-text hover:underline">
                        {e.question}
                      </Link>
                      {e.isSeed && <DemoDataBadge />}
                      <span className="text-caption font-normal text-text-muted">{formatRelative(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Most useful memories" meta="by helpful feedback" flush>
          {!d ? (
            <TableRowsSkeleton rows={5} cols={2} />
          ) : d.mostUseful.length === 0 ? (
            <EmptyState icon={ThumbsUp} message="No feedback recorded yet." />
          ) : (
            <ul>
              {d.mostUseful.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <Link to={`/memories?open=${m.id}`} className="focus-ring flex items-center gap-2 px-4 py-2.5 hover:bg-surface-raised">
                    <MemoryTypeBadge type={m.type} compact />
                    <span className="min-w-0 flex-1 truncate text-dense text-text">{m.title}</span>
                    <span className="tabular text-caption font-normal text-text-muted" title="(helpful + 1) / (rated + 2)">
                      {m.helpful} helpful · {m.notHelpful} not · score {m.score.toFixed(2)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Most retrieved memories" meta="returned by searches" flush>
          {!d ? (
            <TableRowsSkeleton rows={5} cols={2} />
          ) : d.mostRetrieved.length === 0 ? (
            <EmptyState icon={ScanSearch} message="No searches have returned memories yet." />
          ) : (
            <ul>
              {d.mostRetrieved.map((m) => (
                <li key={m.id} className="border-b border-border last:border-b-0">
                  <Link to={`/memories?open=${m.id}`} className="focus-ring flex flex-col px-4 py-2.5 hover:bg-surface-raised">
                    <span className="flex items-center gap-2">
                      <MemoryTypeBadge type={m.type} compact />
                      <span className="min-w-0 flex-1 truncate text-dense text-text">{m.title}</span>
                      <span className="tabular text-caption font-normal text-text-muted">{m.retrievalCount}×</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Feedback history" flush>
        {!d ? (
          <TableRowsSkeleton rows={4} cols={3} />
        ) : d.feedback.length === 0 ? (
          <EmptyState icon={Flag} message="No outcomes recorded yet." />
        ) : (
          <ul>
            {d.feedback.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 border-b border-border px-4 py-2.5 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Badge tone={f.result === 'worked' ? 'success' : 'danger'}>{f.result}</Badge>
                  {f.feedback && <Badge>{f.feedback === 'helpful' ? 'helpful' : 'not helpful'}</Badge>}
                  <Link to={`/tasks/${f.taskId}`} className="focus-ring min-w-0 flex-1 truncate rounded-control text-dense text-text hover:underline">
                    {f.question}
                  </Link>
                  {f.isSeed && <DemoDataBadge />}
                  <span className="text-caption font-normal text-text-muted">{formatRelative(f.createdAt)}</span>
                </div>
                {f.notes && <p className="max-w-prose text-caption font-normal text-text-muted">{f.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
