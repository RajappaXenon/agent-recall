import * as React from 'react';
import { cn } from '@/lib/utils';

export function Panel({
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
  as: Comp = 'section',
  ...rest
}: {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (for row lists and tables). */
  flush?: boolean;
  as?: 'section' | 'div' | 'aside';
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const headingId = React.useId();
  return (
    <Comp
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex min-w-0 flex-col rounded-panel border border-border bg-surface', className)}
      {...rest}
    >
      {(title || actions || meta) && (
        <header className="flex min-h-12 items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {title && (
              <h2 id={headingId} className="truncate text-section text-text">
                {title}
              </h2>
            )}
            {meta && <div className="flex min-w-0 items-center gap-2 text-caption text-text-muted">{meta}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', !flush && 'p-4', bodyClassName)}>{children}</div>
    </Comp>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-title text-text">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-body text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
