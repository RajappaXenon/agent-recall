import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Activity, Bot, LayoutDashboard, Library, ScanSearch, Settings, TrendingUp } from 'lucide-react';
import { AppShell } from './AppShell';
import { Placeholder } from '@/pages/Placeholder';
import NotFound from '@/pages/NotFound';
import { Skeleton } from '@/components/ui/skeleton';
import { Cmd } from '@/components/ui/states';

const DevUi = lazy(() => import('@/pages/DevUi'));

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
      {
        path: '/memories',
        element: (
          <Placeholder title="Memory Explorer" description="Browse, filter and edit what your agents remember." icon={Library} message="No memories yet. Create one or load the demo data." />
        ),
      },
      {
        path: '/search',
        element: (
          <Placeholder
            title="Search Playground"
            description="Compare keyword, semantic and hybrid retrieval on the same query."
            icon={ScanSearch}
            message={<>Search needs the Atlas Search indexes. Run <Cmd>npm run setup:indexes -w backend</Cmd>.</>}
          />
        ),
      },
      {
        path: '/agents',
        element: <Placeholder title="Agents" description="Agents own memories and run tasks." icon={Bot} message="No agents yet. Load the demo data to add three." />,
      },
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
