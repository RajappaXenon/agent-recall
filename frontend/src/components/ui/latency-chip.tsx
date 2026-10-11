import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A measured latency. Renders "—" when no measurement exists; never an estimate. */
export function LatencyChip({ ms, label, className }: { ms: number | null | undefined; label?: string; className?: string }) {
  return (
    <span
      className={cn('tabular inline-flex items-center gap-1 text-caption text-text-muted', className)}
      title={label ? `${label}: measured server-side` : 'Measured server-side'}
    >
      <Timer className="size-3" aria-hidden />
      {label && <span className="text-text-muted">{label}</span>}
      <span className="text-text">{ms === null || ms === undefined ? '—' : `${Math.round(ms)} ms`}</span>
    </span>
  );
}
