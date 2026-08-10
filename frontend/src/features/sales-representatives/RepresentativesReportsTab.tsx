import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange } from '../../components/ui/DateRangeFilter';
import { Badge, statusColor } from '../../components/ui/Badge';
import { useActiveCompany } from '../../lib/use-active-company';

interface RepReportRow {
  representativeId: string;
  representativeName: string;
  salesVolume: number;
  collectedAmount: number;
}

interface RepInvoiceRow {
  id: string;
  documentNumber: string;
  invoiceDate: string;
  grandTotal: number;
  status: string;
  customerName: string;
}

interface RepReceiptRow {
  id: string;
  documentNumber: string;
  paymentDate: string;
  amount: number;
  method: string;
  customerName: string;
}

interface QuarterlyTrendPeriod {
  year: number;
  quarter: number;
  salesVolume: number;
  collectedAmount: number;
}

interface ManagerProfitabilityRow {
  representativeId: string;
  representativeName: string;
  branchName: string | null;
  salesVolume: number;
  netProfit: number;
  profitMargin: number;
}

interface BranchCommissionRow {
  branchId: string;
  branchName: string | null;
  managerId: string | null;
  managerName: string | null;
  totalSales: number;
  commissionRate: number;
  commissionAmount: number;
}

type ComparisonTab = 'sales' | 'profitability';
type SortDir = 'asc' | 'desc';

// Distinct, colorblind-friendly colors for the 3 comparison years — oldest to newest, so the
// current (selected) year always renders in the same brand blue used by the sales-volume chart
// above it, and the two prior years fade into cooler tones for a clear visual hierarchy.
const YEAR_COLORS = ['#a855f7', '#f59e0b', '#3b82f6'];

function money(n: number): string {
  return formatAmount(n);
}

/** 1-4 for a quarter, 0 for the full calendar year. */
export type ReportsQuarter = 0 | 1 | 2 | 3 | 4;
type DetailTab = 'invoices' | 'receipts';

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors quarterDateRange() elsewhere in the app. `quarter` 0 means the full year (Jan1–Dec31). */
function quarterDateRange(year: number, quarter: ReportsQuarter): { dateFrom: string; dateTo: string } {
  if (quarter === 0) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

const chartTooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  fontSize: 13,
};

interface RepresentativesReportsTabProps {
  /** Lifted up to SalesRepresentativesPage so the manager-select and year/quarter controls can
   * render inline with the page's own tab bar instead of inside this tab's own filter row.
   * customRange stays lifted too, purely so both this component and the parent's year/quarter
   * controls agree on whether the quick filter is currently overridden. */
  representativeId: string;
  year: number;
  quarter: ReportsQuarter;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
}

export function RepresentativesReportsTab({
  representativeId,
  year,
  quarter,
  customRange,
  onCustomRangeChange,
}: RepresentativesReportsTabProps) {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [detailTab, setDetailTab] = useState<DetailTab>('invoices');
  const [comparisonTab, setComparisonTab] = useState<ComparisonTab>('sales');
  const [salesSortDir, setSalesSortDir] = useState<SortDir>('desc');

  // A fully-specified custom range takes over from the year/quarter quick filter — clearing it
  // (the DateRangeFilter's own "إعادة ضبط" button) falls straight back to quarter mode.
  const hasCustomRange = !!customRange.from && !!customRange.to;
  const { dateFrom, dateTo } = useMemo(
    () => (hasCustomRange ? { dateFrom: customRange.from, dateTo: customRange.to } : quarterDateRange(year, quarter)),
    [hasCustomRange, customRange, year, quarter],
  );

  const reportQuery = useQuery({
    queryKey: ['sales-representatives-report', companyId, dateFrom, dateTo, representativeId],
    queryFn: () =>
      unwrap<RepReportRow[]>(
        apiClient.get('/sales-representatives/reports/summary', {
          params: { companyId, dateFrom, dateTo, representativeId: representativeId || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const invoicesQuery = useQuery({
    queryKey: ['sales-representatives-report-invoices', companyId, dateFrom, dateTo, representativeId],
    queryFn: () =>
      unwrap<RepInvoiceRow[]>(
        apiClient.get('/sales-representatives/reports/invoices', {
          params: { companyId, dateFrom, dateTo, representativeId: representativeId || undefined },
        }),
      ),
    enabled: !!companyId && detailTab === 'invoices',
  });

  const receiptsQuery = useQuery({
    queryKey: ['sales-representatives-report-receipts', companyId, dateFrom, dateTo, representativeId],
    queryFn: () =>
      unwrap<RepReceiptRow[]>(
        apiClient.get('/sales-representatives/reports/receipts', {
          params: { companyId, dateFrom, dateTo, representativeId: representativeId || undefined },
        }),
      ),
    // Printing Press drops "سندات القبض" from this screen entirely — see the detail-tabs section
    // below, which never lets detailTab become 'receipts' for Press.
    enabled: !!companyId && !isPrintingPress && detailTab === 'receipts',
  });

  // Printing Press only — the quarterly/YoY comparison chart only makes sense once the user has
  // narrowed down to one specific quarter (not "السنة كاملة" or a free-form custom range), since
  // "compare this quarter against the previous one / the same quarter last year" is undefined
  // otherwise.
  const showQuarterlyComparison = isPrintingPress && !hasCustomRange && quarter >= 1 && quarter <= 4;
  const quarterlyTrendQuery = useQuery({
    queryKey: ['sales-representatives-quarterly-trend', companyId, year, quarter, representativeId],
    queryFn: () =>
      unwrap<{ periods: QuarterlyTrendPeriod[]; earliestYear: number }>(
        apiClient.get('/sales-representatives/reports/quarterly-trend', {
          params: { companyId, year, quarter, representativeId: representativeId || undefined },
        }),
      ),
    enabled: !!companyId && showQuarterlyComparison,
  });

  // Printing Press only — comparing "all managers" only makes sense when the manager filter above
  // is left on "جميع مدراء الفروع"; picking one specific manager leaves nothing to compare against.
  const showManagersComparison = isPrintingPress && !representativeId;
  const profitabilityQuery = useQuery({
    queryKey: ['sales-representatives-profitability', companyId, dateFrom, dateTo],
    queryFn: () =>
      unwrap<ManagerProfitabilityRow[]>(
        apiClient.get('/sales-representatives/reports/profitability', {
          params: { companyId, dateFrom, dateTo },
        }),
      ),
    enabled: !!companyId && showManagersComparison,
  });

  // Printing Press only — commission is attributed to whichever manager the branch itself is
  // assigned to (see backend getBranchManagersCommission), never to whoever actually created each
  // invoice, so this table stays independent of the "representativeId" filter above.
  const commissionQuery = useQuery({
    queryKey: ['sales-representatives-branch-commissions', companyId, dateFrom, dateTo],
    queryFn: () =>
      unwrap<BranchCommissionRow[]>(
        apiClient.get('/sales-representatives/reports/branch-commissions', {
          params: { companyId, dateFrom, dateTo },
        }),
      ),
    enabled: !!companyId && isPrintingPress,
  });
  const commissionRows = commissionQuery.data ?? [];
  const totalCommissionAmount = useMemo(
    () => commissionRows.reduce((sum, r) => sum + Number(r.commissionAmount ?? 0), 0),
    [commissionRows],
  );

  const trendPeriods = quarterlyTrendQuery.data?.periods ?? [];
  const findTrendPeriod = (y: number, q: number) => trendPeriods.find((p) => p.year === y && p.quarter === q);

  // Never draws a comparison year that predates the company's actual first activity (its first
  // sales invoice, per the backend's earliestYear) — a press that only started operating in 2026
  // never gets fabricated 2024/2025 bars or legend entries.
  const earliestActivityYear = quarterlyTrendQuery.data?.earliestYear ?? year;
  const comparisonYears = [year - 2, year - 1, year].filter((y) => y >= earliestActivityYear);

  // One bar-chart row per same-year quarter up to the selected one; each row carries a value per
  // comparison year, left undefined (so no bar is drawn) everywhere except the selected quarter's
  // own row, where all three years actually have data.
  const quarterlyChartRows = useMemo(() => {
    if (!showQuarterlyComparison) return [];
    return Array.from({ length: quarter }, (_, i) => i + 1).map((q) => {
      const row: Record<string, number | string> = {
        quarterLabel: t('salesRepresentativesReports.quarterShort', { quarter: q }),
      };
      for (const y of comparisonYears) {
        const value = findTrendPeriod(y, q)?.salesVolume;
        if (value !== undefined) row[String(y)] = value;
      }
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriods, showQuarterlyComparison, quarter, year, earliestActivityYear]);

  const currentPeriod = findTrendPeriod(year, quarter);
  const previousQuarterPeriod = quarter > 1 ? findTrendPeriod(year, quarter - 1) : findTrendPeriod(year - 1, 4);
  const sameQuarterLastYearPeriod = findTrendPeriod(year - 1, quarter);

  function pctChange(current?: number, previous?: number): number | null {
    if (current === undefined || previous === undefined || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }

  const vsPreviousQuarterPct = pctChange(currentPeriod?.salesVolume, previousQuarterPeriod?.salesVolume);
  const vsSameQuarterLastYearPct = pctChange(currentPeriod?.salesVolume, sameQuarterLastYearPeriod?.salesVolume);

  function ChangeBadge({ label, pct }: { label: string; pct: number | null }) {
    const color = pct === null ? 'text-[var(--text-muted)]' : pct > 0 ? 'text-green-600' : pct < 0 ? 'text-red-600' : 'text-[var(--text-muted)]';
    const arrow = pct === null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
    return (
      <Card>
        <div className="text-xs text-[var(--text-muted)]">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${color}`}>
          {pct === null ? '—' : `${arrow} ${formatAmount(Math.abs(pct))}%`}
        </div>
      </Card>
    );
  }

  const rows = reportQuery.data ?? [];
  const totalSalesVolume = useMemo(() => rows.reduce((sum, r) => sum + Number(r.salesVolume ?? 0), 0), [rows]);
  const totalCollected = useMemo(() => rows.reduce((sum, r) => sum + Number(r.collectedAmount ?? 0), 0), [rows]);

  const salesComparisonRows = useMemo(
    () => [...rows].sort((a, b) => (salesSortDir === 'asc' ? a.salesVolume - b.salesVolume : b.salesVolume - a.salesVolume)),
    [rows, salesSortDir],
  );

  const profitabilityRows = profitabilityQuery.data ?? [];
  const topSellingManager = useMemo(
    () => rows.reduce<RepReportRow | null>((best, r) => (!best || r.salesVolume > best.salesVolume ? r : best), null),
    [rows],
  );
  const mostProfitableManager = useMemo(
    () =>
      profitabilityRows.reduce<ManagerProfitabilityRow | null>(
        (best, r) => (!best || r.netProfit > best.netProfit ? r : best),
        null,
      ),
    [profitabilityRows],
  );
  const avgProfitMargin = useMemo(
    () =>
      profitabilityRows.length === 0
        ? null
        : profitabilityRows.reduce((sum, r) => sum + r.profitMargin, 0) / profitabilityRows.length,
    [profitabilityRows],
  );

  const invoiceColumns: Column<RepInvoiceRow>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.customerName'), accessor: (r) => r.customerName },
    { header: t('common.date'), accessor: (r) => r.invoiceDate },
    { header: t('fields.grandTotal'), accessor: (r) => money(r.grandTotal), align: 'right' },
    {
      header: t('common.status'),
      accessor: (r) => <Badge color={statusColor(r.status)}>{t(`docStatus.${r.status}`, r.status)}</Badge>,
    },
  ];

  const commissionColumns: Column<BranchCommissionRow>[] = [
    { header: t('salesRepresentativesReports.branch'), accessor: (r) => r.branchName ?? '—' },
    { header: t('salesRepresentativesReports.branchManager'), accessor: (r) => r.managerName ?? '—' },
    { header: t('salesRepresentativesReports.branchTotalSales'), accessor: (r) => money(r.totalSales), align: 'right' },
    {
      header: t('fields.commissionRate'),
      accessor: (r) => `${formatAmount(r.commissionRate)}%`,
      align: 'right',
    },
    {
      header: t('salesRepresentativesReports.commissionAmountDue'),
      accessor: (r) => <span className="font-semibold text-green-600">{money(r.commissionAmount)}</span>,
      align: 'right',
    },
  ];

  const receiptColumns: Column<RepReceiptRow>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.customerName'), accessor: (r) => r.customerName },
    { header: t('common.date'), accessor: (r) => r.paymentDate },
    { header: t('fields.paidAmount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('fields.method'), accessor: (r) => t(`paymentMethod.${r.method}`, r.method) },
  ];

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1 text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.customDateRange')}</div>
        <DateRangeFilter value={customRange} onChange={onCustomRangeChange} />
      </div>

      {/* Printing Press drops "إجمالي المبالغ المحصلة" and its collection chart entirely — this
          screen only tracks sales volume for that tenant, not receivables collection. */}
      <div className={`mb-4 grid grid-cols-1 gap-4 ${isPrintingPress ? '' : 'sm:grid-cols-2'}`}>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalSalesVolume')}</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{money(totalSalesVolume)}</div>
        </Card>
        {!isPrintingPress && (
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCollected')}</div>
            <div className="mt-1 text-2xl font-semibold text-green-600">{money(totalCollected)}</div>
          </Card>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isPrintingPress ? '' : 'lg:grid-cols-2'}`}>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t('salesRepresentativesReports.salesVolumeChartTitle')}</CardTitle>
          </CardHeader>
          <div className="h-80">
            {rows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                {t('salesRepresentativesReports.noData')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
                  <defs>
                    <linearGradient id="salesVolumeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis
                    dataKey="representativeName"
                    tick={{ fontSize: 11 }}
                    label={{ value: t(isPrintingPress ? 'salesRepresentativesReports.representativeAxisLabelPress' : 'salesRepresentativesReports.representativeAxisLabel'), position: 'insideBottom', offset: -16, style: { fontSize: 12 } }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    label={{ value: t('salesRepresentativesReports.amountAxisLabel'), angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
                  />
                  <Tooltip
                    formatter={(value: number) => [money(value), t('salesRepresentativesReports.amountAxisLabel')]}
                    contentStyle={chartTooltipStyle}
                    cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                  />
                  <Bar dataKey="salesVolume" fill="url(#salesVolumeFill)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {!isPrintingPress && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t('salesRepresentativesReports.collectedChartTitle')}</CardTitle>
            </CardHeader>
            <div className="h-80">
              {rows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  {t('salesRepresentativesReports.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
                    <defs>
                      <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.6} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                    <XAxis
                      dataKey="representativeName"
                      tick={{ fontSize: 11 }}
                      label={{ value: t('salesRepresentativesReports.representativeAxisLabel'), position: 'insideBottom', offset: -16, style: { fontSize: 12 } }}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      label={{ value: t('salesRepresentativesReports.amountAxisLabel'), angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
                    />
                    <Tooltip
                      formatter={(value: number) => [money(value), t('salesRepresentativesReports.amountAxisLabel')]}
                      contentStyle={chartTooltipStyle}
                      cursor={{ fill: 'rgba(34,197,94,0.08)' }}
                    />
                    <Bar dataKey="collectedAmount" fill="url(#collectedFill)" radius={[8, 8, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        )}
      </div>

      {showQuarterlyComparison && (
        <div className="mt-8">
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChangeBadge label={t('salesRepresentativesReports.vsPreviousQuarter')} pct={vsPreviousQuarterPct} />
            <ChangeBadge label={t('salesRepresentativesReports.vsSameQuarterLastYear')} pct={vsSameQuarterLastYearPct} />
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t('salesRepresentativesReports.quarterlyComparisonTitle')}</CardTitle>
              <div className="text-xs text-[var(--text-muted)]">
                {t('salesRepresentativesReports.quarterlyComparisonSubtitle', { year })}
              </div>
            </CardHeader>
            <div className="h-96">
              {quarterlyChartRows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                  {t('salesRepresentativesReports.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quarterlyChartRows} margin={{ top: 8, right: 16, bottom: 32, left: 36 }}>
                    {/* Light Y-axis-only gridlines — enough to guide the eye across bar heights
                        without competing with the bars themselves. */}
                    <CartesianGrid strokeDasharray="3 3" opacity={0.35} vertical={false} />
                    {/* Legend moved to the top, above the plot area, with its own reserved height
                        and generous icon/text spacing — keeps it clear of the axis labels below
                        and gives the year/quarter key a clean, independent strip of its own. */}
                    <Legend
                      verticalAlign="top"
                      align="center"
                      height={36}
                      iconType="circle"
                      iconSize={11}
                      wrapperStyle={{ fontSize: 13, paddingBottom: 12 }}
                    />
                    <XAxis
                      dataKey="quarterLabel"
                      tick={{ fontSize: 12 }}
                      tickMargin={8}
                      label={{ value: t('salesRepresentativesReports.quarterlyAxisLabel'), position: 'insideBottom', offset: -20, style: { fontSize: 13 } }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickMargin={6}
                      width={48}
                      label={{ value: t('salesRepresentativesReports.amountAxisLabel'), angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 13, textAnchor: 'middle' } }}
                    />
                    <Tooltip formatter={(value: number) => [money(value), t('salesRepresentativesReports.amountAxisLabel')]} contentStyle={chartTooltipStyle} />
                    {comparisonYears.map((y, i) => (
                      <Bar key={y} dataKey={String(y)} name={String(y)} fill={YEAR_COLORS[i]} radius={[6, 6, 0, 0]} maxBarSize={40} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}

      {showManagersComparison && (
        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('salesRepresentativesReports.managersComparisonTitle')}</h2>
            <div className="flex gap-2 text-sm">
              <button
                className={`rounded-lg px-3 py-1.5 ${comparisonTab === 'sales' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
                onClick={() => setComparisonTab('sales')}
              >
                {t('salesRepresentativesReports.compareSalesTab')}
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 ${comparisonTab === 'profitability' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
                onClick={() => setComparisonTab('profitability')}
              >
                {t('salesRepresentativesReports.compareProfitabilityTab')}
              </button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.topSellingManager')}</div>
              <div className="mt-1 text-lg font-semibold">{topSellingManager?.representativeName ?? '—'}</div>
              <div className="text-xs text-[var(--text-muted)]">{topSellingManager ? money(topSellingManager.salesVolume) : ''}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.mostProfitableManager')}</div>
              <div className="mt-1 text-lg font-semibold">{mostProfitableManager?.representativeName ?? '—'}</div>
              <div className="text-xs text-[var(--text-muted)]">{mostProfitableManager ? money(mostProfitableManager.netProfit) : ''}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.avgProfitMargin')}</div>
              <div className="mt-1 text-lg font-semibold">{avgProfitMargin === null ? '—' : `${formatAmount(avgProfitMargin)}%`}</div>
            </Card>
          </div>

          <Card className="shadow-sm">
            {comparisonTab === 'sales' ? (
              <>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{t('salesRepresentativesReports.compareSalesTab')}</CardTitle>
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                      onClick={() => setSalesSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    >
                      {salesSortDir === 'asc'
                        ? `↑ ${t('salesRepresentativesReports.sortAscending')}`
                        : `↓ ${t('salesRepresentativesReports.sortDescending')}`}
                    </button>
                  </div>
                </CardHeader>
                <div className="h-80">
                  {salesComparisonRows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                      {t('salesRepresentativesReports.noData')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesComparisonRows} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                        <XAxis
                          dataKey="representativeName"
                          tick={{ fontSize: 11 }}
                          label={{ value: t('salesRepresentativesReports.representativeAxisLabelPress'), position: 'insideBottom', offset: -16, style: { fontSize: 12 } }}
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          label={{ value: t('salesRepresentativesReports.amountAxisLabel'), angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
                        />
                        <Tooltip formatter={(value: number) => [money(value), t('salesRepresentativesReports.amountAxisLabel')]} contentStyle={chartTooltipStyle} />
                        <Bar dataKey="salesVolume" fill="#3b82f6" radius={[8, 8, 0, 0]} maxBarSize={56} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>
            ) : (
              <>
                <CardHeader>
                  <CardTitle>{t('salesRepresentativesReports.compareProfitabilityTab')}</CardTitle>
                </CardHeader>
                <div className="h-80">
                  {profitabilityRows.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                      {t('salesRepresentativesReports.noData')}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={profitabilityRows} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                        <XAxis
                          dataKey="representativeName"
                          tick={{ fontSize: 11 }}
                          label={{ value: t('salesRepresentativesReports.representativeAxisLabelPress'), position: 'insideBottom', offset: -16, style: { fontSize: 12 } }}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 11 }}
                          label={{ value: t('salesRepresentativesReports.netProfitAxisLabel'), angle: -90, position: 'insideLeft', style: { fontSize: 12, textAnchor: 'middle' } }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 11 }}
                          label={{ value: t('salesRepresentativesReports.profitMarginAxisLabel'), angle: 90, position: 'insideRight', style: { fontSize: 12, textAnchor: 'middle' } }}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            name === t('salesRepresentativesReports.profitMarginLegend') ? `${formatAmount(value)}%` : money(value),
                            name,
                          ]}
                          contentStyle={chartTooltipStyle}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          yAxisId="left"
                          dataKey="netProfit"
                          name={t('salesRepresentativesReports.netProfitLegend')}
                          fill="#22c55e"
                          radius={[8, 8, 0, 0]}
                          maxBarSize={56}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="profitMargin"
                          name={t('salesRepresentativesReports.profitMarginLegend')}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {isPrintingPress && (
        <div className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('salesRepresentativesReports.branchCommissionsTitle')}</h2>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('salesRepresentativesReports.totalCommissionsDue')}</div>
              <div className="mt-1 text-lg font-semibold text-green-600">{money(totalCommissionAmount)}</div>
            </Card>
          </div>
          <DataTable
            columns={commissionColumns}
            data={commissionRows}
            keyField={(r) => r.branchId}
            isLoading={commissionQuery.isLoading}
            searchable={false}
          />
        </div>
      )}

      {/* Printing Press drops "سندات القبض" entirely — the tab switcher below never renders for
          that tenant, so detailTab can never leave its 'invoices' default there either. */}
      {!isPrintingPress && (
        <div className="mb-3 mt-8 flex gap-2 text-sm">
          <button
            className={`rounded-lg px-3 py-1.5 ${detailTab === 'invoices' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
            onClick={() => setDetailTab('invoices')}
          >
            {t('nav.salesInvoices')}
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 ${detailTab === 'receipts' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
            onClick={() => setDetailTab('receipts')}
          >
            {t('customers.receiptsHistory')}
          </button>
        </div>
      )}

      {isPrintingPress || detailTab === 'invoices' ? (
        <div className={isPrintingPress ? 'mt-8' : undefined}>
          <DataTable
            columns={invoiceColumns}
            data={invoicesQuery.data ?? []}
            keyField={(r) => r.id}
            isLoading={invoicesQuery.isLoading}
            searchable={false}
          />
        </div>
      ) : (
        <DataTable
          columns={receiptColumns}
          data={receiptsQuery.data ?? []}
          keyField={(r) => r.id}
          isLoading={receiptsQuery.isLoading}
          searchable={false}
        />
      )}
    </div>
  );
}
