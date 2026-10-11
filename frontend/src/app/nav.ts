import { Activity, Bot, FlaskConical, LayoutDashboard, Library, ScanSearch, Settings, TrendingUp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Breadcrumb label. */
  crumb: string;
}

export const NAV_MAIN: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, crumb: 'Overview' },
  { to: '/memories', label: 'Memory Explorer', icon: Library, crumb: 'Memory Explorer' },
  { to: '/search', label: 'Search Playground', icon: ScanSearch, crumb: 'Search Playground' },
  { to: '/agents', label: 'Agents', icon: Bot, crumb: 'Agents' },
  { to: '/learning', label: 'Learning & Insights', icon: TrendingUp, crumb: 'Learning & Insights' },
  { to: '/benchmarks', label: 'Benchmarks', icon: FlaskConical, crumb: 'Benchmarks' },
  { to: '/activity', label: 'Activity Log', icon: Activity, crumb: 'Activity Log' },
];

export const NAV_FOOTER: NavItem[] = [
  { to: '/settings', label: 'Settings & Integrations', icon: Settings, crumb: 'Settings & Integrations' },
];

export const ALL_NAV = [...NAV_MAIN, ...NAV_FOOTER];
