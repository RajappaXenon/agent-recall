import * as React from 'react';
import { cn } from '@/lib/utils';
import { tokenColor } from '@/lib/tokens';

function Sparkline({ data, token }: { data: number[]; token: string }) {
  if (data.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / range) * (h - 4)] as const);
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={area} fill={tokenColor(token, 0.12)} />
      <path d={d} fill="none" stroke={tokenColor(token)} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Value, a measured denominator/comparison, optional sparkline.
 * `value === null` renders "—": never a placeholder number.
 */
export function MetricTile({
  label,
  value,
  context,
  spark,
  sparkToken = 'accent',
  badge,
  className,
}: {
  label: string;
  value: React.ReactNode | null;
  context?: React.ReactNode;
  spark?: number[];
  sparkToken?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 rounded-panel border border-border bg-surface p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-caption text-text-muted">{label}</span>
        {badge}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="tabular text-metric text-text">{value ?? '—'}</span>
        {spark && <Sparkline data={spark} token={sparkToken} />}
      </div>
      {context && <div className="tabular truncate text-caption font-normal text-text-muted">{context}</div>}
    </div>
  );
}
