import * as React from 'react';
import { AlertCircle, RotateCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** Icon, one sentence, one action. */
export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon: LucideIcon;
  message: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div className="flex size-10 items-center justify-center rounded-panel border border-border bg-surface-raised">
        <Icon className="size-5 text-text-muted" aria-hidden />
      </div>
      <p className="max-w-sm text-body text-text-muted">{message}</p>
      {action}
    </div>
  );
}

/** Inline shell command in copy: monospace and never broken across lines. */
export function Cmd({ children }: { children: React.ReactNode }) {
  return <code className="whitespace-nowrap rounded-[4px] bg-surface-raised px-1 py-px font-mono text-[0.92em] text-text">{children}</code>;
}

/** What failed, how to fix it, and Retry. */
export function ErrorState({
  title,
  fix,
  onRetry,
  code,
  className,
}: {
  title: string;
  fix?: React.ReactNode;
  onRetry?: () => void;
  code?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div className="flex size-10 items-center justify-center rounded-panel border border-danger/30 bg-danger/10">
        <AlertCircle className="size-5 text-danger" aria-hidden />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-body font-medium text-text">{title}</p>
        {fix && <p className="text-dense text-text-muted">{fix}</p>}
        {code && <code className="mt-1 font-mono text-caption text-text-muted">{code}</code>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RotateCw aria-hidden />
          Retry
        </Button>
      )}
    </div>
  );
}
