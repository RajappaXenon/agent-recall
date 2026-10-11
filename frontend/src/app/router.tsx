import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import NotFound from '@/pages/NotFound';
import { Skeleton } from '@/components/ui/skeleton';

const DevUi = lazy(() => import('@/pages/DevUi'));
const MemoryExplorer = lazy(() => import('@/pages/MemoryExplorer'));
const SearchPlayground = lazy(() => import('@/pages/SearchPlayground'));
const Agents = lazy(() => import('@/pages/Agents'));
const TaskDetail = lazy(() => import('@/pages/TaskDetail'));
const Overview = lazy(() => import('@/pages/Overview'));
const Learning = lazy(() => import('@/pages/Learning'));
const Benchmarks = lazy(() => import('@/pages/Benchmarks'));
const Activity = lazy(() => import('@/pages/Activity'));
const Settings = lazy(() => import('@/pages/Settings'));

const page = (node: ReactNode) => <Suspense fallback={<Skeleton className="h-96 w-full" />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: page(<Overview />) },
      { path: '/memories', element: page(<MemoryExplorer />) },
      { path: '/search', element: page(<SearchPlayground />) },
      { path: '/agents', element: page(<Agents />) },
      { path: '/tasks/:id', element: page(<TaskDetail />), handle: { crumb: 'Task' } },
      { path: '/learning', element: page(<Learning />) },
      { path: '/benchmarks', element: page(<Benchmarks />) },
      { path: '/activity', element: page(<Activity />) },
      { path: '/settings', element: page(<Settings />) },
      { path: '/dev/ui', element: page(<DevUi />), handle: { crumb: 'Design system' } },
      { path: '*', element: <NotFound />, handle: { crumb: 'Not found' } },
    ],
  },
]);
