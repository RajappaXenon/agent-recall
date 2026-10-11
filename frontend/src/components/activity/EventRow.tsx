import { Link } from 'react-router-dom';
import {
  Archive,
  Bot,
  CheckCircle2,
  CircleAlert,
  FilePlus2,
  Flag,
  ListTodo,
  type LucideIcon,
  Pencil,
  PlayCircle,
  RotateCcw,
  ScanSearch,
  ServerCrash,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { AppEvent } from '@agent-recall/shared';
import { cn, formatRelative } from '@/lib/utils';
import { DemoDataBadge } from '@/components/ui/badge';

const ICON: Record<string, LucideIcon> = {
  'memory.created': FilePlus2,
  'memory.updated': Pencil,
  'memory.archived': Archive,
  'memory.verified': ShieldCheck,
  'memory.embedding_failed': CircleAlert,
  'search.run': ScanSearch,
  'answer.generated': Sparkles,
  'answer.failed': CircleAlert,
  'outcome.recorded': Flag,
  'task.queued': ListTodo,
  'task.started': PlayCircle,
  'task.resumed': RotateCcw,
  'task.completed': CheckCircle2,
  'task.failed': CircleAlert,
  'task.lease_lost': CircleAlert,
  'task.released': RotateCcw,
  'worker.crashed': ServerCrash,
  'worker.crash_requested': ServerCrash,
  'agent.created': Bot,
  'agent.updated': Bot,
  'audio.generated': Volume2,
};

const TONE: Record<AppEvent['status'], string> = {
  info: 'border-border-strong bg-surface-raised text-text-muted',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  error: 'border-danger/40 bg-danger/10 text-danger',
};

export function EventRow({ event: e, compact = false }: { event: AppEvent; compact?: boolean }) {
  const Icon = ICON[e.type] ?? CircleAlert;
  return (
    <li className={cn('flex gap-3 border-b border-border px-4 last:border-b-0', compact ? 'py-2' : 'py-2.5')}>
      <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border', TONE[e.status])}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-dense text-text', compact ? 'line-clamp-2' : '')}>{e.summary}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption font-normal text-text-muted">
          <span className="font-mono text-[11px]">{e.type}</span>
          <span>· {e.actor.name}</span>
          <span title={new Date(e.createdAt).toLocaleString()}>· {formatRelative(e.createdAt)}</span>
          {!compact && e.taskId && (
            <Link to={`/tasks/${e.taskId}`} className="focus-ring rounded-control text-accent hover:underline">
              Task
            </Link>
          )}
          {!compact && e.memoryId && (
            <Link to={`/memories?open=${e.memoryId}`} className="focus-ring rounded-control text-accent hover:underline">
              Memory
            </Link>
          )}
          {e.isSeed && <DemoDataBadge />}
        </div>
      </div>
    </li>
  );
}
