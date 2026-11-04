import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useActiveCompany } from '../../lib/use-active-company';
import { Card } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';

interface CommissionPayout {
  id: string;
  salesRepresentativeId: string | null;
  repName: string;
  beneficiaryType: 'MANAGER' | 'REP';
  amount: number;
}

interface EarnedCommission {
  representativeId: string;
  representativeName: string | null;
  beneficiaryType: 'MANAGER' | 'REP';
  commissionAmount: number;
}

interface CommissionTotalRow {
  salesRepresentativeId: string;
  repName: string;
  beneficiaryType: 'MANAGER' | 'REP';
  earnedAmount: number;
  paidAmount: number;
  payoutCount: number;
}

function money(n: number): string {
  return formatAmount(n);
}

// Paid commissions come exclusively from the actually-paid commission-payout ledger (CashMovement
// rows with sourceType = COMMISSION_PAYOUT, created only once a مندوب/مدير فرع's "صرف العمولة" is
// executed and confirmed from their own dashboard). The Printing Press additionally shows what each
// person has EARNED in the period (the same figure as their dashboard / the commissions report) next
// to it, so a commission that's due but not yet paid out is visible here as "remaining" — it is never
// counted as paid, matching the Expenses screen's "العمولات المصروفة" line, which stays payout-only.
export function TotalCommissionsTab({ year, month }: { year: number; month: number }) {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();

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

  const earnedQuery = useQuery({
    queryKey: ['earned-commissions-total', dateFrom, dateTo],
    queryFn: () =>
      unwrap<EarnedCommission[]>(apiClient.get('/sales-representatives/reports/earned-commissions', { params: { dateFrom, dateTo } })),
    enabled: isPrintingPress,
  });

  const rows = useMemo(() => {
    const byRep = new Map<string, CommissionTotalRow>();
    for (const e of isPrintingPress ? (earnedQuery.data ?? []) : []) {
      byRep.set(e.representativeId, {
        salesRepresentativeId: e.representativeId,
        repName: e.representativeName ?? '—',
        beneficiaryType: e.beneficiaryType,
        earnedAmount: Number(e.commissionAmount),
        paidAmount: 0,
        payoutCount: 0,
      });
    }
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
          earnedAmount: 0,
          paidAmount: Number(p.amount),
          payoutCount: 1,
        });
      }
    }
    return Array.from(byRep.values())
      .filter((r) => r.earnedAmount > 0 || r.paidAmount > 0)
      .sort((a, b) => b.earnedAmount + b.paidAmount - (a.earnedAmount + a.paidAmount));
  }, [payoutsQuery.data, earnedQuery.data, isPrintingPress]);

  const paidTotal = useMemo(() => rows.reduce((sum, r) => sum + r.paidAmount, 0), [rows]);
  const earnedTotal = useMemo(() => rows.reduce((sum, r) => sum + r.earnedAmount, 0), [rows]);

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
    ...(isPrintingPress
      ? ([
          { header: t('salesRepresentativesReports.totalCommissionsEarned'), accessor: (r) => money(r.earnedAmount), align: 'right' },
        ] as Column<CommissionTotalRow>[])
      : []),
    { header: t('salesRepresentativesReports.totalCommissionsPayoutCount'), accessor: (r) => r.payoutCount, align: 'center' },
    { header: t('salesRepresentativesReports.totalCommissionsPaidAmount'), accessor: (r) => money(r.paidAmount), align: 'right' },
    ...(isPrintingPress
      ? ([
          {
            header: t('salesRepresentativesReports.totalCommissionsRemaining'),
            accessor: (r) => <span className="font-semibold">{money(Math.max(0, r.earnedAmount - r.paidAmount))}</span>,
            align: 'right',
          },
        ] as Column<CommissionTotalRow>[])
      : []),
  ];

  return (
    <div>
      <div className={`mb-4 grid grid-cols-1 gap-4 ${isPrintingPress ? 'sm:grid-cols-3' : ''}`}>
        {isPrintingPress && (
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsEarnedGrandTotal')}</div>
            <div className="mt-1 text-2xl font-semibold">{money(earnedTotal)}</div>
          </Card>
        )}
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsGrandTotal')}</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{money(paidTotal)}</div>
        </Card>
        {isPrintingPress && (
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsRemainingGrandTotal')}</div>
            <div className="mt-1 text-2xl font-semibold text-orange-600">{money(Math.max(0, earnedTotal - paidTotal))}</div>
          </Card>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyField={(r) => r.salesRepresentativeId}
        isLoading={payoutsQuery.isLoading || (isPrintingPress && earnedQuery.isLoading)}
        searchable={false}
      />

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {t(isPrintingPress ? 'salesRepresentativesReports.totalCommissionsNotePress' : 'salesRepresentativesReports.totalCommissionsNote')}
      </p>
    </div>
  );
}
