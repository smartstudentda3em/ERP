import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';

interface SupplierOption {
  id: string;
  companyName: string;
}

interface AcBonus {
  id: string;
  bonusDate: string;
  amount: number;
  supplierId: string;
}

interface SupplierBonusSummary {
  supplierId: string;
  companyName: string;
  entryCount: number;
  totalBonus: number;
}

function money(n: number): string {
  return formatAmount(n);
}

/**
 * Air Conditioning only — "إجمالي البونص" tab under the top-level الموردون section (see
 * SuppliersPage.tsx), a company-wide roll-up of every supplier's own "البونص" tab on their detail
 * page (AcSupplierDetailPage.tsx — that's still the only place a bonus is actually recorded or
 * deleted). Reads the exact same ac_supplier_bonuses ledger/endpoint that tab uses, just unscoped
 * to one supplierId, grouped down to one row per supplier so the totals can be reviewed in one
 * place instead of opening every supplier individually — the same "centralize per-supplier X into
 * one company-wide tab" pattern SupplierTaxesTab.tsx already established for "ضريبة المبيعات".
 * Only suppliers with at least one recorded bonus are listed (a table of mostly-zero rows for every
 * supplier that never received one wouldn't help "مراجعة وإدارة" as intended); clicking a row goes
 * to that supplier's own detail page for the actual add/delete actions.
 */
export function SupplierBonusesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.user?.companyId);

  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<SupplierOption[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: !!companyId,
  });
  const supplierNameById = useMemo(
    () => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.companyName])),
    [suppliersQuery.data],
  );

  // No supplierId param — AcSupplierBonusesController treats it as optional, returning every
  // bonus row for the company across every supplier (see AcSupplierBonusesService.findAll).
  const bonusesQuery = useQuery({
    queryKey: ['ac-supplier-bonuses', companyId],
    queryFn: () => unwrap<AcBonus[]>(apiClient.get('/ac-supplier-bonuses', { params: { companyId } })),
    enabled: !!companyId,
  });

  const rows: SupplierBonusSummary[] = useMemo(() => {
    const filtered = (bonusesQuery.data ?? []).filter((b) => inDateRange(b.bonusDate, dateRange));
    const bySupplier = new Map<string, { entryCount: number; totalBonus: number }>();
    for (const b of filtered) {
      const entry = bySupplier.get(b.supplierId) ?? { entryCount: 0, totalBonus: 0 };
      entry.entryCount += 1;
      entry.totalBonus += Number(b.amount);
      bySupplier.set(b.supplierId, entry);
    }
    return Array.from(bySupplier.entries())
      .map(([supplierId, v]) => ({
        supplierId,
        companyName: supplierNameById.get(supplierId) ?? '—',
        ...v,
      }))
      .sort((a, b) => b.totalBonus - a.totalBonus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonusesQuery.data, dateRange, supplierNameById]);

  const grandTotal = rows.reduce((sum, r) => sum + r.totalBonus, 0);

  const columns: Column<SupplierBonusSummary>[] = [
    { header: t('common.name'), accessor: (r) => r.companyName },
    { header: t('suppliers.bonusEntryCount'), accessor: (r) => formatAmount(r.entryCount), align: 'right' },
    { header: t('suppliers.totalBonusColumn'), accessor: (r) => money(r.totalBonus), align: 'right' },
    {
      header: t('common.details'),
      accessor: (r) => (
        <Button variant="secondary" onClick={() => navigate(`/suppliers/${r.supplierId}/ac-detail`)}>
          {t('common.viewDetails')}
        </Button>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="whitespace-nowrap rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
          {t('suppliers.totalBonusForPeriod')}: <span className="font-semibold">{money(grandTotal)}</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyField={(r) => r.supplierId}
        isLoading={bonusesQuery.isLoading || suppliersQuery.isLoading}
      />
    </div>
  );
}
