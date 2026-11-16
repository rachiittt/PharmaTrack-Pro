import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { Skeleton } from './States';

/**
 * Dense, scannable table. Columns: { key, header, render?, align?, className?, hideBelow? }.
 * The table scrolls horizontally inside its container on small screens so the
 * page itself never does.
 */
export function DataTable({ columns, rows, rowKey = 'id', onRowClick, loading, empty, footer, className = '', rowClassName }) {
  const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };
  return (
    <div className={`overflow-x-auto scroll-thin ${className}`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`sticky top-0 bg-surface px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap
                  ${c.align === 'right' ? 'text-right' : ''} ${c.hideBelow ? hide[c.hideBelow] : ''} ${c.headerClassName || ''}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && !rows?.length && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`s${i}`} className="border-b border-line/70">
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-3 ${c.hideBelow ? hide[c.hideBelow] : ''}`}><Skeleton className="h-4 w-full max-w-[160px]" /></td>
              ))}
            </tr>
          ))}
          {rows?.map((row, i) => (
            <tr
              key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey] ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={`border-b border-line/70 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface-2 focus:bg-surface-2 focus:outline-none' : ''} ${rowClassName?.(row) || ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 align-middle ${c.align === 'right' ? 'text-right num' : ''} ${c.hideBelow ? hide[c.hideBelow] : ''} ${c.className || ''}`}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-xs text-ink-3">
      <span className="num">{from}–{to} of {total}</span>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button variant="ghost" size="xs" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">Previous</Button>
        <span className="num px-1.5 text-ink-2">{page} / {pages}</span>
        <Button variant="ghost" size="xs" iconRight={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">Next</Button>
      </nav>
    </div>
  );
}
