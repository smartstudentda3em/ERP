import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { monthNameOnly } from '../../lib/date-utils';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';

interface RepOption {
  id: string;
  name: string;
}

interface SalesItem {
  lineId: string;
  invoiceId: string;
  documentNumber: string;
  invoiceDate: string;
  productName: string;
  lineTotal: number;
  commissionRate: number;
  commissionAmount: number;
}

interface PayrollMonthSnapshot {
  year: number;
  month: number;
  baseSalary: number;
  absenceDays: number;
  lateHours: number;
  absenceDeduction: number;
  lateDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  status: string;
}

interface ManagerDashboard {
  manager: { id: string; name: string; branchName: string | null };
  employee: { baseSalary: number; jobTitle: string } | null;
  sales: { totalSales: number; items: SalesItem[] };
  commission: { generalRate: number; amount: number };
  repTreasuryBalance: number;
  payroll: {
    hasEmployeeRecord: boolean;
    months: (PayrollMonthSnapshot | null)[];
  };
}

export type DashboardQuarter = 1 | 2 | 3 | 4;

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors the backend's
 * quarterDateRange() (partners-treasury.controller.ts), just returning {from, to} instead of
 * {dateFrom, dateTo} to match this file's own naming. */
function quarterDateRange(year: number, quarter: DashboardQuarter): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

/** The 3 (year, month) pairs a quarter spans — mirrors the backend's monthsInDateRange(), which
 * derives the same 3 months from the dateFrom this component sends it, so the labels here always
 * line up 1:1 with payroll.months' array order. */
function quarterMonths(year: number, quarter: DashboardQuarter): { year: number; month: number }[] {
  const startMonth = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((i) => {
    const d = new Date(year, startMonth - 1 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

function PayrollMonthCard({
  year,
  month,
  snapshot,
  language,
}: {
  year: number;
  month: number;
  snapshot: PayrollMonthSnapshot | null;
  language: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="mb-2 text-sm font-semibold">
        {monthNameOnly(month, language)} {year}
      </div>
      {!snapshot ? (
        <div className="text-sm text-[var(--text-muted)]">{t('managerDashboard.noPayrollForMonth')}</div>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('hr.baseSalary')}</span>
            <span>{formatAmount(snapshot.baseSalary)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('managerDashboard.absenceDays')}</span>
            <span>{snapshot.absenceDays}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('managerDashboard.lateHours')}</span>
            <span>{snapshot.lateHours}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('hr.absenceDeduction')}</span>
            <span>{formatAmount(snapshot.absenceDeduction)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('hr.lateDeduction')}</span>
            <span>{formatAmount(snapshot.lateDeduction)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t('hr.otherDeductions')}</span>
            <span>{formatAmount(snapshot.otherDeductions)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-1 font-medium">
            <span>{t('hr.totalDeductions')}</span>
            <span>{formatAmount(snapshot.totalDeductions)}</span>
          </div>
          <div className="flex justify-between text-base font-bold text-primary-600">
            <span>{t('hr.netSalary')}</span>
            <span>{formatAmount(snapshot.netSalary)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export interface MyManagerDashboardTabProps {
  /** Provided only when this tab is rendered inside SalesRepresentativesPage's shared tab bar for an
   * admin — in that case the parent renders the year/quarter/manager-select controls inline with its
   * own tab buttons and this component becomes fully controlled for them, rendering none of its own
   * copies. Omitted entirely for the self-service branch-manager view (no shared header to plug into),
   * which keeps managing all three internally exactly as before. */
  controlled?: {
    selectedRepId: string;
    year: number;
    quarter: DashboardQuarter;
    repOptions: RepOption[];
  };
}

export function MyManagerDashboardTab({ controlled }: MyManagerDashboardTabProps = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isStationery } = useActiveCompany();
  const now = new Date();
  const currentQuarter = (Math.floor(now.getMonth() / 3) + 1) as DashboardQuarter;
  const [internalYear, setInternalYear] = useState(now.getFullYear());
  const [internalQuarter, setInternalQuarter] = useState<DashboardQuarter>(currentQuarter);

  // Admins (sales-representatives.view) have no dashboard of their own — self-service /me/dashboard
  // would 404 for them since they're not a linked branch manager. They instead pick any manager
  // from a list and drill into that manager's dashboard via /:id/dashboard. A مدير فرع viewing their
  // own tab never sees this picker at all and keeps hitting /me/dashboard exactly as before.
  const canViewAll = useAuthStore((s) => s.hasPermission('sales-representatives.view'));
  const [internalSelectedRepId, setInternalSelectedRepId] = useState('');

  const year = controlled?.year ?? internalYear;
  const quarter = controlled?.quarter ?? internalQuarter;
  const selectedRepId = controlled?.selectedRepId ?? internalSelectedRepId;

  const repsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<RepOption[]>(apiClient.get('/sales-representatives')),
    enabled: canViewAll && !controlled,
  });
  const repOptions = controlled?.repOptions ?? repsQuery.data ?? [];

  const range = useMemo(() => quarterDateRange(year, quarter), [year, quarter]);

  const dashboardQuery = useQuery({
    queryKey: canViewAll
      ? ['sales-representatives', selectedRepId, 'dashboard', range.from, range.to]
      : ['sales-representatives', 'me', 'dashboard', range.from, range.to],
    queryFn: () =>
      unwrap<ManagerDashboard>(
        apiClient.get(`/sales-representatives/${canViewAll ? selectedRepId : 'me'}/dashboard`, {
          params: { dateFrom: range.from, dateTo: range.to },
        }),
      ),
    enabled: !canViewAll || !!selectedRepId,
  });

  const data = dashboardQuery.data;

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salesColumns: Column<SalesItem>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.invoiceDate },
    { header: t('fields.product'), accessor: (r) => r.productName },
    { header: t('common.total'), accessor: (r) => formatAmount(r.lineTotal), align: 'right' },
    { header: t('fields.commissionRate'), accessor: (r) => `${formatAmount(r.commissionRate)}%`, align: 'right' },
    { header: t('managerDashboard.commissionAmount'), accessor: (r) => formatAmount(r.commissionAmount), align: 'right' },
  ];

  return (
    <div>
      {canViewAll && !controlled && (
        <div className="mb-3 max-w-xs">
          <FormField label={t('managerDashboard.selectManager')}>
            <Select value={internalSelectedRepId} onChange={(e) => setInternalSelectedRepId(e.target.value)}>
              <option value="">{t('managerDashboard.selectManagerPlaceholder')}</option>
              {repOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      )}

      {!controlled && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:max-w-md sm:grid-cols-2">
          <FormField label={t('common.year')}>
            <Select value={internalYear} onChange={(e) => setInternalYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('partners.quarter')}>
            <Select value={internalQuarter} onChange={(e) => setInternalQuarter(Number(e.target.value) as DashboardQuarter)}>
              <option value={1}>{t('partners.q1')}</option>
              <option value={2}>{t('partners.q2')}</option>
              <option value={3}>{t('partners.q3')}</option>
              <option value={4}>{t('partners.q4')}</option>
            </Select>
          </FormField>
        </div>
      )}

      {canViewAll && !selectedRepId ? (
        <div className="text-sm text-[var(--text-muted)]">{t('managerDashboard.selectManagerPlaceholder')}</div>
      ) : dashboardQuery.isLoading ? (
        <div className="text-sm text-[var(--text-muted)]">{t('common.loading')}</div>
      ) : !data ? null : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('managerDashboard.employeeInfoTitle')}</CardTitle>
            </CardHeader>
            {!data.employee ? (
              <div className="text-sm text-[var(--text-muted)]">{t('managerDashboard.noEmployeeRecord')}</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-[var(--text-muted)]">{t('hr.jobTitle')}: </span>
                  {data.employee.jobTitle}
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{t('hr.baseSalary')}: </span>
                  {formatAmount(data.employee.baseSalary)}
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">{t('managerDashboard.branchLabel')}: </span>
                  {data.manager.branchName ?? '—'}
                </div>
              </div>
            )}
          </Card>

          <div className={`grid grid-cols-1 gap-4 ${isStationery ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <Card>
              <CardHeader>
                <CardTitle>{t('managerDashboard.salesOverviewTitle')}</CardTitle>
              </CardHeader>
              <div className="text-2xl font-bold text-primary-600">{formatAmount(data.sales.totalSales)}</div>
            </Card>

            {/* Stationery only: clickable only for whoever can see this dashboard for a رep other
                than themselves (canViewAll, i.e. Admin/Manager) — a مندوب viewing their own tab sees
                the exact same amount but the card stays inert for them, per spec ("خفية عن المندوب
                العادي"). Navigates to the detailed commission payout screen for this specific manager. */}
            <Card
              className={isStationery && canViewAll ? 'cursor-pointer transition hover:border-primary-400' : undefined}
              onClick={
                isStationery && canViewAll
                  ? () => navigate(`/sales-representatives/${data.manager.id}/commission-payout`)
                  : undefined
              }
            >
              <CardHeader>
                <CardTitle>{t('managerDashboard.commissionTitle')}</CardTitle>
              </CardHeader>
              <div className="text-2xl font-bold text-primary-600">{formatAmount(data.commission.amount)}</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {t('fields.commissionRate')}: {data.commission.generalRate}%
              </div>
              {isStationery && canViewAll && (
                <div className="mt-1 text-xs text-primary-600">{t('managerDashboard.clickForCommissionDetails')}</div>
              )}
            </Card>

            {isStationery && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('treasury.repTreasuryBalance')}</CardTitle>
                </CardHeader>
                <div className="text-2xl font-bold text-green-600">{formatAmount(data.repTreasuryBalance)}</div>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t(isStationery ? 'managerDashboard.salesListTitleRep' : 'managerDashboard.salesListTitle')}</CardTitle>
            </CardHeader>
            <DataTable columns={salesColumns} data={data.sales.items} keyField={(r) => r.lineId} pageSize={10} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('managerDashboard.payrollTitle')}</CardTitle>
            </CardHeader>
            {!data.payroll.hasEmployeeRecord ? (
              <div className="text-sm text-[var(--text-muted)]">{t('managerDashboard.noEmployeeRecord')}</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {quarterMonths(year, quarter).map((m, i) => (
                  <PayrollMonthCard
                    key={`${m.year}-${m.month}`}
                    year={m.year}
                    month={m.month}
                    snapshot={data.payroll.months[i] ?? null}
                    language={i18n.language}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
