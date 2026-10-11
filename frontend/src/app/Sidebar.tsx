import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/queries';
import { Tooltip } from '@/components/ui/tooltip';
import { NAV_FOOTER, NAV_MAIN, type NavItem } from './nav';

export function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <path d="M16 4 28 16 16 28 4 16Z" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="3.5" fill="rgb(var(--accent-2))" />
      </svg>
      {!collapsed && <span className="text-section font-semibold tracking-tight text-text">Agent Recall</span>}
    </div>
  );
}

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'focus-ring relative flex h-9 items-center gap-3 rounded-control text-dense font-medium transition-colors duration-fast',
          collapsed ? 'justify-center px-0' : 'px-3',
          isActive
            ? 'bg-surface-raised text-text before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-full before:bg-accent'
            : 'text-text-muted hover:bg-surface-raised/60 hover:text-text',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  showToggle = true,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  showToggle?: boolean;
}) {
  const session = useSession();
  const orgName = session.data?.org.name ?? 'Demo org';
  return (
    <nav aria-label="Primary" className="flex h-full flex-col bg-sidebar">
      <div className={cn('flex h-header shrink-0 items-center border-b border-border', collapsed ? 'justify-center' : 'px-5')}>
        <Logo collapsed={collapsed} />
      </div>
      <div className={cn('flex flex-1 flex-col gap-0.5 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {NAV_MAIN.map((item) => (
          <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
      <div className={cn('flex flex-col gap-0.5 border-t border-border py-3', collapsed ? 'px-2' : 'px-3')}>
        {NAV_FOOTER.map((item) => (
          <NavRow key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <div className={cn('mt-2 flex items-center gap-2.5', collapsed ? 'justify-center py-1' : 'px-3 py-2')}>
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-control border border-border-strong bg-surface-raised text-caption text-text"
            aria-hidden
          >
            {orgName.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-dense font-medium text-text">{orgName}</div>
              <div className="truncate text-caption font-normal text-text-muted">{session.data?.user.email ?? 'Signing in…'}</div>
            </div>
          )}
        </div>
        {collapsed ? (
          <Tooltip content="Demo auth — not production-secure" side="right">
            <span tabIndex={0} className="focus-ring mx-auto flex size-7 items-center justify-center rounded-control text-warning" aria-label="Demo auth — not production-secure">
              <ShieldAlert className="size-4" aria-hidden />
            </span>
          </Tooltip>
        ) : (
          <div className="mx-0 flex items-start gap-1.5 rounded-control border border-warning/25 bg-warning/[0.06] px-2.5 py-1.5 text-caption font-normal text-warning">
            <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Demo auth — not production-secure
          </div>
        )}
        {showToggle && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'focus-ring mt-1 flex h-8 items-center gap-3 rounded-control text-dense text-text-muted hover:bg-surface-raised/60 hover:text-text',
              collapsed ? 'justify-center' : 'px-3',
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </nav>
  );
}
