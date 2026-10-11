import { useQuery } from '@tanstack/react-query';
import type { AgentWithStats, IntegrationsResponse, IntegrationStatus, Memory, Paginated, Session } from '@agent-recall/shared';
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
