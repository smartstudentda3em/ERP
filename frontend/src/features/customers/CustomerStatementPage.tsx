import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';

interface StatementLine {
  date: string;
  type: string;
  documentNumber: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface Statement {
  customer: { code: string; name: string };
  openingBalance: number;
  closingBalance: number;
  lines: StatementLine[];
}

export function CustomerStatementPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  const statementQuery = useQuery({
    queryKey: ['customer-statement', id],
    queryFn: () => unwrap<Statement>(apiClient.get(`/customers/${id}/statement`)),
    enabled: !!id,
  });

  const data = statementQuery.data;

  const displayLines = useMemo(() => {
    const lines = data?.lines ?? [];
    const opening = lines.filter((l) => l.type === 'OPENING_BALANCE');
    const movements = lines.filter((l) => l.type !== 'OPENING_BALANCE' && inDateRange(l.date, dateRange));
    return [...movements].reverse().concat(opening);
  }, [data, dateRange]);

  return (
    <div>
      <PageHeader title={`${t('nav.customers')} — ${data?.customer.name ?? ''}`} />
      <Card>
        <div className="mb-4 flex gap-8 text-sm">
          <div>
            <div className="text-[var(--text-muted)]">{t('table.openingBalance')}</div>
            <div className="text-lg font-semibold">
              {data?.openingBalance !== undefined ? formatAmount(data.openingBalance) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-muted)]">{t('table.closingBalance')}</div>
            <div className="text-lg font-semibold">
              {data?.closingBalance !== undefined ? formatAmount(data.closingBalance) : '—'}
            </div>
          </div>
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('common.type')}</th>
                <th>{t('table.documentNumber')}</th>
                <th>{t('table.debit')}</th>
                <th>{t('table.credit')}</th>
                <th>{t('table.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {displayLines.map((line, i) => (
                <tr key={i}>
                  <td>{line.date}</td>
                  <td>{line.type}</td>
                  <td>{line.documentNumber}</td>
                  <td>{line.debit ? formatAmount(line.debit) : '—'}</td>
                  <td>{line.credit ? formatAmount(line.credit) : '—'}</td>
                  <td className="font-medium">{formatAmount(line.runningBalance)}</td>
                </tr>
              ))}
              {displayLines.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-[var(--text-muted)]">
                    {t('common.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
