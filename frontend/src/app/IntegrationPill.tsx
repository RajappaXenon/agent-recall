import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { IntegrationsResponse } from '@agent-recall/shared';
import { cn, formatRelative } from '@/lib/utils';
import { api } from '@/lib/api';
import { INTEGRATION_STATUS_LABEL, integrationTone, qk, useIntegrations, worstTone } from '@/lib/queries';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusDot } from '@/components/ui/status-dot';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import * as React from 'react';

const TONE_RING = {
  success: 'border-success/30',
  warning: 'border-warning/40',
  danger: 'border-danger/40',
  neutral: 'border-border-strong',
};

export function IntegrationPill() {
  const { data, isLoading, isError } = useIntegrations();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await api.get<IntegrationsResponse>('/api/integrations/status?refresh=true');
      qc.setQueryData(qk.integrations, fresh);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) return <Skeleton className="h-8 w-36" />;

  const list = data?.integrations ?? [];
  const connected = list.filter((i) => i.status === 'connected').length;
  const tone = isError ? 'danger' : worstTone(list);
  const label = isError ? 'Status unavailable' : `${connected} of ${list.length} connected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'focus-ring inline-flex h-8 items-center gap-2 rounded-full border bg-surface px-3 transition-colors duration-fast hover:bg-surface-raised',
            TONE_RING[tone],
          )}
          aria-label={`Integrations: ${label}. Open details`}
        >
          <StatusDot tone={tone} label={label} className="text-text" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-section text-text">Integrations</span>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} loading={refreshing} aria-label="Re-probe all integrations">
            {!refreshing && <RefreshCw aria-hidden />}
            Refresh
          </Button>
        </div>
        <ul className="flex flex-col py-1">
          {list.map((i) => (
            <li key={i.key} className="flex flex-col gap-0.5 px-4 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-dense font-medium text-text">
                  {i.name}
                  {i.optional && <span className="ml-1.5 text-caption font-normal text-text-muted">optional</span>}
                </span>
                <StatusDot tone={integrationTone(i)} label={INTEGRATION_STATUS_LABEL[i.status]} />
              </div>
              <p className="line-clamp-2 text-caption font-normal text-text-muted">{i.detail}</p>
            </li>
          ))}
          {isError && <li className="px-4 py-3 text-dense text-text-muted">Could not load integration status.</li>}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-caption font-normal text-text-muted">
          <span>Probed {formatRelative(list[0]?.checkedAt)} · cached 60 s</span>
          <Link to="/settings" className="focus-ring rounded-control text-accent hover:underline">
            Settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
