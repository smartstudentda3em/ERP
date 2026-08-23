import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Input, FormField, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { monthNameOnly } from '../../lib/date-utils';

interface PayrollRunLine {
  id: string;
  employeeId: string;
  branchId: string;
  baseSalary: number;
  absenceDays: number;
  lateHours: number;
  otherDeductions: number;
  absenceDeduction: number;
  lateDeduction: number;
  netSalary: number;
  employee: { name: string; jobTitle: string } | null;
  branch: { nameEn: string; nameAr?: string | null } | null;
}

interface PayrollRunDetail {
  id: string;
  documentNumber: string;
  year: number;
  month: number;
  status: 'CONFIRMED' | 'APPROVED';
  notes?: string | null;
  paymentAccount?: 'CASH' | 'BANK' | null;
  createdByName?: string;
  approvedByName?: string;
  approvedAt?: string | null;
  lines: PayrollRunLine[];
}

const PAYROLL_STATUS_COLOR: Record<string, 'gray' | 'green' | 'yellow'> = {
  CONFIRMED: 'yellow',
  APPROVED: 'green',
};

export function PayrollRunDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canApprove = useAuthStore((s) => s.hasPermission('hr.payroll.approve'));
  const canEdit = useAuthStore((s) => s.hasPermission('hr.payroll.edit'));
  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<Record<string, { absenceDays: string; lateHours: string; otherDeductions: string }>>({});
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveAccount, setApproveAccount] = useState<'CASH' | 'BANK'>('CASH');

  const detailQuery = useQuery({
    queryKey: ['hr-payroll-run', id],
    queryFn: () => unwrap<PayrollRunDetail>(apiClient.get(`/hr/payroll-runs/${id}`)),
    enabled: !!id,
  });

  // The approval-confirmation modal's chosen account always wins over whatever was picked at
  // creation time (see PayrollService.approve()) — liquidity may have changed since the run was
  // drafted, so this is the moment that actually decides where the money comes from.
  const approveMutation = useMutation({
    mutationFn: () => apiClient.post(`/hr/payroll-runs/${id}/approve`, { paymentAccount: approveAccount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-run', id] });
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      setApproveModalOpen(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function openApproveModal() {
    if (!detailQuery.data) return;
    setApproveAccount(detailQuery.data.paymentAccount ?? 'CASH');
    setApproveModalOpen(true);
  }

  // Works the same whether the run is still CONFIRMED or already APPROVED — if it's already
  // APPROVED, the backend reverses the CashMovement rows it posted at approval and re-posts fresh
  // per-branch totals from the corrected figures in the same request (see PayrollService.update()),
  // so every downstream total (this page, the Payroll list, Reports, Expenses) reflects the edit
  // immediately without a separate "unapprove" step.
  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/hr/payroll-runs/${id}`, {
        lines: Object.entries(editLines).map(([employeeId, v]) => ({
          employeeId,
          absenceDays: Number(v.absenceDays) || 0,
          lateHours: Number(v.lateHours) || 0,
          otherDeductions: Number(v.otherDeductions) || 0,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-run', id] });
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setEditMode(false);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function startEdit() {
    if (!detailQuery.data) return;
    setEditLines(
      Object.fromEntries(
        detailQuery.data.lines.map((l) => [
          l.employeeId,
          { absenceDays: String(l.absenceDays), lateHours: String(l.lateHours), otherDeductions: String(l.otherDeductions) },
        ]),
      ),
    );
    setEditMode(true);
  }

  function updateEditLine(employeeId: string, field: 'absenceDays' | 'lateHours' | 'otherDeductions', value: string) {
    setEditLines((prev) => ({ ...prev, [employeeId]: { ...prev[employeeId], [field]: value } }));
  }

  const run = detailQuery.data;
  const lines = run?.lines ?? [];
  const totalNetSalary = lines.reduce((s, l) => s + Number(l.netSalary), 0);

  // Same grouping the approval step itself uses — one operating-expense line per branch — shown
  // here up front so an approver can see exactly what will be posted before confirming.
  const branchTotals = lines.reduce<Record<string, { label: string; total: number }>>((acc, l) => {
    const key = l.branchId;
    const label = l.branch?.nameAr || l.branch?.nameEn || '—';
    acc[key] = { label, total: (acc[key]?.total ?? 0) + Number(l.netSalary) };
    return acc;
  }, {});

  const lineColumns: Column<PayrollRunLine>[] = [
    { header: t('hr.employeeName'), accessor: (r) => r.employee?.name ?? '—' },
    { header: t('hr.jobTitle'), accessor: (r) => r.employee?.jobTitle ?? '—' },
    { header: t('fields.branch'), accessor: (r) => r.branch?.nameAr || r.branch?.nameEn || '—' },
    { header: t('hr.baseSalary'), accessor: (r) => formatAmount(r.baseSalary), align: 'right' },
    {
      header: t('hr.absenceDays'),
      accessor: (r) =>
        editMode ? (
          <Input
            type="number"
            min={0}
            step="0.5"
            value={editLines[r.employeeId]?.absenceDays ?? '0'}
            onChange={(e) => updateEditLine(r.employeeId, 'absenceDays', e.target.value)}
            className="w-20"
          />
        ) : (
          r.absenceDays
        ),
      align: 'center',
    },
    {
      header: t('hr.lateHours'),
      accessor: (r) =>
        editMode ? (
          <Input
            type="number"
            min={0}
            step="0.5"
            value={editLines[r.employeeId]?.lateHours ?? '0'}
            onChange={(e) => updateEditLine(r.employeeId, 'lateHours', e.target.value)}
            className="w-20"
          />
        ) : (
          r.lateHours
        ),
      align: 'center',
    },
    {
      header: t('hr.otherDeductions'),
      accessor: (r) =>
        editMode ? (
          <Input
            type="number"
            min={0}
            value={editLines[r.employeeId]?.otherDeductions ?? '0'}
            onChange={(e) => updateEditLine(r.employeeId, 'otherDeductions', e.target.value)}
            className="w-24"
          />
        ) : (
          formatAmount(r.otherDeductions)
        ),
      align: 'right',
    },
    { header: t('hr.absenceDeduction'), accessor: (r) => formatAmount(r.absenceDeduction), align: 'right' },
    { header: t('hr.lateDeduction'), accessor: (r) => formatAmount(r.lateDeduction), align: 'right' },
    {
      header: t('hr.netSalary'),
      accessor: (r) => <span className="font-semibold">{formatAmount(r.netSalary)}</span>,
      align: 'right',
    },
  ];

  if (!run) return null;

  return (
    <div>
      <PageHeader
        title={t('hr.payrollRunTitle', { month: monthNameOnly(run.month, i18n.language), year: run.year })}
        actions={
          editMode ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditMode(false)} disabled={updateMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {canEdit && (
                <Button variant="secondary" onClick={startEdit}>
                  {t('common.edit')}
                </Button>
              )}
              {run.status === 'CONFIRMED' && canApprove && (
                <Button onClick={openApproveModal} disabled={approveMutation.isPending}>
                  {t('hr.approvePayroll')}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('table.documentNumber')}</div>
          <div className="mt-1 font-semibold">{run.documentNumber}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('common.status')}</div>
          <div className="mt-1">
            <Badge color={PAYROLL_STATUS_COLOR[run.status]}>{t(`hr.payrollStatus.${run.status}`, run.status)}</Badge>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('hr.totalNetSalary')}</div>
          <div className="mt-1 font-semibold">{formatAmount(totalNetSalary)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('treasury.paymentAccount')}</div>
          <div className="mt-1 font-semibold">
            {run.paymentAccount ? t(`treasury.paymentAccounts.${run.paymentAccount}`) : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('hr.approvedBy')}</div>
          <div className="mt-1 font-semibold">{run.approvedByName ?? '—'}</div>
        </Card>
      </div>

      {Object.keys(branchTotals).length > 1 && (
        <Card className="mb-4">
          <div className="mb-2 text-sm font-semibold">{t('hr.branchTotals')}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.values(branchTotals).map((b) => (
              <div key={b.label} className="rounded-lg border border-[var(--border)] p-2">
                <div className="text-xs text-[var(--text-muted)]">{b.label}</div>
                <div className="font-semibold">{formatAmount(b.total)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable columns={lineColumns} data={lines} keyField={(r) => r.id} searchable={false} />

      <Modal open={approveModalOpen} onClose={() => setApproveModalOpen(false)} title={t('hr.approvePayroll')}>
        <div className="grid grid-cols-1 gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            {t('hr.approvePayrollConfirmMessage', { amount: formatAmount(totalNetSalary) })}
          </p>
          <FormField label={t('treasury.paymentAccount')}>
            <Select value={approveAccount} onChange={(e) => setApproveAccount(e.target.value as 'CASH' | 'BANK')}>
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
            </Select>
          </FormField>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setApproveModalOpen(false)} disabled={approveMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {t('hr.confirmApproval')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
