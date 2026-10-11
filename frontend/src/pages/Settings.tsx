import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import type { IntegrationKey, IntegrationsResponse, IntegrationStatus } from '@agent-recall/shared';
import { api } from '@/lib/api';
import { INTEGRATION_STATUS_LABEL, integrationTone, qk, useDevStatus, useIntegrations, useSession } from '@/lib/queries';
import { formatDateTime } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import { LatencyChip } from '@/components/ui/latency-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { Cmd, ErrorState } from '@/components/ui/states';
import { VoiceSettings } from '@/components/audio/VoiceSettings';

const SETUP: Record<IntegrationKey, React.ReactNode> = {
  mongodb: (
    <>
      Set <Cmd>MONGODB_URI</Cmd> and <Cmd>DB_NAME</Cmd> in <Cmd>.env</Cmd>. If the cluster is unreachable, add this machine&apos;s IP under Atlas → Network Access.
    </>
  ),
  atlas_search: (
    <>
      Run <Cmd>npm run setup:indexes -w backend</Cmd>. It creates <Cmd>memories_search</Cmd> and waits until Atlas reports it queryable.
    </>
  ),
  atlas_vector_search: (
    <>
      Created by the same <Cmd>setup:indexes</Cmd> run (<Cmd>memories_vector</Cmd>, cosine). If <Cmd>VOYAGE_DIMENSIONS</Cmd> changes, run it with <Cmd>-- --recreate</Cmd>, then <Cmd>embed:backfill</Cmd>.
    </>
  ),
  voyage: (
    <>
      Set <Cmd>VOYAGE_API_KEY</Cmd>, <Cmd>VOYAGE_MODEL</Cmd> and <Cmd>VOYAGE_DIMENSIONS</Cmd>. Atlas model API keys also need <Cmd>VOYAGE_BASE_URL=https://ai.mongodb.com/v1</Cmd>. Then run <Cmd>npm run embed:backfill -w backend</Cmd>.
    </>
  ),
  llm: (
    <>
      Set <Cmd>LLM_API_KEY</Cmd> (Anthropic) and optionally <Cmd>LLM_MODEL</Cmd>. Without it, answers are labelled template answers.
    </>
  ),
  elevenlabs: (
    <>
      Optional. Set <Cmd>ELEVENLABS_API_KEY</Cmd> and <Cmd>ELEVENLABS_VOICE_ID</Cmd> (and <Cmd>ELEVENLABS_MODEL_ID</Cmd>). Text features never depend on it.
    </>
  ),
};

function MetaList({ meta }: { meta: IntegrationStatus['meta'] }) {
  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== '');
  if (!entries.length) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption font-normal">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="text-text-muted">{k}</dt>
          <dd className="font-mono text-text">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Settings() {
  const integrations = useIntegrations();
  const session = useSession();
  const dev = useDevStatus();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(qk.integrations, await api.get<IntegrationsResponse>('/api/integrations/status?refresh=true'));
    } finally {
      setRefreshing(false);
    }
  };

  const list = integrations.data?.integrations ?? [];
  const eleven = list.find((i) => i.key === 'elevenlabs');

  return (
    <>
      <PageHeader title="Settings & Integrations" description="Live status of every provider. Connected means a probe succeeded within the last 60 seconds; a key existing is not enough." />

      <Panel
        title="Integrations"
        meta={list[0] ? <span>probed {formatDateTime(list[0].checkedAt)}{integrations.data?.cached ? ' · cached' : ''}</span> : null}
        actions={
          <Button size="sm" onClick={() => void refresh()} loading={refreshing}>
            {!refreshing && <RefreshCw aria-hidden />}
            Refresh
          </Button>
        }
        flush
        className="mb-4"
      >
        {integrations.isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : integrations.isError ? (
          <ErrorState title="Could not load integration status." onRetry={() => void integrations.refetch()} />
        ) : (
          <ul>
            {list.map((i) => (
              <li key={i.key} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                <div className="flex items-center gap-2">
                  <span className="text-dense font-medium text-text">{i.name}</span>
                  {i.optional && <span className="text-caption font-normal text-text-muted">optional</span>}
                </div>
                <div className="min-w-0">
                  <p className="text-dense text-text">{i.detail}</p>
                  <MetaList meta={i.meta} />
                  {i.status !== 'connected' && <p className="mt-1.5 max-w-prose text-caption font-normal text-text-muted">{SETUP[i.key]}</p>}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  {i.latencyMs !== null && <LatencyChip ms={i.latencyMs} />}
                  <StatusDot tone={integrationTone(i)} label={INTEGRATION_STATUS_LABEL[i.status]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <VoiceSettings status={eleven} />
        <Panel title="Workspace">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-dense">
            <dt className="text-text-muted">Organization</dt>
            <dd className="text-text">{session.data?.org.name ?? '—'}</dd>
            <dt className="text-text-muted">Signed in as</dt>
            <dd className="text-text">{session.data?.user.email ?? '—'}</dd>
            <dt className="text-text-muted">Auth</dt>
            <dd className="text-warning">Demo auth — not production-secure</dd>
            <dt className="text-text-muted">Demo mode</dt>
            <dd className="text-text">{dev.data ? (dev.data.demoMode ? 'On (crash button enabled)' : 'Off') : '—'}</dd>
            <dt className="text-text-muted">Worker lease</dt>
            <dd className="tabular text-text">{dev.data ? `${dev.data.leaseMs / 1000} s · step delay ${dev.data.stepDelayMs / 1000} s` : '—'}</dd>
            <dt className="text-text-muted">Live workers</dt>
            <dd className="text-text">
              {dev.data?.workers.length ? dev.data.workers.map((w) => <span key={w.workerId} className="mr-2 font-mono text-dense">{w.workerId}</span>) : (
                <span className="text-text-muted">
                  none · start with <Cmd>npm run worker:supervised -w backend</Cmd>
                </span>
              )}
            </dd>
          </dl>
        </Panel>
      </div>
    </>
  );
}
