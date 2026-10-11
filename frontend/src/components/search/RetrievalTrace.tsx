import * as React from 'react';
import type { Engine, SearchResult } from '@agent-recall/shared';
import { tokenColor } from '@/lib/tokens';
import { cn } from '@/lib/utils';

interface Line {
  key: string;
  id: string;
  mode: 'keyword' | 'semantic';
  d: string;
  width: number;
  dashed: boolean;
  label?: { x: number; y: number; text: string; anchor: 'start' | 'end' };
}

const MAX_CONTRIBUTION = 1 / 61; // rank 1
const MIN_CONTRIBUTION = 1 / 80; // rank 20 (component lists are top 20)
/** Stroke width is linear in the source's RRF contribution 1/(60+rank): 4px at rank 1 → 1px at rank 20. */
const strokeFor = (rank: number) => 1 + (3 * (1 / (60 + rank) - MIN_CONTRIBUTION)) / (MAX_CONTRIBUTION - MIN_CONTRIBUTION);

/**
 * SVG layer connecting each hybrid row to its rows in the Keyword (left) and
 * Semantic (right) columns. Stroke width ∝ that source's RRF contribution 1/(60+rank).
 * Built from the real ranks in the API response; a source outside the visible
 * column gets a dashed stub labelled with its rank.
 */
export function RetrievalTrace({
  containerRef,
  hybrid,
  engines,
  hoveredId,
  animate,
  layoutVersion,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  hybrid: SearchResult[];
  engines: { keyword?: Engine; semantic?: Engine };
  hoveredId: string | null;
  animate: boolean;
  layoutVersion: number;
}) {
  const [lines, setLines] = React.useState<Line[]>([]);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  const compute = React.useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    setSize({ w: box.width, h: box.height });
    const rowIn = (col: string, id: string) => root.querySelector<HTMLElement>(`[data-column="${col}"] [data-memory-id="${id}"]`);
    const colBox = (col: string) => root.querySelector<HTMLElement>(`[data-column="${col}"]`)?.getBoundingClientRect();
    const hybridCol = colBox('hybrid');
    if (!hybridCol) return setLines([]);
    const out: Line[] = [];
    for (const r of hybrid) {
      const target = rowIn('hybrid', r.memory.id);
      if (!target) continue;
      const t = target.getBoundingClientRect();
      const ty = t.top + t.height / 2 - box.top;
      for (const s of r.sources) {
        const engine = engines[s.mode];
        if (!engine || engine === 'unavailable') continue;
        const dashed = engine === 'fallback_regex';
        const width = Math.max(1, strokeFor(s.rank));
        const src = rowIn(s.mode, r.memory.id);
        const left = s.mode === 'keyword';
        const tx = left ? t.left - box.left : t.right - box.left;
        if (src) {
          const sb = src.getBoundingClientRect();
          const sx = left ? sb.right - box.left : sb.left - box.left;
          const sy = sb.top + sb.height / 2 - box.top;
          const mid = (sx + tx) / 2;
          out.push({ key: `${r.memory.id}-${s.mode}`, id: r.memory.id, mode: s.mode, d: `M${sx},${sy} C${mid},${sy} ${mid},${ty} ${tx},${ty}`, width, dashed });
        } else {
          // Source rank exists but isn't shown in the column (outside its visible top N).
          const col = colBox(s.mode);
          if (!col) continue;
          const sx = left ? col.right - box.left : col.left - box.left;
          const stub = left ? Math.max(sx, tx - 18) : Math.min(sx, tx + 18);
          out.push({
            key: `${r.memory.id}-${s.mode}`,
            id: r.memory.id,
            mode: s.mode,
            d: `M${stub},${ty} L${tx},${ty}`,
            width: 1,
            dashed: true,
            label: { x: left ? stub - 3 : stub + 3, y: ty + 3.5, text: `${left ? 'K' : 'S'}${s.rank}`, anchor: left ? 'end' : 'start' },
          });
        }
      }
    }
    setLines(out);
  }, [containerRef, hybrid, engines]);

  React.useLayoutEffect(() => {
    compute();
  }, [compute, layoutVersion]);

  React.useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(root);
    return () => ro.disconnect();
  }, [containerRef, compute]);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
    >
      {lines.map((l, i) => {
        const active = hoveredId === null || hoveredId === l.id;
        const color = tokenColor(l.mode === 'keyword' ? 'keyword' : 'accent-2');
        return (
          <g key={l.key} className="transition-opacity duration-fast" style={{ opacity: active ? (hoveredId ? 1 : 0.5) : 0.08 }}>
            <path
              d={l.d}
              fill="none"
              stroke={color}
              strokeWidth={hoveredId === l.id ? l.width + 0.75 : l.width}
              strokeLinecap="round"
              pathLength={l.dashed ? undefined : 1}
              strokeDasharray={l.dashed ? '3 3' : animate ? 1 : undefined}
              className={cn(!l.dashed && animate && 'trace-draw')}
              style={!l.dashed && animate ? { animationDelay: `${380 + i * 12}ms` } : undefined}
            />
            {l.label && (
              <text x={l.label.x} y={l.label.y} textAnchor={l.label.anchor} fontSize={10} fontFamily="Geist, sans-serif" fill={color}>
                {l.label.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
