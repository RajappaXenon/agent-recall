import * as React from 'react';
import { cn } from '@/lib/utils';

export type TimelineTone = 'success' | 'warning' | 'danger' | 'accent' | 'neutral';

const TONE: Record<TimelineTone, string> = {
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
  accent: 'border-accent/40 bg-accent/10 text-accent',
  neutral: 'border-border-strong bg-surface-raised text-text-muted',
};

export interface TimelineItem {
  id: string;
  icon: React.ReactNode;
  tone: TimelineTone;
  title: React.ReactNode;
  meta?: React.ReactNode;
  body?: React.ReactNode;
  /** A marker row (e.g. "Worker crashed — resumed…") spans the full width with emphasis. */
  marker?: boolean;
}

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col', className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13px] top-7 w-px bg-border-strong" />}
          <span
            className={cn(
              'relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5',
              TONE[item.tone],
            )}
          >
            {item.icon}
          </span>
          <div
            className={cn(
              'min-w-0 flex-1 pt-0.5',
              item.marker && 'rounded-panel border border-warning/40 bg-warning/[0.06] px-3 py-2.5',
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <div className={cn('text-dense font-medium text-text', item.marker && 'text-[17px] font-semibold leading-6 text-warning')}>{item.title}</div>
              {item.meta && <div className="tabular text-caption font-normal text-text-muted">{item.meta}</div>}
            </div>
            {item.body && <div className={cn('mt-1 text-dense text-text-muted', item.marker && 'text-body text-text')}>{item.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
