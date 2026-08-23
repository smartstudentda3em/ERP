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

/** Icon-badge background per KPI card — purely a visual grouping cue (revenue-ish vs cost-ish vs
 * neutral-balance figures), not tied to any business meaning beyond that. */
const KPI_TONE_CLASSES: Record<string, string> = {
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  purple: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
};

export function DashboardPage() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress, isStationery, isAirConditioning } = useActiveCompany();
  // Stationery and Air Conditioning only — adds an "الأصول" (Assets) card to the top row and
  // reorders/relabels the second row into exactly [bank, cash, financial balance, outstanding
  // customers], while keeping the existing inventory-value and partners-contribution cards
  // alongside them. Press's own layout (and any other future company's) is untouched.
  const showAssetCards = isStationery || isAirConditioning;

  // Printing Press, Stationery, and Air Conditioning — "تصفية حسب الفرع". A non-empty sentinel
  // (never ''), same trick SalesReportPage's own branch filter uses and for the exact same reason:
  // the shared Select component auto-fires onChange the moment a dropdown's real option list
  // resolves to exactly one choice while its value is still '' (see Input.tsx's Select) — meant for
  // data-entry fields with one obviously-correct choice, not for a view filter. A company with only
  // one branch would otherwise have this filter silently jump from "كل الفروع" to that one branch on
  // page load, narrowing every card here (e.g. "مصروفات الشهر") away from unassigned/branch-less
  // records (branchId IS NULL) without the user ever choosing a branch — exactly what made a real
  // expense recorded with no branch picked vanish from the Dashboard while still showing in
  // "المصروفات".
  const hasBranchFilter = isPrintingPress || isStationery || isAirConditioning;
  const ALL_BRANCHES = 'all';
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);
  const effectiveBranchId = hasBranchFilter && branchFilter !== ALL_BRANCHES ? branchFilter : undefined;

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: hasBranchFilter && !!companyId,
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

  // Same branchId/query-key pattern as summaryQuery above — so the chart's total for a given day
  // always matches "إيرادات الشهر" and the Sales Invoices log for whichever branch is selected.
  const salesChartQuery = useQuery({
    queryKey: effectiveBranchId
      ? ['dashboard-sales-chart', companyId, effectiveBranchId]
      : ['dashboard-sales-chart', companyId],
    queryFn: () =>
      unwrap<{ date: string; total: number }[]>(
        apiClient.get('/dashboard/charts/sales', { params: { branchId: effectiveBranchId } }),
      ),
    enabled: !!companyId,
  });

  const topProductsQuery = useQuery({
    queryKey: effectiveBranchId
      ? ['dashboard-top-products', companyId, effectiveBranchId]
      : ['dashboard-top-products', companyId],
    queryFn: () =>
      unwrap<{ productId: string; name: string; totalQuantity: number; totalRevenue: number }[]>(
        apiClient.get('/dashboard/top-selling-products', { params: { branchId: effectiveBranchId } }),
      ),
    enabled: !!companyId,
  });

  const recentTxQuery = useQuery({
    queryKey: effectiveBranchId
      ? ['dashboard-recent-tx', companyId, effectiveBranchId]
      : ['dashboard-recent-tx', companyId],
    queryFn: () =>
      unwrap<{ type: string; documentNumber: string; date: string; amount: number }[]>(
        apiClient.get('/dashboard/recent-transactions', { params: { branchId: effectiveBranchId } }),
      ),
    enabled: !!companyId,
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

  const kpis: Array<{ label: string; value: string; icon: string; tone: string; to?: string }> = [
    // Row 1: daily/monthly operating activity.
    { label: t('dashboard.dailySales'), value: money(s?.dailySales ?? 0), icon: '💰', tone: 'primary' },
    { label: t('dashboard.dailyPurchases'), value: money(s?.dailyPurchases ?? 0), icon: '🛒', tone: 'amber' },
    { label: t('dashboard.profitToday'), value: money(s?.profitToday ?? 0), icon: '📈', tone: 'green' },
    { label: t('dashboard.monthlyRevenue'), value: money(s?.monthlyRevenue ?? 0), icon: '💵', tone: 'green' },
    { label: t('dashboard.monthlyExpenses'), value: money(s?.monthlyExpenses ?? 0), icon: '💸', tone: 'amber' },
    // Stationery/AC only — total company assets (same formula as PartnersPage's "الأصول" tab:
    // inventory + cash + bank), placed at the end of the top row.
    ...(showAssetCards
      ? [
          {
            label: t('dashboard.assets'),
            value: money(treasuryBalance + (s?.inventoryValue ?? 0)),
            icon: '🏢',
            tone: 'purple',
          },
        ]
      : []),
    // Row 2: assets and financial liquidity.
    { label: t('dashboard.inventoryValue'), value: money(s?.inventoryValue ?? 0), icon: '📦', tone: 'purple' },
    ...(showAssetCards
      ? [
          {
            label: t('dashboard.bankBalance'),
            value: money(s?.bankBalance ?? 0),
            icon: '🏦',
            tone: 'teal',
            to: '/treasury/transactions',
          },
          {
            label: t('dashboard.cashTreasuryBalance'),
            value: money(s?.cashBalance ?? 0),
            icon: '🪙',
            tone: 'teal',
            to: '/treasury/transactions',
          },
          {
            label: t('dashboard.outstandingCustomers'),
            value: money(s?.outstandingCustomerBalances ?? 0),
            icon: '👥',
            tone: 'primary',
          },
          { label: t('dashboard.financialBalance'), value: money(financialBalance), icon: '⚖️', tone: 'primary' },
        ]
      : [
          // Same figure, same source (getBalance(BANK)), as TreasuryTransactionsPage's own "رصيد
          // البنك" card — showing the combined cash+bank total here under this label was the bug:
          // two screens both titled "Bank Balance" disagreeing because one silently meant
          // something else.
          {
            label: t('dashboard.cashBalance'),
            value: money(s?.bankBalance ?? 0),
            icon: '🏦',
            tone: 'teal',
            to: '/treasury/transactions',
          },
          // Printing Press has no customer-receivables management (see RequireNotPrintingPress on
          // /customers) — its own cash-only treasury figure is more useful here than a balance
          // that's always zero for this tenant.
          isPrintingPress
            ? {
                label: t('dashboard.printingPressCashTreasury'),
                value: money(s?.cashBalance ?? 0),
                icon: '🪙',
                tone: 'teal',
                to: '/treasury/transactions',
              }
            : {
                label: t('dashboard.outstandingCustomers'),
                value: money(s?.outstandingCustomerBalances ?? 0),
                icon: '👥',
                tone: 'primary',
              },
          { label: t('dashboard.financialBalance'), value: money(financialBalance), icon: '⚖️', tone: 'primary' },
        ]),
    {
      label: t('partners.totalContribution'),
      value: money(partnersBalancesQuery.data?.total ?? 0),
      icon: '🤝',
      tone: 'purple',
      to: '/partners',
    },
  ];

  return (
    <div>
      {hasBranchFilter ? (
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
              <option value={ALL_BRANCHES}>{t('accounting.allBranches')}</option>
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

      <div className={`mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 ${showAssetCards ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        {kpis.map((k) => {
          const card = (
            <Card
              className={`h-full rounded-2xl shadow-sm transition-shadow ${k.to ? 'cursor-pointer hover:shadow-md' : ''}`}
            >
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${KPI_TONE_CLASSES[k.tone]}`}
                >
                  {k.icon}
                </span>
                <span className="truncate">{k.label}</span>
              </div>
              <div className="mt-2.5 truncate text-lg font-bold tracking-tight">{k.value}</div>
            </Card>
          );
          return k.to ? (
            <Link key={k.label} to={k.to} className="block">
              {card}
            </Link>
          ) : (
            <div key={k.label}>{card}</div>
          );
        })}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <span>📊</span> {t('dashboard.salesChart')}
            </CardTitle>
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
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} fill="url(#salesFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <span>🏆</span> {t('dashboard.topSellingProducts')}
            </CardTitle>
          </CardHeader>
          <ul className="space-y-1">
            {(topProductsQuery.data ?? []).map((p, i) => (
              <li key={p.productId} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-[var(--table-header-bg)]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[10px] font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 font-medium text-[var(--text-muted)]">{formatAmount(p.totalQuantity)}</span>
              </li>
            ))}
            {(topProductsQuery.data ?? []).length === 0 && (
              <li className="text-sm text-[var(--text-muted)]">{t('common.noData')}</li>
            )}
          </ul>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <span>🧾</span> {t('dashboard.recentTransactions')}
          </CardTitle>
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
                  <td>
                    <span className="rounded-full bg-[var(--table-header-bg)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                      {tx.type}
                    </span>
                  </td>
                  <td className="font-medium">{tx.documentNumber}</td>
                  <td className="text-[var(--text-muted)]">{tx.date}</td>
                  <td className="font-semibold">{money(tx.amount)}</td>
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

      <Card className="mt-6 rounded-2xl shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-1.5">
              <span>💬</span> {t('dashboard.whatsappOutbox')}
            </CardTitle>
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
              {t('dashboard.whatsappOutboxPlaceholder')}
            </span>
          </div>
        </CardHeader>
        <ul className="space-y-3 text-sm">
          {(whatsappOutboxQuery.data ?? []).map((m) => (
            <li key={m.id} className="rounded-xl border border-[var(--border)] p-3 transition-colors hover:bg-[var(--table-header-bg)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="font-medium">{m.recipientLabel}</span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-line leading-relaxed">{m.content}</p>
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
