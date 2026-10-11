import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleX, Loader2, RotateCcw, Search, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { AnswerResponse, Memory, OutcomeResponse, SearchableResponse } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { agentKeys, memoryKeys, useAgents } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge, MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { StatusDot } from '@/components/ui/status-dot';
import { ListenButton } from '@/components/audio/ListenButton';
import { LatencyChip } from '@/components/ui/latency-chip';
import { toast } from '@/components/ui/toast';

/** Splits answer text into plain text and [mem:id] citation chips (numbered by first appearance). */
function AnswerText({
  text,
  memories,
  onHover,
}: {
  text: string;
  memories: Memory[];
  onHover: (id: string | null) => void;
}) {
  const order: string[] = [];
  const parts = text.split(/(\[mem:[a-f0-9]{24}\])/g);
  return (
    <div className="max-w-prose whitespace-pre-wrap text-body leading-6 text-text">
      {parts.map((p, i) => {
        const m = p.match(/^\[mem:([a-f0-9]{24})\]$/);
        if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
        const id = m[1]!;
        if (!order.includes(id)) order.push(id);
        const n = order.indexOf(id) + 1;
        const mem = memories.find((x) => x.id === id);
        return (
          <button
            key={i}
            type="button"
            onMouseEnter={() => onHover(id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(id)}
            onBlur={() => onHover(null)}
            className="focus-ring mx-0.5 inline-flex h-5 -translate-y-px items-center rounded-[4px] border border-accent/40 bg-accent/10 px-1.5 align-middle text-caption text-accent hover:bg-accent/20"
            aria-label={`Citation ${n}: ${mem?.title ?? id}`}
            title={mem?.title}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function SearchableState({ memoryId }: { memoryId: string }) {
  const q = useQuery({
    queryKey: ['memories', memoryId, 'searchable'],
    queryFn: () => api.get<SearchableResponse>(`/api/memories/${memoryId}/searchable`),
    refetchInterval: (query) => (query.state.data?.searchable ? false : 1500),
  });
  if (!q.data) return <StatusDot tone="warning" label="Indexing…" pulse />;
  return q.data.searchable ? (
    <StatusDot tone="success" label="Searchable" />
  ) : (
    <span title={q.data.detail}>
      <StatusDot tone="warning" label="Indexing…" pulse />
    </span>
  );
}

export function AnswerFlow({
  query,
  memories,
  defaultAgentId,
  onClose,
  onSearchAgain,
  onHoverMemory,
}: {
  query: string;
  memories: Memory[];
  defaultAgentId?: string;
  onClose: () => void;
  onSearchAgain: () => void;
  onHoverMemory?: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const agents = useAgents();
  const [agentId, setAgentId] = React.useState<string | undefined>(defaultAgentId);
  const [hoverCite, setHoverCite] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<'worked' | 'failed' | null>(null);
  const [feedback, setFeedback] = React.useState<'helpful' | 'not_helpful' | null>(null);
  const [notes, setNotes] = React.useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!agentId && defaultAgentId) setAgentId(defaultAgentId);
  }, [agentId, defaultAgentId]);

  const answer = useMutation({
    mutationFn: () => api.post<AnswerResponse>('/api/answers', { agentId, query, memoryIds: memories.map((m) => m.id) }),
  });
  const outcome = useMutation({
    mutationFn: () =>
      api.post<OutcomeResponse>(`/api/tasks/${answer.data!.taskId}/outcome`, { result, ...(feedback ? { feedback } : {}), notes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: memoryKeys.all });
      void qc.invalidateQueries({ queryKey: agentKeys.all });
      toast.success('Outcome recorded', { description: 'A new memory was created from this outcome.' });
    },
  });

  // Generate once on open (and when the agent is known).
  const started = React.useRef(false);
  React.useEffect(() => {
    if (agentId && !started.current) {
      started.current = true;
      answer.mutate();
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [agentId, answer]);

  const hover = (id: string | null) => {
    setHoverCite(id);
    onHoverMemory?.(id);
  };

  const data = answer.data;
  const cited = new Set(data?.citations ?? []);

  return (
    <div ref={ref} className="mt-4 scroll-mt-20">
      <Panel
        title="Grounded answer"
        meta={
          data && (
            <>
              {data.mode === 'template' ? <Badge tone="warning">Template answer (LLM not configured)</Badge> : <Badge>{data.model}</Badge>}
              {data.mode === 'llm' && <LatencyChip ms={data.latencyMs} />}
              {data.servedBy && <Badge tone="warning">Served by fallback model {data.servedBy}</Badge>}
            </>
          )
        }
        actions={
          <>
            <Select
              size="sm"
              aria-label="Agent"
              className="w-48"
              value={agentId}
              onValueChange={setAgentId}
              options={(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
            />
            <Button size="icon-sm" variant="ghost" aria-label="Close answer" onClick={onClose}>
              <X aria-hidden />
            </Button>
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-dense text-text-muted">
              <span className="text-text-muted">Question · </span>
              {query}
            </p>
            {answer.isPending && (
              <div className="flex flex-col gap-2" aria-label="Generating answer" role="status">
                <span className="inline-flex items-center gap-2 text-dense text-text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Grounding an answer in {memories.length} memories…
                </span>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            )}
            {answer.isError && (
              <ErrorState
                title="Could not generate an answer."
                fix={answer.error instanceof ApiError ? answer.error.message : undefined}
                onRetry={() => answer.mutate()}
              />
            )}
            {data && (
              <>
                <span data-testid="answer-ready" hidden />
                <AnswerText text={data.answer} memories={memories} onHover={hover} />
                <div className="flex flex-wrap items-center gap-2">
                  <ListenButton text={data.answer} filename="agent-recall-answer.mp3" />
                  <Button size="sm" variant="ghost" onClick={() => answer.mutate()} disabled={outcome.isSuccess}>
                    <RotateCcw aria-hidden />
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>

          <aside aria-label="Evidence" className="flex flex-col gap-2">
            <h3 className="text-caption text-text-muted">Evidence ({memories.length})</h3>
            <ul className="flex flex-col rounded-panel border border-border">
              {memories.map((m) => (
                <li
                  key={m.id}
                  onMouseEnter={() => hover(m.id)}
                  onMouseLeave={() => hover(null)}
                  className={cn(
                    'flex flex-col gap-1 border-b border-border px-3 py-2 transition-colors duration-fast last:border-b-0',
                    hoverCite === m.id && 'bg-accent/10',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MemoryTypeBadge type={m.type} compact />
                    <span className="min-w-0 flex-1 truncate text-dense font-medium text-text">{m.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <VerificationBadge status={m.verification.status} />
                    {data && (cited.has(m.id) ? <Badge tone="accent">Cited</Badge> : <Badge>Not cited</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        {data && (
          <section aria-labelledby="outcome-heading" className="mt-6 border-t border-border pt-4">
            <h3 id="outcome-heading" className="mb-3 text-section text-text">
              Did this work?
            </h3>
            {!outcome.isSuccess ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Choice on={result === 'worked'} tone="success" onClick={() => setResult('worked')} icon={<CheckCircle2 aria-hidden />} label="Worked" />
                  <Choice on={result === 'failed'} tone="danger" onClick={() => setResult('failed')} icon={<CircleX aria-hidden />} label="Failed" />
                  <span className="mx-2 h-5 w-px bg-border-strong" aria-hidden />
                  <Choice on={feedback === 'helpful'} tone="accent" onClick={() => setFeedback(feedback === 'helpful' ? null : 'helpful')} icon={<ThumbsUp aria-hidden />} label="Helpful" />
                  <Choice
                    on={feedback === 'not_helpful'}
                    tone="neutral"
                    onClick={() => setFeedback(feedback === 'not_helpful' ? null : 'not_helpful')}
                    icon={<ThumbsDown aria-hidden />}
                    label="Not helpful"
                  />
                </div>
                <Textarea aria-label="Notes" placeholder="What did you change, and how do you know it worked?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="max-w-3xl" />
                {outcome.isError && (
                  <p role="alert" className="text-dense text-danger">
                    {outcome.error instanceof ApiError ? outcome.error.message : 'Could not record the outcome.'}
                  </p>
                )}
                <div>
                  <Button variant="primary" disabled={!result} loading={outcome.isPending} onClick={() => outcome.mutate()}>
                    Record outcome
                  </Button>
                </div>
              </div>
            ) : (
              <OutcomeSummary data={outcome.data} onSearchAgain={onSearchAgain} />
            )}
          </section>
        )}
      </Panel>
    </div>
  );
}

function Choice({ on, tone, onClick, icon, label }: { on: boolean; tone: 'success' | 'danger' | 'accent' | 'neutral'; onClick: () => void; icon: React.ReactNode; label: string }) {
  const toneOn = { success: 'border-success/50 bg-success/10 text-success', danger: 'border-danger/50 bg-danger/10 text-danger', accent: 'border-accent/50 bg-accent/10 text-accent', neutral: 'border-text-muted/50 bg-surface-raised text-text' }[tone];
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-dense font-medium transition-colors duration-fast [&_svg]:size-4',
        on ? toneOn : 'border-border-strong text-text-muted hover:text-text',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OutcomeSummary({ data, onSearchAgain }: { data: OutcomeResponse; onSearchAgain: () => void }) {
  const m = data.createdMemory;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-dense text-text">
        Outcome recorded as <strong className={data.result === 'worked' ? 'text-success' : 'text-danger'}>{data.result === 'worked' ? 'worked' : 'failed'}</strong>
        {data.usefulnessUpdated.length > 0 && <> · usefulness updated on {data.usefulnessUpdated.length} memories</>}.
      </p>
      {data.verificationChanges.length > 0 && (
        <ul className="flex flex-col gap-1 text-dense">
          {data.verificationChanges.map((c) => (
            <li key={c.memoryId} className="flex flex-wrap items-center gap-2">
              <VerificationBadge status={c.to} />
              <span className="text-text">{c.title}</span>
              <span className="text-text-muted">· {c.note}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1.5 rounded-panel border border-accent/30 bg-accent/[0.05] px-4 py-3" data-testid="created-memory">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">New memory</Badge>
          <MemoryTypeBadge type={m.type} />
          <VerificationBadge status={m.verification.status} />
          <span className="ml-auto">
            <SearchableState memoryId={m.id} />
          </span>
        </div>
        <Link to={`/memories?open=${m.id}`} className="focus-ring w-fit rounded-control text-body font-medium text-text hover:underline">
          {m.title}
        </Link>
        <p className="line-clamp-2 text-dense text-text-muted">{m.content}</p>
      </div>
      <div>
        <Button variant="primary" onClick={onSearchAgain}>
          <Search aria-hidden />
          Search again
        </Button>
        <span className="ml-3 text-caption font-normal text-text-muted">
          <Sparkles className="mr-1 inline size-3.5" aria-hidden />
          Verified outcomes now count in hybrid ranking.
        </span>
      </div>
    </div>
  );
}
