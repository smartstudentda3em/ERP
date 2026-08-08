import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
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
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, FormField, Select } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

type Tab = 'expenses' | 'profit' | 'performance';
type Quarter = 1 | 2 | 3 | 4;

interface PerformanceTrendPeriod {
  year: number;
  quarter: number;
  netProfit: number;
  materialCostRatio: number;
}

// Navy → blue shades for the net-profit bars (oldest to newest comparison year), kept distinct
// from the orange material-cost-ratio line so the two axes never get visually confused.
const YEAR_COLORS = ['#1e3a8a', '#3b82f6', '#93c5fd'];
const RATIO_LINE_COLOR = '#f97316';
const chartTooltipStyle = {
  borderRadius: 10,
  border: '1px solid var(--border)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  fontSize: 13,
};

type MaterialCostHealth = 'excellent' | 'acceptable' | 'alert';
function materialCostHealth(ratio: number): MaterialCostHealth {
  if (ratio < 40) return 'excellent';
  if (ratio <= 50) return 'acceptable';
  return 'alert';
}
const HEALTH_BADGE_STYLES: Record<MaterialCostHealth, string> = {
  excellent: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  acceptable: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  alert: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

interface ExpenseRow {
  label: string;
  total: number;
}

interface ExpenseBreakdown {
  cogs: number;
  operatingExpenses: number;
  total: number;
}

interface ProfitReport {
  revenue: number;
  cogs: number;
  // Printing Press only — sum of approved Monthly Stock Audits' consumed materials for the
  // period/branch (see CashMovementsService.getConsumedMaterialsTotal()); 0 for every other company.
  consumedMaterials: number;
  grossProfit: number;
  expenses: ExpenseRow[];
  totalExpenses: number;
  netProfit: number;
  distributedDividends: number;
  expenseBreakdown: ExpenseBreakdown;
}

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors the backend's quarterDateRange(). */
function quarterDateRange(year: number, quarter: Quarter): { dateFrom: string; dateTo: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function ReportsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress } = useActiveCompany();
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('profit');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState<Quarter>((Math.floor(now.getMonth() / 3) + 1) as Quarter);
  // Printing Press only — "الفرع" filter; empty string means every branch (جميع الفروع).
  const [branchFilter, setBranchFilter] = useState('');

  const { dateFrom, dateTo } = useMemo(() => quarterDateRange(year, quarter), [year, quarter]);

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  // Both tabs read from the same profit report — it already carries the operating-expense
  // category list (Profit tab) and the COGS/Operating/Dividends breakdown (Expenses tab), so
  // there's no separate "expense report" call left to duplicate it.
  const effectiveBranchId = isPrintingPress && branchFilter ? branchFilter : undefined;
  const profitQuery = useQuery({
    queryKey: ['profit-report', companyId, dateFrom, dateTo, effectiveBranchId],
    queryFn: () =>
      unwrap<ProfitReport>(
        apiClient.get('/treasury/reports/profit', {
          params: { companyId, dateFrom, dateTo, branchId: effectiveBranchId },
        }),
      ),
    enabled: !!companyId,
  });

  // Printing Performance Report tab only — quarterly net-profit / material-cost-ratio trend,
  // dynamically bounded to years the company has actually operated in (see earliestActivityYear).
  const performanceTrendQuery = useQuery({
    queryKey: ['printing-performance-trend', companyId, year, quarter, effectiveBranchId],
    queryFn: () =>
      unwrap<{ periods: PerformanceTrendPeriod[]; earliestYear: number }>(
        apiClient.get('/treasury/reports/printing-performance-trend', {
          params: { companyId, year, quarter, branchId: effectiveBranchId },
        }),
      ),
    enabled: isPrintingPress && !!companyId && tab === 'performance',
  });

  const trendPeriods = performanceTrendQuery.data?.periods ?? [];
  const findTrendPeriod = (y: number, q: number) => trendPeriods.find((p) => p.year === y && p.quarter === q);

  // Never draws a comparison year that predates the company's actual first activity — mirrors the
  // exact same guard on the sales-representatives quarterly comparison chart.
  const performanceEarliestYear = performanceTrendQuery.data?.earliestYear ?? year;
  const performanceComparisonYears = [year - 2, year - 1, year].filter((y) => y >= performanceEarliestYear);

  // Bars: net profit per comparison year. Line: the selected year's own material-cost ratio trend.
  // Always all 4 quarters (Q1–Q4) regardless of which quarter is currently selected, so the X-axis
  // reads as one continuous, complete year — a quarter with no data yet (e.g. Q4 while browsing Q2)
  // simply shows 0 rather than being omitted.
  const performanceChartRows = useMemo(() => {
    if (tab !== 'performance') return [];
    return [1, 2, 3, 4].map((q) => {
      const row: Record<string, number | string> = { quarterLabel: t('salesRepresentativesReports.quarterShort', { quarter: q }) };
      for (const y of performanceComparisonYears) {
        const period = findTrendPeriod(y, q);
        row[`netProfit_${y}`] = period ? Number(period.netProfit.toFixed(2)) : 0;
      }
      const currentYearPeriod = findTrendPeriod(year, q);
      row.ratio = currentYearPeriod ? Number(currentYearPeriod.materialCostRatio.toFixed(2)) : 0;
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendPeriods, tab, year, performanceEarliestYear]);

  const materialCostRatio = (profitQuery.data?.revenue ?? 0) > 0
    ? ((profitQuery.data?.consumedMaterials ?? 0) / (profitQuery.data?.revenue ?? 1)) * 100
    : 0;
  const performanceHealth = materialCostHealth(materialCostRatio);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profit', label: t('accounting.profitReport') },
    { key: 'expenses', label: t('accounting.expenseReport') },
    ...(isPrintingPress ? [{ key: 'performance' as Tab, label: t('accounting.performanceReport') }] : []),
  ];

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('accounting.comprehensiveReportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only combined report (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's regular
    // stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const scale = 2;
      const canvas = await html2canvas(printRef.current, { scale, useCORS: true });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();
      const pxPerMm = canvas.width / pageWidthMm;
      const pageHeightPx = pageHeightMm * pxPerMm;

      // Row-boundary-aware page breaks — a plain fixed-height slice could cut a table row (or a
      // section title) in half at a page edge, so each break snaps back to the nearest element
      // boundary that still fits, keeping the two sections' content visually intact.
      const rowEdgesPx = Array.from(
        printRef.current.querySelectorAll('tr, .financial-report-print-section-title, .financial-report-print-total'),
      ).map((el) => ((el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight) * scale);
      const sliceBoundaries: number[] = [];
      let cursor = 0;
      while (cursor < canvas.height) {
        const maxEnd = cursor + pageHeightPx;
        if (maxEnd >= canvas.height) {
          sliceBoundaries.push(canvas.height);
          break;
        }
        const fittingEdges = rowEdgesPx.filter((e) => e > cursor && e <= maxEnd);
        sliceBoundaries.push(fittingEdges.length ? Math.max(...fittingEdges) : maxEnd);
        cursor = sliceBoundaries[sliceBoundaries.length - 1];
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      let sliceStart = 0;
      for (let i = 0; i < sliceBoundaries.length; i++) {
        const sliceEnd = sliceBoundaries[i];
        const sliceHeightPx = sliceEnd - sliceStart;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, sliceStart, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        if (i > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
        sliceStart = sliceEnd;
      }

      pdf.save(buildPdfFileName('التقرير المالي الشامل', `${dateFrom} إلى ${dateTo}`, localToday()));
    } catch (err) {
      toast.error(t('accounting.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Financial report PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  const netProfit = (profitQuery.data?.revenue ?? 0) - (profitQuery.data?.expenseBreakdown?.total ?? 0);
  // A negative result is an accounting deficit, not a "negative profit" — shown with its own label
  // and the amount parenthesized (accounting convention) rather than a leading minus sign.
  const isNetLoss = netProfit < 0;
  const netProfitLabel = t(isNetLoss ? 'accounting.netLoss' : 'accounting.netProfit');
  const netProfitDisplay = isNetLoss ? `(${formatAmount(Math.abs(netProfit))})` : formatAmount(netProfit);

  return (
    <div>
      <PageHeader
        title={t('nav.reports')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              {t('accounting.printComprehensiveReport')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfLoading}>
              {t('accounting.exportPdf')}
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-2 text-sm">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                className={`rounded-lg px-3 py-1.5 ${tab === tb.key ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
                onClick={() => setTab(tb.key)}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label={t('salesReport.year')}>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
          </FormField>
          <FormField label={t('partners.quarter')}>
            <Select value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}>
              <option value={1}>{t('partners.q1')}</option>
              <option value={2}>{t('partners.q2')}</option>
              <option value={3}>{t('partners.q3')}</option>
              <option value={4}>{t('partners.q4')}</option>
            </Select>
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">{t('accounting.allBranches')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>

        {tab === 'profit' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <tbody>
                  <tr>
                    <td>{t('accounting.revenue')}</td>
                    <td>{formatAmount(profitQuery.data?.revenue ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>{t('accounting.totalExpenses')}</td>
                    <td>{formatAmount(profitQuery.data?.expenseBreakdown?.total ?? 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td className="font-semibold">{netProfitLabel}</td>
                    <td className="font-semibold">{netProfitDisplay}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        {tab === 'expenses' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <tbody>
                  <tr>
                    <td>{t(isPrintingPress ? 'accounting.totalRawMaterialPurchases' : 'accounting.costOfGoodsSold')}</td>
                    <td>{formatAmount(profitQuery.data?.expenseBreakdown?.cogs ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>{t('accounting.operatingExpenses')}</td>
                    <td>{formatAmount(profitQuery.data?.expenseBreakdown?.operatingExpenses ?? 0)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td className="font-semibold">{t('accounting.totalExpenses')}</td>
                    <td className="font-semibold">{formatAmount(profitQuery.data?.expenseBreakdown?.total ?? 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        {tab === 'performance' && isPrintingPress && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('accounting.totalSales')}</div>
                <div className="mt-1 text-lg font-semibold">{formatAmount(profitQuery.data?.revenue ?? 0)}</div>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('accounting.totalConsumedMaterials')}</div>
                <div className="mt-1 text-lg font-semibold">{formatAmount(profitQuery.data?.consumedMaterials ?? 0)}</div>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('accounting.operatingExpenses')}</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatAmount(profitQuery.data?.expenseBreakdown?.operatingExpenses ?? 0)}
                </div>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('accounting.printingNetProfit')}</div>
                <div className="mt-1 text-lg font-semibold">{formatAmount(netProfit)}</div>
              </Card>
            </div>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{t('accounting.performanceHealthTitle')}</div>
                  <div className="text-xs text-[var(--text-muted)]">{t('accounting.performanceHealthSubtitle')}</div>
                </div>
                <div className="group relative">
                  <div className={`cursor-help rounded-full px-3 py-1 text-sm font-semibold ${HEALTH_BADGE_STYLES[performanceHealth]}`}>
                    {materialCostRatio.toFixed(2)}% · {t(`accounting.performanceHealth${performanceHealth.charAt(0).toUpperCase()}${performanceHealth.slice(1)}`)}
                  </div>
                  <div className="pointer-events-none absolute end-0 top-full z-10 mt-2 w-64 rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-800">
                    <div className="mb-1 text-green-400">{t('accounting.performanceHealthTooltipExcellent')}</div>
                    <div className="mb-1 text-yellow-400">{t('accounting.performanceHealthTooltipAcceptable')}</div>
                    <div className="text-red-400">{t('accounting.performanceHealthTooltipAlert')}</div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t('accounting.performanceChartTitle')}</CardTitle>
                <div className="text-xs text-[var(--text-muted)]">{t('accounting.performanceChartSubtitle', { year })}</div>
              </CardHeader>
              <div className="h-96">
                {performanceChartRows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                    {t('salesRepresentativesReports.noData')}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={performanceChartRows} margin={{ top: 8, right: 16, bottom: 32, left: 36 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.35} vertical={false} />
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
                        yAxisId="profit"
                        tick={{ fontSize: 12 }}
                        tickMargin={6}
                        width={56}
                        tickFormatter={(v: number) => formatAmount(v)}
                        label={{ value: t('accounting.netProfit'), angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 13, textAnchor: 'middle' } }}
                      />
                      <YAxis
                        yAxisId="ratio"
                        orientation="right"
                        tick={{ fontSize: 12 }}
                        tickMargin={6}
                        width={48}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                        label={{ value: t('accounting.materialCostRatioAxisLabel'), angle: 90, position: 'insideRight', offset: 8, style: { fontSize: 13, textAnchor: 'middle' } }}
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value: number, name: string, item: { dataKey?: string | number }) =>
                          item?.dataKey === 'ratio'
                            ? [`${value.toFixed(2)}%`, name]
                            : [`${formatAmount(value)} ${t('accounting.currencyUnit')}`, name]
                        }
                      />
                      {performanceComparisonYears.map((y, i) => (
                        <Bar key={y} yAxisId="profit" dataKey={`netProfit_${y}`} name={String(y)} fill={YEAR_COLORS[i]} radius={[6, 6, 0, 0]} maxBarSize={40} />
                      ))}
                      <Line
                        yAxisId="ratio"
                        type="monotone"
                        dataKey="ratio"
                        name={t('accounting.materialCostRatioAxisLabel')}
                        stroke={RATIO_LINE_COLOR}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Print/PDF always combine BOTH reports in one document (expenses first, then profit)
          regardless of which tab is active on screen — hidden here by default since it duplicates
          the screen content above in a different shape, and only shown via @media print /
          .pdf-export-mode (see index.css). */}
      <div ref={printRef} className="financial-report-print">
        <div className="financial-report-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('accounting.comprehensiveReportTitle')}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {dateFrom} — {dateTo} · {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        <div className="financial-report-print-section">
          <div className="financial-report-print-section-title">{t('accounting.expenseReport')}</div>
          <table className="app-table">
            <thead>
              <tr>
                <th>{t('accounting.category')}</th>
                <th>{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {(profitQuery.data?.expenses ?? []).map((row, i) => (
                <tr key={i}>
                  <td>{row.label}</td>
                  <td>{formatAmount(row.total)}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">{t('treasury.operatingExpensesTotal')}</td>
                <td className="font-semibold">{formatAmount(profitQuery.data?.expenseBreakdown?.operatingExpenses ?? 0)}</td>
              </tr>
              <tr>
                <td>{t(isPrintingPress ? 'accounting.totalRawMaterialPurchases' : 'accounting.costOfGoodsSold')}</td>
                <td>{formatAmount(profitQuery.data?.expenseBreakdown?.cogs ?? 0)}</td>
              </tr>
            </tbody>
          </table>
          <div className="financial-report-print-total">
            {t('accounting.totalExpenses')}: {formatAmount(profitQuery.data?.expenseBreakdown?.total ?? 0)}
          </div>
        </div>

        <div className="financial-report-print-section">
          <div className="financial-report-print-section-title">{t('accounting.profitReport')}</div>
          <table className="app-table">
            <tbody>
              <tr>
                <td>{t('accounting.revenue')}</td>
                <td>{formatAmount(profitQuery.data?.revenue ?? 0)}</td>
              </tr>
              <tr>
                <td>{t('accounting.totalExpenses')}</td>
                <td>{formatAmount(profitQuery.data?.expenseBreakdown?.total ?? 0)}</td>
              </tr>
            </tbody>
          </table>
          <div className="financial-report-print-total">
            {netProfitLabel}: {netProfitDisplay}
          </div>
        </div>
      </div>
    </div>
  );
}
