import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-shimmer rounded-control bg-surface-raised', className)} />;
}

/** Shaped like a ResultRow so nothing shifts when data arrives. */
export function ResultRowSkeleton() {
  return (
    <div className="flex gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
      <Skeleton className="mt-0.5 h-4 w-6" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
        <div className="flex items-center gap-2 pt-0.5">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
        <Skeleton className="mt-1 h-1 w-full" />
      </div>
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-row-dense items-center gap-4 border-b border-border px-3 last:border-b-0">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-2/5' : 'w-1/6')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricTileSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-border bg-surface p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-[34px] w-20" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
