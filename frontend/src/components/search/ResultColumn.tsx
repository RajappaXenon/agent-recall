import * as React from 'react';
import { Play, SearchX } from 'lucide-react';
import type { SearchResponseBase, SearchResult } from '@agent-recall/shared';
import { MODE_META, type SearchMode } from '@/lib/tokens';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';
import { Panel } from '@/components/ui/panel';
import { Badge, EngineBadge } from '@/components/ui/badge';
import { LatencyChip } from '@/components/ui/latency-chip';
import { ResultRow } from '@/components/ui/result-row';
import { ResultRowSkeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState, ErrorState } from '@/components/ui/states';

const BAR: Record<SearchMode, string> = { keyword: 'bg-mode-keyword', semantic: 'bg-mode-semantic', hybrid: 'bg-mode-hybrid' };

export function ResultColumn({
  mode,
  data,
  loading,
  error,
  onRun,
  runId,
  hoveredId,
  onHover,
  selectedId,
  onSelect,
  checked,
  onCheck,
  showRankChips,
  onLayoutSettled,
  className,
}: {
  mode: SearchMode;
  data?: SearchResponseBase;
  loading: boolean;
  error?: string | null;
  onRun: () => void;
  runId: number;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (r: SearchResult) => void;
  checked: Set<string>;
  onCheck: (id: string, on: boolean) => void;
  showRankChips?: boolean;
  onLayoutSettled?: () => void;
  className?: string;
}) {
  const meta = MODE_META[mode];
  const reduced = usePrefersReducedMotion();
  const listRef = React.useRef<HTMLDivElement>(null);
  const prevRects = React.useRef(new Map<string, number>());
  const prevRunId = React.useRef(runId);
  const max = data ? Math.max(...data.results.map((r) => r.score), 0) : 0;

  // FLIP: when the same run re-orders (outcome policy toggle), slide rows to their new positions (300 ms).
  React.useLayoutEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-memory-id]')];
    const sameRun = prevRunId.current === runId;
    prevRunId.current = runId;
    const next = new Map(rows.map((el) => [el.dataset.memoryId!, el.getBoundingClientRect().top]));
    let moved = false;
    if (sameRun && !reduced) {
      for (const el of rows) {
        const before = prevRects.current.get(el.dataset.memoryId!);
        const after = next.get(el.dataset.memoryId!)!;
        if (before === undefined || before === after) continue;
        moved = true;
        el.style.transition = 'none';
        el.style.transform = `translateY(${before - after}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 300ms var(--ease-out)';
          el.style.transform = '';
        });
      }
    }
    prevRects.current = next;
    if (moved) {
      const t = setTimeout(() => onLayoutSettled?.(), 320);
      return () => clearTimeout(t);
    }
    onLayoutSettled?.();
  }, [data, runId, reduced, onLayoutSettled]);

  const fallback = data && (data.engine === 'fallback_regex' || data.engine === 'unavailable');

  return (
    <Panel
      data-column={mode}
      flush
      className={cn('min-w-0', fallback && 'border-warning/40', className)}
      title={<span className={meta.text}>{meta.label}</span>}
      meta={
        data && (
          <>
            <EngineBadge engine={data.engine} />
            <LatencyChip ms={data.latencyMs.total} className="whitespace-nowrap" />
          </>
        )
      }
      actions={
        <Tooltip content={`Run ${meta.label.toLowerCase()} search only`}>
          <Button size="icon-sm" variant="ghost" onClick={onRun} disabled={loading} aria-label={`Run ${meta.label.toLowerCase()} search only`}>
            <Play aria-hidden />
          </Button>
        </Tooltip>
      }
    >
      {data?.warnings.map((w) => (
        <p key={w} className="border-b border-warning/30 bg-warning/[0.06] px-3 py-2 text-caption font-normal text-warning">
          {w}
        </p>
      ))}
      <div ref={listRef} className="relative">
        {loading && !data && Array.from({ length: 5 }).map((_, i) => <ResultRowSkeleton key={i} />)}
        {error && !loading && <ErrorState title={`${meta.label} search failed.`} fix={error} onRetry={onRun} />}
        {!loading && !error && !data && (
          <EmptyState icon={SearchX} message={`Run the query to see ${meta.label.toLowerCase()} results.`} className="py-12" />
        )}
        {data && data.results.length === 0 && !loading && (
          <EmptyState
            icon={SearchX}
            message={data.engine === 'unavailable' ? 'This mode did not run. See the reason above.' : 'No memories matched.'}
            className="py-12"
          />
        )}
        {data?.results.map((r, i) => (
          <ResultRow
            key={`${runId}-${r.memory.id}`}
            data-memory-id={r.memory.id}
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
            barClass={BAR[mode]}
            active={hoveredId === r.memory.id}
            dimmed={hoveredId !== null && hoveredId !== r.memory.id}
            selected={selectedId === r.memory.id}
            onHoverChange={(h) => onHover(h ? r.memory.id : null)}
            onSelect={() => onSelect(r)}
            checked={checked.has(r.memory.id)}
            onCheckedChange={(on) => onCheck(r.memory.id, on)}
            className={cn(loading && 'opacity-60', 'animate-row-in')}
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
            rankChips={
              showRankChips && mode === 'hybrid' ? (
                <>
                  {r.sources.map((s) => (
                    <Badge key={s.mode} tone={s.mode === 'keyword' ? 'keyword' : 'semantic'} className="tabular">
                      {s.mode === 'keyword' ? 'K' : 'S'}
                      {s.rank}
                    </Badge>
                  ))}
                </>
              ) : r.policyMultiplier !== undefined && r.policyMultiplier !== 1 && r.rankBeforePolicy && r.rankBeforePolicy !== r.rank ? (
                <Badge
                  tone={r.policyMultiplier > 1 ? 'success' : 'danger'}
                  className="tabular"
                  title={`Outcome policy ×${r.policyMultiplier.toFixed(2)}: rank ${r.rankBeforePolicy} → ${r.rank}`}
                >
                  {r.rankBeforePolicy > r.rank ? '↑' : '↓'} from {r.rankBeforePolicy}
                </Badge>
              ) : undefined
            }
          />
        ))}
      </div>
    </Panel>
  );
}
