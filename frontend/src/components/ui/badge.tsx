import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CircleDashed, CircleCheck, CircleX, Database } from 'lucide-react';
import type { MemoryType, VerificationStatus } from '@agent-recall/shared';
import { cn } from '@/lib/utils';
import { TYPE_META } from '@/lib/tokens';

const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-1.5 text-caption [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border-strong bg-surface-raised text-text-muted',
        accent: 'border-accent/30 bg-accent/10 text-accent',
        success: 'border-success/30 bg-success/10 text-success',
        warning: 'border-warning/35 bg-warning/10 text-warning',
        danger: 'border-danger/35 bg-danger/10 text-danger',
        keyword: 'border-keyword/30 bg-keyword/10 text-keyword',
        semantic: 'border-accent-2/30 bg-accent-2/10 text-accent-2',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Memory type: colour plus icon, never colour alone. */
export function MemoryTypeBadge({ type, compact = false }: { type: MemoryType; compact?: boolean }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-control text-caption',
        meta.text,
        compact ? 'px-0' : 'border border-border-strong bg-surface-raised px-1.5',
      )}
      title={compact ? `${meta.label} memory` : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  if (status === 'verified_success')
    return (
      <Badge tone="success">
        <CircleCheck aria-hidden />
        Verified
      </Badge>
    );
  if (status === 'verified_failure')
    return (
      <Badge tone="danger">
        <CircleX aria-hidden />
        Failed
      </Badge>
    );
  return (
    <Badge tone="neutral">
      <CircleDashed aria-hidden />
      Unverified
    </Badge>
  );
}

export type Engine = 'atlas_search' | 'atlas_vector_search' | 'rrf' | 'fallback_regex' | 'unavailable';

const ENGINE_LABEL: Record<Engine, string> = {
  atlas_search: 'atlas_search',
  atlas_vector_search: 'vector_search',
  rrf: 'rrf',
  fallback_regex: 'Fallback — not Atlas Search',
  unavailable: 'Unavailable',
};

/** Engine pill: honest about which engine actually ran. */
export function EngineBadge({ engine }: { engine: Engine }) {
  if (engine === 'fallback_regex' || engine === 'unavailable')
    return (
      <Badge tone="warning">
        <AlertTriangle aria-hidden />
        {ENGINE_LABEL[engine]}
      </Badge>
    );
  return (
    <Badge tone="neutral" className="font-mono text-[11px]">
      {ENGINE_LABEL[engine]}
    </Badge>
  );
}

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={cn('border-dashed', className)} title="Seeded demo data, not produced by a live run">
      <Database aria-hidden />
      Demo data
    </Badge>
  );
}
