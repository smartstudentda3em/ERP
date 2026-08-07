import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

interface SalesRepresentative {
  id: string;
  name: string;
  branchId: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface BranchCommissionRow {
  branchId: string;
  branchName: string | null;
  managerId: string | null;
  managerName: string | null;
  commissionAmount: number;
}

interface CommissionPayout {
  id: string;
  date: string;
  amount: number;
  account: 'CASH' | 'BANK';
  branchId: string | null;
  salesRepresentativeId: string | null;
  createdAt: string;
}

const emptyForm = { branchId: '', amount: '', account: 'CASH' as 'CASH' | 'BANK' };

function money(n: number): string {
  return formatAmount(n);
}

export function CommissionPayoutsTab({ year, month }: { year: number; month: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { dateFrom, dateTo } = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
      dateTo: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [year, month]);

  const repsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
  });
  const reps = repsQuery.data ?? [];

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: !!companyId,
  });
  const branches = branchesQuery.data ?? [];

  const commissionsQuery = useQuery({
    queryKey: ['sales-representatives-branch-commissions', companyId, dateFrom, dateTo],
    queryFn: () =>
      unwrap<BranchCommissionRow[]>(
        apiClient.get('/sales-representatives/reports/branch-commissions', { params: { companyId, dateFrom, dateTo } }),
      ),
    enabled: !!companyId,
  });

  const payoutsQuery = useQuery({
    queryKey: ['commission-payouts', companyId, dateFrom, dateTo],
    queryFn: () => unwrap<CommissionPayout[]>(apiClient.get('/treasury/commission-payouts', { params: { companyId, dateFrom, dateTo } })),
    enabled: !!companyId,
  });

  // One row per branch that actually has a manager assigned — a branch with no manager has
  // nothing to pay out, so it never appears on this tab (unlike the commission report, which
  // deliberately shows every branch).
  const rows = useMemo(() => {
    const payouts = payoutsQuery.data ?? [];
    const paidByManager = new Map<string, number>();
    const lastPayoutByManager = new Map<string, CommissionPayout>();
    for (const p of payouts) {
      if (!p.salesRepresentativeId) continue;
      paidByManager.set(p.salesRepresentativeId, (paidByManager.get(p.salesRepresentativeId) ?? 0) + Number(p.amount));
      const existing = lastPayoutByManager.get(p.salesRepresentativeId);
      if (!existing || p.createdAt > existing.createdAt) lastPayoutByManager.set(p.salesRepresentativeId, p);
    }
    return (commissionsQuery.data ?? [])
      .filter((r) => r.managerId)
      .map((r) => ({
        ...r,
        paidAmount: paidByManager.get(r.managerId!) ?? 0,
        lastPayout: lastPayoutByManager.get(r.managerId!) ?? null,
      }));
  }, [commissionsQuery.data, payoutsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { movementDate: dateTo, amount: Number(form.amount) || 0, account: form.account };
      if (editingId) {
        return apiClient.patch(`/treasury/commission-payouts/${editingId}`, payload);
      }
      const rep = reps.find((r) => r.branchId === form.branchId);
      return apiClient.post('/treasury/commission-payouts', { ...payload, branchId: form.branchId, salesRepresentativeId: rep?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/treasury/commission-payouts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: (typeof rows)[number]) {
    if (!row.lastPayout) return;
    setEditingId(row.lastPayout.id);
    setForm({ branchId: row.branchId, amount: String(row.lastPayout.amount), account: row.lastPayout.account });
    setError(null);
    setModalOpen(true);
  }

  async function handleDelete(row: (typeof rows)[number]) {
    if (!row.lastPayout) return;
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.managerName ?? '' }) });
    if (ok) deleteMutation.mutate(row.lastPayout.id);
  }

  const selectedManager = reps.find((r) => r.branchId === form.branchId);
  const selectedManagerName = selectedManager?.name ?? '';

  const columns: Column<(typeof rows)[number]>[] = [
    { header: t('salesRepresentativesReports.branchManager'), accessor: (r) => r.managerName ?? '—' },
    { header: t('salesRepresentativesReports.branch'), accessor: (r) => r.branchName ?? '—' },
    { header: t('salesRepresentativesReports.totalProfit'), accessor: (r) => money(r.commissionAmount), align: 'right' },
    { header: t('salesRepresentativesReports.paidProfit'), accessor: (r) => money(r.paidAmount), align: 'right' },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!r.lastPayout}
            onClick={() => openEdit(r)}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!r.lastPayout}
            onClick={() => handleDelete(r)}
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
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>{t('salesRepresentativesReports.payoutButton')}</Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyField={(r) => r.branchId}
        isLoading={commissionsQuery.isLoading || payoutsQuery.isLoading}
        searchable={false}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t(editingId ? 'salesRepresentativesReports.editPayoutModalTitle' : 'salesRepresentativesReports.payoutModalTitle')}
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('salesRepresentativesReports.branch')}>
            <Select
              required
              disabled={!!editingId}
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </FormField>

          {form.branchId && (
            <FormField label={t('salesRepresentativesReports.branchManager')}>
              <Input disabled value={selectedManagerName || t('salesRepresentativesReports.noManagerForBranch')} />
            </FormField>
          )}

          <FormField label={t('salesRepresentativesReports.amountToPay')}>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>

          <FormField label={t('treasury.paymentAccount')}>
            <Select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value as 'CASH' | 'BANK' })}>
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
            </Select>
          </FormField>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || (!editingId && !selectedManager)}>
              {t('salesRepresentativesReports.executePayout')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
