import * as React from 'react';
import type { MemoryType, VerificationStatus } from '@agent-recall/shared';
import { cn, formatScore } from '@/lib/utils';
import { TYPE_META } from '@/lib/tokens';
import { DemoDataBadge, VerificationBadge } from './badge';
import { ScoreBar } from './score-bar';
import { Checkbox } from './checkbox';

export interface HighlightFragment {
  value: string;
  type: 'hit' | 'text';
}

/** Renders a highlighted excerpt: matched terms in --text on a subtle accent tint. */
export function Excerpt({ fragments, fallback, className }: { fragments?: HighlightFragment[][]; fallback: string; className?: string }) {
  const first = fragments?.[0];
  return (
    <p className={cn('line-clamp-2 text-dense text-text-muted', className)}>
      {first
        ? first.map((f, i) =>
            f.type === 'hit' ? (
              <mark key={i} className="rounded-[3px] bg-accent/20 px-0.5 text-text">
                {f.value}
              </mark>
            ) : (
              <React.Fragment key={i}>{f.value}</React.Fragment>
            ),
          )
        : fallback}
    </p>
  );
}

export interface ResultRowProps {
  rank: number;
  title: string;
  type: MemoryType;
  excerpt: string;
  highlights?: HighlightFragment[][];
  verification: VerificationStatus;
  isSeed?: boolean;
  score: number;
  scoreKind: string;
  columnMax: number;
  barClass?: string;
  selected?: boolean;
  active?: boolean;
  dimmed?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onSelect?: () => void;
  onHoverChange?: (hovering: boolean) => void;
  rankChips?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'data-memory-id'?: string;
}

/** A search result as a row: rank, type icon, title, excerpt, verification, score with its kind, column-scaled bar. */
export const ResultRow = React.forwardRef<HTMLDivElement, ResultRowProps>(function ResultRow(
  {
    rank,
    title,
    type,
    excerpt,
    highlights,
    verification,
    isSeed,
    score,
    scoreKind,
    columnMax,
    barClass = 'bg-accent',
    selected,
    active,
    dimmed,
    checked,
    onCheckedChange,
    onSelect,
    onHoverChange,
    rankChips,
    className,
    style,
    ...rest
  },
  ref,
) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <div
      ref={ref}
      data-memory-id={rest['data-memory-id']}
      style={style}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      className={cn(
        'group relative flex gap-3 border-b border-border px-3 py-2.5 transition-[background-color,opacity] duration-fast last:border-b-0',
        active ? 'bg-surface-raised' : 'hover:bg-surface-raised',
        selected && 'shadow-[inset_2px_0_0_rgb(var(--accent))]',
        dimmed && 'opacity-30',
        className,
      )}
    >
      <div className="flex w-6 shrink-0 flex-col items-center gap-2 pt-0.5">
        <span className="tabular text-dense font-semibold text-text-muted">{rank}</span>
        {onCheckedChange && (
          <Checkbox
            checked={Boolean(checked)}
            onCheckedChange={(v) => onCheckedChange(v === true)}
            aria-label={`Select ${title}`}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="focus-ring -m-1 flex min-w-0 flex-1 flex-col gap-1 rounded-control p-1 text-left"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className={cn('size-3.5 shrink-0', meta.text)} aria-label={`${meta.label} memory`} />
          <span className="truncate text-dense font-medium text-text">{title}</span>
        </div>
        <Excerpt fragments={highlights} fallback={excerpt} />
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <VerificationBadge status={verification} />
          {isSeed && <DemoDataBadge />}
          {rankChips}
          <span className="tabular ml-auto text-caption text-text-muted">
            {scoreKind} <span className="text-text">{formatScore(score, scoreKind)}</span>
          </span>
        </div>
        <ScoreBar value={score} max={columnMax} colorClass={barClass} className="mt-1" />
      </button>
    </div>
  );
});
