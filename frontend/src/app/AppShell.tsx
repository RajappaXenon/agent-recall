import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link, Outlet, useLocation, useMatches } from 'react-router-dom';
import { ChevronRight, Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sidebar } from './Sidebar';
import { IntegrationPill } from './IntegrationPill';
import { CommandPalette } from './CommandPalette';
import { ALL_NAV } from './nav';

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export interface CrumbHandle {
  crumb?: string | ((params: Record<string, string | undefined>) => string);
}

function Breadcrumb() {
  const location = useLocation();
  const matches = useMatches();
  const section =
    location.pathname === '/' ? ALL_NAV[0]! : ALL_NAV.filter((n) => n.to !== '/').find((n) => location.pathname.startsWith(n.to));
  const leaf = [...matches]
    .reverse()
    .map((m) => {
      const h = m.handle as CrumbHandle | undefined;
      if (!h?.crumb) return null;
      return typeof h.crumb === 'function' ? h.crumb(m.params) : h.crumb;
    })
    .find(Boolean);
  const crumbs = [...(section ? [section.crumb] : []), ...(leaf && leaf !== section?.crumb ? [leaf] : [])];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-dense">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-text-muted sm:block" aria-hidden />}
          {i === 0 && crumbs.length > 1 && section ? (
            <Link to={section.to} className="focus-ring hidden truncate rounded-control text-text-muted hover:text-text sm:inline">
              {c}
            </Link>
          ) : (
            <span className={cn('truncate', i === crumbs.length - 1 ? 'font-medium text-text' : 'text-text-muted')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
              {c}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function AppShell() {
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [userCollapsed, setUserCollapsed] = React.useState<boolean | null>(null);
  const collapsed = userCollapsed ?? !isDesktop;
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setSheetOpen(false), [location.pathname]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#main"
        className="focus-ring sr-only z-[60] rounded-control bg-accent px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      {!isMobile && (
        <aside
          className={cn(
            'sticky top-0 h-dvh shrink-0 border-r border-border transition-[width] duration-base ease-out',
            collapsed ? 'w-rail' : 'w-sidebar',
          )}
        >
          <Sidebar collapsed={collapsed} onToggle={() => setUserCollapsed(!collapsed)} />
        </aside>
      )}
      {isMobile && (
        <DialogPrimitive.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border-strong shadow-overlay data-[state=open]:animate-in data-[state=open]:slide-in-from-left-8"
            >
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Sidebar collapsed={false} showToggle={false} onNavigate={() => setSheetOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-header shrink-0 items-center gap-3 border-b border-border bg-bg px-4 md:px-6">
          {isMobile && (
            <Button size="icon" variant="ghost" onClick={() => setSheetOpen(true)} aria-label="Open navigation">
              <Menu aria-hidden />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <Breadcrumb />
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="focus-ring hidden h-8 w-64 items-center gap-2 rounded-control border border-border bg-surface px-2.5 text-dense text-text-muted transition-colors duration-fast hover:border-border-strong hover:text-text md:inline-flex"
            aria-label="Open command palette to search memories"
          >
            <Search className="size-3.5" aria-hidden />
            <span className="flex-1 text-left">Search memories</span>
            <kbd className="rounded-[4px] border border-border-strong px-1 text-caption">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="md:hidden"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search memories"
          >
            <Search aria-hidden />
          </Button>
          <IntegrationPill />
        </header>
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
