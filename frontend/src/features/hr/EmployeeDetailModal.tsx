import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { monthNameOnly } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, FormField, Select } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';

interface MonthSalary {
  month: number;
  hasPayrollRun: boolean;
  baseSalary: number;
  absenceDays: number;
  lateHours: number;
  absenceDeduction: number;
  lateDeduction: number;
  otherDeductions: number;
  commission: number;
  netSalary: number;
  status: string | null;
}

interface LeaveRecord {
  id: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
  notes: string | null;
  days: number;
}

interface EmployeeHistory {
  employee: { id: string; name: string; jobTitle: string; branchName: string | null; baseSalary: number; isActive: boolean };
  year: number;
  month: number | null;
  salary: { monthly: MonthSalary[]; totals: Omit<MonthSalary, 'month' | 'hasPayrollRun' | 'status'> };
  leaves: { records: LeaveRecord[]; totalDays: number };
}

const emptyLeaveForm = { startDate: '', endDate: '', type: 'ANNUAL' as LeaveType, notes: '' };

export function EmployeeDetailModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | ''>('');
  const [addingLeave, setAddingLeave] = useState(false);
  const [leaveForm, setLeaveForm] = useState(emptyLeaveForm);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const historyQuery = useQuery({
    queryKey: ['hr-employees', employeeId, 'history', year, month],
    queryFn: () =>
      unwrap<EmployeeHistory>(
        apiClient.get(`/hr/employees/${employeeId}/history`, { params: { year, month: month || undefined } }),
      ),
  });

  const addLeaveMutation = useMutation({
    mutationFn: () => apiClient.post(`/hr/employees/${employeeId}/leaves`, leaveForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-employees', employeeId, 'history'] });
      setAddingLeave(false);
      setLeaveForm(emptyLeaveForm);
      setLeaveError(null);
    },
    onError: (err: any) => setLeaveError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => apiClient.delete(`/hr/employees/${employeeId}/leaves/${leaveId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-employees', employeeId, 'history'] }),
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeleteLeave(leave: LeaveRecord) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: `${leave.startDate} - ${leave.endDate}` }) });
    if (ok) deleteLeaveMutation.mutate(leave.id);
  }

  const data = historyQuery.data;
  const isSingleMonth = month !== '';

  async function handleDownloadPdf() {
    if (!printRef.current || !data) return;
    setPdfLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(buildPdfFileName(t('hr.salarySlipTitle'), data.employee.name, `${data.year}${data.month ? '-' + data.month : ''}`));
    } catch {
      toast.error(t('hr.pdfExportError'));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <>
    <Modal
      open
      onClose={onClose}
      title={data?.employee.name ?? '—'}
      widthClass="max-w-4xl"
      headerActions={
        data ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfLoading}>
              {t('hr.exportPdf')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!data ? (
        <div className="text-sm text-[var(--text-muted)]">{t('common.loading')}</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border)] p-3 text-sm sm:grid-cols-4">
            <div>
              <span className="text-[var(--text-muted)]">{t('hr.jobTitle')}: </span>
              {data.employee.jobTitle}
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('fields.branch')}: </span>
              {data.employee.branchName ?? '—'}
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('hr.baseSalary')}: </span>
              {formatAmount(data.employee.baseSalary)}
            </div>
            <div>
              {data.employee.isActive ? (
                <Badge color="green">{t('common.active')}</Badge>
              ) : (
                <Badge color="red">{t('common.inactive')}</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t('common.year')}>
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('hr.monthLabel')}>
              <Select value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{t('hr.allMonths')}</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthNameOnly(m, i18n.language)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {/* تفاصيل الراتب الشهري */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('hr.monthlySalaryTitle')}</h3>
            {isSingleMonth && !data.salary.monthly[0].hasPayrollRun ? (
              <div className="text-sm text-[var(--text-muted)]">{t('managerDashboard.noPayrollForMonth')}</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>{t('hr.monthLabel')}</th>
                      <th>{t('hr.baseSalary')}</th>
                      <th>{t('hr.absenceDeduction')}</th>
                      <th>{t('hr.lateDeduction')}</th>
                      <th>{t('hr.otherDeductions')}</th>
                      <th>{t('hr.commission')}</th>
                      <th>{t('hr.netSalary')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salary.monthly.map((m) => (
                      <tr key={m.month}>
                        <td>{monthNameOnly(m.month, i18n.language)}</td>
                        <td>{m.hasPayrollRun ? formatAmount(m.baseSalary) : '—'}</td>
                        <td>{m.hasPayrollRun ? formatAmount(m.absenceDeduction) : '—'}</td>
                        <td>{m.hasPayrollRun ? formatAmount(m.lateDeduction) : '—'}</td>
                        <td>{m.hasPayrollRun ? formatAmount(m.otherDeductions) : '—'}</td>
                        <td>{m.hasPayrollRun ? formatAmount(m.commission) : '—'}</td>
                        <td className="font-semibold">{m.hasPayrollRun ? formatAmount(m.netSalary) : '—'}</td>
                      </tr>
                    ))}
                    {!isSingleMonth && (
                      <tr className="font-semibold">
                        <td>{t('common.total')}</td>
                        <td>{formatAmount(data.salary.totals.baseSalary)}</td>
                        <td>{formatAmount(data.salary.totals.absenceDeduction)}</td>
                        <td>{formatAmount(data.salary.totals.lateDeduction)}</td>
                        <td>{formatAmount(data.salary.totals.otherDeductions)}</td>
                        <td>{formatAmount(data.salary.totals.commission)}</td>
                        <td>{formatAmount(data.salary.totals.netSalary)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* سجلات الغياب والتأخير */}
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('hr.attendanceTitle')}</h3>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t('hr.monthLabel')}</th>
                    <th>{t('hr.absenceDays')}</th>
                    <th>{t('hr.lateHours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.salary.monthly.map((m) => (
                    <tr key={m.month}>
                      <td>{monthNameOnly(m.month, i18n.language)}</td>
                      <td>{m.absenceDays}</td>
                      <td>{m.lateHours}</td>
                    </tr>
                  ))}
                  {!isSingleMonth && (
                    <tr className="font-semibold">
                      <td>{t('common.total')}</td>
                      <td>{data.salary.totals.absenceDays}</td>
                      <td>{data.salary.totals.lateHours}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* الإجازات والعطلات */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {t('hr.leavesTitle')} — {t('hr.totalLeaveDays')}: {data.leaves.totalDays}
              </h3>
              <button type="button" className="text-sm text-primary-600 hover:underline" onClick={() => setAddingLeave((v) => !v)}>
                {t('hr.addLeave')}
              </button>
            </div>

            {addingLeave && (
              <form
                className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  addLeaveMutation.mutate();
                }}
              >
                <FormField label={t('hr.leaveStartDate')}>
                  <Input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                  />
                </FormField>
                <FormField label={t('hr.leaveEndDate')}>
                  <Input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                  />
                </FormField>
                <FormField label={t('common.type')}>
                  <Select
                    value={leaveForm.type}
                    onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value as LeaveType })}
                  >
                    <option value="ANNUAL">{t('hr.leaveType.ANNUAL')}</option>
                    <option value="SICK">{t('hr.leaveType.SICK')}</option>
                    <option value="UNPAID">{t('hr.leaveType.UNPAID')}</option>
                    <option value="OTHER">{t('hr.leaveType.OTHER')}</option>
                  </Select>
                </FormField>
                <FormField label={t('common.notes')}>
                  <Input value={leaveForm.notes} onChange={(e) => setLeaveForm({ ...leaveForm, notes: e.target.value })} />
                </FormField>
                <div className="flex items-end gap-2">
                  <Button type="submit" disabled={addLeaveMutation.isPending}>
                    {t('common.save')}
                  </Button>
                </div>
                {leaveError && <p className="col-span-full text-sm text-red-600">{leaveError}</p>}
              </form>
            )}

            {data.leaves.records.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">{t('hr.noLeaveRecords')}</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>{t('hr.leaveStartDate')}</th>
                      <th>{t('hr.leaveEndDate')}</th>
                      <th>{t('common.type')}</th>
                      <th>{t('hr.leaveDays')}</th>
                      <th>{t('common.notes')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leaves.records.map((l) => (
                      <tr key={l.id}>
                        <td>{l.startDate}</td>
                        <td>{l.endDate}</td>
                        <td>{t(`hr.leaveType.${l.type}`)}</td>
                        <td>{l.days}</td>
                        <td>{l.notes ?? '—'}</td>
                        <td>
                          <button type="button" className="text-red-600 hover:underline" onClick={() => handleDeleteLeave(l)}>
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>

    {/* Rendered as a sibling of Modal, never as its child — Modal itself is print:hidden, and a
        hidden ancestor would hide this print-only fragment too. Hidden on screen by default; shown
        only for an actual print or the html2canvas PDF snapshot (see handleDownloadPdf above). */}
    {data && (
      <div ref={printRef} className="employee-salary-print">
        <div className="employee-salary-print-header">
          <div className="employee-salary-print-title">{t('hr.salarySlipTitle')} — {data.employee.name}</div>
          <div className="employee-salary-print-meta">
            {t('common.year')}: {data.year}
            {data.month ? ` — ${t('hr.monthLabel')}: ${monthNameOnly(data.month, i18n.language)}` : ''}
          </div>
        </div>

        <div className="employee-salary-print-section">
          <div className="employee-salary-print-section-title">{t('hr.employeeName')}</div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <span className="text-[var(--text-muted)]">{t('hr.jobTitle')}: </span>
              {data.employee.jobTitle}
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('fields.branch')}: </span>
              {data.employee.branchName ?? '—'}
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('hr.baseSalary')}: </span>
              {formatAmount(data.employee.baseSalary)}
            </div>
            <div>
              <span className="text-[var(--text-muted)]">{t('common.status')}: </span>
              {data.employee.isActive ? t('common.active') : t('common.inactive')}
            </div>
          </div>
        </div>

        <div className="employee-salary-print-section">
          <div className="employee-salary-print-section-title">{t('hr.monthlySalaryTitle')}</div>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th>{t('hr.monthLabel')}</th>
                  <th>{t('hr.baseSalary')}</th>
                  <th>{t('hr.absenceDeduction')}</th>
                  <th>{t('hr.lateDeduction')}</th>
                  <th>{t('hr.otherDeductions')}</th>
                  <th>{t('hr.commission')}</th>
                  <th>{t('hr.netSalary')}</th>
                </tr>
              </thead>
              <tbody>
                {data.salary.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{monthNameOnly(m.month, i18n.language)}</td>
                    <td>{m.hasPayrollRun ? formatAmount(m.baseSalary) : '—'}</td>
                    <td>{m.hasPayrollRun ? formatAmount(m.absenceDeduction) : '—'}</td>
                    <td>{m.hasPayrollRun ? formatAmount(m.lateDeduction) : '—'}</td>
                    <td>{m.hasPayrollRun ? formatAmount(m.otherDeductions) : '—'}</td>
                    <td>{m.hasPayrollRun ? formatAmount(m.commission) : '—'}</td>
                    <td className="font-semibold">{m.hasPayrollRun ? formatAmount(m.netSalary) : '—'}</td>
                  </tr>
                ))}
                {!isSingleMonth && (
                  <tr className="font-semibold">
                    <td>{t('common.total')}</td>
                    <td>{formatAmount(data.salary.totals.baseSalary)}</td>
                    <td>{formatAmount(data.salary.totals.absenceDeduction)}</td>
                    <td>{formatAmount(data.salary.totals.lateDeduction)}</td>
                    <td>{formatAmount(data.salary.totals.otherDeductions)}</td>
                    <td>{formatAmount(data.salary.totals.commission)}</td>
                    <td>{formatAmount(data.salary.totals.netSalary)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="employee-salary-print-section">
          <div className="employee-salary-print-section-title">{t('hr.attendanceTitle')}</div>
          <div className="overflow-x-auto">
            <table className="app-table">
              <thead>
                <tr>
                  <th>{t('hr.monthLabel')}</th>
                  <th>{t('hr.absenceDays')}</th>
                  <th>{t('hr.lateHours')}</th>
                </tr>
              </thead>
              <tbody>
                {data.salary.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{monthNameOnly(m.month, i18n.language)}</td>
                    <td>{m.absenceDays}</td>
                    <td>{m.lateHours}</td>
                  </tr>
                ))}
                {!isSingleMonth && (
                  <tr className="font-semibold">
                    <td>{t('common.total')}</td>
                    <td>{data.salary.totals.absenceDays}</td>
                    <td>{data.salary.totals.lateHours}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
