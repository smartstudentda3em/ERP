import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';

interface Customer {
  id: string;
  name: string;
  mobile?: string;
  balanceDue: number;
  salesRepresentativeName?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

// Air Conditioning only — same sentinel convention as SalesInvoicesPage/WarehousesPage's own
// branch filters, needed because Select auto-picks the sole option when exactly one real branch
// exists (AC currently has just one) — an empty '' value would collapse into that option instead
// of meaning "all branches".
const ALL_BRANCHES = 'all';

function money(n: number): string {
  return formatAmount(n);
}

export function OutstandingBalancesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isAirConditioning } = useActiveCompany();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Air Conditioning only — options for the branch filter below.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isAirConditioning && !!companyId,
  });

  const debtors = useMemo(
    () => (customersQuery.data ?? []).filter((c) => Number(c.balanceDue ?? 0) > 0.005),
    [customersQuery.data],
  );

  const totalOutstanding = useMemo(() => debtors.reduce((sum, c) => sum + Number(c.balanceDue ?? 0), 0), [debtors]);

  // Multi-keyword, cross-column, order-independent — see DataTable.tsx's own search for the same
  // pattern. The branch filter (Air Conditioning only) narrows independently alongside it.
  const filteredDebtors = useMemo(() => {
    const byBranch =
      isAirConditioning && branchFilter !== ALL_BRANCHES
        ? debtors.filter((c) => c.branchId === branchFilter)
        : debtors;
    const keywords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return byBranch;
    return byBranch.filter((c) => {
      const haystack = [c.name, c.mobile, c.salesRepresentativeName].filter(Boolean).join(' ').toLowerCase();
      return keywords.every((kw) => haystack.includes(kw));
    });
  }, [debtors, search, isAirConditioning, branchFilter]);

  const columns: Column<Customer>[] = [
    { header: t('common.name'), accessor: (r) => r.name },
    { header: t('fields.mobile'), accessor: (r) => r.mobile ?? '—' },
    { header: t('fields.invoiceOwner'), accessor: (r) => r.salesRepresentativeName ?? '—' },
    {
      header: t('actions.balanceDue'),
      accessor: (r) => money(r.balanceDue),
      align: 'right',
    },
    {
      header: t('common.details'),
      accessor: (r) => (
        <button
          type="button"
          className="text-primary-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/outstanding-balances/${r.id}`);
          }}
        >
          {t('common.viewDetails')}
        </button>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <PageHeader title={t('nav.outstandingBalances')} />

      <Card className="mb-4">
        <div className="text-xs text-[var(--text-muted)]">{t('customers.totalOutstandingBalance')}</div>
        <div className="mt-1 text-2xl font-semibold text-red-600">{money(totalOutstanding)}</div>
      </Card>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="max-w-sm flex-1">
          <Input
            type="search"
            placeholder={t('customers.searchByNameOrMobile') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAirConditioning && (
          <FormField label={t('fields.branch')}>
            <Select className="w-48" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value={ALL_BRANCHES}>{t('accounting.allBranches')}</option>
              {(branchesQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filteredDebtors}
        keyField={(r) => r.id}
        isLoading={customersQuery.isLoading}
        searchable={false}
      />
    </div>
  );
}
