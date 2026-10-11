import type { Memory } from '@agent-recall/shared';
import { Sparkles } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';

/** Grounded answer + outcome flow (implemented in Phase 3). */
export function AnswerFlow({
  memories,
  onClose,
}: {
  query: string;
  memories: Memory[];
  defaultAgentId?: string;
  onClose: () => void;
  onSearchAgain: () => void;
}) {
  return (
    <Panel title="Grounded answer" className="mt-4" actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      <EmptyState icon={Sparkles} message={`${memories.length} memories selected. Grounded answers are not available in this build yet.`} />
    </Panel>
  );
}
