import { ReactNode, useMemo, useState } from 'react';
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
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => String(col.accessor(row) ?? '').toLowerCase().includes(q)),
    );
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
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
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
