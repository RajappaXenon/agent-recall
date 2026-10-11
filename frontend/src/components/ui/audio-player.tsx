import * as React from 'react';
import { Download, Loader2, Pause, Play, RotateCw, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Tooltip } from './tooltip';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'error'; message: string };

/**
 * Generates audio on demand (one request per click, double clicks blocked),
 * then plays/pauses and offers export. Disabled with an explanation when not configured.
 */
export function AudioPlayer({
  generate,
  disabledReason,
  filename = 'agent-recall-answer.mp3',
  className,
}: {
  generate: () => Promise<Blob>;
  disabledReason?: string | null;
  filename?: string;
  className?: string;
}) {
  const [state, setState] = React.useState<State>({ kind: 'idle' });
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const inflight = React.useRef(false);

  React.useEffect(
    () => () => {
      if (state.kind === 'ready') URL.revokeObjectURL(state.url);
    },
    [state],
  );

  const load = async (): Promise<string | null> => {
    if (inflight.current) return null;
    inflight.current = true;
    setState({ kind: 'loading' });
    try {
      const blob = await generate();
      const url = URL.createObjectURL(blob);
      setState({ kind: 'ready', url });
      return url;
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Audio generation failed' });
      return null;
    } finally {
      inflight.current = false;
    }
  };

  const toggle = async () => {
    let url = state.kind === 'ready' ? state.url : null;
    if (!url) url = await load();
    if (!url) return;
    const el = audioRef.current;
    if (!el) return;
    if (el.src !== url) el.src = url;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        setState({ kind: 'error', message: 'The browser could not play this audio.' });
      }
    }
    else el.pause();
  };

  const exportAudio = async () => {
    let url = state.kind === 'ready' ? state.url : null;
    if (!url) url = await load();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  if (disabledReason) {
    return (
      <Tooltip content={disabledReason}>
        <span tabIndex={0} className={cn('focus-ring inline-flex rounded-control', className)}>
          <Button size="sm" variant="secondary" disabled aria-label={`Listen (unavailable: ${disabledReason})`}>
            <Volume2 aria-hidden />
            Listen
          </Button>
        </span>
      </Tooltip>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress(el.duration ? el.currentTime / el.duration : 0);
        }}
        className="hidden"
      />
      {state.kind === 'error' ? (
        <Button size="sm" variant="destructive" onClick={() => void load()} title={state.message}>
          <RotateCw aria-hidden />
          Retry audio
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void toggle()}
          disabled={state.kind === 'loading'}
          aria-label={playing ? 'Pause audio' : 'Listen to answer'}
        >
          {state.kind === 'loading' ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : playing ? (
            <Pause aria-hidden />
          ) : (
            <Play aria-hidden />
          )}
          {state.kind === 'loading' ? 'Generating…' : playing ? 'Pause' : 'Listen'}
        </Button>
      )}
      {state.kind === 'ready' && (
        <div className="h-1 w-24 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-fast" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => void exportAudio()}
        disabled={state.kind === 'loading'}
        aria-label="Export audio"
        title="Export audio"
      >
        <Download aria-hidden />
      </Button>
    </div>
  );
}
