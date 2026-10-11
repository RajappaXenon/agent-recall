import type * as React from 'react';
import { Info, MousePointerClick } from 'lucide-react';
import type { SearchMode, SearchResponseBase, SearchResult } from '@agent-recall/shared';
import { MODE_META } from '@/lib/tokens';
import { formatScore } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { MemoryTypeBadge, VerificationBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { Tooltip } from '@/components/ui/tooltip';

export const POLICY_TOOLTIP =
  'Outcome policy: final = rrf × (1 + 0.15·s), where s = +1 for verified success, −1 for verified failure, 0 otherwise. Only explicit recorded outcomes verify a memory.';

function Stat({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className={className ?? 'text-text'}>{value}</dd>
    </>
  );
}

export function WhyPanel({
  selection,
  columns,
}: {
  selection: { mode: SearchMode; result: SearchResult } | null;
  columns: Partial<Record<SearchMode, SearchResponseBase>>;
}) {
  if (!selection) {
    return (
      <Panel title="Why this result">
        <EmptyState icon={MousePointerClick} message="Select a result to see its ranks, scores and how the outcome policy affected it." className="py-6" />
      </Panel>
    );
  }
  const { mode, result: r } = selection;
  const rankIn = (m: SearchMode) => columns[m]?.results.find((x) => x.memory.id === r.memory.id);
  const hybrid = mode === 'hybrid' ? r : rankIn('hybrid');
  const kw = rankIn('keyword');
  const sem = rankIn('semantic');
  const kwSource = hybrid?.sources.find((s) => s.mode === 'keyword');
  const semSource = hybrid?.sources.find((s) => s.mode === 'semantic');

  return (
    <Panel
      title="Why this result"
      meta={
        <span className={MODE_META[mode].text}>
          {MODE_META[mode].label} · rank {r.rank}
        </span>
      }
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <MemoryTypeBadge type={r.memory.type} compact />
        <span className="truncate text-dense font-medium text-text">{r.memory.title}</span>
        <VerificationBadge status={r.memory.verification.status} />
      </div>
      <p className="mb-3 text-dense text-text">{r.explanation.summary}</p>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-dense">
        <Stat
          label="Keyword"
          className="text-mode-keyword"
          value={
            kwSource || kw
              ? `rank ${kwSource?.rank ?? kw!.rank} · ${columns.keyword?.engine === 'fallback_regex' ? 'regex' : 'search'} ${formatScore(kwSource?.score ?? kw!.score, 'search')}`
              : 'not in top 20'
          }
        />
        <Stat
          label="Semantic"
          className="text-mode-semantic"
          value={
            columns.semantic?.engine === 'unavailable'
              ? 'did not run'
              : semSource || sem
                ? `rank ${semSource?.rank ?? sem!.rank} · vector ${formatScore(semSource?.score ?? sem!.score, 'vector')}`
                : 'not in top 20'
          }
        />
        {hybrid?.rrf !== undefined && (
          <>
            <Stat label="RRF" value={formatScore(hybrid.rrf, 'rrf')} />
            <Stat
              label={
                <span className="inline-flex items-center gap-1">
                  Outcome policy
                  <Tooltip content={POLICY_TOOLTIP}>
                    <button type="button" className="focus-ring rounded-full" aria-label="How the outcome policy works">
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </span>
              }
              value={hybrid.policyMultiplier === 1 ? '× 1.00 (no adjustment)' : `× ${hybrid.policyMultiplier?.toFixed(2)}`}
              className={hybrid.policyMultiplier && hybrid.policyMultiplier > 1 ? 'text-success' : hybrid.policyMultiplier && hybrid.policyMultiplier < 1 ? 'text-danger' : 'text-text'}
            />
            <Stat
              label="Final"
              value={`${formatScore(hybrid.final ?? hybrid.score, 'final')} · hybrid rank ${hybrid.rank}${hybrid.rankBeforePolicy && hybrid.rankBeforePolicy !== hybrid.rank ? ` (was ${hybrid.rankBeforePolicy})` : ''}`}
            />
          </>
        )}
        {!hybrid && <Stat label="Hybrid" value="not in the hybrid top results" />}
      </dl>
      {r.explanation.details.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-caption font-normal text-text-muted">
          {r.explanation.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
