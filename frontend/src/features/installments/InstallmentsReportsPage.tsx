import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange } from '../../components/ui/DateRangeFilter';

interface Summary {
  totalOutstanding: number;
}
interface CashFlowPeriod {
  period: string;
  expected: number;
}
interface InterestProfit {
  realizedInterest: number;
  remainingInterest: number;
}

function money(n: number) {
  return formatAmount(n);
}

export function InstallmentsReportsPage() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [range, setRange] = useState<DateRange>({ from: '', to: '' });

  const summaryQuery = useQuery({
    queryKey: ['installments-summary', companyId],
    queryFn: () => unwrap<Summary>(apiClient.get('/installments/reports/summary', { params: { companyId } })),
    enabled: !!companyId,
  });

  const cashFlowQuery = useQuery({
    queryKey: ['installments-cash-flow', companyId, range.from, range.to],
    queryFn: () =>
      unwrap<CashFlowPeriod[]>(
        apiClient.get('/installments/reports/expected-cash-flow', {
          params: { companyId, dateFrom: range.from || undefined, dateTo: range.to || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const interestQuery = useQuery({
    queryKey: ['installments-interest-profit', companyId, range.from, range.to],
    queryFn: () =>
      unwrap<InterestProfit>(
        apiClient.get('/installments/reports/interest-profit', {
          params: { companyId, dateFrom: range.from || undefined, dateTo: range.to || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const cashFlowColumns: Column<CashFlowPeriod>[] = [
    { header: t('installments.period'), accessor: (r) => r.period },
    { header: t('installments.expectedCollection'), accessor: (r) => money(r.expected), align: 'right' },
  ];

  return (
    <div>
      <PageHeader title={t('installments.reportsTitle')} />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('installments.totalDistributed')}</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{money(summaryQuery.data?.totalOutstanding ?? 0)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('installments.realizedInterest')}</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{money(interestQuery.data?.realizedInterest ?? 0)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('installments.remainingInterestReport')}</div>
          <div className="mt-1 text-2xl font-semibold">{money(interestQuery.data?.remainingInterest ?? 0)}</div>
        </Card>
      </div>

      <DateRangeFilter value={range} onChange={setRange} />

      <h3 className="mb-2 mt-4 text-sm font-semibold">{t('installments.expectedCashFlow')}</h3>
      <DataTable
        columns={cashFlowColumns}
        data={cashFlowQuery.data ?? []}
        keyField={(r) => r.period}
        isLoading={cashFlowQuery.isLoading}
        searchable={false}
      />
    </div>
  );
}
