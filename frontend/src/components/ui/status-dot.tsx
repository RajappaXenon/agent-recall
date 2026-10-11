import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-faint',
  accent: 'bg-accent',
};

/** A dot is never alone: it always carries a text label. */
export function StatusDot({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-dense text-text-muted', className)}>
      <span className="relative inline-flex size-2" aria-hidden>
        {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-50', DOT[tone])} />}
        <span className={cn('relative inline-flex size-2 rounded-full', DOT[tone])} />
      </span>
      {label}
    </span>
  );
}
