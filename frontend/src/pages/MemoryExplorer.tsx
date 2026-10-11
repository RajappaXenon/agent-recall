import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Library, Plus, X } from 'lucide-react';
import { MEMORY_TYPES, type Memory } from '@agent-recall/shared';
import { useAgents, useMemories } from '@/lib/queries';
import { TYPE_META } from '@/lib/tokens';
import { formatRelative } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/ui/data-table';
import { DemoDataBadge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { Cmd, EmptyState, ErrorState } from '@/components/ui/states';
import { MemoryDrawer, EmbeddingStatus } from '@/components/memory/MemoryDrawer';
import { MemoryFormDialog } from '@/components/memory/MemoryForm';
import { ExplorerSearch } from '@/components/memory/ExplorerSearch';

const ALL = '__all__';
const PAGE_SIZE = 20;

export default function MemoryExplorer() {
  const [params, setParams] = useSearchParams();
  const agents = useAgents();
  const [creating, setCreating] = React.useState(false);

  const get = (k: string) => params.get(k) ?? undefined;
  const page = Number(get('page') ?? 1);
  const filters = {
    agentId: get('agentId'),
    type: get('type'),
    verification: get('verification'),
    tag: get('tag'),
    sort: get('sort') ?? 'newest',
  };
  const openId = get('open') ?? null;
  const q = get('q') ?? '';

  const set = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === ALL || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const list = useMemories({ page, pageSize: PAGE_SIZE, ...filters });
  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? '—';
  const activeFilters = Boolean(filters.agentId || filters.type || filters.verification || filters.tag);

  const columns: Column<Memory>[] = [
    {
      key: 'title',
      header: 'Memory',
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-2" data-testid="memory-row">
          <MemoryTypeBadge type={m.type} compact />
          <span className="truncate font-medium">{m.title}</span>
          {m.isSeed && <DemoDataBadge className="hidden lg:inline-flex" />}
        </div>
      ),
      className: 'max-w-0 w-full',
    },
    { key: 'agent', header: 'Agent', cell: (m) => <span className="whitespace-nowrap text-text-muted">{agentName(m.agentId)}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell' },
    { key: 'verification', header: 'Verification', cell: (m) => <VerificationBadge status={m.verification.status} />, headerClassName: 'hidden sm:table-cell', className: 'hidden sm:table-cell' },
    { key: 'embedding', header: 'Embedding', cell: (m) => <EmbeddingStatus memory={m} />, headerClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell whitespace-nowrap' },
    { key: 'retrievals', header: 'Retrieved', cell: (m) => m.retrievalCount, align: 'right', headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell' },
    { key: 'created', header: 'Created', cell: (m) => <span className="whitespace-nowrap text-text-muted">{formatRelative(m.createdAt)}</span> },
  ];

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Memory Explorer"
        description="Browse, filter and edit what your agents remember."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Create memory
          </Button>
        }
      />

      <ExplorerSearch initialQuery={q} onQueryChange={(v) => set({ q: v || undefined })} onOpen={(id) => set({ open: id }, false)} />

      <Panel
        className="mt-4"
        flush
        title="All memories"
        meta={list.data ? <span className="tabular">{total} {total === 1 ? 'memory' : 'memories'}</span> : null}
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <FilterBar filters={filters} set={set} agents={agents.data ?? []} />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 md:hidden">
          <FilterBar filters={filters} set={set} agents={agents.data ?? []} />
        </div>
        {list.isLoading ? (
          <TableRowsSkeleton rows={8} cols={5} />
        ) : list.isError ? (
          <ErrorState
            title="Could not load memories."
            fix={list.error instanceof ApiError ? list.error.message : undefined}
            onRetry={() => void list.refetch()}
          />
        ) : list.data && list.data.items.length === 0 ? (
          activeFilters ? (
            <EmptyState
              icon={Library}
              message="No memories match these filters."
              action={
                <Button size="sm" onClick={() => set({ agentId: undefined, type: undefined, verification: undefined, tag: undefined })}>
                  <X aria-hidden />
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Library}
              message={
                <>
                  No memories yet. Create one or load the demo data with <Cmd>npm run seed -w backend</Cmd>.
                </>
              }
              action={
                <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden />
                  Create memory
                </Button>
              }
            />
          )
        ) : (
          <>
            <DataTable
              caption="Memories"
              columns={columns}
              rows={list.data?.items ?? []}
              rowKey={(m) => m.id}
              onRowClick={(m) => set({ open: m.id }, false)}
              activeKey={openId}
            />
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-caption text-text-muted">
              <span className="tabular">
                Page {page} of {pages}
              </span>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => set({ page: String(page - 1) }, false)}>
                  <ChevronLeft aria-hidden />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={page >= pages} onClick={() => set({ page: String(page + 1) }, false)}>
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <MemoryDrawer memoryId={openId} onOpenChange={(o) => !o && set({ open: undefined }, false)} />
      <MemoryFormDialog open={creating} onOpenChange={setCreating} defaultAgentId={filters.agentId} onSaved={(m) => set({ open: m.id }, false)} />
    </>
  );
}

function FilterBar({
  filters,
  set,
  agents,
}: {
  filters: { agentId?: string; type?: string; verification?: string; sort: string };
  set: (p: Record<string, string | undefined>) => void;
  agents: { id: string; name: string }[];
}) {
  return (
    <>
      <Select
        size="sm"
        aria-label="Filter by agent"
        className="w-44"
        value={filters.agentId ?? ALL}
        onValueChange={(v) => set({ agentId: v })}
        options={[
          { value: ALL, label: 'All agents' },
          ...agents.map((a) => ({ value: a.id, label: a.name })),
          ...(filters.agentId && agents.length && !agents.some((a) => a.id === filters.agentId) ? [{ value: filters.agentId, label: 'Unknown agent' }] : []),
        ]}
      />
      <Select
        size="sm"
        aria-label="Filter by type"
        className="w-36"
        value={filters.type ?? ALL}
        onValueChange={(v) => set({ type: v })}
        options={[
          { value: ALL, label: 'All types' },
          ...MEMORY_TYPES.map((t) => {
            const Icon = TYPE_META[t].icon;
            return { value: t, label: TYPE_META[t].label, icon: <Icon className={`size-3.5 ${TYPE_META[t].text}`} aria-hidden /> };
          }),
        ]}
      />
      <Select
        size="sm"
        aria-label="Filter by verification"
        className="w-36"
        value={filters.verification ?? ALL}
        onValueChange={(v) => set({ verification: v })}
        options={[
          { value: ALL, label: 'Any status' },
          { value: 'verified_success', label: 'Verified' },
          { value: 'verified_failure', label: 'Failed' },
          { value: 'unverified', label: 'Unverified' },
        ]}
      />
      <Select
        size="sm"
        aria-label="Sort"
        className="w-36"
        value={filters.sort}
        onValueChange={(v) => set({ sort: v === 'newest' ? undefined : v })}
        options={[
          { value: 'newest', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
          { value: 'usefulness', label: 'Most useful' },
          { value: 'retrievals', label: 'Most retrieved' },
        ]}
      />
    </>
  );
}
