import { History, Lightbulb, ListChecks, Network, type LucideIcon } from 'lucide-react';
import type { MemoryType } from '@agent-recall/shared';

/** JS access to design tokens (for SVG/Recharts). Always reads the CSS variable, never a hex. */
export const tokenColor = (token: string, alpha = 1) =>
  alpha === 1 ? `rgb(var(--${token}))` : `rgb(var(--${token}) / ${alpha})`;

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export const MODE_META: Record<SearchMode, { label: string; token: string; text: string; bg: string; border: string }> = {
  keyword: { label: 'Keyword', token: 'keyword', text: 'text-mode-keyword', bg: 'bg-mode-keyword', border: 'border-mode-keyword' },
  semantic: { label: 'Semantic', token: 'accent-2', text: 'text-mode-semantic', bg: 'bg-mode-semantic', border: 'border-mode-semantic' },
  hybrid: { label: 'Hybrid', token: 'accent', text: 'text-mode-hybrid', bg: 'bg-mode-hybrid', border: 'border-mode-hybrid' },
};

export const TYPE_META: Record<MemoryType, { label: string; icon: LucideIcon; token: string; text: string; bg: string }> = {
  semantic: { label: 'Semantic', icon: Lightbulb, token: 'type-semantic', text: 'text-type-semantic', bg: 'bg-type-semantic' },
  episodic: { label: 'Episodic', icon: History, token: 'type-episodic', text: 'text-type-episodic', bg: 'bg-type-episodic' },
  taxonomic: { label: 'Taxonomic', icon: Network, token: 'type-taxonomic', text: 'text-type-taxonomic', bg: 'bg-type-taxonomic' },
  procedural: { label: 'Procedural', icon: ListChecks, token: 'type-procedural', text: 'text-type-procedural', bg: 'bg-type-procedural' },
};
