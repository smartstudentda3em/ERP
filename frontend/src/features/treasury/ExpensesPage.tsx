import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

interface ExpenseCategory {
  id: string;
  nameEn: string;
  isActive: boolean;
}

interface ExpenseTransaction {
  id: string;
  date: string;
  documentNumber: string;
  category: string | null;
  amount: number;
  account: 'CASH' | 'BANK';
  branchId?: string | null;
  description: string | null;
  createdByName: string;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface RecurringExpense {
  id: string;
  category: string;
  amount: number;
  account: 'CASH' | 'BANK';
  description: string | null;
  isActive: boolean;
}

interface CogsTransaction {
  id: string;
  date: string;
  documentNumber: string;
  customerName: string;
  cogs: number;
}

/** Printing Press only — "أرباح المدراء والشركاء" tab, combining branch-manager commission payouts
 * and partner dividend payouts into one list (see backend's getManagerPartnerProfitTransactions). */
interface ProfitTransaction {
  id: string;
  date: string;
  documentNumber: string;
  subType: 'MANAGER' | 'PARTNER';
  name: string;
  amount: number;
  account: 'CASH' | 'BANK';
  branchId?: string | null;
  description: string | null;
}

/** Printing Press only — one row per purchase receipt, backing the "مشتريات المواد الخام" tab
 * instead of COGS. Reuses the same GET /inventory/purchase-receipts resource ProductsPage.tsx's
 * raw-materials report already fetches for this tenant. */
interface PurchaseReceipt {
  id: string;
  documentNumber: string;
  receiptDate: string;
  totalAmount: number;
  branchId?: string | null;
  product: { nameEn: string } | null;
  supplier: { companyName: string } | null;
}

type Tab = 'operating' | 'cogs' | 'salaries' | 'profits';

function money(n: number): string {
  return formatAmount(n);
}

export function ExpensesPage() {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [tab, setTab] = useState<Tab>('operating');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  // Printing Press only — narrows all three tabs (operating/raw materials/salaries) and every
  // total shown on this screen to one branch. Empty string means "الكل" (every branch combined).
  const [branchFilter, setBranchFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    movementDate: localToday(),
    category: '',
    amount: '0',
    account: 'CASH',
    branchId: '',
    description: '',
    isRecurring: false,
  });
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recurringForm, setRecurringForm] = useState({ category: '', amount: '0', account: 'CASH', description: '' });
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    movementDate: localToday(),
    category: '',
    amount: '0',
    account: 'CASH',
    branchId: '',
    description: '',
  });

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => unwrap<ExpenseCategory[]>(apiClient.get('/settings/expense-categories')),
  });
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.isActive);

  // Printing Press only — lets a manually-recorded expense be attributed to one branch, the same
  // way the Purchasing form's Branch field works.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  const expensesQuery = useQuery({
    queryKey: ['treasury-expenses', companyId, dateRange.from, dateRange.to],
    queryFn: () =>
      unwrap<ExpenseTransaction[]>(
        apiClient.get('/treasury/expenses', {
          params: { companyId, dateFrom: dateRange.from || undefined, dateTo: dateRange.to || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const recurringExpensesQuery = useQuery({
    queryKey: ['recurring-expenses', companyId],
    queryFn: () => unwrap<RecurringExpense[]>(apiClient.get('/treasury/recurring-expenses', { params: { companyId } })),
    enabled: !!companyId,
  });

  const salariesQuery = useQuery({
    queryKey: ['treasury-salaries', companyId, dateRange.from, dateRange.to],
    queryFn: () =>
      unwrap<ExpenseTransaction[]>(
        apiClient.get('/treasury/salaries', {
          params: { companyId, dateFrom: dateRange.from || undefined, dateTo: dateRange.to || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const cogsQuery = useQuery({
    queryKey: ['cogs-transactions', companyId, dateRange.from, dateRange.to],
    queryFn: () =>
      unwrap<CogsTransaction[]>(
        apiClient.get('/treasury/reports/cogs-transactions', {
          params: { companyId, dateFrom: dateRange.from || undefined, dateTo: dateRange.to || undefined },
        }),
      ),
    enabled: !!companyId && !isPrintingPress,
  });

  // Printing Press only — replaces the COGS tab's data source entirely (see rawMaterialPurchaseColumns
  // below). Fetches every receipt once and filters by the date range client-side, same convention
  // ProductsPage.tsx's raw-materials report already uses for this exact endpoint.
  const rawMaterialPurchasesQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: !!companyId && isPrintingPress,
  });
  // Printing Press only — "أرباح المدراء والشركاء" tab's combined commission-payout + dividend log.
  const profitsQuery = useQuery({
    queryKey: ['treasury-manager-partner-profits', companyId, dateRange.from, dateRange.to],
    queryFn: () =>
      unwrap<{ rows: ProfitTransaction[]; total: number }>(
        apiClient.get('/treasury/manager-partner-profits', {
          params: { companyId, dateFrom: dateRange.from || undefined, dateTo: dateRange.to || undefined },
        }),
      ),
    enabled: !!companyId && isPrintingPress,
  });

  // Applies the Branch filter on top of the server-side date filtering already done for
  // expenses/salaries/profits and the client-side date filtering already done for raw material
  // purchases — one shared predicate so all four tabs (and every total derived from them) narrow
  // consistently.
  const matchesBranch = (branchId?: string | null) => !branchFilter || branchId === branchFilter;

  const filteredExpenses = useMemo(
    () => (expensesQuery.data ?? []).filter((e) => matchesBranch(e.branchId)),
    [expensesQuery.data, branchFilter],
  );
  const filteredSalaries = useMemo(
    () => (salariesQuery.data ?? []).filter((s) => matchesBranch(s.branchId)),
    [salariesQuery.data, branchFilter],
  );
  const filteredProfits = useMemo(
    () => (profitsQuery.data?.rows ?? []).filter((p) => matchesBranch(p.branchId)),
    [profitsQuery.data, branchFilter],
  );
  // Per-beneficiary breakdown for the "أرباح المدراء والشركاء" tab's summary card — grouped by
  // subType+name (not name alone) so a manager and a partner who happen to share a name are never
  // collapsed into one total. Recomputes automatically whenever filteredProfits changes, i.e.
  // whenever the date range or branch filter narrows the same rows the table below shows, so the
  // two can never disagree.
  const profitsByPerson = useMemo(() => {
    const totals = new Map<string, { name: string; subType: 'MANAGER' | 'PARTNER'; amount: number }>();
    for (const p of filteredProfits) {
      const key = `${p.subType}:${p.name}`;
      const existing = totals.get(key);
      if (existing) existing.amount += p.amount;
      else totals.set(key, { name: p.name, subType: p.subType, amount: p.amount });
    }
    return [...totals.values()].sort((a, b) => b.amount - a.amount);
  }, [filteredProfits]);
  const dateFilteredRawMaterialPurchases = useMemo(
    () =>
      (rawMaterialPurchasesQuery.data ?? []).filter(
        (r) => inDateRange(r.receiptDate, dateRange) && matchesBranch(r.branchId),
      ),
    [rawMaterialPurchasesQuery.data, dateRange, branchFilter],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/treasury/cash-movements', {
        companyId,
        movementDate: form.movementDate,
        type: 'EXPENSE',
        account: form.account,
        amount: Number(form.amount),
        category: form.category,
        branchId: isPrintingPress ? form.branchId || undefined : undefined,
        description: form.description || undefined,
      });
      // A recurring expense is the same entry composed with a template: the immediate CashMovement
      // above records today's occurrence, this records the pattern the monthly cron re-generates
      // from on the 1st going forward.
      if (form.isRecurring) {
        await apiClient.post('/treasury/recurring-expenses', {
          companyId,
          category: form.category,
          amount: Number(form.amount),
          account: form.account,
          description: form.description || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-expenses'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      setModalOpen(false);
      setForm({ movementDate: localToday(), category: '', amount: '0', account: 'CASH', branchId: '', description: '', isRecurring: false });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const saveRecurringMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/treasury/recurring-expenses/${editingRecurringId}`, {
        category: recurringForm.category,
        amount: Number(recurringForm.amount),
        account: recurringForm.account,
        description: recurringForm.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] });
      setEditingRecurringId(null);
    },
  });

  const cancelRecurringMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/treasury/recurring-expenses/${id}`, { isActive: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] }),
  });

  function openEditRecurring(r: RecurringExpense) {
    setEditingRecurringId(r.id);
    setRecurringForm({
      category: r.category,
      amount: String(r.amount),
      account: r.account,
      description: r.description ?? '',
    });
  }

  // Balances/totals everywhere (this screen, the Treasury ledger, Dashboard, Reports) are all
  // computed live from the underlying cash_movements rows, so editing or deleting one here is
  // reflected everywhere else automatically once these queries are invalidated — no separate
  // reversal step is needed.
  const invalidateExpenseRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['treasury-expenses'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['expense-report'] });
    queryClient.invalidateQueries({ queryKey: ['profit-report'] });
  };

  const updateExpenseMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/treasury/expenses/${editingExpenseId}`, {
        movementDate: expenseForm.movementDate,
        account: expenseForm.account,
        amount: Number(expenseForm.amount),
        category: expenseForm.category,
        branchId: isPrintingPress ? expenseForm.branchId || undefined : undefined,
        description: expenseForm.description || undefined,
      }, { params: { companyId } }),
    onSuccess: () => {
      invalidateExpenseRelatedQueries();
      setEditingExpenseId(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/treasury/expenses/${id}`, { params: { companyId } }),
    onSuccess: () => invalidateExpenseRelatedQueries(),
  });

  function openEditExpense(r: ExpenseTransaction) {
    setEditingExpenseId(r.id);
    setExpenseForm({
      movementDate: r.date,
      category: r.category ?? '',
      amount: String(r.amount),
      account: r.account,
      branchId: r.branchId ?? '',
      description: r.description ?? '',
    });
  }

  async function handleDeleteExpense(r: ExpenseTransaction) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: r.category ?? r.documentNumber }) });
    if (ok) deleteExpenseMutation.mutate(r.id);
  }

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCogs = (cogsQuery.data ?? []).reduce((sum, r) => sum + r.cogs, 0);
  const totalRawMaterialPurchases = dateFilteredRawMaterialPurchases.reduce(
    (sum, r) => sum + Number(r.totalAmount ?? 0),
    0,
  );
  const totalSalaries = filteredSalaries.reduce((sum, s) => sum + s.amount, 0);
  const totalProfitsPaidOut = filteredProfits.reduce((sum, p) => sum + p.amount, 0);
  // Printing Press's second tab totals raw material purchases instead of COGS — see tabs/columns
  // below — so the grand total follows suit for this tenant only.
  const secondTabTotal = isPrintingPress ? totalRawMaterialPurchases : totalCogs;
  // Grand total across all expense types shown on this screen: operating + raw materials/COGS +
  // salaries + (Printing Press only) manager/partner profit payouts — the fourth arm the request
  // adds to this screen's comprehensive expense figure.
  const grandTotal = totalExpenses + secondTabTotal + totalSalaries + (isPrintingPress ? totalProfitsPaidOut : 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'operating', label: t('accounting.operatingExpenses') },
    {
      key: 'cogs',
      label: isPrintingPress ? t('accounting.rawMaterialPurchases') : t('accounting.costOfGoodsSold'),
    },
    { key: 'salaries', label: t('accounting.salaries') },
    ...(isPrintingPress ? [{ key: 'profits' as Tab, label: t('accounting.managerPartnerProfits') }] : []),
  ];

  const cogsColumns: Column<CogsTransaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.customer'), accessor: (r) => r.customerName },
    { header: t('treasury.amount'), accessor: (r) => money(r.cogs), align: 'right' },
  ];

  const rawMaterialPurchaseColumns: Column<PurchaseReceipt>[] = [
    { header: t('common.date'), accessor: (r) => r.receiptDate },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.product'), accessor: (r) => r.product?.nameEn ?? '—' },
    { header: t('fields.supplier'), accessor: (r) => r.supplier?.companyName ?? '—' },
    { header: t('treasury.amount'), accessor: (r) => money(r.totalAmount), align: 'right' },
  ];

  // Read-only — payroll entries are managed from the الرواتب screen itself (create/approve a
  // PayrollRun), not editable/deletable here; this tab is just that spend surfaced alongside the
  // other two expense types for a combined view.
  const salaryColumns: Column<ExpenseTransaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('accounting.category'), accessor: (r) => r.category ?? '—' },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
  ];

  // Read-only — managed from صرف الأرباح (branch managers) / الشركاء (partners), same convention
  // as the الرواتب tab's payroll rows above.
  const profitColumns: Column<ProfitTransaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('accounting.profitSubType'), accessor: (r) => t(`accounting.profitSubTypes.${r.subType}`) },
    { header: t('common.name'), accessor: (r) => r.name },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
  ];

  const recurringColumns: Column<RecurringExpense>[] = [
    { header: t('accounting.category'), accessor: (r) => r.category },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    {
      header: t('common.status'),
      accessor: (r) => (r.isActive ? t('treasury.recurringStatusActive') : t('treasury.recurringStatusCancelled')),
    },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={() => openEditRecurring(r)}>
            {t('treasury.editRecurrence')}
          </button>
          {r.isActive && (
            <button
              type="button"
              className="text-red-600 hover:underline"
              disabled={cancelRecurringMutation.isPending}
              onClick={() => cancelRecurringMutation.mutate(r.id)}
            >
              {t('treasury.cancelRecurrence')}
            </button>
          )}
        </div>
      ),
      align: 'center',
    },
  ];

  const columns: Column<ExpenseTransaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('accounting.category'), accessor: (r) => r.category ?? '—' },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={() => openEditExpense(r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteExpenseMutation.isPending}
            onClick={() => handleDeleteExpense(r)}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t('nav.expenses')}</h1>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            {isPrintingPress && (
              <FormField label={t('treasury.filterByBranch')}>
                <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  <option value="">{t('accounting.allBranches')}</option>
                  {(branchesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameAr || b.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('treasury.expensesGrandTotal')}</div>
          <div className="mt-1 text-xl font-semibold">{money(grandTotal)}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              className={`rounded-lg px-3 py-1.5 ${tab === tb.key ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>
        {tab === 'operating' && <Button onClick={() => setModalOpen(true)}>{t('treasury.addExpense')}</Button>}
      </div>

      {tab === 'operating' && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs text-[var(--text-muted)]">{t('treasury.operatingExpensesTotal')}</div>
              <div className="mt-1 text-2xl font-semibold">{money(totalExpenses)}</div>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredExpenses}
            keyField={(r) => r.id}
            isLoading={expensesQuery.isLoading}
          />
        </>
      )}

      {tab === 'cogs' && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs text-[var(--text-muted)]">
                {isPrintingPress ? t('accounting.totalRawMaterialPurchases') : t('accounting.costOfGoodsSold')}
              </div>
              <div className="mt-1 text-2xl font-semibold">{money(secondTabTotal)}</div>
            </div>
          </div>

          {isPrintingPress ? (
            <DataTable
              columns={rawMaterialPurchaseColumns}
              data={dateFilteredRawMaterialPurchases}
              keyField={(r) => r.id}
              isLoading={rawMaterialPurchasesQuery.isLoading}
            />
          ) : (
            <DataTable
              columns={cogsColumns}
              data={cogsQuery.data ?? []}
              keyField={(r) => r.id}
              isLoading={cogsQuery.isLoading}
            />
          )}
        </>
      )}

      {tab === 'salaries' && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs text-[var(--text-muted)]">{t('accounting.totalSalaries')}</div>
              <div className="mt-1 text-2xl font-semibold">{money(totalSalaries)}</div>
            </div>
          </div>

          <DataTable
            columns={salaryColumns}
            data={filteredSalaries}
            keyField={(r) => r.id}
            isLoading={salariesQuery.isLoading}
          />
        </>
      )}

      {tab === 'profits' && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="text-xs text-[var(--text-muted)]">{t('accounting.totalManagerPartnerProfits')}</div>
              <div className="mt-1 text-2xl font-semibold">{money(totalProfitsPaidOut)}</div>
            </div>

            {/* Per-beneficiary breakdown — always derived from profitsByPerson, itself derived from
                filteredProfits, so this list and the detail table below it can never disagree, and
                it recomputes automatically whenever the date range or branch filter changes. */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 text-xs text-[var(--text-muted)]">{t('accounting.profitsByPersonTitle')}</div>
              {profitsByPerson.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">{t('common.noData')}</div>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {profitsByPerson.map((p) => (
                    <li key={`${p.subType}:${p.name}`} className="flex items-center justify-between gap-2">
                      <span>{t('accounting.totalProfitForPerson', { name: p.name })}</span>
                      <span className="font-semibold">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DataTable
            columns={profitColumns}
            data={filteredProfits}
            keyField={(r) => r.id}
            isLoading={profitsQuery.isLoading}
          />
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('treasury.addExpense')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={form.movementDate}
              onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('accounting.category')}>
            <Select
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option value="" disabled>
                {t('treasury.selectExpenseCategory')}
              </option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.nameEn}>
                  {c.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.paymentAccount')}>
            <Select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              {isPrintingPress && <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>}
            </Select>
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select required value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                <option value="">{t('actions.selectBranch')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormField>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
            />
            {t('treasury.recurringMonthly')}
          </label>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || activeCategories.length === 0 || (isPrintingPress && !form.branchId)}
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {tab === 'operating' && (
        <div className="mt-8">
          <PageHeader title={t('treasury.recurringExpensesTitle')} />
          <DataTable
            columns={recurringColumns}
            data={recurringExpensesQuery.data ?? []}
            keyField={(r) => r.id}
            isLoading={recurringExpensesQuery.isLoading}
            searchable={false}
          />
        </div>
      )}

      <Modal open={!!editingRecurringId} onClose={() => setEditingRecurringId(null)} title={t('treasury.editRecurrence')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveRecurringMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('accounting.category')}>
              <Select
                required
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
              >
                <option value="" disabled>
                  {t('treasury.selectExpenseCategory')}
                </option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.nameEn}>
                    {c.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={recurringForm.amount}
              onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.paymentAccount')}>
            <Select
              value={recurringForm.account}
              onChange={(e) => setRecurringForm({ ...recurringForm, account: e.target.value })}
            >
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              {isPrintingPress && <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>}
            </Select>
          </FormField>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input
                value={recurringForm.description}
                onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingRecurringId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveRecurringMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingExpenseId} onClose={() => setEditingExpenseId(null)} title={t('common.edit')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateExpenseMutation.mutate();
          }}
        >
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={expenseForm.movementDate}
              onChange={(e) => setExpenseForm({ ...expenseForm, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('accounting.category')}>
            <Select
              required
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            >
              <option value="" disabled>
                {t('treasury.selectExpenseCategory')}
              </option>
              {activeCategories.map((c) => (
                <option key={c.id} value={c.nameEn}>
                  {c.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.paymentAccount')}>
            <Select
              value={expenseForm.account}
              onChange={(e) => setExpenseForm({ ...expenseForm, account: e.target.value })}
            >
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              {isPrintingPress && <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>}
            </Select>
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={expenseForm.branchId}
                onChange={(e) => setExpenseForm({ ...expenseForm, branchId: e.target.value })}
              >
                <option value="">{t('actions.selectBranch')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingExpenseId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                updateExpenseMutation.isPending ||
                activeCategories.length === 0 ||
                (isPrintingPress && !expenseForm.branchId)
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
