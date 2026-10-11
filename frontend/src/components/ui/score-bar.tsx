import { cn } from '@/lib/utils';

/**
 * Thin bar scaled within its own column only (value / columnMax).
 * Scores from different modes are never put on one scale.
 */
export function ScoreBar({
  value,
  max,
  colorClass = 'bg-accent',
  className,
  label,
}: {
  value: number;
  max: number;
  colorClass?: string;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-border', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label ?? 'Relative score within this column'}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-base ease-out', colorClass)} style={{ width: `${pct}%` }} />
    </div>
  );
}
