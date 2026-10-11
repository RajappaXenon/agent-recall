import * as React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import type { MemoryType } from '@agent-recall/shared';
import { TYPE_META, tokenColor } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { axisProps, ChartTooltip, gridProps } from './chart-kit';

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Chart / table toggle state; render the button in the panel header (no extra row above the chart). */
export function useChartTable(title: string) {
  const [table, setTable] = React.useState(false);
  const toggle = (
    <Button size="sm" variant="ghost" onClick={() => setTable((t) => !t)} aria-pressed={table} aria-label={table ? `Show ${title} as chart` : `Show ${title} as table`}>
      {table ? <BarChart3 aria-hidden /> : <Table2 aria-hidden />}
      {table ? 'Chart' : 'Table'}
    </Button>
  );
  return { table, toggle };
}

/** Every chart has an accessible table view of the same rows. */
export function ChartFrame({
  title,
  chart,
  columns,
  rows,
  height,
  table,
}: {
  title: string;
  chart: React.ReactNode;
  columns: { key: string; header: string; align?: 'right' }[];
  rows: Record<string, React.ReactNode>[];
  height: number;
  table: boolean;
}) {
  return table ? (
    <div className="overflow-auto" style={{ maxHeight: height }}>
      <table className="w-full text-left text-dense">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`sticky top-0 border-b border-border bg-surface px-2 py-1.5 text-caption text-text-muted ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className={`tabular px-2 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div style={{ height }} role="img" aria-label={`${title} chart. Use the Table button for the values.`}>
      {chart}
    </div>
  );
}

/** One measure per chart (created and retrieved have very different scales): two single-series areas on a shared time axis. */
export function ActivityCharts({ data, table }: { data: { date: string; created: number; retrieved: number }[]; table: boolean }) {
  const series = [
    { key: 'created' as const, label: 'Memories created per day', token: 'accent' },
    { key: 'retrieved' as const, label: 'Memories returned by searches per day', token: 'accent-2' },
  ];
  return (
    <ChartFrame
      title="Memory activity"
      table={table}
      height={260}
      columns={[
        { key: 'date', header: 'Date' },
        { key: 'created', header: 'Created', align: 'right' },
        { key: 'retrieved', header: 'Returned by searches', align: 'right' },
      ]}
      rows={[...data].reverse().map((d) => ({ date: shortDate(d.date), created: d.created, retrieved: d.retrieved }))}
      chart={
        <div className="flex h-full flex-col gap-3">
          {series.map((s, i) => (
            <div key={s.key} className="flex min-h-0 flex-1 flex-col">
              <span className="text-caption text-text-muted">{s.label}</span>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer>
                  <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} syncId="activity">
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={40} hide={i === 0} />
                    <YAxis {...axisProps} allowDecimals={false} width={32} />
                    <Tooltip
                      content={<ChartTooltip labelFormatter={shortDate} />}
                      cursor={{ stroke: tokenColor('border-strong'), strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey={s.key}
                      name={s.key === 'created' ? 'Created' : 'Returned'}
                      stroke={tokenColor(s.token)}
                      strokeWidth={2}
                      fill={tokenColor(s.token, 0.12)}
                      dot={false}
                      activeDot={{ r: 4, stroke: tokenColor('surface'), strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}

/** Horizontal bars; each row carries its type icon + label + value, so colour is never the only cue. */
export function TypeBars({ data, table }: { data: { type: MemoryType; count: number }[]; table: boolean }) {
  const rows = data.map((d) => ({ ...d, label: TYPE_META[d.type].label }));
  const total = rows.reduce((s, r) => s + r.count, 0);
  const TypeTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
    const row = rows.find((r) => r.label === payload?.value);
    if (!row) return null;
    const Icon = TYPE_META[row.type].icon;
    return (
      <g transform={`translate(${(x ?? 0) - 96},${(y ?? 0) - 8})`}>
        <foreignObject width={92} height={18}>
          <div className="flex items-center gap-1.5 text-caption text-text-muted">
            <Icon className={`size-3.5 ${TYPE_META[row.type].text}`} aria-hidden />
            {row.label}
          </div>
        </foreignObject>
      </g>
    );
  };
  return (
    <ChartFrame
      title="Memories by type"
      table={table}
      height={232}
      columns={[
        { key: 'type', header: 'Type' },
        { key: 'count', header: 'Memories', align: 'right' },
        { key: 'share', header: 'Share', align: 'right' },
      ]}
      rows={rows.map((r) => ({ type: r.label, count: r.count, share: total ? `${Math.round((r.count / total) * 100)}%` : '—' }))}
      chart={
        <ResponsiveContainer>
          <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 36, bottom: 0, left: 100 }} barCategoryGap={6}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} allowDecimals={false} />
            <YAxis type="category" dataKey="label" {...axisProps} width={4} tick={<TypeTick />} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: tokenColor('surface-raised') }} />
            <Bar dataKey="count" name="Memories" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.type} fill={tokenColor(TYPE_META[r.type].token)} />
              ))}
              <LabelList dataKey="count" position="right" fill={tokenColor('text')} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      }
    />
  );
}

/**
 * Worked vs failed per week, stacked. Status colours are only ~7 ΔE apart for deuteranopes,
 * so "failed" also carries a hatch texture, a legend, and 2px gaps between segments.
 */
export function OutcomeBars({ data, table }: { data: { week: string; worked: number; failed: number }[]; table: boolean }) {
  const label = (w: string) => w.replace(/^\d{4}-W/, 'W');
  return (
    <ChartFrame
      title="Outcomes per week"
      table={table}
      height={240}
      columns={[
        { key: 'week', header: 'ISO week' },
        { key: 'worked', header: 'Worked', align: 'right' },
        { key: 'failed', header: 'Failed', align: 'right' },
      ]}
      rows={[...data].reverse().map((d) => ({ week: d.week, worked: d.worked, failed: d.failed }))}
      chart={
        <div className="flex h-full flex-col">
          <div className="mb-2 flex gap-4 text-caption text-text-muted" aria-hidden>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-success" /> Worked
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="10" height="10" className="rounded-[2px]">
                <rect width="10" height="10" fill="url(#hatch-failed)" />
              </svg>
              Failed
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
                <defs>
                  <pattern id="hatch-failed" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                    <rect width="5" height="5" fill={tokenColor('danger', 0.85)} />
                    <line x1="0" y1="0" x2="0" y2="5" stroke={tokenColor('surface')} strokeWidth="1.6" />
                  </pattern>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="week" {...axisProps} tickFormatter={label} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} width={32} />
                <Tooltip content={<ChartTooltip labelFormatter={(w) => `ISO week ${w}`} />} cursor={{ fill: tokenColor('surface-raised') }} />
                <Bar dataKey="worked" name="Worked" stackId="o" fill={tokenColor('success')} stroke={tokenColor('surface')} strokeWidth={2} isAnimationActive={false} />
                <Bar dataKey="failed" name="Failed" stackId="o" fill="url(#hatch-failed)" stroke={tokenColor('surface')} strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      }
    />
  );
}
