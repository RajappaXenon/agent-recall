import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { History, Network } from 'lucide-react';
import type { Memory, MemoryRelatedResponse, MemoryRetrievalsResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { MODE_META } from '@/lib/tokens';
import { formatDateTime, formatScore } from '@/lib/utils';
import { EngineBadge, MemoryTypeBadge, VerificationBadge, type Engine } from '@/components/ui/badge';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';

function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : 'Request failed.';
}

export function RelatedTab({ memory }: { memory: Memory }) {
  const q = useQuery({
    queryKey: ['memories', memory.id, 'related'],
    queryFn: () => api.get<MemoryRelatedResponse>(`/api/memories/${memory.id}/related`),
  });
  if (q.isLoading) return <TableRowsSkeleton rows={4} cols={2} />;
  if (q.isError) return <ErrorState title="Could not load related memories." fix={errorText(q.error)} onRetry={() => void q.refetch()} />;
  const data = q.data!;
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 text-caption text-text-muted">Linked (taxonomic relations)</h3>
        {data.relations.length === 0 ? (
          <p className="text-dense text-text-muted">No explicit links.</p>
        ) : (
          <ul className="flex flex-col">
            {data.relations.map((r) => (
              <li key={`${r.direction}-${r.memory.id}`} className="flex items-center gap-2 border-b border-border py-2 text-dense last:border-b-0">
                <MemoryTypeBadge type={r.memory.type} compact />
                <Link to={`/memories?open=${r.memory.id}`} className="focus-ring min-w-0 flex-1 truncate rounded-control text-text hover:underline">
                  {r.memory.title}
                </Link>
                <span className="shrink-0 text-caption text-text-muted">
                  {r.direction === 'outgoing' ? r.label : `${r.label} (incoming)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-caption text-text-muted">Nearest by meaning</h3>
          <EngineBadge engine={data.neighbors.engine as Engine} />
        </div>
        {data.neighbors.engine === 'unavailable' ? (
          <p className="text-dense text-text-muted">{data.neighbors.reason}</p>
        ) : data.neighbors.items.length === 0 ? (
          <p className="text-dense text-text-muted">No neighbours found.</p>
        ) : (
          <ul className="flex flex-col">
            {data.neighbors.items.map((n) => (
              <li key={n.memory.id} className="flex items-center gap-2 border-b border-border py-2 text-dense last:border-b-0">
                <MemoryTypeBadge type={n.memory.type} compact />
                <Link to={`/memories?open=${n.memory.id}`} className="focus-ring min-w-0 flex-1 truncate rounded-control text-text hover:underline">
                  {n.memory.title}
                </Link>
                <VerificationBadge status={n.memory.verification.status} />
                <span className="tabular shrink-0 text-caption text-text-muted">
                  vector <span className="text-text">{formatScore(n.score, 'vector')}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.relations.length === 0 && data.neighbors.items.length === 0 && data.neighbors.engine !== 'unavailable' && (
        <EmptyState icon={Network} message="Nothing related yet." />
      )}
    </div>
  );
}

export function RetrievalsTab({ memoryId }: { memoryId: string }) {
  const q = useQuery({
    queryKey: ['memories', memoryId, 'retrievals'],
    queryFn: () => api.get<MemoryRetrievalsResponse>(`/api/memories/${memoryId}/retrievals`),
  });
  if (q.isLoading) return <TableRowsSkeleton rows={4} cols={3} />;
  if (q.isError) return <ErrorState title="Could not load retrieval history." fix={errorText(q.error)} onRetry={() => void q.refetch()} />;
  const items = q.data!.items;
  if (items.length === 0) return <EmptyState icon={History} message="This memory has not been retrieved yet. Run a search in the Playground." />;
  return (
    <ul className="flex flex-col">
      {items.map((r) => (
        <li key={r.logId} className="flex flex-col gap-1 border-b border-border py-2.5 last:border-b-0">
          <div className="flex items-center gap-2 text-dense">
            <span className={`font-medium ${MODE_META[r.mode].text}`}>{MODE_META[r.mode].label}</span>
            <span className="tabular text-text-muted">rank {r.rank}</span>
            <span className="tabular text-text-muted">
              · {r.scoreKind} {formatScore(r.score, r.scoreKind)}
            </span>
            <span className="ml-auto text-caption text-text-muted">{formatDateTime(r.createdAt)}</span>
          </div>
          <p className="truncate text-dense text-text-muted">“{r.query}”</p>
        </li>
      ))}
    </ul>
  );
}
