import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';

interface Customer {
  id: string;
  name: string;
  mobile?: string;
  balanceDue: number;
  salesRepresentativeName?: string | null;
}

function money(n: number): string {
  return formatAmount(n);
}

export function OutstandingBalancesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [search, setSearch] = useState('');

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: !!companyId,
  });

  const debtors = useMemo(
    () => (customersQuery.data ?? []).filter((c) => Number(c.balanceDue ?? 0) > 0.005),
    [customersQuery.data],
  );

  const totalOutstanding = useMemo(() => debtors.reduce((sum, c) => sum + Number(c.balanceDue ?? 0), 0), [debtors]);

  // Multi-keyword, cross-column, order-independent — see DataTable.tsx's own search for the same
  // pattern.
  const filteredDebtors = useMemo(() => {
    const keywords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return debtors;
    return debtors.filter((c) => {
      const haystack = [c.name, c.mobile, c.salesRepresentativeName].filter(Boolean).join(' ').toLowerCase();
      return keywords.every((kw) => haystack.includes(kw));
    });
  }, [debtors, search]);

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

      <div className="mb-3 max-w-sm">
        <Input
          type="search"
          placeholder={t('customers.searchByNameOrMobile') ?? ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
