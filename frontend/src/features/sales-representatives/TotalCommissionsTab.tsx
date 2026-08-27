import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { Card } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';

interface CommissionPayout {
  id: string;
  salesRepresentativeId: string | null;
  repName: string;
  beneficiaryType: 'MANAGER' | 'REP';
  amount: number;
}

interface CommissionTotalRow {
  salesRepresentativeId: string;
  repName: string;
  beneficiaryType: 'MANAGER' | 'REP';
  paidAmount: number;
  payoutCount: number;
}

function money(n: number): string {
  return formatAmount(n);
}

// Reads exclusively from the actually-paid commission-payout ledger (CashMovement rows with
// sourceType = COMMISSION_PAYOUT, created only once a منندوب/مدير فرع's "صرف العمولة" is executed
// and confirmed from their own dashboard) — never from any live-computed "earned" commission
// figure. This is deliberate: an unpaid/earned amount must never appear here or be counted toward
// the total, matching the same COMMISSION_PAYOUT-only filter already used by the Expenses screen's
// "العمولات المصروفة" line (sumExpensesBySourceType in cash-movements.service.ts).
export function TotalCommissionsTab({ year, month }: { year: number; month: number }) {
  const { t } = useTranslation();

  const { dateFrom, dateTo } = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
      dateTo: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [year, month]);

  const payoutsQuery = useQuery({
    queryKey: ['commission-payouts-total', dateFrom, dateTo],
    queryFn: () => unwrap<CommissionPayout[]>(apiClient.get('/treasury/commission-payouts', { params: { dateFrom, dateTo } })),
  });

  const rows = useMemo(() => {
    const byRep = new Map<string, CommissionTotalRow>();
    for (const p of payoutsQuery.data ?? []) {
      if (!p.salesRepresentativeId) continue;
      const existing = byRep.get(p.salesRepresentativeId);
      if (existing) {
        existing.paidAmount += Number(p.amount);
        existing.payoutCount += 1;
      } else {
        byRep.set(p.salesRepresentativeId, {
          salesRepresentativeId: p.salesRepresentativeId,
          repName: p.repName,
          beneficiaryType: p.beneficiaryType,
          paidAmount: Number(p.amount),
          payoutCount: 1,
        });
      }
    }
    return Array.from(byRep.values()).sort((a, b) => b.paidAmount - a.paidAmount);
  }, [payoutsQuery.data]);

  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + r.paidAmount, 0), [rows]);

  const columns: Column<CommissionTotalRow>[] = [
    { header: t('salesRepresentativesReports.totalCommissionsName'), accessor: (r) => r.repName },
    {
      header: t('salesRepresentativesReports.totalCommissionsType'),
      accessor: (r) =>
        t(
          r.beneficiaryType === 'MANAGER'
            ? 'salesRepresentativesReports.totalCommissionsTypeManager'
            : 'salesRepresentativesReports.totalCommissionsTypeRep',
        ),
    },
    { header: t('salesRepresentativesReports.totalCommissionsPayoutCount'), accessor: (r) => r.payoutCount, align: 'center' },
    { header: t('salesRepresentativesReports.totalCommissionsPaidAmount'), accessor: (r) => money(r.paidAmount), align: 'right' },
  ];

  return (
    <div>
      <div className="mb-4">
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsGrandTotal')}</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{money(grandTotal)}</div>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyField={(r) => r.salesRepresentativeId}
        isLoading={payoutsQuery.isLoading}
        searchable={false}
      />

      <p className="mt-3 text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsNote')}</p>
    </div>
  );
}
