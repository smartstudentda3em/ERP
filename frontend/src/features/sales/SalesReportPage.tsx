import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { PackageQuantity } from '../../components/ui/PackageQuantity';
import { DateRangeFilter, DateRange } from '../../components/ui/DateRangeFilter';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';
import { useActiveCompany } from '../../lib/use-active-company';
import { useSalesRepLock } from './useSalesRepLock';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface Representative {
  id: string;
  userId?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface SalesLine {
  id: string;
  invoiceDate: string;
  productName: string;
  productType: 'RAW_MATERIAL' | 'CATALOG_ITEM';
  baseQuantity: number;
  unitsPerPackage: number | null;
  packageTypeName: string | null;
  salesRepresentativeName: string | null;
  branchName: string | null;
  customerName: string | null;
  lineTotal: number;
  costOfGoodsSold: number;
  totalProfit: number;
  paidAmount: number;
  dueAmount: number;
}

function money(n: number): string {
  return formatAmount(n);
}

/** Sentinel value for the branch filter's "جميع الفروع" option — see its useState comment below
 * for why this can't be the usual empty-string placeholder. */
const ALL_BRANCHES = 'all';

/** 1-4 for a quarter, 0 for the full calendar year. */
type Quarter = 0 | 1 | 2 | 3 | 4;

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors quarterDateRange() elsewhere in the app. `quarter` 0 means the full year (Jan1–Dec31). */
function quarterDateRange(year: number, quarter: Quarter): { dateFrom: string; dateTo: string } {
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

export function SalesReportPage() {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [search, setSearch] = useState('');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState<Quarter>((Math.floor(now.getMonth() / 3) + 1) as Quarter);
  const [customRange, setCustomRange] = useState<DateRange>({ from: '', to: '' });
  // A non-empty sentinel (rather than '') for "no branch selected" — the shared Select
  // component auto-picks a dropdown's one real option whenever its value is still '', which is
  // right for a required field but wrong for a report filter: most companies never populate
  // SalesRepresentative.branchId at all, so auto-selecting their one seeded branch would silently
  // hide every rep-less sale the moment this page loads. Starting on 'all' (a real, non-empty
  // value) opts this field out of that auto-select entirely.
  const [branchFilter, setBranchFilter] = useState(ALL_BRANCHES);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  const repsQuery = useQuery({
    queryKey: ['sales-representatives', companyId],
    queryFn: () => unwrap<Representative[]>(apiClient.get('/sales-representatives', { params: { companyId } })),
    enabled: !!companyId,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: !!companyId,
  });

  // A non-admin tied to their own sales rep (a branch's "مدير الفرع") can only ever see their own
  // branch's data — re-enforced server-side regardless of what this drives on screen (see
  // SalesRepAccessService.resolveBranchId). Admins keep the dropdown fully open.
  const { isAdmin, ownRep } = useSalesRepLock(repsQuery.data);
  const lockedBranchId = !isAdmin && ownRep?.branchId ? ownRep.branchId : null;
  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);

  // A fully-specified custom range takes over from the year/quarter quick filter — clearing it
  // (the DateRangeFilter's own "إعادة ضبط" button) falls straight back to quarter mode.
  const hasCustomRange = !!customRange.from && !!customRange.to;
  const { dateFrom, dateTo } = useMemo(
    () => (hasCustomRange ? { dateFrom: customRange.from, dateTo: customRange.to } : quarterDateRange(year, quarter)),
    [hasCustomRange, customRange, year, quarter],
  );

  const linesQuery = useQuery({
    queryKey: ['sales-lines-report', companyId, dateFrom, dateTo, branchFilter],
    queryFn: () =>
      unwrap<SalesLine[]>(
        apiClient.get('/sales/invoices/report/lines', {
          params: { companyId, dateFrom, dateTo, branchId: branchFilter === ALL_BRANCHES ? undefined : branchFilter },
        }),
      ),
    enabled: !!companyId,
  });

  // Multi-keyword, cross-column, order-independent — see DataTable.tsx's own search for the same
  // pattern.
  const filteredLines = useMemo(() => {
    const keywords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = linesQuery.data ?? [];
    if (keywords.length === 0) return rows;
    return rows.filter((r) => {
      const haystack = [r.productName, r.salesRepresentativeName, r.customerName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return keywords.every((kw) => haystack.includes(kw));
    });
  }, [linesQuery.data, search]);

  const totalAmount = useMemo(() => filteredLines.reduce((sum, r) => sum + Number(r.lineTotal ?? 0), 0), [filteredLines]);
  const totalProfit = useMemo(() => filteredLines.reduce((sum, r) => sum + Number(r.totalProfit ?? 0), 0), [filteredLines]);
  const totalPaid = useMemo(() => filteredLines.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0), [filteredLines]);
  const totalCogs = useMemo(() => filteredLines.reduce((sum, r) => sum + Number(r.costOfGoodsSold ?? 0), 0), [filteredLines]);

  // Printing Press only: the COGS and Profit columns/cards are dropped (Press catalog sales never
  // carry a meaningful per-line cost — see ExpensesPage's raw-material-purchases COGS override),
  // replaced by "الصنف المباع" in the COGS column's old slot, showing whether the sold item came
  // from the finished-products catalog or was a raw material sold directly.
  const columns: Column<SalesLine>[] = [
    { header: t('common.date'), accessor: (r) => r.invoiceDate },
    { header: t('nav.customers'), accessor: (r) => r.customerName ?? '—' },
    { header: t('fields.product'), accessor: (r) => r.productName },
    {
      header: t('salesReport.packagesSold'),
      accessor: (r) => (
        <PackageQuantity baseQuantity={r.baseQuantity} unitsPerPackage={r.unitsPerPackage} packageUnitName={r.packageTypeName ?? undefined} />
      ),
      align: 'right',
    },
    isPrintingPress
      ? { header: t('fields.branch'), accessor: (r: SalesLine) => r.branchName ?? '—' }
      : { header: t('fields.salesRepresentative'), accessor: (r: SalesLine) => r.salesRepresentativeName ?? '—' },
    ...(isPrintingPress
      ? [
          {
            header: t('salesReport.itemTypeSold'),
            accessor: (r: SalesLine) =>
              t(r.productType === 'CATALOG_ITEM' ? 'salesReport.finishedProduct' : 'salesReport.rawMaterialItem'),
          },
        ]
      : [{ header: t('fields.cogs'), accessor: (r: SalesLine) => money(r.costOfGoodsSold), align: 'right' as const }]),
    { header: t('salesReport.totalAmount'), accessor: (r) => money(r.lineTotal), align: 'right' },
    { header: t('salesReport.paidAmount'), accessor: (r) => money(r.paidAmount), align: 'right' },
    ...(isPrintingPress
      ? []
      : [
          {
            header: t('salesReport.profit'),
            accessor: (r: SalesLine) => (
              <span className={Number(r.totalProfit) < 0 ? 'text-red-600' : 'text-green-600'}>{money(r.totalProfit)}</span>
            ),
            align: 'right' as const,
          },
        ]),
  ];

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('salesReport.reportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only header (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's
    // regular stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      // Landscape — 9 data columns is wider than the portrait documents elsewhere.
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName('تقرير المبيعات', company?.nameAr || company?.nameEn, localToday()),
        'landscape',
      );
    } catch (err) {
      toast.error(t('salesReport.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Sales report PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.sales')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <FormField label={t('salesReport.year')}>
          <Input
            type="number"
            disabled={hasCustomRange}
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
          />
        </FormField>
        <FormField label={t('partners.quarter')}>
          <Select
            disabled={hasCustomRange}
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}
          >
            <option value={1}>{t('partners.q1')}</option>
            <option value={2}>{t('partners.q2')}</option>
            <option value={3}>{t('partners.q3')}</option>
            <option value={4}>{t('partners.q4')}</option>
            <option value={0}>{t('partners.fullYear')}</option>
          </Select>
        </FormField>
        <FormField label={t('salesReport.branch')}>
          <Select disabled={!!lockedBranchId} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value={ALL_BRANCHES}>{t('salesReport.allBranches')}</option>
            {(branchesQuery.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameEn}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('common.search')}>
          <Input
            type="search"
            placeholder={t('salesReport.searchPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </FormField>
      </div>

      <div className="print:hidden">
        <DateRangeFilter value={customRange} onChange={setCustomRange} />
      </div>

      <div ref={printRef} className="sales-report-print">
        <div className="sales-report-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('salesReport.reportTitle')}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {dateFrom} — {dateTo} · {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        <div className={`mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${isPrintingPress ? '' : 'lg:grid-cols-4'}`}>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('salesReport.totalAmount')}</div>
            <div className="mt-1 text-2xl font-semibold text-green-600">{money(totalAmount)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('salesReport.totalPaidAmount')}</div>
            <div className="mt-1 text-2xl font-semibold text-green-600">{money(totalPaid)}</div>
          </Card>
          {!isPrintingPress && (
            <>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('salesReport.totalCogs')}</div>
                <div className="mt-1 text-2xl font-semibold">{money(totalCogs)}</div>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('salesReport.totalProfit')}</div>
                <div className={`mt-1 text-2xl font-semibold ${totalProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {money(totalProfit)}
                </div>
              </Card>
            </>
          )}
        </div>

        {/* pageSize forced to the full array length so print/PDF gets every row, not just the
            current on-screen page — DataTable otherwise only ever mounts one page at a time. */}
        <DataTable
          columns={columns}
          data={filteredLines}
          keyField={(r) => r.id}
          isLoading={linesQuery.isLoading}
          searchable={false}
          pageSize={Math.max(filteredLines.length, 1)}
        />
      </div>
    </div>
  );
}
