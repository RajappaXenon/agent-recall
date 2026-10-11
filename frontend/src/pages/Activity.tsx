import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity as ActivityIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AppEvent } from '@agent-recall/shared';
import { useEvents } from '@/lib/queries';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { EventRow } from '@/components/activity/EventRow';

const ALL = '__all__';
const PAGE_SIZE = 50;
const TYPES = [
  { value: 'memory', label: 'Memories' },
  { value: 'search', label: 'Searches' },
  { value: 'answer', label: 'Answers' },
  { value: 'outcome', label: 'Outcomes' },
  { value: 'task', label: 'Tasks' },
  { value: 'worker', label: 'Worker' },
  { value: 'agent', label: 'Agents' },
  { value: 'audio', label: 'Audio' },
];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export default function Activity() {
  const [params, setParams] = useSearchParams();
  const typePrefix = params.get('type') ?? undefined;
  const status = params.get('status') ?? undefined;
  const page = Number(params.get('page') ?? 1);
  const q = useEvents({ typePrefix, status, page, pageSize: PAGE_SIZE }, true);

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const groups = React.useMemo(() => {
    const out: { day: string; items: AppEvent[] }[] = [];
    for (const e of q.data?.items ?? []) {
      const day = dayLabel(e.createdAt);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [q.data]);
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Activity Log" description="Everything agents, workers and people did, newest first. Also the audit trail." />
      <Panel
        flush
        title="Events"
        meta={q.data ? <span className="tabular">{total}</span> : null}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              aria-label="Filter by event type"
              className="w-36"
              value={typePrefix ?? ALL}
              onValueChange={(v) => set({ type: v })}
              options={[{ value: ALL, label: 'All types' }, ...TYPES]}
            />
            <Select
              size="sm"
              aria-label="Filter by status"
              className="w-32"
              value={status ?? ALL}
              onValueChange={(v) => set({ status: v })}
              options={[
                { value: ALL, label: 'Any status' },
                { value: 'success', label: 'Success' },
                { value: 'warning', label: 'Warning' },
                { value: 'error', label: 'Error' },
                { value: 'info', label: 'Info' },
              ]}
            />
          </div>
        }
      >
        {q.isLoading ? (
          <TableRowsSkeleton rows={10} cols={2} />
        ) : q.isError ? (
          <ErrorState title="Could not load the activity log." onRetry={() => void q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            message={typePrefix || status ? 'No events match these filters.' : 'No activity yet.'}
            action={
              (typePrefix || status) && (
                <Button size="sm" onClick={() => set({ type: undefined, status: undefined })}>
                  <X aria-hidden />
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day}>
                <h3 className="sticky top-header z-[1] border-b border-border bg-surface px-4 py-2 text-caption text-text-muted">{g.day}</h3>
                <ul>
                  {g.items.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              </section>
            ))}
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-caption text-text-muted">
              <span className="tabular">
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
