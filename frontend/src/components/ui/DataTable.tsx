import { CSSProperties, ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from './Input';

export interface Column<T> {
  header: string;
  accessor: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortKey?: string;
  /** Optional CSS width (e.g. '1%', '12rem') for columns that need to be narrower/wider than their neighbors. */
  width?: string;
  /** Opt-in visual emphasis (light/dark-aware background, bold text, distinct border) for a column
   * the user needs to spot at a glance while scanning a wide table — applies to both the header and
   * every data cell via the shared `.col-highlight` rule in index.css. */
  highlight?: boolean;
  /** Marks this column as the row's action buttons (edit/delete/print/etc.). On the phone card
   * layout it renders as its own full-width strip below the other fields instead of being squeezed
   * into a label/value line, where a handful of buttons had no room and wrapped mid-word. */
  isActions?: boolean;
}

export interface ServerPagination {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export interface SortState {
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  onSortChange: (sortKey: string) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: (row: T) => string;
  isLoading?: boolean;
  searchable?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  serverPagination?: ServerPagination;
  sort?: SortState;
  /** Optional per-row inline style (e.g. alternating group backgrounds) — takes precedence over
   * the default `.app-table tbody tr:nth-child(even)` zebra striping wherever it returns a
   * `backgroundColor`, since inline styles win regardless of the stylesheet rule's specificity.
   * Applied to both the desktop table row and the phone card. Every other caller leaves this
   * unset, so nothing changes for them. */
  rowStyle?: (row: T) => CSSProperties | undefined;
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  isLoading,
  searchable = true,
  pageSize = 10,
  onRowClick,
  serverPagination,
  sort,
  rowStyle,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Multi-keyword, cross-column, order-independent: splits the typed query into separate words
  // and requires every one of them to appear SOMEWHERE across the row's columns combined — not
  // each word in the same column, and not all in one continuous phrase. This is what lets
  // "فريش 1.5" (or "1.5 فريش") match a row where "فريش" is in the product-name column and "1.5"
  // is in a completely different column (model/spec/whatever), regardless of typing order.
  const filtered = useMemo(() => {
    const keywords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return data;
    return data.filter((row) => {
      const haystack = columns.map((col) => String(col.accessor(row) ?? '').toLowerCase()).join(' ');
      return keywords.every((kw) => haystack.includes(kw));
    });
  }, [data, search, columns]);

  const totalPages = serverPagination
    ? serverPagination.totalPages
    : Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = serverPagination ? serverPagination.page : page;
  const paged = serverPagination ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  function goToPage(p: number) {
    if (serverPagination) serverPagination.onPageChange(p);
    else setPage(p);
  }

  return (
    <div>
      {searchable && (
        <div className="mb-3 max-w-xs">
          <Input
            placeholder={t('common.search') ?? 'Search'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      )}
      {/* Desktop/tablet: the original table, unchanged. Hidden below `md` in favor of the card list
          below it — a plain HTML table with fixed-width columns has no way to reflow at phone
          widths, and this component is shared by every list screen in the app (including the ones
          مندوب/مدير فرع use inside the Android app), so the fix lives here once instead of being
          rebuilt per screen. */}
      <div className="hidden overflow-x-auto rounded-lg border border-[var(--border)] md:block">
        <table className="app-table">
          {columns.some((col) => col.width) && (
            <colgroup>
              {columns.map((col, i) => (
                <col key={i} style={col.width ? { width: col.width } : undefined} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map((col, i) => {
                const sortable = !!sort && !!col.sortKey;
                const active = sortable && sort!.sortBy === col.sortKey;
                const thClassNames = [sortable ? 'cursor-pointer select-none' : '', col.highlight ? 'col-highlight' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <th
                    key={i}
                    className={thClassNames || undefined}
                    onClick={() => sortable && sort!.onSortChange(col.sortKey!)}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      {col.header}
                      {active && <span className="text-xs">{sort!.sortOrder === 'DESC' ? '▼' : '▲'}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="text-[var(--text-muted)]">
                  {t('common.loading')}
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-[var(--text-muted)]">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              paged.map((row) => (
                <tr
                  key={keyField(row)}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  style={rowStyle?.(row)}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col, i) => (
                    <td key={i} className={col.highlight ? 'col-highlight' : undefined}>
                      {col.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per row instead of a horizontally-scrolling table. The first column
          becomes the card's title (it's always the row's own identifying value — a name, a
          document number, a date); every other column renders as a label/value line. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {isLoading ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--text-muted)]">
            {t('common.loading')}
          </div>
        ) : paged.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--text-muted)]">
            {t('common.noData')}
          </div>
        ) : (
          paged.map((row) => {
            const [titleCol, ...restCols] = columns;
            const actionsCol = restCols.find((col) => col.isActions);
            const fieldCols = restCols.filter((col) => !col.isActions);
            return (
              <div
                key={keyField(row)}
                className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 ${onRowClick ? 'cursor-pointer active:bg-[var(--surface-2,var(--table-header-bg))]' : ''}`}
                style={rowStyle?.(row)}
                onClick={() => onRowClick?.(row)}
              >
                <div className="mb-2.5 text-base font-semibold">{titleCol.accessor(row)}</div>
                <div className="flex flex-col gap-2">
                  {fieldCols.map((col, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-[var(--text-muted)]">{col.header}</span>
                      <span className={`text-end font-medium ${col.highlight ? 'text-[var(--accent,var(--primary-600))]' : ''}`}>
                        {col.accessor(row)}
                      </span>
                    </div>
                  ))}
                </div>
                {actionsCol && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-sm">
                    {actionsCol.accessor(row)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            className="rounded px-2 py-1 disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
          >
            ‹
          </button>
          <span className="text-[var(--text-muted)]">
            {currentPage} / {totalPages}
          </span>
          <button
            className="rounded px-2 py-1 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => goToPage(currentPage + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
