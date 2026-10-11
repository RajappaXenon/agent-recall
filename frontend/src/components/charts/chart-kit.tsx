import type { TooltipProps } from 'recharts';
import { tokenColor } from '@/lib/tokens';

/** Shared Recharts styling (DESIGN §6): no borders, horizontal gridlines only, faint 12px axes. */
export const gridProps = { stroke: tokenColor('border'), vertical: false, strokeDasharray: '' } as const;

export const axisProps = {
  stroke: 'transparent',
  tick: { fill: tokenColor('text-faint'), fontSize: 12, fontFamily: 'Geist, sans-serif' },
  tickLine: false,
  axisLine: false,
} as const;

export function ChartTooltip({ active, payload, label, labelFormatter }: TooltipProps<number, string> & { labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control border border-border-strong bg-surface-overlay px-3 py-2 text-caption shadow-overlay">
      {label !== undefined && <div className="mb-1 text-text-muted">{labelFormatter ? labelFormatter(String(label)) : label}</div>}
      <div className="flex flex-col gap-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-text-muted">{p.name}</span>
            <span className="tabular ml-auto pl-3 text-text">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
