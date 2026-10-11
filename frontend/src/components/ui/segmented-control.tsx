import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Tailwind text class applied when active (e.g. mode colour). */
  activeClass?: string;
}

/** Radio-group semantics with arrow-key navigation. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: SegmentOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label': string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const opt = options[next];
    if (opt) {
      onValueChange(opt.value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-control border border-border bg-bg p-0.5', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'focus-ring inline-flex items-center gap-1.5 rounded-[4px] font-medium transition-colors duration-fast [&_svg]:size-3.5',
              size === 'sm' ? 'h-6 px-2 text-caption' : 'h-7 px-3 text-dense',
              active
                ? cn('bg-surface-raised shadow-[inset_0_0_0_1px_rgb(var(--border-strong))]', o.activeClass ?? 'text-text')
                : 'text-text-muted hover:text-text',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
