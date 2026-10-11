import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEMORY_TYPES, type CreateMemoryInput, type Memory, type MemoryType, type UpdateMemoryInput } from '@agent-recall/shared';
import { api, ApiError } from '@/lib/api';
import { agentKeys, memoryKeys, useAgents } from '@/lib/queries';
import { TYPE_META } from '@/lib/tokens';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';

const typeOptions = MEMORY_TYPES.map((t) => {
  const Icon = TYPE_META[t].icon;
  return { value: t, label: TYPE_META[t].label, icon: <Icon className={`size-3.5 ${TYPE_META[t].text}`} aria-hidden /> };
});

/** Create (no `memory`) or edit (with `memory`) dialog. */
export function MemoryFormDialog({
  open,
  onOpenChange,
  memory,
  defaultAgentId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memory?: Memory | null;
  defaultAgentId?: string;
  onSaved?: (m: Memory) => void;
}) {
  const qc = useQueryClient();
  const agents = useAgents();
  const editing = Boolean(memory);
  const [agentId, setAgentId] = React.useState<string | undefined>(memory?.agentId ?? defaultAgentId);
  const [type, setType] = React.useState<MemoryType>(memory?.type ?? 'episodic');
  const [title, setTitle] = React.useState(memory?.title ?? '');
  const [content, setContent] = React.useState(memory?.content ?? '');
  const [tags, setTags] = React.useState((memory?.tags ?? []).join(', '));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAgentId(memory?.agentId ?? defaultAgentId ?? agents.data?.[0]?.id);
    setType(memory?.type ?? 'episodic');
    setTitle(memory?.title ?? '');
    setContent(memory?.content ?? '');
    setTags((memory?.tags ?? []).join(', '));
    setError(null);
  }, [open, memory, defaultAgentId, agents.data]);

  const save = useMutation({
    mutationFn: async () => {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (editing && memory) {
        const body: UpdateMemoryInput = { title: title.trim(), content: content.trim(), type, tags: tagList };
        return api.patch<Memory>(`/api/memories/${memory.id}`, body);
      }
      const body: CreateMemoryInput = { agentId: agentId!, title: title.trim(), content: content.trim(), type, tags: tagList };
      return api.post<Memory>('/api/memories', body);
    },
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: memoryKeys.all });
      void qc.invalidateQueries({ queryKey: agentKeys.all });
      toast.success(editing ? 'Memory saved' : 'Memory created', {
        description:
          m.embeddingStatus === 'ready'
            ? `Embedded with ${m.embedding?.model ?? 'Voyage'}.`
            : m.embeddingStatus === 'failed'
              ? 'Embedding failed; semantic search will skip it until embed:backfill runs.'
              : 'Embedding pending: VOYAGE_API_KEY is not configured.',
      });
      onSaved?.(m);
      onOpenChange(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save the memory.'),
  });

  const valid = title.trim().length > 0 && content.trim().length > 0 && (editing || Boolean(agentId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit memory' : 'Create memory'}
        description="Memories are embedded on save and become searchable shortly after indexing."
        className="max-w-xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
              {editing ? 'Save changes' : 'Create memory'}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {!editing && (
              <Field label="Agent" htmlFor="mem-agent">
                <Select
                  id="mem-agent"
                  value={agentId}
                  onValueChange={setAgentId}
                  placeholder={agents.isLoading ? 'Loading agents…' : 'Choose an agent'}
                  options={(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                />
              </Field>
            )}
            <Field label="Type" htmlFor="mem-type">
              <Select id="mem-type" value={type} onValueChange={(v) => setType(v as MemoryType)} options={typeOptions} />
            </Field>
          </div>
          <Field label="Title" htmlFor="mem-title">
            <Input id="mem-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. API timeouts after pool change" />
          </Field>
          <Field label="Content" htmlFor="mem-content" hint="What happened, what fixed it, and how you know.">
            <Textarea id="mem-content" value={content} onChange={(e) => setContent(e.target.value)} rows={7} maxLength={8000} />
          </Field>
          <Field label="Tags" htmlFor="mem-tags" hint="Comma separated.">
            <Input id="mem-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="mongodb, connection-pool" />
          </Field>
          {error && (
            <p role="alert" className="text-dense text-danger">
              {error}
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}
