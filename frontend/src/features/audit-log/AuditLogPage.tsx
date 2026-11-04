import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input, Select, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';

interface AuditRow {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  departmentName: string | null;
  actionType: string;
  source: 'CHANGE' | 'REQUEST';
  targetModel: string | null;
  targetLabel: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  description: string | null;
  requestBody: Record<string, unknown> | null;
  statusCode: number;
  method: string;
  path: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface FilterOptions {
  users: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  targetModels: { key: string; label: string }[];
}

interface Page {
  items: AuditRow[];
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PRINT', 'APPROVE', 'OTHER'];
const ACTION_COLORS: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  APPROVE: 'yellow',
  LOGIN: 'gray',
  LOGOUT: 'gray',
  PRINT: 'gray',
  OTHER: 'gray',
};

const emptyFilters = { search: '', userId: '', companyId: '', actionType: '', targetModel: '', dateFrom: '', dateTo: '' };

const fmtValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/**
 * "سجل الإجراءات" — the activity trail. Founder-only: the sidebar link is hidden for everyone else
 * (Sidebar.tsx), the route redirects them (RequireFounder), and the API itself returns 403
 * (FounderGuard) — the last one is the real boundary, the other two are just tidiness.
 */
export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['audit-log-options'],
    queryFn: () => unwrap<FilterOptions>(apiClient.get('/audit-logs/filter-options')),
  });

  const logQuery = useQuery({
    queryKey: ['audit-log', applied, page],
    queryFn: () =>
      unwrap<Page>(
        apiClient.get('/audit-logs', {
          params: Object.fromEntries(Object.entries({ ...applied, page, limit: 25 }).filter(([, v]) => v !== '')),
        }),
      ),
    placeholderData: (prev) => prev,
  });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' });

  const columns: Column<AuditRow>[] = [
    { header: t('auditLog.time'), accessor: (r) => <span className="whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</span> },
    {
      header: t('auditLog.user'),
      accessor: (r) => (
        <div>
          <div className="font-medium">{r.userName ?? r.userEmail ?? '—'}</div>
          {r.userRole && <div className="text-xs text-[var(--text-muted)]">{r.userRole}</div>}
        </div>
      ),
    },
    { header: t('auditLog.department'), accessor: (r) => r.departmentName ?? '—' },
    {
      header: t('auditLog.action'),
      accessor: (r) => (
        <Badge color={r.statusCode >= 400 ? 'red' : (ACTION_COLORS[r.actionType] ?? 'gray')}>
          {t(`auditLog.actions.${r.actionType}`, r.actionType)}
          {r.statusCode >= 400 ? ` · ${t('auditLog.failed')}` : ''}
        </Badge>
      ),
    },
    {
      header: t('auditLog.target'),
      accessor: (r) => (
        <div>
          <div>{r.targetLabel ?? '—'}</div>
          {r.entityId && <div className="font-mono text-[10px] text-[var(--text-muted)]">{r.entityId.slice(0, 8)}</div>}
        </div>
      ),
    },
    { header: t('auditLog.description'), accessor: (r) => r.description ?? '—' },
  ];

  const changedKeys = (r: AuditRow) =>
    Array.from(new Set([...Object.keys(r.oldValues ?? {}), ...Object.keys(r.newValues ?? {})])).filter(
      (k) => !['id', 'createdAt', 'updatedAt', 'deletedAt'].includes(k),
    );

  return (
    <div>
      <PageHeader title={t('auditLog.title')} />

      <Card className="mb-4">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(filters);
            setPage(1);
          }}
        >
          <FormField label={t('auditLog.search')}>
            <Input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder={t('auditLog.searchPlaceholder') ?? ''} />
          </FormField>
          <FormField label={t('auditLog.user')}>
            <Select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
              <option value="">{t('auditLog.all')}</option>
              {(optionsQuery.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('auditLog.department')}>
            <Select value={filters.companyId} onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}>
              <option value="">{t('auditLog.all')}</option>
              {(optionsQuery.data?.companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('auditLog.action')}>
            <Select value={filters.actionType} onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}>
              <option value="">{t('auditLog.all')}</option>
              {ACTION_TYPES.map((a) => (
                <option key={a} value={a}>
                  {t(`auditLog.actions.${a}`, a)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('auditLog.target')}>
            <Select value={filters.targetModel} onChange={(e) => setFilters({ ...filters, targetModel: e.target.value })}>
              <option value="">{t('auditLog.all')}</option>
              {(optionsQuery.data?.targetModels ?? []).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('auditLog.dateFrom')}>
            <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </FormField>
          <FormField label={t('auditLog.dateTo')}>
            <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </FormField>
          <div className="flex items-end gap-2">
            <Button type="submit">{t('auditLog.apply')}</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilters(emptyFilters);
                setApplied(emptyFilters);
                setPage(1);
              }}
            >
              {t('auditLog.reset')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-2 text-xs text-[var(--text-muted)]">{t('auditLog.total', { count: logQuery.data?.total ?? 0 })}</div>
      <DataTable
        columns={columns}
        data={logQuery.data?.items ?? []}
        keyField={(r) => r.id}
        isLoading={logQuery.isLoading}
        searchable={false}
        pageSize={25}
        onRowClick={setSelected}
        serverPagination={{ page, totalPages: logQuery.data?.totalPages ?? 1, onPageChange: setPage }}
      />

      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('auditLog.details')} widthClass="max-w-3xl">
        {selected && (
          <div className="space-y-4 text-sm">
            <p className="text-base font-semibold">{selected.description}</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.user')}: </span>
                {selected.userName ?? selected.userEmail ?? '—'}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.role')}: </span>
                {selected.userRole ?? '—'}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.department')}: </span>
                {selected.departmentName ?? '—'}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.time')}: </span>
                {fmtDate(selected.createdAt)}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.action')}: </span>
                {t(`auditLog.actions.${selected.actionType}`, selected.actionType)}
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.target')}: </span>
                {selected.targetLabel ?? '—'}
              </div>
              <div className="col-span-2">
                <span className="text-[var(--text-muted)]">{t('auditLog.recordId')}: </span>
                <span className="font-mono text-xs">{selected.entityId ?? '—'}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.ip')}: </span>
                <span dir="ltr">{selected.ipAddress ?? '—'}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">{t('auditLog.status')}: </span>
                {selected.statusCode}
              </div>
            </div>

            {(selected.oldValues || selected.newValues) && (
              <div>
                <h4 className="mb-2 font-semibold">{t('auditLog.changes')}</h4>
                <div className="overflow-x-auto">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>{t('auditLog.field')}</th>
                        <th>{t('auditLog.oldValue')}</th>
                        <th>{t('auditLog.newValue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changedKeys(selected).map((k) => (
                        <tr key={k}>
                          <td className="font-medium">{t(`auditLog.fields.${k}`, k)}</td>
                          <td className="text-red-600">{fmtValue(selected.oldValues?.[k])}</td>
                          <td className="text-green-600">{fmtValue(selected.newValues?.[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selected.requestBody && !selected.oldValues && !selected.newValues && (
              <div>
                <h4 className="mb-2 font-semibold">{t('auditLog.requestData')}</h4>
                <pre dir="ltr" className="max-h-60 overflow-auto rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">
                  {JSON.stringify(selected.requestBody, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
