import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import type { SearchResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { MODE_META, type SearchMode } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Panel } from '@/components/ui/panel';
import { EngineBadge } from '@/components/ui/badge';
import { LatencyChip } from '@/components/ui/latency-chip';
import { ResultRow } from '@/components/ui/result-row';
import { ResultRowSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';

const BAR: Record<SearchMode, string> = { keyword: 'bg-mode-keyword', semantic: 'bg-mode-semantic', hybrid: 'bg-mode-hybrid' };

/** Search box with mode selector; results open the memory drawer. */
export function ExplorerSearch({
  initialQuery,
  onQueryChange,
  onOpen,
}: {
  initialQuery: string;
  onQueryChange: (q: string) => void;
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = React.useState(initialQuery);
  const [mode, setMode] = React.useState<SearchMode>('hybrid');
  const search = useMutation({
    mutationFn: (v: { q: string; mode: SearchMode }) => api.post<SearchResponse>(`/api/search/${v.mode}`, { query: v.q, limit: 10 }),
  });

  const run = React.useCallback(
    (q: string, m: SearchMode) => {
      if (!q.trim()) return;
      onQueryChange(q.trim());
      search.mutate({ q: q.trim(), mode: m });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  React.useEffect(() => {
    if (initialQuery) run(initialQuery, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = search.data;
  const max = data ? Math.max(...data.results.map((r) => r.score), 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          run(query, mode);
        }}
        role="search"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input
            aria-label="Search memories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories by keyword or meaning…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            aria-label="Search mode"
            value={mode}
            onValueChange={(m) => {
              setMode(m);
              if (query.trim()) run(query, m);
            }}
            options={(Object.keys(MODE_META) as SearchMode[]).map((m) => ({ value: m, label: MODE_META[m].label, activeClass: MODE_META[m].text }))}
          />
          <Button type="submit" variant="primary" loading={search.isPending} disabled={!query.trim()}>
            Search
          </Button>
          {(data || search.isError) && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                search.reset();
                onQueryChange('');
              }}
            >
              <X aria-hidden />
            </Button>
          )}
        </div>
      </form>

      {(search.isPending || data || search.isError) && (
        <Panel
          flush
          title={<span className={MODE_META[data?.mode ?? mode].text}>{MODE_META[data?.mode ?? mode].label} results</span>}
          meta={
            data && (
              <>
                <EngineBadge engine={data.engine} />
                <span className="tabular">{data.results.length} results</span>
                <LatencyChip ms={data.latencyMs.total} />
              </>
            )
          }
        >
          {data?.warnings.map((w) => (
            <p key={w} className="border-b border-border bg-warning/[0.06] px-4 py-2 text-dense text-warning">
              {w}
            </p>
          ))}
          {search.isPending && Array.from({ length: 3 }).map((_, i) => <ResultRowSkeleton key={i} />)}
          {search.isError && (
            <ErrorState title="Search failed." fix={search.error instanceof ApiError ? search.error.message : undefined} onRetry={() => run(query, mode)} />
          )}
          {data && !search.isPending && data.results.length === 0 && <EmptyState icon={Search} message="No memories matched this search." />}
          {data &&
            !search.isPending &&
            data.results.map((r) => (
              <ResultRow
                key={r.memory.id}
                rank={r.rank}
                title={r.memory.title}
                type={r.memory.type}
                excerpt={r.memory.content}
                highlights={r.highlights}
                verification={r.memory.verification.status}
                isSeed={r.memory.isSeed}
                score={r.score}
                scoreKind={r.scoreKind}
                columnMax={max}
                barClass={BAR[data.mode]}
                onSelect={() => onOpen(r.memory.id)}
              />
            ))}
        </Panel>
      )}
    </div>
  );
}
