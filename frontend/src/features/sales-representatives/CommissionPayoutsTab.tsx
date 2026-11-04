import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { usePressBranch } from '../../lib/use-active-company';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

// One earned commission per beneficiary — each branch's مدير فرع AND every مندوب with commissionable
// assisted sales (backend getEarnedCommissions), so the same "صرف الأرباح" flow pays either.
interface EarnedRow {
  representativeId: string;
  representativeName: string | null;
  beneficiaryType: 'MANAGER' | 'REP';
  branchId: string | null;
  branchName: string | null;
  commissionAmount: number;
}

interface CommissionPayout {
  id: string;
  date: string;
  amount: number;
  account: 'CASH' | 'BANK';
  branchId: string | null;
  salesRepresentativeId: string | null;
  repName?: string | null;
  beneficiaryType?: 'MANAGER' | 'REP';
  createdAt: string;
}

const emptyForm = { repId: '', amount: '', account: 'CASH' as 'CASH' | 'BANK', movementDate: localToday() };

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
  const { hideBranchUi: hidePressBranchUi, singleBranchId } = usePressBranch();

  const { dateFrom, dateTo } = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
      dateTo: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [year, month]);

  const commissionsQuery = useQuery({
    queryKey: ['sales-representatives-earned-commissions', companyId, dateFrom, dateTo],
    queryFn: () =>
      unwrap<EarnedRow[]>(
        apiClient.get('/sales-representatives/reports/earned-commissions', { params: { companyId, dateFrom, dateTo } }),
      ),
    enabled: !!companyId,
  });

  const payoutsQuery = useQuery({
    queryKey: ['commission-payouts', companyId, dateFrom, dateTo],
    queryFn: () => unwrap<CommissionPayout[]>(apiClient.get('/treasury/commission-payouts', { params: { companyId, dateFrom, dateTo } })),
    enabled: !!companyId,
  });

  // One row per beneficiary: every branch manager and every مندوب with commission earned in the
  // period, plus anyone paid in the period who has no earned figure left in it.
  const rows = useMemo(() => {
    const payouts = payoutsQuery.data ?? [];
    const paidByRep = new Map<string, number>();
    const lastPayoutByRep = new Map<string, CommissionPayout>();
    for (const p of payouts) {
      if (!p.salesRepresentativeId) continue;
      paidByRep.set(p.salesRepresentativeId, (paidByRep.get(p.salesRepresentativeId) ?? 0) + Number(p.amount));
      const existing = lastPayoutByRep.get(p.salesRepresentativeId);
      if (!existing || p.createdAt > existing.createdAt) lastPayoutByRep.set(p.salesRepresentativeId, p);
    }
    const base = (commissionsQuery.data ?? []).map((r) => ({
      repId: r.representativeId,
      name: r.representativeName ?? '—',
      type: r.beneficiaryType,
      branchId: r.branchId,
      branchName: r.branchName,
      commissionAmount: r.commissionAmount,
    }));
    for (const p of payouts) {
      if (p.salesRepresentativeId && !base.some((b) => b.repId === p.salesRepresentativeId)) {
        base.push({
          repId: p.salesRepresentativeId,
          name: p.repName ?? '—',
          type: p.beneficiaryType ?? 'REP',
          branchId: p.branchId,
          branchName: null,
          commissionAmount: 0,
        });
      }
    }
    return base.map((r) => ({
      ...r,
      paidAmount: paidByRep.get(r.repId) ?? 0,
      lastPayout: lastPayoutByRep.get(r.repId) ?? null,
    }));
  }, [commissionsQuery.data, payoutsQuery.data]);

  const selectedRow = rows.find((r) => r.repId === form.repId);

  const saveMutation = useMutation({
    mutationFn: () => {
      // The actual date this payout leaves the treasury account — defaults to today, editable
      // like every other treasury form (dividends, contributions, manual expenses). Previously
      // this silently reused `dateTo` (the last day of whichever report month was selected), so a
      // mid-month payout got dated at the end of that month — a future date the "as of today"
      // balance query correctly excludes, making the deduction invisible everywhere until that
      // date arrived even though the ledger row itself was created correctly.
      const payload = { movementDate: form.movementDate, amount: Number(form.amount) || 0, account: form.account };
      if (editingId) {
        return apiClient.patch(`/treasury/commission-payouts/${editingId}`, payload);
      }
      // A مندوب has no branch of his own — the payout is booked against the Press's branch, same as
      // a manager's, so the balance check and the treasury ledger line up.
      return apiClient.post('/treasury/commission-payouts', {
        ...payload,
        salesRepresentativeId: form.repId,
        branchId: selectedRow?.branchId ?? singleBranchId ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['commission-payouts-total'] });
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
      queryClient.invalidateQueries({ queryKey: ['commission-payouts-total'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, movementDate: localToday() });
    setError(null);
    setModalOpen(true);
  }

  function openEdit(row: (typeof rows)[number]) {
    if (!row.lastPayout) return;
    setEditingId(row.lastPayout.id);
    setForm({
      repId: row.repId,
      amount: String(row.lastPayout.amount),
      account: row.lastPayout.account,
      movementDate: row.lastPayout.date,
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleDelete(row: (typeof rows)[number]) {
    if (!row.lastPayout) return;
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.name }) });
    if (ok) deleteMutation.mutate(row.lastPayout.id);
  }

  // Picking a beneficiary pre-fills what is still owed to him this month.
  function pickBeneficiary(repId: string) {
    const row = rows.find((r) => r.repId === repId);
    const remaining = row ? Math.max(row.commissionAmount - row.paidAmount, 0) : 0;
    setForm({ ...form, repId, amount: remaining > 0.005 ? remaining.toFixed(2) : form.amount });
  }

  const columns: Column<(typeof rows)[number]>[] = [
    { header: t('salesRepresentativesReports.commissionBeneficiary'), accessor: (r) => r.name },
    {
      header: t('salesRepresentativesReports.totalCommissionsType'),
      accessor: (r) =>
        t(
          r.type === 'MANAGER'
            ? 'salesRepresentativesReports.totalCommissionsTypeManager'
            : 'salesRepresentativesReports.totalCommissionsTypeRep',
        ),
    },
    ...(hidePressBranchUi
      ? []
      : [{ header: t('salesRepresentativesReports.branch'), accessor: (r: (typeof rows)[number]) => r.branchName ?? '—' } as Column<(typeof rows)[number]>]),
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
        keyField={(r) => r.repId}
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
          <FormField label={t('salesRepresentativesReports.commissionBeneficiary')}>
            <Select required disabled={!!editingId} value={form.repId} onChange={(e) => pickBeneficiary(e.target.value)}>
              <option value="" disabled>
                {t('common.select')}
              </option>
              {rows.map((r) => (
                <option key={r.repId} value={r.repId}>
                  {r.name} — {t(r.type === 'MANAGER' ? 'salesRepresentativesReports.totalCommissionsTypeManager' : 'salesRepresentativesReports.totalCommissionsTypeRep')}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={form.movementDate}
              onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
            />
          </FormField>

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
            <Button type="submit" disabled={saveMutation.isPending || (!editingId && !selectedRow)}>
              {t('salesRepresentativesReports.executePayout')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
