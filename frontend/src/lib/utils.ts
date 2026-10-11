import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom type scale and colour tokens, otherwise
// `text-body` and `text-text-muted` are treated as conflicting colour classes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['title', 'section', 'body', 'dense', 'caption', 'metric'] }],
      'text-color': [
        {
          text: [
            'text', 'text-muted', 'text-faint', 'accent', 'accent-2', 'keyword', 'success', 'warning', 'danger',
            'primary-foreground', 'mode-keyword', 'mode-semantic', 'mode-hybrid',
            'type-semantic', 'type-episodic', 'type-taxonomic', 'type-procedural',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatScore(score: number, kind: string): string {
  if (kind === 'rrf' || kind === 'final') return score.toFixed(4);
  if (kind === 'vector') return score.toFixed(3);
  return score.toFixed(2);
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
