import React, { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import EmptyState from './EmptyState';

/**
 * columns: [{ key, label, align?: 'left'|'right', sortable?: bool,
 *             sortValue?: (row) => value, render?: (row) => node, mono?: bool }]
 */
export default function DataTable({ columns, rows, onRowClick, emptyState, getRowKey }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const getValue = col.sortValue ?? ((row) => row[col.key]);
    const sorted = [...rows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va < vb) return sort.dir === 'asc' ? -1 : 1;
      if (va > vb) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [rows, sort, columns]);

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  };

  if (rows.length === 0) {
    return <EmptyState {...emptyState} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-bg border-b-2 border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`h-8 px-3 text-[11px] font-mono uppercase tracking-wide text-text-secondary select-none ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${col.sortable ? 'cursor-pointer hover:text-text-primary' : ''}`}
                onClick={() => col.sortable && toggleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable &&
                    (sort.key === col.key ? (
                      sort.dir === 'asc' ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      )
                    ) : (
                      <ChevronsUpDown size={12} className="opacity-40" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-elevated ${
                onRowClick
                  ? 'cursor-pointer hover:bg-elevated hover:border-l-2 hover:border-l-amber'
                  : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`h-11 px-3 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                    col.mono ? 'font-mono text-xs text-text-secondary' : ''
                  }`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
