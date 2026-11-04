import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { monthNameOnly } from '../../lib/date-utils';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select, FormField } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface MonthRow {
  year: number;
  month: number;
  isClosed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedByName: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * Printing Press month-end closing — Administrator only (see SettingsPage.tsx + the backend
 * MonthClosingsService, which re-checks the real role). A closed month rejects any add/edit/delete
 * dated inside it, enforced by database triggers; reopening is allowed and recorded.
 */
export function MonthClosingTab() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  const monthsQuery = useQuery({
    queryKey: ['month-closings', year],
    queryFn: () => unwrap<MonthRow[]>(apiClient.get('/settings/month-closings', { params: { year } })),
  });

  const actionMutation = useMutation({
    mutationFn: ({ month, action }: { month: number; action: 'close' | 'reopen' }) =>
      apiClient.post(`/settings/month-closings/${year}/${month}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['month-closings'] }),
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  async function handleAction(row: MonthRow, action: 'close' | 'reopen') {
    const name = `${monthNameOnly(row.month, i18n.language)} ${row.year}`;
    const ok = await confirm({
      message: t(action === 'close' ? 'monthClosing.confirmClose' : 'monthClosing.confirmReopen', { name }),
    });
    if (ok) actionMutation.mutate({ month: row.month, action });
  }

  const isFuture = (m: number) => year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth() + 1);

  return (
    <Card>
      <h3 className="text-base font-semibold">{t('monthClosing.title')}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t('monthClosing.description')}</p>

      <div className="mt-4 max-w-[10rem]">
        <FormField label={t('monthClosing.year')}>
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="app-table">
          <thead>
            <tr>
              <th>{t('monthClosing.month')}</th>
              <th>{t('monthClosing.status')}</th>
              <th>{t('monthClosing.closedBy')}</th>
              <th>{t('monthClosing.reopenedBy')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(monthsQuery.data ?? []).map((row) => (
              <tr key={row.month}>
                <td>{monthNameOnly(row.month, i18n.language)}</td>
                <td>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      row.isClosed
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                    }`}
                  >
                    {t(row.isClosed ? 'monthClosing.closed' : 'monthClosing.open')}
                  </span>
                </td>
                <td className="text-xs">{row.closedAt ? `${row.closedByName ?? '—'} · ${fmt(row.closedAt)}` : '—'}</td>
                <td className="text-xs">{row.reopenedAt ? `${row.reopenedByName ?? '—'} · ${fmt(row.reopenedAt)}` : '—'}</td>
                <td>
                  {row.isClosed ? (
                    <Button variant="secondary" disabled={actionMutation.isPending} onClick={() => handleAction(row, 'reopen')}>
                      {t('monthClosing.reopen')}
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={actionMutation.isPending || isFuture(row.month)}
                      onClick={() => handleAction(row, 'close')}
                    >
                      {t('monthClosing.close')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
