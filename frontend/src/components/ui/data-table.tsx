import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Return a comparable value to make the column sortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'right';
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/** Dense table: sticky header, optional client-side sort, keyboard-activatable rows. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  activeKey,
  dense = true,
  maxHeight,
  initialSort = null,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  activeKey?: string | null;
  dense?: boolean;
  maxHeight?: number | string;
  initialSort?: SortState;
  caption?: string;
  className?: string;
}) {
  const [sort, setSort] = React.useState<SortState>(initialSort);
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));

  return (
    <div className={cn('relative overflow-auto', className)} style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'sticky top-0 z-10 h-9 border-b border-border bg-surface px-3 text-caption text-text-muted',
                    c.align === 'right' && 'text-right',
                    c.headerClassName,
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        'focus-ring -mx-1 inline-flex items-center gap-1 rounded-control px-1 hover:text-text',
                        active && 'text-text',
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const isActive = activeKey === key;
            return (
              <tr
                key={key}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                aria-current={isActive || undefined}
                className={cn(
                  'group transition-colors duration-fast',
                  onRowClick && 'focus-ring cursor-pointer -outline-offset-2',
                  isActive ? 'bg-surface-raised' : 'hover:bg-surface-raised',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'border-b border-border px-3 text-dense text-text group-last:border-b-0',
                      dense ? 'h-row-dense' : 'h-row',
                      c.align === 'right' && 'tabular text-right',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
