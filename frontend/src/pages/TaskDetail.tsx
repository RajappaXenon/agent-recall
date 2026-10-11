import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, CircleX, Loader2, Play, RotateCcw, ServerCrash, Skull, Terminal } from 'lucide-react';
import type { Checkpoint, Task } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { taskKeys, useAgents, useCheckpoints, useDevStatus, useEvents, useTask } from '@/lib/queries';
import { cn, formatDateTime, formatRelative } from '@/lib/utils';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { DemoDataBadge } from '@/components/ui/badge';
import { StatusDot, type StatusTone } from '@/components/ui/status-dot';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { Skeleton } from '@/components/ui/skeleton';
import { Cmd, EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { EventRow } from '@/components/activity/EventRow';
import { ListenButton } from '@/components/audio/ListenButton';

const STATUS_TONE: Record<Task['status'], StatusTone> = { queued: 'neutral', running: 'accent', completed: 'success', failed: 'danger' };
const STATUS_LABEL: Record<Task['status'], string> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour12: false });

function useNow(active: boolean) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** One-line description of a checkpoint's real output. */
function checkpointBody(c: Checkpoint): React.ReactNode {
  const o = c.output as Record<string, unknown>;
  switch (c.stepIndex) {
    case 0:
      return `${(o.terms as string[] | undefined)?.length ?? 0} key terms extracted: ${((o.terms as string[]) ?? []).slice(0, 6).join(', ')}`;
    case 1: {
      const r = (o.results as { title: string; sources: string }[] | undefined) ?? [];
      return `${r.length} memories via ${String(o.engine)}${r[0] ? ` · top: ${r[0].title} (${r[0].sources})` : ''}`;
    }
    case 2: {
      const p = o.procedure as { title: string; outcomeCount: number } | null;
      return p ? `Verified procedure: ${p.title} · ${p.outcomeCount} recorded outcome(s)` : String(o.note ?? 'No verified procedure found');
    }
    case 3:
      return `${(o.steps as string[] | undefined)?.length ?? 0} remediation steps drafted`;
    default: {
      const text = String(o.summary ?? '');
      return text.length > 180 ? `${text.slice(0, 180).replace(/\s+\S*$/, '')}…` : text;
    }
  }
}

function buildTimeline(
  task: Task,
  checkpoints: Checkpoint[],
  resumed: { by: string; at: string } | null,
  leaseExpired: boolean,
  workerAlive: boolean,
): TimelineItem[] {
  const byStep = new Map(checkpoints.map((c) => [c.stepIndex, c]));
  const items: TimelineItem[] = [];
  let resumeMarkerShown = false;
  task.steps.forEach((step, i) => {
    const cp = byStep.get(i);
    const prev = i > 0 ? byStep.get(i - 1) : undefined;
    // Resume marker: the first step done (or in progress) under a later attempt than the previous checkpoint.
    const resumedHere =
      (cp && prev && cp.attempt > prev.attempt) || (!cp && prev && task.status === 'running' && task.attempt > prev.attempt && task.currentStep === i);
    if (resumedHere && !resumeMarkerShown) {
      resumeMarkerShown = true;
      const by = cp?.workerId ?? resumed?.by ?? task.workerId ?? 'a new worker';
      items.push({
        id: `resume-${i}`,
        icon: <ServerCrash />,
        tone: 'warning',
        marker: true,
        title: `Worker crashed — resumed from step ${i + 1} by ${by}`,
        meta: resumed ? time(resumed.at) : undefined,
        body: `Steps 1–${i} were restored from checkpoints written by ${prev!.workerId} and were not re-executed (attempt ${prev!.attempt} → ${cp?.attempt ?? task.attempt}).`,
      });
    }
    // Orphaned: the owner stopped heartbeating; waiting for the lease to expire.
    if (!cp && task.status === 'running' && task.currentStep === i && !resumedHere && !workerAlive && checkpoints.length > 0) {
      items.push({
        id: `orphan-${i}`,
        icon: <Skull />,
        tone: 'danger',
        marker: true,
        title: `${task.workerId ?? 'The worker'} stopped responding during step ${i + 1}`,
        body: leaseExpired ? 'Lease expired: the next worker will claim this task and resume from step ' + (i + 1) + '.' : 'Waiting for its lease to expire before another worker can resume.',
      });
    }
    if (cp) {
      items.push({
        id: `step-${i}`,
        icon: <CheckCircle2 />,
        tone: 'success',
        title: `${i + 1}. ${step.name}`,
        meta: (
          <span>
            {time(cp.createdAt)} · <span className="font-mono">{cp.workerId}</span> · attempt {cp.attempt}
          </span>
        ),
        body: checkpointBody(cp),
      });
    } else if (step.status === 'running' && task.status === 'running') {
      items.push({
        id: `step-${i}`,
        icon: <Loader2 className="animate-spin" />,
        tone: 'accent',
        title: `${i + 1}. ${step.name}`,
        meta: <span>running on <span className="font-mono">{task.workerId}</span></span>,
      });
    } else if (step.status === 'failed' || (task.status === 'failed' && task.currentStep === i)) {
      items.push({ id: `step-${i}`, icon: <CircleX />, tone: 'danger', title: `${i + 1}. ${step.name}`, body: task.error ?? 'Failed' });
    } else {
      items.push({ id: `step-${i}`, icon: <CircleDashed />, tone: 'neutral', title: `${i + 1}. ${step.name}`, meta: 'pending' });
    }
  });
  return items;
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 px-4 py-3', className)}>
      <span className="text-caption text-text-muted">{label}</span>
      <span className="tabular truncate text-body text-text">{children}</span>
    </div>
  );
}

export default function TaskDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const task = useTask(id);
  const live = task.data?.status === 'running' || task.data?.status === 'queued';
  const checkpoints = useCheckpoints(id, live);
  const events = useEvents({ taskId: id, pageSize: 50 }, live);
  const dev = useDevStatus();
  const agents = useAgents();
  const now = useNow(live);

  const crash = useMutation({
    mutationFn: () => api.post('/api/dev/worker/crash'),
    onSuccess: () => toast.warning('Worker crash requested', { description: 'The worker exits with code 1 after committing its current step.' }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not request a crash.'),
  });
  const rerun = useMutation({
    mutationFn: () => api.post<Task>('/api/tasks', { agentId: task.data!.agentId, symptoms: String(task.data!.input.symptoms ?? '') }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
      navigate(`/tasks/${t.id}`);
    },
  });

  if (task.isLoading)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (task.isError || !task.data)
    return <ErrorState title="Could not load this task." fix={task.error instanceof ApiError ? task.error.message : undefined} onRetry={() => void task.refetch()} />;

  const t = task.data;
  const cps = checkpoints.data ?? [];
  const agentName = agents.data?.find((a) => a.id === t.agentId)?.name ?? '—';
  const workers = dev.data?.workers ?? [];
  const owner = workers.find((w) => w.workerId === t.workerId);
  const leaseLeft = t.leaseExpiresAt ? new Date(t.leaseExpiresAt).getTime() - now : null;
  const leaseExpired = leaseLeft !== null && leaseLeft <= 0;
  const resumedEvent = events.data?.items.find((e) => e.type === 'task.resumed');
  const timeline = buildTimeline(t, cps, resumedEvent ? { by: resumedEvent.actor.name, at: resumedEvent.createdAt } : null, leaseExpired, Boolean(owner));
  const completedSteps = cps.length;
  const output = t.output as { summary?: string; remediation?: string; procedure?: { memoryId: string; title: string } | null } | null;

  return (
    <>
      <PageHeader
        title={t.goal}
        description={`${t.kind === 'playbook' ? 'Playbook' : 'Answer task'} · ${agentName} · created ${formatRelative(t.createdAt)}`}
        actions={
          t.kind === 'playbook' && (
            <>
              {dev.data?.demoMode && live && (
                <Button variant="destructive" onClick={() => crash.mutate()} loading={crash.isPending}>
                  {!crash.isPending && <ServerCrash aria-hidden />}
                  Crash worker
                </Button>
              )}
              {!live && (
                <Button onClick={() => rerun.mutate()} loading={rerun.isPending}>
                  {!rerun.isPending && <RotateCcw aria-hidden />}
                  Run again
                </Button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface md:grid-cols-3 md:divide-y-0 xl:grid-cols-6">
        <Fact label="Status">
          <StatusDot tone={STATUS_TONE[t.status]} label={STATUS_LABEL[t.status]} pulse={t.status === 'running'} className="text-body text-text" />
        </Fact>
        <Fact label="Progress">
          {completedSteps} / {t.steps.length} steps
        </Fact>
        <Fact label="Attempts">{t.attempt}</Fact>
        <Fact label="Worker">
          <span className="font-mono text-dense">{t.workerId ?? '—'}</span>
          {t.workerId && live && <span className={cn('ml-2 text-caption', owner ? 'text-success' : 'text-danger')}>{owner ? 'alive' : 'no heartbeat'}</span>}
        </Fact>
        <Fact label="Lease">
          {!live ? '—' : leaseLeft === null ? 'unclaimed' : leaseExpired ? <span className="text-warning">expired {Math.round(-leaseLeft / 1000)} s ago</span> : `${(leaseLeft / 1000).toFixed(1)} s left`}
        </Fact>
        <Fact label={t.completedAt ? 'Completed' : 'Updated'}>{formatDateTime(t.completedAt ?? t.updatedAt)}</Fact>
      </div>

      {live && workers.length === 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-panel border border-warning/30 bg-warning/[0.06] px-4 py-3 text-dense text-warning">
          <Terminal className="size-4 shrink-0" aria-hidden />
          No worker is running. Start one with <Cmd>npm run worker:supervised -w backend</Cmd>.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Steps and checkpoints" meta={t.isSeed ? <DemoDataBadge /> : undefined} className="self-start xl:col-span-2">
          {t.steps.length ? (
            <Timeline items={timeline} />
          ) : (
            <EmptyState icon={Play} message="This task has no steps." />
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Output">
            {output?.summary ? (
              <div className="flex flex-col gap-3 text-dense">
                <p className="text-body text-text">{output.summary}</p>
                <ListenButton text={output.summary} filename="agent-recall-task-summary.mp3" />
                {output.procedure && (
                  <p className="text-text-muted">
                    Procedure:{' '}
                    <Link to={`/memories?open=${output.procedure.memoryId}`} className="focus-ring rounded-control text-accent hover:underline">
                      {output.procedure.title}
                    </Link>
                  </p>
                )}
                {output.remediation && <pre className="whitespace-pre-wrap rounded-control bg-bg p-3 font-sans text-dense text-text-muted">{output.remediation}</pre>}
              </div>
            ) : t.kind === 'qa' && t.output ? (
              <div className="flex flex-col gap-3">
                <p className="whitespace-pre-wrap text-dense text-text">{String((t.output as { answer?: string }).answer ?? '')}</p>
                <ListenButton text={String((t.output as { answer?: string }).answer ?? '')} filename="agent-recall-answer.mp3" />
              </div>
            ) : (
              <p className="text-dense text-text-muted">{t.status === 'failed' ? (t.error ?? 'Failed') : 'Output appears when the last step completes.'}</p>
            )}
          </Panel>
          <Panel title="Events" meta={events.data ? <span className="tabular">{events.data.total}</span> : null} flush>
            {events.data?.items.length ? (
              <ul className="max-h-96 overflow-y-auto">
                {events.data.items.map((e) => (
                  <EventRow key={e.id} event={e} compact />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-dense text-text-muted">No events yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

