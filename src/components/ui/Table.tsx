import * as React from 'react';
import { cn } from '../../lib/utils';
import { LoadingState, EmptyState } from './Feedback';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  emptyTitle = 'Nada por aqui',
  emptyDescription,
  emptyIcon,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
}) {
  if (loading && rows.length === 0) return <LoadingState />;
  if (rows.length === 0)
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;

  const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  'px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide',
                  alignCls[c.align || 'left'],
                  c.hideOnMobile && 'hidden md:table-cell',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-slate-50 dark:border-slate-800/60 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40',
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-4 py-3 text-sm text-slate-700 dark:text-slate-200 align-middle',
                    alignCls[c.align || 'left'],
                    c.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
