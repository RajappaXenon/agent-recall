import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Activity, LayoutDashboard, Settings, TrendingUp } from 'lucide-react';
import { AppShell } from './AppShell';
import { Placeholder } from '@/pages/Placeholder';
import NotFound from '@/pages/NotFound';
import { Skeleton } from '@/components/ui/skeleton';
import { Cmd } from '@/components/ui/states';

const DevUi = lazy(() => import('@/pages/DevUi'));
const MemoryExplorer = lazy(() => import('@/pages/MemoryExplorer'));
const SearchPlayground = lazy(() => import('@/pages/SearchPlayground'));
const Agents = lazy(() => import('@/pages/Agents'));
const TaskDetail = lazy(() => import('@/pages/TaskDetail'));

const page = (node: ReactNode) => <Suspense fallback={<Skeleton className="h-96 w-full" />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        path: '/',
        element: (
          <Placeholder
            title="Memory Intelligence"
            description="Understand what your agents remember, retrieve, and learn."
            icon={LayoutDashboard}
            message={<>No memories yet. Load the demo data with <Cmd>npm run seed -w backend</Cmd>.</>}
          />
        ),
      },
      { path: '/memories', element: page(<MemoryExplorer />) },
      { path: '/search', element: page(<SearchPlayground />) },
      { path: '/agents', element: page(<Agents />) },
      { path: '/tasks/:id', element: page(<TaskDetail />), handle: { crumb: 'Task' } },
      {
        path: '/learning',
        element: (
          <Placeholder title="Learning & Insights" description="How verified outcomes change what gets retrieved." icon={TrendingUp} message="No outcomes recorded yet. Record one from the Search Playground." />
        ),
      },
      {
        path: '/activity',
        element: <Placeholder title="Activity Log" description="Everything agents and people did, in order." icon={Activity} message="No activity yet." />,
      },
      {
        path: '/settings',
        element: (
          <Placeholder title="Settings & Integrations" description="Live status of every provider, with setup steps." icon={Settings} message="Integration details appear here." />
        ),
      },
      { path: '/dev/ui', element: page(<DevUi />), handle: { crumb: 'Design system' } },
      { path: '*', element: <NotFound />, handle: { crumb: 'Not found' } },
    ],
  },
]);
