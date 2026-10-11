import { useQuery } from '@tanstack/react-query';
import type { AgentWithStats, AppEvent, Checkpoint, DevStatus, IntegrationsResponse, IntegrationStatus, Memory, Paginated, Session, Task } from '@agent-recall/shared';
import { api, qs } from './api';

export const qk = {
  session: ['session'] as const,
  integrations: ['integrations'] as const,
};

export function useSession() {
  return useQuery({ queryKey: qk.session, queryFn: () => api.get<Session>('/api/auth/me'), staleTime: 5 * 60_000 });
}

export function useIntegrations() {
  return useQuery({
    queryKey: qk.integrations,
    queryFn: () => api.get<IntegrationsResponse>('/api/integrations/status'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export type Severity = 'success' | 'warning' | 'danger' | 'neutral';

export function integrationTone(s: IntegrationStatus): Severity {
  if (s.status === 'connected') return 'success';
  if (s.status === 'index_building') return 'warning';
  if (s.status === 'not_configured') return s.optional ? 'neutral' : 'warning';
  return 'danger';
}

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus['status'], string> = {
  connected: 'Connected',
  not_configured: 'Not configured',
  error: 'Error',
  index_missing: 'Index missing',
  index_building: 'Index building',
};

/** Worst status among non-optional integrations, used for the header pill colour. */
export function worstTone(list: IntegrationStatus[]): Severity {
  const order: Severity[] = ['danger', 'warning', 'neutral', 'success'];
  const tones = list.filter((i) => !i.optional).map(integrationTone);
  for (const t of order) if (tones.includes(t)) return t;
  return 'success';
}

// ── Agents & memories ───────────────────────────────────────────────────────

export const agentKeys = { all: ['agents'] as const, one: (id: string) => ['agents', id] as const };
export const memoryKeys = {
  all: ['memories'] as const,
  list: (p: Record<string, unknown>) => ['memories', 'list', p] as const,
  one: (id: string) => ['memories', id] as const,
};

export function useAgents() {
  return useQuery({ queryKey: agentKeys.all, queryFn: () => api.get<{ items: AgentWithStats[] }>('/api/agents').then((r) => r.items) });
}

export interface MemoryListParams {
  page: number;
  pageSize: number;
  agentId?: string;
  type?: string;
  verification?: string;
  tag?: string;
  sort: string;
  includeArchived?: boolean;
}

export function useMemories(p: MemoryListParams) {
  return useQuery({
    queryKey: memoryKeys.list(p as unknown as Record<string, unknown>),
    queryFn: () => api.get<Paginated<Memory>>(`/api/memories${qs({ ...p, includeArchived: p.includeArchived ? 'true' : undefined })}`),
    placeholderData: (prev) => prev,
  });
}

export function useMemory(id: string | null) {
  return useQuery({ queryKey: memoryKeys.one(id ?? ''), queryFn: () => api.get<Memory>(`/api/memories/${id}`), enabled: Boolean(id) });
}

// ── Tasks, worker, events ───────────────────────────────────────────────────
export const taskKeys = {
  all: ['tasks'] as const,
  list: (p: Record<string, unknown>) => ['tasks', 'list', p] as const,
  one: (id: string) => ['tasks', id] as const,
  checkpoints: (id: string) => ['tasks', id, 'checkpoints'] as const,
};

const isLive = (t?: Task) => t?.status === 'queued' || t?.status === 'running';

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.one(id),
    queryFn: () => api.get<Task>(`/api/tasks/${id}`),
    refetchInterval: (q) => (isLive(q.state.data) ? 1000 : false),
  });
}

export function useCheckpoints(id: string, live: boolean) {
  return useQuery({
    queryKey: taskKeys.checkpoints(id),
    queryFn: () => api.get<{ items: Checkpoint[] }>(`/api/tasks/${id}/checkpoints`).then((r) => r.items),
    refetchInterval: live ? 1000 : false,
  });
}

export function useTasks(p: { agentId?: string; kind?: 'qa' | 'playbook'; pageSize?: number }) {
  return useQuery({
    queryKey: taskKeys.list(p),
    queryFn: () => api.get<Paginated<Task>>(`/api/tasks${qs({ ...p, pageSize: p.pageSize ?? 20 })}`),
    refetchInterval: (q) => (q.state.data?.items.some(isLive) ? 2000 : false),
  });
}

export function useDevStatus() {
  return useQuery({ queryKey: ['dev-status'], queryFn: () => api.get<DevStatus>('/api/dev/status'), refetchInterval: 3000 });
}

export function useEvents(p: { taskId?: string; agentId?: string; memoryId?: string; status?: string; typePrefix?: string; page?: number; pageSize?: number }, live = false) {
  return useQuery({
    queryKey: ['events', p],
    queryFn: () => api.get<Paginated<AppEvent>>(`/api/events${qs(p)}`),
    refetchInterval: live ? 1500 : false,
    placeholderData: (prev) => prev,
  });
}
