import * as React from 'react';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import type { SelectOption } from './select';

/** Searchable single-select. */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  className,
  id,
  'aria-label': ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (v: string | undefined) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'focus-ring inline-flex h-9 items-center justify-between gap-2 rounded-control border border-border bg-surface-raised px-3 text-left text-body transition-colors duration-fast hover:border-border-strong',
            !selected && 'text-text-faint',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.icon}
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command className="flex flex-col">
          <Command.Input
            placeholder={searchPlaceholder}
            className="h-9 border-b border-border bg-transparent px-3 text-dense text-text outline-none placeholder:text-text-faint"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-3 text-dense text-text-muted">{emptyText}</Command.Empty>
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.value}`}
                onSelect={() => {
                  onValueChange(o.value === value ? undefined : o.value);
                  setOpen(false);
                }}
                className="flex h-8 cursor-default items-center gap-2 rounded-control px-2 text-dense text-text data-[selected=true]:bg-surface-raised"
              >
                {o.icon}
                <span className="flex-1 truncate">{o.label}</span>
                {o.value === value && <Check className="size-4 text-accent" aria-hidden />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
