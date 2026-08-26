import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { formatAmount } from '../../lib/number-format';
import { monthNameOnly, localToday } from '../../lib/date-utils';
import { exportElementToPdf } from '../../lib/pdf-export';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { FormField, Input, Select } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { DocumentLetterhead, LetterheadCompany } from './DocumentLetterhead';

const ALL_COMPANIES = '__ALL__';
const FOOTER_NOTE_STORAGE_KEY = 'guideline-price-print-footer-note';

interface GuidelinePriceLine {
  id: string;
  productId: string;
  price: number;
  product?: {
    sku?: string | null;
    nameEn: string;
    nameAr?: string | null;
    barcode?: string | null;
    packageSellingPrice?: number | null;
    brand?: { nameEn: string; nameAr?: string | null } | null;
  } | null;
}

interface GuidelinePriceSheet {
  id: string;
  month: number;
  year: number;
  supplierId: string;
  discountPercentage: number;
  supplier: { companyName: string };
  lines: GuidelinePriceLine[];
}

interface SupplierProductPrice {
  productId: string;
  sku: string | null;
  nameEn: string;
  nameAr: string | null;
  barcode: string | null;
  brandNameEn: string | null;
  brandNameAr: string | null;
  purchasePrice: number;
  packageSellingPrice: number | null;
  /** Total packages bought from this supplier across every (non-free-goods) receipt of this
   * product — see GuidelinePricesService.findSupplierProducts. */
  quantityPurchased: number;
  /** This supplier's total ضريبة المبيعات payments ÷ total packages bought from them — identical
   * across every product returned for the same supplier. See findSupplierProducts's own comment. */
  taxValuePerUnit: number;
}

interface ProductRow {
  key: string;
  productId: string;
  sheetId: string;
  companyName: string;
  sku: string;
  name: string;
  capacity: string;
  brand: string;
  /** Total packages bought from this product's own supplier — "عدد العبوات المشتراة" — 0 for a
   * fallback row with no purchase history at all (see the rows useMemo below). */
  quantityPurchased: number;
  purchasePrice: number;
  /** This row's supplier-wide tax-per-package share — see SupplierProductPrice's own comment. */
  taxValuePerUnit: number;
  discountPercentage: number;
  /** The product's own configured PACKAGE/carton selling price ("سعر البيع (المصنع)") — a fixed
   * reference value, distinct from "سعر البيع المتوقع" (the new guideline price being set on this
   * page). Package price, not per-unit, since the factory sells this product by the carton. */
  factorySellingPrice: number;
}

interface Company extends LetterheadCompany {
  id: string;
}

type SortField = 'capacity' | 'brand';

/**
 * AC-only — opens from clicking a month/year row in GuidelinePricesTab.tsx's grouped list. A
 * merged row has no single company, so this page owns picking WHICH of that month's companies to
 * work on (top filter, scoped to only the companies that already have a sheet for this month/year
 * — also reachable via that same table's ✏️ edit-companies popover, which deep-links here with
 * ?supplierId= pre-filled). "جميع الشركات" merges every company's own product list into one table
 * — each row keeps its own company/discount%/tax since those are per-sheet, not global, so the
 * same product bought from two different companies gets two independent rows (keyed by
 * `${sheetId}::${productId}`, not just productId — real UUIDs contain dashes, so `::` is used as
 * the split-safe separator instead).
 *
 * The product list auto-populates from each company's own Purchasing history (real paid receipts
 * only — free-goods receipts are excluded server-side since their price is always forced to 0),
 * plus any product that already has a saved guideline price line even without purchase history.
 * Discount value / net purchase price are pure display math off that row's own discountPercentage;
 * tax value ("قيمة الضريبة") is this row's supplier-wide taxValuePerUnit instead — by explicit
 * request, this supplier's total ضريبة المبيعات payments spread evenly across every package ever
 * bought from them, not a per-product tax rate (see GuidelinePricesService.findSupplierProducts).
 * Nothing here is persisted beyond what's already stored. "سعر البيع المتوقع" is the only
 * editable column and is exactly GuidelinePriceLine.price; saving groups the edited cells by their
 * owning sheet and PATCHes each sheet's lines independently (a sheet no cell was touched for is
 * left completely alone).
 */
export function GuidelinePriceDetailPage() {
  const { year, month } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canEdit = hasPermission('sales.guidelinePrice.edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // A standing personal note the user sets once and reuses across every print/PDF from this page
  // (not tied to any one month/company) — persisted to localStorage so it survives reloads and
  // stays editable any time, with no backend field needed for what's just a display preference.
  const [footerNote, setFooterNote] = useState(() => localStorage.getItem(FOOTER_NOTE_STORAGE_KEY) ?? '');
  function updateFooterNote(value: string) {
    setFooterNote(value);
    localStorage.setItem(FOOTER_NOTE_STORAGE_KEY, value);
  }

  const sheetsQuery = useQuery({
    queryKey: ['guideline-price-sheets', companyId],
    queryFn: () => unwrap<GuidelinePriceSheet[]>(apiClient.get('/sales/guideline-prices', { params: { companyId } })),
    enabled: !!companyId,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  const groupSheets = (sheetsQuery.data ?? []).filter((s) => String(s.year) === year && String(s.month) === month);
  const supplierOptions = [
    ...(groupSheets.length ? [{ value: ALL_COMPANIES, label: t('guidelinePrices.allCompanies') }] : []),
    ...groupSheets.map((s) => ({ value: s.supplierId, label: s.supplier?.companyName ?? '—' })),
  ];
  const title = year && month ? `${monthNameOnly(Number(month), i18n.language)} ${year}` : '';

  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') ?? '');
  const selectedSheet = groupSheets.find((s) => s.supplierId === supplierId) ?? null;
  const isAllMode = supplierId === ALL_COMPANIES;
  const activeSheets = isAllMode ? groupSheets : selectedSheet ? [selectedSheet] : [];

  function selectSupplier(id: string) {
    setSupplierId(id);
    setSearchParams(id ? { supplierId: id } : {}, { replace: true });
  }

  const productsQuery = useQuery({
    queryKey: ['guideline-price-supplier-products', activeSheets.map((s) => s.id).join(',')],
    queryFn: async () => {
      const perSheet = await Promise.all(
        activeSheets.map(async (sheet) => ({
          sheet,
          products: await unwrap<SupplierProductPrice[]>(
            apiClient.get('/sales/guideline-prices/supplier-products', { params: { supplierId: sheet.supplierId } }),
          ),
        })),
      );
      return perSheet;
    },
    enabled: activeSheets.length > 0,
  });

  // Union of Purchasing history (the normal case) and any product that already has a saved line
  // for its sheet — keeps a manually-priced product visible even if it has no purchase history.
  const rows: ProductRow[] = useMemo(() => {
    const map = new Map<string, ProductRow>();
    // taxValuePerUnit is supplier-wide, not per-product — every product row from the same sheet
    // carries the identical value, so it's captured once here and reused for the fallback loop
    // below (which has no purchase-history row of its own to read it off).
    const taxPerUnitBySheet = new Map<string, number>();
    for (const { sheet, products } of productsQuery.data ?? []) {
      for (const p of products) {
        const key = `${sheet.id}::${p.productId}`;
        taxPerUnitBySheet.set(sheet.id, Number(p.taxValuePerUnit) || 0);
        map.set(key, {
          key,
          productId: p.productId,
          sheetId: sheet.id,
          companyName: sheet.supplier?.companyName ?? '—',
          sku: p.sku ?? '—',
          name: p.nameAr || p.nameEn,
          capacity: p.barcode ?? '—',
          brand: p.brandNameAr || p.brandNameEn || '—',
          taxValuePerUnit: Number(p.taxValuePerUnit) || 0,
          discountPercentage: Number(sheet.discountPercentage) || 0,
          purchasePrice: Number(p.purchasePrice) || 0,
          quantityPurchased: Number(p.quantityPurchased) || 0,
          factorySellingPrice: Number(p.packageSellingPrice) || 0,
        });
      }
    }
    for (const sheet of activeSheets) {
      for (const line of sheet.lines ?? []) {
        const key = `${sheet.id}::${line.productId}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            productId: line.productId,
            sheetId: sheet.id,
            companyName: sheet.supplier?.companyName ?? '—',
            sku: line.product?.sku ?? '—',
            name: line.product?.nameAr || line.product?.nameEn || '—',
            capacity: line.product?.barcode ?? '—',
            brand: line.product?.brand?.nameAr || line.product?.brand?.nameEn || '—',
            taxValuePerUnit: taxPerUnitBySheet.get(sheet.id) ?? 0,
            discountPercentage: Number(sheet.discountPercentage) || 0,
            purchasePrice: 0,
            quantityPurchased: 0,
            factorySellingPrice: Number(line.product?.packageSellingPrice) || 0,
          });
        }
      }
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.data]);

  const [primarySort, setPrimarySort] = useState<SortField>('capacity');
  const [secondarySort, setSecondarySort] = useState<SortField>('brand');

  const sortedRows = useMemo(() => {
    const sortValue = (r: ProductRow, field: SortField) => (field === 'capacity' ? r.capacity : r.brand);
    return [...rows].sort((a, b) => {
      const primaryDiff = sortValue(a, primarySort).localeCompare(sortValue(b, primarySort), 'ar');
      if (primaryDiff !== 0) return primaryDiff;
      return sortValue(a, secondarySort).localeCompare(sortValue(b, secondarySort), 'ar');
    });
  }, [rows, primarySort, secondarySort]);

  // Alternates a tint on/off each time the primary-sort value changes as sortedRows is walked in
  // order, so every run of rows sharing that value reads as one visually distinct band — set as an
  // explicit inline background (transparent included) on every row rather than leaving some
  // undefined, so this fully overrides the table's default nth-child zebra striping instead of the
  // two competing for the same rows.
  const rowBackgrounds = useMemo(() => {
    const map = new Map<string, CSSProperties>();
    let lastValue: string | null = null;
    let groupIndex = -1;
    for (const r of sortedRows) {
      const value = primarySort === 'capacity' ? r.capacity : r.brand;
      if (value !== lastValue) {
        groupIndex++;
        lastValue = value;
      }
      map.set(r.key, { backgroundColor: groupIndex % 2 === 1 ? 'var(--table-stripe)' : 'transparent' });
    }
    return map;
  }, [sortedRows, primarySort]);

  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const sheet of activeSheets) {
      for (const line of sheet.lines ?? []) {
        initial[`${sheet.id}::${line.productId}`] = String(Number(line.price));
      }
    }
    setPrices(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const bySheet = new Map<string, { productId: string; price: number }[]>();
      for (const [key, priceStr] of Object.entries(prices)) {
        if (priceStr === '') continue;
        const [sheetId, productId] = key.split('::');
        const list = bySheet.get(sheetId) ?? [];
        list.push({ productId, price: Number(priceStr) });
        bySheet.set(sheetId, list);
      }
      await Promise.all(
        Array.from(bySheet.entries()).map(([sheetId, lines]) =>
          apiClient.patch(`/sales/guideline-prices/${sheetId}`, { lines }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      toast.success(t('guidelinePrices.updated'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName(
          'الأسعار الاسترشادية',
          isAllMode ? t('guidelinePrices.allCompanies') : selectedSheet?.supplier?.companyName,
          `${title} ${localToday()}`,
        ),
        'portrait',
      );
    } catch {
      toast.error(t('common.saveFailed'));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  const columns: Column<ProductRow>[] = [
    { header: t('guidelinePrices.capacity'), accessor: (r) => r.capacity },
    { header: t('guidelinePrices.brand'), accessor: (r) => r.brand },
    { header: t('guidelinePrices.sku'), accessor: (r) => r.sku },
    { header: t('guidelinePrices.itemName'), accessor: (r) => r.name },
    {
      header: t('guidelinePrices.quantityPurchased'),
      accessor: (r) => formatAmount(r.quantityPurchased),
      align: 'right',
      hideOnPrint: true,
    },
    { header: t('guidelinePrices.purchasePrice'), accessor: (r) => formatAmount(r.purchasePrice), hideOnPrint: true },
    {
      header: t('guidelinePrices.discountValue'),
      accessor: (r) => formatAmount(r.purchasePrice * (r.discountPercentage / 100)),
      hideOnPrint: true,
    },
    {
      header: t('guidelinePrices.taxValue'),
      accessor: (r) => formatAmount(r.taxValuePerUnit),
      hideOnPrint: true,
    },
    {
      header: t('guidelinePrices.netPurchasePrice'),
      accessor: (r) => formatAmount(r.purchasePrice * (1 - r.discountPercentage / 100)),
      hideOnPrint: true,
    },
    {
      header: t('guidelinePrices.factorySellingPrice'),
      accessor: (r) => formatAmount(r.factorySellingPrice),
      hideOnPrint: true,
    },
    {
      header: t('guidelinePrices.expectedSalePrice'),
      accessor: (r) => (
        <>
          {/* Print/PDF gets plain text instead of the live input — html2canvas clones the DOM to
              capture it, and a cloned <input> doesn't carry over its live JS `.value` (React
              controlled inputs never set the `value` attribute the clone would need), so the
              field was rendering blank/stale in the exported PDF. */}
          <span className="print-only">
            {prices[r.key] ? formatAmount(Number(prices[r.key])) : '—'}
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={prices[r.key] ?? ''}
            onChange={(e) => setPrices((p) => ({ ...p, [r.key]: e.target.value }))}
            disabled={!canEdit}
            className="screen-only text-center"
          />
        </>
      ),
    },
  ];

  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'capacity', label: t('guidelinePrices.capacity') },
    { value: 'brand', label: t('guidelinePrices.brand') },
  ];

  const metaCompanyLabel = isAllMode ? t('guidelinePrices.allCompanies') : selectedSheet?.supplier?.companyName ?? '';

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {supplierId && (
              <>
                <Button variant="secondary" onClick={() => window.print()}>
                  {t('common.print')}
                </Button>
                <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
                  {t('actions.downloadPdf')}
                </Button>
              </>
            )}
            {canEdit && supplierId && (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {t('common.save')}
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4 print:hidden">
        <div className="w-full max-w-xs">
          <FormField label={t('guidelinePrices.company')}>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onChange={selectSupplier}
              placeholder={t('guidelinePrices.selectCompany') ?? ''}
              clearable
            />
          </FormField>
        </div>
        {supplierId && (
          <>
            <div className="w-40">
              <FormField label={t('guidelinePrices.primarySort')}>
                <Select value={primarySort} onChange={(e) => setPrimarySort(e.target.value as SortField)}>
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="w-40">
              <FormField label={t('guidelinePrices.secondarySort')}>
                <Select value={secondarySort} onChange={(e) => setSecondarySort(e.target.value as SortField)}>
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </>
        )}
      </div>

      {supplierId && (
        <div className="mb-4 print:hidden">
          <FormField label={t('guidelinePrices.footerNoteLabel')}>
            <Input
              value={footerNote}
              onChange={(e) => updateFooterNote(e.target.value)}
              placeholder={t('guidelinePrices.footerNotePlaceholder') ?? ''}
            />
          </FormField>
        </div>
      )}

      {!supplierId ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {t('guidelinePrices.pickCompanyPrompt')}
        </div>
      ) : (
        <div ref={printRef} className="printable-document guideline-price-print">
          <DocumentLetterhead
            docTypeLabel={t('guidelinePrices.tabLabel')}
            metaLine={`${t('guidelinePrices.company')}: ${metaCompanyLabel}  |  ${title}`}
            company={company}
          />
          <DataTable
            columns={columns}
            data={sortedRows}
            keyField={(r) => r.key}
            isLoading={productsQuery.isLoading}
            pageSize={Number.MAX_SAFE_INTEGER}
            rowStyle={(r) => rowBackgrounds.get(r.key)}
          />
          {footerNote && (
            // "section-title" is one of pdf-export.ts's own recognized page-break boundaries, so
            // the paginator snaps a break to just above this block instead of ever cutting through
            // it; break-inside/page-break-inside do the same for the real browser print path.
            <div
              className="section-title mt-4 border-t border-[var(--border)] pt-3 text-sm text-[var(--text-muted)]"
              style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              {footerNote}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
