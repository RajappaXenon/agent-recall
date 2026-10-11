import { useQuery } from '@tanstack/react-query';
import type { IntegrationsResponse, IntegrationStatus, Session } from '@agent-recall/shared';
import { api } from './api';

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
