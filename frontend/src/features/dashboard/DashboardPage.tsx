import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Input';

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface Summary {
  dailySales: number;
  dailyPurchases: number;
  cashBalance: number;
  bankBalance: number;
  profitToday: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingCustomerBalances: number;
  inventoryValue: number;
}

interface PartnersBalances {
  total: number;
}

interface WhatsAppOutboxMessage {
  id: string;
  messageType: 'ADMIN_DAILY_REPORT' | 'CUSTOMER_REMINDER';
  recipientLabel: string;
  content: string;
  createdAt: string;
}

function money(n: number): string {
  return formatAmount(n);
}

export function DashboardPage() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress } = useActiveCompany();

  // Printing Press only — "تصفية حسب الفرع"; empty string means every branch (الإجمالي / جميع الفروع).
  const [branchFilter, setBranchFilter] = useState('');
  const effectiveBranchId = isPrintingPress && branchFilter ? branchFilter : undefined;

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  // No branchId param keeps the exact same cache key (and cached data) as every other screen that
  // reads this same summary (Partners, Treasury) when "الإجمالي / جميع الفروع" is selected — only
  // picking an actual branch splits off into its own, separately-cached filtered request.
  const summaryQuery = useQuery({
    queryKey: effectiveBranchId ? ['dashboard-summary', companyId, effectiveBranchId] : ['dashboard-summary', companyId],
    queryFn: () =>
      unwrap<Summary>(apiClient.get('/dashboard/summary', { params: { companyId, branchId: effectiveBranchId } })),
    enabled: !!companyId,
  });

  // Same query key/reasoning as the Partners > Contributions screen's own fetch of this endpoint
  // — shared cache entry (and thus always-matching numbers) whenever no branch filter is applied.
  const partnersBalancesQuery = useQuery({
    queryKey: effectiveBranchId
      ? ['partners-balances', companyId, effectiveBranchId]
      : ['partners-balances', companyId],
    queryFn: () =>
      unwrap<PartnersBalances>(
        apiClient.get('/treasury/partners-balances', { params: { companyId, branchId: effectiveBranchId } }),
      ),
    enabled: !!companyId,
  });

  const salesChartQuery = useQuery({
    queryKey: ['dashboard-sales-chart'],
    queryFn: () => unwrap<{ date: string; total: number }[]>(apiClient.get('/dashboard/charts/sales')),
  });

  const topProductsQuery = useQuery({
    queryKey: ['dashboard-top-products'],
    queryFn: () =>
      unwrap<{ productId: string; name: string; totalQuantity: number; totalRevenue: number }[]>(
        apiClient.get('/dashboard/top-selling-products'),
      ),
  });

  const recentTxQuery = useQuery({
    queryKey: ['dashboard-recent-tx'],
    queryFn: () =>
      unwrap<{ type: string; documentNumber: string; date: string; amount: number }[]>(
        apiClient.get('/dashboard/recent-transactions'),
      ),
  });

  const whatsappOutboxQuery = useQuery({
    queryKey: ['whatsapp-outbox', companyId],
    queryFn: () => unwrap<WhatsAppOutboxMessage[]>(apiClient.get('/whatsapp/outbox', { params: { companyId } })),
    enabled: !!companyId,
  });

  const s = summaryQuery.data;

  const treasuryBalance = (s?.cashBalance ?? 0) + (s?.bankBalance ?? 0);

  // الرصيد المالي = إجمالي رصيد الخزينة (نقدي + بنك) + أرصدة العملاء المستحقة — total current + owed
  // financial assets. Both read live off the same summary fetch as every other KPI here, so this
  // stays in lockstep with them automatically; there is no separate/cached figure that could ever
  // drift out of sync.
  const financialBalance = treasuryBalance + (s?.outstandingCustomerBalances ?? 0);

  const kpis: Array<{ label: string; value: string; tone?: string; to?: string }> = [
    // Row 1: daily/monthly operating activity.
    { label: t('dashboard.dailySales'), value: money(s?.dailySales ?? 0) },
    { label: t('dashboard.dailyPurchases'), value: money(s?.dailyPurchases ?? 0) },
    { label: t('dashboard.profitToday'), value: money(s?.profitToday ?? 0) },
    { label: t('dashboard.monthlyRevenue'), value: money(s?.monthlyRevenue ?? 0) },
    { label: t('dashboard.monthlyExpenses'), value: money(s?.monthlyExpenses ?? 0) },
    // Row 2: assets and financial liquidity.
    { label: t('dashboard.inventoryValue'), value: money(s?.inventoryValue ?? 0) },
    // Same figure, same source (getBalance(BANK)), as TreasuryTransactionsPage's own "رصيد البنك"
    // card — showing the combined cash+bank total here under this label was the bug: two screens
    // both titled "Bank Balance" disagreeing because one silently meant something else.
    { label: t('dashboard.cashBalance'), value: money(s?.bankBalance ?? 0), to: '/treasury/transactions' },
    // Printing Press has no customer-receivables management (see RequireNotPrintingPress on
    // /customers) — its own cash-only treasury figure is more useful here than a balance that's
    // always zero for this tenant.
    isPrintingPress
      ? {
          label: t('dashboard.printingPressCashTreasury'),
          value: money(s?.cashBalance ?? 0),
          to: '/treasury/transactions',
        }
      : { label: t('dashboard.outstandingCustomers'), value: money(s?.outstandingCustomerBalances ?? 0) },
    { label: t('dashboard.financialBalance'), value: money(financialBalance) },
    { label: t('partners.totalContribution'), value: money(partnersBalancesQuery.data?.total ?? 0), to: '/partners' },
  ];

  return (
    <div>
      {isPrintingPress ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
          <h1 className="text-xl font-semibold">{t('nav.dashboard')}</h1>
          <div className="flex items-center gap-2">
            <label className="whitespace-nowrap text-sm text-[var(--text-muted)]">
              {t('dashboard.branchFilter')}
            </label>
            <Select
              className="w-48"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              <option value="">{t('accounting.allBranches')}</option>
              {(branchesQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : (
        <PageHeader title={t('nav.dashboard')} />
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) =>
          k.to ? (
            <Link key={k.label} to={k.to} className="block transition-shadow hover:shadow-md">
              <Card className="cursor-pointer">
                <div className="text-xs text-[var(--text-muted)]">{k.label}</div>
                <div className="mt-1 text-lg font-semibold">{k.value}</div>
              </Card>
            </Link>
          ) : (
            <Card key={k.label}>
              <div className="text-xs text-[var(--text-muted)]">{k.label}</div>
              <div className="mt-1 text-lg font-semibold">{k.value}</div>
            </Card>
          ),
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.salesChart')}</CardTitle>
          </CardHeader>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartQuery.data ?? []}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.topSellingProducts')}</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-sm">
            {(topProductsQuery.data ?? []).map((p) => (
              <li key={p.productId} className="flex items-center justify-between">
                <span className="truncate">{p.name}</span>
                <span className="text-[var(--text-muted)]">{p.totalQuantity}</span>
              </li>
            ))}
            {(topProductsQuery.data ?? []).length === 0 && (
              <li className="text-[var(--text-muted)]">{t('common.noData')}</li>
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentTransactions')}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="app-table">
            <thead>
              <tr>
                <th>{t('common.type')}</th>
                <th>{t('table.documentNumber')}</th>
                <th>{t('common.date')}</th>
                <th>{t('fields.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {(recentTxQuery.data ?? []).map((tx, i) => (
                <tr key={i}>
                  <td className="text-[var(--text-muted)]">{tx.type}</td>
                  <td className="font-medium">{tx.documentNumber}</td>
                  <td className="text-[var(--text-muted)]">{tx.date}</td>
                  <td>{money(tx.amount)}</td>
                </tr>
              ))}
              {(recentTxQuery.data ?? []).length === 0 && (
                <tr>
                  <td className="text-[var(--text-muted)]" colSpan={4}>
                    {t('common.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t('dashboard.whatsappOutbox')}</CardTitle>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
              {t('dashboard.whatsappOutboxPlaceholder')}
            </span>
          </div>
        </CardHeader>
        <ul className="space-y-3 text-sm">
          {(whatsappOutboxQuery.data ?? []).map((m) => (
            <li key={m.id} className="rounded-lg border border-[var(--border)] p-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{m.recipientLabel}</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 whitespace-pre-line">{m.content}</p>
            </li>
          ))}
          {(whatsappOutboxQuery.data ?? []).length === 0 && (
            <li className="text-[var(--text-muted)]">{t('common.noData')}</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
