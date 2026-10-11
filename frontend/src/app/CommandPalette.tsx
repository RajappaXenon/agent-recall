import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import { ALL_NAV } from './nav';

export interface PaletteMemoryHit {
  id: string;
  title: string;
  icon: React.ReactNode;
}

/** Hook point for memory search results (wired to the API from Phase 2). */
export const PaletteSearchContext = React.createContext<{
  useMemoryHits: (q: string) => { hits: PaletteMemoryHit[]; loading: boolean };
} | null>(null);

function useNoHits() {
  return { hits: [] as PaletteMemoryHit[], loading: false };
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = React.useState('');
  const ctx = React.useContext(PaletteSearchContext);
  const { hits, loading } = (ctx?.useMemoryHits ?? useNoHits)(q);

  React.useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-overlay border border-border-strong bg-surface-overlay shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command label="Command palette" shouldFilter={true} loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-text-muted" aria-hidden />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search memories or jump to a page…"
                className="h-12 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-faint"
              />
              <kbd className="rounded-[4px] border border-border-strong px-1.5 text-caption text-text-muted">Esc</kbd>
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-dense text-text-muted">
                {loading ? 'Searching…' : 'No matching pages or memories.'}
              </Command.Empty>
              {q.trim().length > 1 && (
                <Command.Group
                  heading="Memories"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-text-muted"
                >
                  <Command.Item
                    value={`search-all ${q}`}
                    onSelect={() => go(`/memories?q=${encodeURIComponent(q.trim())}`)}
                    className="flex h-9 cursor-default items-center gap-3 rounded-control px-2 text-dense text-text data-[selected=true]:bg-surface-raised"
                  >
                    <Search className="size-4 text-text-muted" aria-hidden />
                    Search memories for “{q.trim()}”
                    <CornerDownLeft className="ml-auto size-3.5 text-text-muted" aria-hidden />
                  </Command.Item>
                  {hits.map((h) => (
                    <Command.Item
                      key={h.id}
                      value={`memory ${h.title} ${q}`}
                      onSelect={() => go(`/memories?open=${h.id}`)}
                      className="flex h-9 cursor-default items-center gap-3 rounded-control px-2 text-dense text-text data-[selected=true]:bg-surface-raised"
                    >
                      {h.icon}
                      <span className="truncate">{h.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group
                heading="Pages"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-text-muted"
              >
                {ALL_NAV.map((n) => {
                  const Icon = n.icon;
                  return (
                    <Command.Item
                      key={n.to}
                      value={`page ${n.label}`}
                      onSelect={() => go(n.to)}
                      className="flex h-9 cursor-default items-center gap-3 rounded-control px-2 text-dense text-text data-[selected=true]:bg-surface-raised"
                    >
                      <Icon className="size-4 text-text-muted" aria-hidden />
                      {n.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
