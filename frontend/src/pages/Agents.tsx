import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Flag, ListTodo, Plus, RotateCcw, Workflow } from 'lucide-react';
import type { AgentWithStats, Memory, OutcomeListItem, Paginated, Task } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { agentKeys, taskKeys, useAgents } from '@/lib/queries';
import { cn, formatRelative } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge, DemoDataBadge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { StatusDot } from '@/components/ui/status-dot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { TableRowsSkeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';

const TASK_TONE = { queued: 'neutral', running: 'accent', completed: 'success', failed: 'danger' } as const;

function AgentRow({ a, active, onSelect }: { a: AgentWithStats; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className={cn(
          'focus-ring flex w-full flex-col gap-1.5 border-b border-border px-4 py-3 text-left transition-colors duration-fast',
          active ? 'bg-surface-raised shadow-[inset_2px_0_0_rgb(var(--accent))]' : 'hover:bg-surface-raised',
        )}
      >
        <div className="flex items-center gap-2">
          <Bot className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="flex-1 truncate text-dense font-medium text-text">{a.name}</span>
          {a.isSeed && <DemoDataBadge />}
        </div>
        <p className="line-clamp-2 text-caption font-normal text-text-muted">{a.description || 'No description.'}</p>
        <div className="tabular flex flex-wrap gap-x-3 gap-y-1 text-caption font-normal text-text-muted">
          <span>
            <span className="text-text">{a.stats.memoryCount}</span> {a.stats.memoryCount === 1 ? 'memory' : 'memories'}
          </span>
          <span>
            <span className="text-text">{a.stats.taskCount}</span> {a.stats.taskCount === 1 ? 'task' : 'tasks'}
          </span>
          <span>
            <span className="text-success">{a.stats.successfulOutcomes}</span> worked
          </span>
          <span>active {formatRelative(a.stats.lastActivityAt)}</span>
        </div>
      </button>
    </li>
  );
}

function TaskRows({ agentId }: { agentId: string }) {
  const q = useQuery({
    queryKey: [...taskKeys.all, 'agent', agentId],
    queryFn: () => api.get<Paginated<Task>>(`/api/agents/${agentId}/tasks?pageSize=30`),
    refetchInterval: (s) => (s.state.data?.items.some((t) => t.status === 'running' || t.status === 'queued') ? 2000 : false),
  });
  if (q.isLoading) return <TableRowsSkeleton rows={4} cols={3} />;
  if (q.isError) return <ErrorState title="Could not load tasks." onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={ListTodo} message="No tasks yet. Run the playbook or ask a question in the Search Playground." />;
  return (
    <ul>
      {q.data.items.map((t) => (
        <li key={t.id} className="border-b border-border last:border-b-0">
          <Link
            to={`/tasks/${t.id}`}
            data-testid={t.attempt > 1 ? 'task-link-resumed' : 'task-link'}
            className="focus-ring flex items-center gap-3 px-4 py-2.5 hover:bg-surface-raised"
          >
            {t.kind === 'playbook' ? <Workflow className="size-4 shrink-0 text-text-muted" aria-hidden /> : <Flag className="size-4 shrink-0 text-text-muted" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-dense font-medium text-text">{t.goal}</div>
              <div className="tabular text-caption font-normal text-text-muted">
                {t.kind === 'playbook' ? `${t.steps.filter((s) => s.status === 'completed').length}/${t.steps.length} steps` : 'answer'} · {formatRelative(t.createdAt)}
              </div>
            </div>
            {t.attempt > 1 && (
              <Badge tone="warning" title="Resumed after a worker crash">
                <RotateCcw aria-hidden />
                resumed · attempt {t.attempt}
              </Badge>
            )}
            {t.outcome && <Badge tone={t.outcome.result === 'worked' ? 'success' : 'danger'}>{t.outcome.result}</Badge>}
            {t.isSeed && <DemoDataBadge />}
            <StatusDot tone={TASK_TONE[t.status]} label={t.status} pulse={t.status === 'running'} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MemoryRows({ agentId }: { agentId: string }) {
  const q = useQuery({ queryKey: ['memories', 'agent', agentId], queryFn: () => api.get<Paginated<Memory>>(`/api/agents/${agentId}/memories?pageSize=50`) });
  if (q.isLoading) return <TableRowsSkeleton rows={5} cols={3} />;
  if (q.isError) return <ErrorState title="Could not load memories." onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={Bot} message="This agent has no memories yet." />;
  return (
    <ul>
      {q.data.items.map((m) => (
        <li key={m.id} className="border-b border-border last:border-b-0">
          <Link to={`/memories?open=${m.id}`} className="focus-ring flex items-center gap-2 px-4 py-2.5 hover:bg-surface-raised">
            <MemoryTypeBadge type={m.type} compact />
            <span className="min-w-0 flex-1 truncate text-dense text-text">{m.title}</span>
            <VerificationBadge status={m.verification.status} />
            <span className="tabular hidden w-24 text-right text-caption font-normal text-text-muted sm:block">{formatRelative(m.createdAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OutcomeRows({ agentId }: { agentId: string }) {
  const q = useQuery({ queryKey: ['outcomes', 'agent', agentId], queryFn: () => api.get<{ items: OutcomeListItem[] }>(`/api/agents/${agentId}/outcomes`) });
  if (q.isLoading) return <TableRowsSkeleton rows={3} cols={3} />;
  if (q.isError) return <ErrorState title="Could not load outcomes." onRetry={() => void q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={Flag} message="No outcomes recorded for this agent yet." />;
  return (
    <ul>
      {q.data.items.map((o) => (
        <li key={o.id} className="flex flex-col gap-1 border-b border-border px-4 py-2.5 last:border-b-0">
          <div className="flex items-center gap-2">
            <Badge tone={o.result === 'worked' ? 'success' : 'danger'}>{o.result}</Badge>
            {o.feedback && <Badge>{o.feedback === 'helpful' ? 'helpful' : 'not helpful'}</Badge>}
            <Link to={`/tasks/${o.taskId}`} className="focus-ring min-w-0 flex-1 truncate rounded-control text-dense text-text hover:underline">
              {o.question}
            </Link>
            {o.isSeed && <DemoDataBadge />}
            <span className="text-caption font-normal text-text-muted">{formatRelative(o.createdAt)}</span>
          </div>
          {o.notes && <p className="line-clamp-1 text-caption font-normal text-text-muted">{o.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

function CreateAgentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (a: AgentWithStats) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const create = useMutation({
    mutationFn: () => api.post<AgentWithStats>('/api/agents', { name, description }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: agentKeys.all });
      toast.success('Agent created');
      setName('');
      setDescription('');
      onCreated(a);
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create agent"
        description="Agents own memories and run tasks."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
              Create agent
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" htmlFor="agent-name">
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Description" htmlFor="agent-desc">
            <Textarea id="agent-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
          </Field>
          {create.isError && <p className="text-dense text-danger">{create.error instanceof ApiError ? create.error.message : 'Could not create the agent.'}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Agents() {
  const agents = useAgents();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const selectedId = params.get('agent') ?? agents.data?.find((a) => a.name === 'Engineering Assistant')?.id ?? agents.data?.[0]?.id ?? null;
  const selected = agents.data?.find((a) => a.id === selectedId) ?? null;
  const select = (id: string) => setParams({ agent: id }, { replace: true });

  const runPlaybook = useMutation({
    mutationFn: () => api.post<Task>('/api/tasks', { agentId: selectedId }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
      toast.success('Playbook queued', { description: 'A worker picks it up within a second if one is running.' });
      navigate(`/tasks/${t.id}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not queue the playbook.'),
  });

  return (
    <>
      <PageHeader
        title="Agents"
        description="Agents own memories and run tasks. Run the playbook to see checkpointed, crash-safe execution."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Create agent
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="All agents" meta={agents.data ? <span className="tabular">{agents.data.length}</span> : null} flush className="self-start">
          {agents.isLoading ? (
            <TableRowsSkeleton rows={3} cols={1} />
          ) : agents.isError ? (
            <ErrorState title="Could not load agents." onRetry={() => void agents.refetch()} />
          ) : agents.data?.length ? (
            <ul>
              {agents.data.map((a) => (
                <AgentRow key={a.id} a={a} active={a.id === selectedId} onSelect={() => select(a.id)} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Bot} message="No agents yet. Create one or load the demo data." />
          )}
        </Panel>

        {selected ? (
          <Panel
            title={selected.name}
            meta={selected.isSeed ? <DemoDataBadge /> : undefined}
            actions={
              <Button variant="primary" size="sm" onClick={() => runPlaybook.mutate()} loading={runPlaybook.isPending}>
                {!runPlaybook.isPending && <Workflow aria-hidden />}
                Run playbook
              </Button>
            }
            flush
          >
            <p className="border-b border-border px-4 py-3 text-dense text-text-muted">{selected.description || 'No description.'}</p>
            <Tabs defaultValue="tasks" className="px-4">
              <TabsList>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="memories">
                  Memories <span className="tabular text-caption text-text-muted">{selected.stats.memoryCount}</span>
                </TabsTrigger>
                <TabsTrigger value="outcomes">
                  Outcomes <span className="tabular text-caption text-text-muted">{selected.stats.successfulOutcomes}</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="tasks" className="-mx-4 pt-0">
                <TaskRows agentId={selected.id} />
              </TabsContent>
              <TabsContent value="memories" className="-mx-4 pt-0">
                <MemoryRows agentId={selected.id} />
              </TabsContent>
              <TabsContent value="outcomes" className="-mx-4 pt-0">
                <OutcomeRows agentId={selected.id} />
              </TabsContent>
            </Tabs>
          </Panel>
        ) : (
          !agents.isLoading && (
            <Panel>
              <EmptyState icon={Bot} message="Select an agent to see its tasks, memories and outcomes." />
            </Panel>
          )
        )}
      </div>
      <CreateAgentDialog open={creating} onOpenChange={setCreating} onCreated={(a) => select(a.id)} />
    </>
  );
}
