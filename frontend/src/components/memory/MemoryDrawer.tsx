import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil } from 'lucide-react';
import type { Memory } from '@agent-recall/shared';
import { api } from '@/lib/api';
import { agentKeys, memoryKeys, useAgents, useMemory } from '@/lib/queries';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/dialog';
import { DemoDataBadge, MemoryTypeBadge, VerificationBadge, Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import { toast } from '@/components/ui/toast';
import { MemoryFormDialog } from './MemoryForm';
import { RelatedTab, RetrievalsTab } from './MemoryDrawerTabs';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 border-b border-border py-2.5 text-dense last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text">{children}</dd>
    </div>
  );
}

export function EmbeddingStatus({ memory }: { memory: Memory }) {
  if (memory.embeddingStatus === 'ready') return <StatusDot tone="success" label="Embedded" />;
  if (memory.embeddingStatus === 'failed') return <StatusDot tone="danger" label="Embedding failed" />;
  return <StatusDot tone="warning" label="Embedding pending" />;
}

export function MemoryDrawer({ memoryId, onOpenChange }: { memoryId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: m, isLoading, isError, refetch } = useMemory(memoryId);
  const agents = useAgents();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const agentName = agents.data?.find((a) => a.id === m?.agentId)?.name ?? '—';

  const archive = useMutation({
    mutationFn: () => api.post<Memory>(`/api/memories/${memoryId}/archive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: memoryKeys.all });
      void qc.invalidateQueries({ queryKey: agentKeys.all });
      toast.success('Memory archived');
      onOpenChange(false);
    },
    onError: () => toast.error('Could not archive the memory.'),
  });

  return (
    <>
      <Drawer
        open={Boolean(memoryId)}
        onOpenChange={onOpenChange}
        title={m ? m.title : isLoading ? 'Loading memory…' : 'Memory'}
        description={m ? `${agentName} · created ${formatRelative(m.createdAt)}` : undefined}
        headerExtra={
          m && (
            <div className="flex flex-wrap items-center gap-1.5">
              <MemoryTypeBadge type={m.type} />
              <VerificationBadge status={m.verification.status} />
              {m.isSeed && <DemoDataBadge />}
              {m.archived && <Badge tone="warning">Archived</Badge>}
            </div>
          )
        }
        footer={
          m && !m.archived ? (
            <>
              <Button variant="destructive" onClick={() => archive.mutate()} loading={archive.isPending}>
                {!archive.isPending && <Archive aria-hidden />}
                Archive memory
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit memory
              </Button>
            </>
          ) : undefined
        }
      >
        {isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
        {isError && <ErrorState title="Could not load this memory." onRetry={() => void refetch()} />}
        {m && (
          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="provenance">Provenance</TabsTrigger>
              <TabsTrigger value="related">Related</TabsTrigger>
              <TabsTrigger value="retrievals">Retrievals</TabsTrigger>
              <TabsTrigger value="embedding">Embedding</TabsTrigger>
            </TabsList>
            <TabsContent value="content">
              <p className="max-w-prose whitespace-pre-wrap text-body text-text">{m.content}</p>
              {m.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {m.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
              <dl className="mt-5">
                <Row label="Usefulness">
                  <span className="tabular">
                    {m.usefulness.score.toFixed(2)} · {m.usefulness.helpful} helpful / {m.usefulness.notHelpful} not helpful
                  </span>
                </Row>
                <Row label="Retrieved">
                  <span className="tabular">{m.retrievalCount} times</span>
                </Row>
                <Row label="Updated">{formatDateTime(m.updatedAt)}</Row>
              </dl>
            </TabsContent>
            <TabsContent value="provenance">
              <dl>
                <Row label="Source">
                  {m.provenance.kind === 'outcome' ? 'Created from a recorded outcome' : m.provenance.kind === 'seed' ? 'Demo seed data' : m.provenance.kind === 'task' ? 'Created by a task' : 'Created manually'}
                </Row>
                <Row label="Agent">{agentName}</Row>
                <Row label="Source task">{m.sourceTaskId ? <code className="font-mono text-caption">{m.sourceTaskId}</code> : '—'}</Row>
                <Row label="Verification">
                  <VerificationBadge status={m.verification.status} />
                  {m.verification.verifiedAt && <span className="ml-2 text-text-muted">{formatDateTime(m.verification.verifiedAt)}</span>}
                </Row>
                <Row label="Outcomes">
                  <span className="tabular">{m.verification.outcomeIds.length}</span>
                </Row>
                {m.provenance.citedMemoryIds && (
                  <Row label="Cited memories">
                    <span className="tabular">{m.provenance.citedMemoryIds.length}</span>
                  </Row>
                )}
                <Row label="Memory id">
                  <code className="font-mono text-caption text-text-muted">{m.id}</code>
                </Row>
              </dl>
            </TabsContent>
            <TabsContent value="related">
              <RelatedTab memory={m} />
            </TabsContent>
            <TabsContent value="retrievals">
              <RetrievalsTab memoryId={m.id} />
            </TabsContent>
            <TabsContent value="embedding">
              <dl>
                <Row label="Status">
                  <EmbeddingStatus memory={m} />
                </Row>
                <Row label="Provider">{m.embedding ? 'Voyage AI' : '—'}</Row>
                <Row label="Model">{m.embedding ? <code className="font-mono text-caption">{m.embedding.model}</code> : '—'}</Row>
                <Row label="Dimensions">
                  <span className="tabular">{m.embedding?.dimensions ?? '—'}</span>
                </Row>
                <Row label="Embedded">{formatDateTime(m.embedding?.embeddedAt)}</Row>
              </dl>
            </TabsContent>
          </Tabs>
        )}
      </Drawer>
      {m && <MemoryFormDialog open={editing} onOpenChange={setEditing} memory={m} />}
    </>
  );
}
