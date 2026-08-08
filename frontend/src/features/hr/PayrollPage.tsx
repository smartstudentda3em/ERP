import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { FormField, Input, Select } from '../../components/ui/Input';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { monthNameOnly } from '../../lib/date-utils';

interface Employee {
  id: string;
  name: string;
  jobTitle: string;
  branchId: string;
  baseSalary: number;
  isActive: boolean;
}

interface PayrollRunLine {
  employeeId: string;
  netSalary: number;
}

interface PayrollRunRow {
  id: string;
  documentNumber: string;
  year: number;
  month: number;
  status: 'CONFIRMED' | 'APPROVED';
  lines: PayrollRunLine[];
}

interface LineDraft {
  employeeId: string;
  name: string;
  jobTitle: string;
  baseSalary: number;
  absenceDays: string;
  lateHours: string;
  otherDeductions: string;
}

const PAYROLL_STATUS_COLOR: Record<string, 'gray' | 'green' | 'yellow'> = {
  CONFIRMED: 'yellow',
  APPROVED: 'green',
};

function computeDeductions(baseSalary: number, absenceDays: number, lateHours: number, otherDeductions: number) {
  const dailyRate = baseSalary / 30;
  const hourlyRate = dailyRate / 8;
  const absenceDeduction = dailyRate * absenceDays;
  const lateDeduction = hourlyRate * lateHours;
  const netSalary = Math.max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions);
  return { absenceDeduction, lateDeduction, netSalary };
}

export function PayrollPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('hr.payroll.create'));
  const canEdit = useAuthStore((s) => s.hasPermission('hr.payroll.edit'));
  const canDelete = useAuthStore((s) => s.hasPermission('hr.payroll.delete'));
  const { isPrintingPress } = useActiveCompany();
  const [entryOpen, setEntryOpen] = useState(false);
  const [newRunModalOpen, setNewRunModalOpen] = useState(false);
  const now = new Date();
  const [runPeriod, setRunPeriod] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [lineInputs, setLineInputs] = useState<Record<string, { absenceDays: string; lateHours: string; otherDeductions: string }>>({});
  const [paymentAccount, setPaymentAccount] = useState<'CASH' | 'BANK'>('CASH');
  const [error, setError] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ['hr-payroll-runs', companyId],
    queryFn: () => unwrap<PayrollRunRow[]>(apiClient.get('/hr/payroll-runs')),
    enabled: !!companyId && !entryOpen,
  });

  const employeesQuery = useQuery({
    queryKey: ['hr-employees', companyId],
    queryFn: () => unwrap<Employee[]>(apiClient.get('/hr/employees')),
    enabled: entryOpen && !!companyId,
  });

  function openNewRunModal() {
    setError(null);
    setRunPeriod({ year: now.getFullYear(), month: now.getMonth() + 1 });
    setNewRunModalOpen(true);
  }

  function confirmNewRun() {
    setLineInputs({});
    setNewRunModalOpen(false);
    setEntryOpen(true);
  }

  function updateLine(employeeId: string, field: 'absenceDays' | 'lateHours' | 'otherDeductions', value: string) {
    setLineInputs((prev) => {
      const current = prev[employeeId] ?? { absenceDays: '0', lateHours: '0', otherDeductions: '0' };
      return { ...prev, [employeeId]: { ...current, [field]: value } };
    });
  }

  const lines: LineDraft[] = useMemo(() => {
    return (employeesQuery.data ?? [])
      .filter((e) => e.isActive)
      .map((e) => {
        const input = lineInputs[e.id] ?? { absenceDays: '0', lateHours: '0', otherDeductions: '0' };
        return {
          employeeId: e.id,
          name: e.name,
          jobTitle: e.jobTitle,
          baseSalary: Number(e.baseSalary),
          absenceDays: input.absenceDays,
          lateHours: input.lateHours,
          otherDeductions: input.otherDeductions,
        };
      });
  }, [employeesQuery.data, lineInputs]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/hr/payroll-runs', {
        year: runPeriod.year,
        month: runPeriod.month,
        // Press-only: required so the backend can debit this run's net salaries from the right
        // account and check its balance before posting anything (see PayrollService.create()).
        paymentAccount: isPrintingPress ? paymentAccount : undefined,
        lines: lines.map((l) => ({
          employeeId: l.employeeId,
          absenceDays: Number(l.absenceDays) || 0,
          lateHours: Number(l.lateHours) || 0,
          otherDeductions: Number(l.otherDeductions) || 0,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setEntryOpen(false);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const lineColumns: Column<LineDraft>[] = useMemo(
    () => [
      { header: t('hr.employeeName'), accessor: (r) => r.name },
      { header: t('hr.jobTitle'), accessor: (r) => r.jobTitle },
      { header: t('hr.baseSalary'), accessor: (r) => formatAmount(r.baseSalary), align: 'right' },
      {
        header: t('hr.absenceDays'),
        accessor: (r) => (
          <Input
            type="number"
            min={0}
            step="0.5"
            value={r.absenceDays}
            onChange={(e) => updateLine(r.employeeId, 'absenceDays', e.target.value)}
            className="w-20"
          />
        ),
        align: 'center',
      },
      {
        header: t('hr.lateHours'),
        accessor: (r) => (
          <Input
            type="number"
            min={0}
            step="0.5"
            value={r.lateHours}
            onChange={(e) => updateLine(r.employeeId, 'lateHours', e.target.value)}
            className="w-20"
          />
        ),
        align: 'center',
      },
      {
        header: t('hr.otherDeductions'),
        accessor: (r) => (
          <Input
            type="number"
            min={0}
            value={r.otherDeductions}
            onChange={(e) => updateLine(r.employeeId, 'otherDeductions', e.target.value)}
            className="w-24"
          />
        ),
        align: 'center',
      },
      {
        header: t('hr.absenceDeduction'),
        accessor: (r) => {
          const { absenceDeduction } = computeDeductions(r.baseSalary, Number(r.absenceDays) || 0, Number(r.lateHours) || 0, Number(r.otherDeductions) || 0);
          return formatAmount(absenceDeduction);
        },
        align: 'right',
      },
      {
        header: t('hr.lateDeduction'),
        accessor: (r) => {
          const { lateDeduction } = computeDeductions(r.baseSalary, Number(r.absenceDays) || 0, Number(r.lateHours) || 0, Number(r.otherDeductions) || 0);
          return formatAmount(lateDeduction);
        },
        align: 'right',
      },
      {
        header: t('hr.netSalary'),
        accessor: (r) => {
          const { netSalary } = computeDeductions(r.baseSalary, Number(r.absenceDays) || 0, Number(r.lateHours) || 0, Number(r.otherDeductions) || 0);
          return <span className="font-semibold">{formatAmount(netSalary)}</span>;
        },
        align: 'right',
      },
    ],
    [t],
  );

  const totalNetSalary = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum +
          computeDeductions(l.baseSalary, Number(l.absenceDays) || 0, Number(l.lateHours) || 0, Number(l.otherDeductions) || 0)
            .netSalary,
        0,
      ),
    [lines],
  );

  // Editing (allowances/deductions/net pay) needs the full per-employee line table, which only the
  // detail page has already loaded — the Edit button here just navigates there instead of
  // duplicating that editor in a modal. Works the same for an already-APPROVED run: the backend
  // reverses its originally-posted CashMovement rows and re-posts fresh totals for the new figures
  // (see PayrollService.update()).
  function openEditRun(e: MouseEvent, r: PayrollRunRow) {
    e.stopPropagation();
    navigate(`/hr/payroll/${r.id}`);
  }

  // Deleting an already-APPROVED run reverses its posted CashMovement rows first (see
  // PayrollService.remove()) before the record itself is removed, so this needs the same broad
  // invalidation the Reports/Expenses screens rely on for their totals.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/hr/payroll-runs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-runs'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeleteRun(e: MouseEvent, r: PayrollRunRow) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: r.documentNumber }) });
    if (ok) deleteMutation.mutate(r.id);
  }

  const runColumns: Column<PayrollRunRow>[] = [
    { header: t('hr.payrollMonth'), accessor: (r) => `${monthNameOnly(r.month, i18n.language)} ${r.year}` },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    {
      header: t('hr.totalNetSalary'),
      accessor: (r) => formatAmount(r.lines.reduce((s, l) => s + Number(l.netSalary), 0)),
      align: 'right',
    },
    {
      header: t('common.status'),
      accessor: (r) => <Badge color={PAYROLL_STATUS_COLOR[r.status]}>{t(`hr.payrollStatus.${r.status}`, r.status)}</Badge>,
      align: 'center',
    },
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            // Available for both CONFIRMED and APPROVED runs — editing/deleting an APPROVED one
            // just also reverses/re-posts its real CashMovement effect server-side (see
            // PayrollService.update()/remove()), rather than being blocked outright.
            accessor: (r: PayrollRunRow) => (
              <div className="flex justify-center gap-3">
                {canEdit && (
                  <button
                    type="button"
                    className="text-primary-600 hover:underline"
                    onClick={(e) => openEditRun(e, r)}
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => handleDeleteRun(e, r)}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ),
            align: 'center',
          } as Column<PayrollRunRow>,
        ]
      : []),
  ];

  if (entryOpen) {
    return (
      <div>
        <PageHeader title={t('hr.newPayrollRun')} />
        <Button variant="secondary" onClick={() => setEntryOpen(false)} className="mb-3">
          {t('hr.backToList')}
        </Button>

        <div className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${isPrintingPress ? 'lg:grid-cols-3' : ''}`}>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('hr.payrollMonth')}</div>
            <div className="mt-1 font-semibold">
              {monthNameOnly(runPeriod.month, i18n.language)} {runPeriod.year}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('hr.totalNetSalary')}</div>
            <div className="mt-1 font-semibold">{formatAmount(totalNetSalary)}</div>
          </Card>
          {isPrintingPress && (
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('treasury.paymentAccount')}</div>
              <Select
                className="mt-1"
                required
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK')}
              >
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
            </Card>
          )}
        </div>

        <DataTable columns={lineColumns} data={lines} keyField={(r) => r.employeeId} searchable={false} isLoading={employeesQuery.isLoading} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEntryOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || lines.length === 0}>
            {/* Press pays out immediately at save time (see PayrollService.create()'s balance-check
                design), so "save and approve" is literally accurate there; every other company saves
                as a pending draft only — nothing posts to expenses until an Administrator approves it
                on the run's detail page (see PayrollRunDetailPage.tsx). */}
            {isPrintingPress ? t('hr.saveAndSubmit') : t('hr.saveDraft')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('nav.payroll')}
        actions={canCreate ? <Button onClick={openNewRunModal}>+ {t('hr.newPayrollRun')}</Button> : undefined}
      />
      <DataTable
        columns={runColumns}
        data={runsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={runsQuery.isLoading}
        searchable={false}
        onRowClick={(r) => navigate(`/hr/payroll/${r.id}`)}
      />

      <Modal open={newRunModalOpen} onClose={() => setNewRunModalOpen(false)} title={t('hr.newPayrollRun')}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('hr.payrollMonthLabel')}>
            <Select
              value={runPeriod.month}
              onChange={(e) => setRunPeriod({ ...runPeriod, month: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthNameOnly(m, i18n.language)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('common.year')}>
            <Input
              type="number"
              value={runPeriod.year}
              onChange={(e) => setRunPeriod({ ...runPeriod, year: Number(e.target.value) || now.getFullYear() })}
            />
          </FormField>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewRunModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={confirmNewRun}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
