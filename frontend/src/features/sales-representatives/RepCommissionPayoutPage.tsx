import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange } from '../../components/ui/DateRangeFilter';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

interface ManagerDashboard {
  manager: { id: string; name: string };
  commission: { generalRate: number; amount: number };
}

interface CommissionPayout {
  id: string;
  date: string;
  documentNumber: string;
  amount: number;
  account: 'CASH' | 'BANK';
  description: string | null;
  createdByName: string;
}

function money(n: number): string {
  return formatAmount(n);
}

function firstDayOfThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Stationery/Air Conditioning detail/payout screen reached by clicking the commission card on
 * "لوحة المندوب" — Admin/Manager only (see MyManagerDashboardTab.tsx's own canViewAll gate on that
 * click), never reachable by a رep viewing their own dashboard. Air Conditioning has no
 * commission-payout mechanism of its own and reuses this one rather than a separate
 * implementation. Shows the commission earned in a chosen date range (reusing the same computation
 * already backing that dashboard's own commission card, via
 * SalesRepresentativesService.getManagerDashboard/-ByRepId) alongside what's already been paid out
 * in that same range, and lets an admin/manager execute a new payout — routed into the exact same
 * "COMMISSION_PAYOUT" cash movement Printing Press branch managers' own "صرف الأرباح" already uses,
 * so it also surfaces automatically under the Expenses screen's new "صرف العمولات" tab. */
export function RepCommissionPayoutPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isStationery, isAirConditioning, isLoading: companyLoading } = useActiveCompany();

  const [dateRange, setDateRange] = useState<DateRange>({ from: firstDayOfThisMonth(), to: localToday() });
  // getManagerDashboard(ByRepId) requires both dates — DateRangeFilter's own "reset" clears both to
  // '', so the effective range falls back to this month rather than sending an invalid empty query.
  const effectiveFrom = dateRange.from || firstDayOfThisMonth();
  const effectiveTo = dateRange.to || localToday();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ amount: '0', account: 'CASH' as 'CASH' | 'BANK', movementDate: localToday(), description: '' });
  const [error, setError] = useState<string | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['sales-representatives', id, 'dashboard', effectiveFrom, effectiveTo],
    queryFn: () =>
      unwrap<ManagerDashboard>(
        apiClient.get(`/sales-representatives/${id}/dashboard`, {
          params: { dateFrom: effectiveFrom, dateTo: effectiveTo },
        }),
      ),
    enabled: !!id,
  });

  const payoutsQuery = useQuery({
    queryKey: ['commission-payouts', id, effectiveFrom, effectiveTo],
    queryFn: () =>
      unwrap<CommissionPayout[]>(
        apiClient.get('/treasury/commission-payouts', {
          params: { salesRepresentativeId: id, dateFrom: effectiveFrom, dateTo: effectiveTo },
        }),
      ),
    enabled: !!id,
  });

  const repName = dashboardQuery.data?.manager.name ?? '';
  const dueAmount = dashboardQuery.data?.commission.amount ?? 0;
  const paidAmount = (payoutsQuery.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.max(dueAmount - paidAmount, 0);

  const payoutMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/commission-payouts', {
        movementDate: form.movementDate,
        amount: Number(form.amount) || 0,
        account: form.account,
        salesRepresentativeId: id,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setModalOpen(false);
      setError(null);
      toast.success(t('common.savedSuccessfully'));
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function openPayoutModal() {
    setForm({
      amount: remaining > 0.005 ? remaining.toFixed(2) : '0',
      account: 'CASH',
      movementDate: localToday(),
      description: '',
    });
    setError(null);
    setModalOpen(true);
  }

  const columns: Column<CommissionPayout>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
  ];

  if (companyLoading) return null;
  if (!isStationery && !isAirConditioning) return <Navigate to="/sales-representatives" replace />;

  return (
    <div>
      <PageHeader
        title={t('managerDashboard.commissionPayoutPageTitle', { name: repName })}
        actions={
          <Button variant="secondary" onClick={() => navigate('/sales-representatives')}>
            {t('managerDashboard.backToDashboard')}
          </Button>
        }
      />

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t('managerDashboard.commissionDue')}</CardTitle>
          </CardHeader>
          <div className="text-xl font-semibold">{money(dueAmount)}</div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('managerDashboard.commissionPaid')}</CardTitle>
          </CardHeader>
          <div className="text-xl font-semibold">{money(paidAmount)}</div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('managerDashboard.commissionRemaining')}</CardTitle>
          </CardHeader>
          <div className="text-xl font-semibold text-primary-600">{money(remaining)}</div>
        </Card>
      </div>

      <div className="mb-4 flex justify-end">
        <Button onClick={openPayoutModal}>{t('managerDashboard.executeCommissionPayout')}</Button>
      </div>

      <PageHeader title={t('managerDashboard.payoutHistoryTitle')} />
      <DataTable
        columns={columns}
        data={payoutsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={payoutsQuery.isLoading}
        searchable={false}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('managerDashboard.executeCommissionPayout')}>
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            payoutMutation.mutate();
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
          <FormField label={t('table.description')}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={payoutMutation.isPending}>
              {t('salesRepresentativesReports.executePayout')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
