import { useEffect, useMemo, useRef, useState } from 'react';
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

interface GuidelinePriceLine {
  id: string;
  productId: string;
  price: number;
  product?: {
    nameEn: string;
    nameAr?: string | null;
    barcode?: string | null;
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
  nameEn: string;
  nameAr: string | null;
  barcode: string | null;
  brandNameEn: string | null;
  brandNameAr: string | null;
  purchasePrice: number;
}

interface ProductRow {
  productId: string;
  name: string;
  capacity: string;
  brand: string;
  purchasePrice: number;
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
 * ?supplierId= pre-filled).
 *
 * The product list auto-populates from that supplier's own Purchasing history (real paid receipts
 * only — free-goods receipts are excluded server-side since their price is always forced to 0),
 * plus any product that already has a saved guideline price line even without purchase history.
 * Discount value / net purchase price are pure display math (purchasePrice × sheet's own
 * discountPercentage) — nothing new to persist there. "سعر البيع المتوقع" is the only editable
 * column and is exactly GuidelinePriceLine.price, saved via the existing lines-replace PATCH.
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
  const supplierOptions = groupSheets.map((s) => ({ value: s.supplierId, label: s.supplier?.companyName ?? '—' }));
  const title = year && month ? `${monthNameOnly(Number(month), i18n.language)} ${year}` : '';

  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') ?? '');
  const selectedSheet = groupSheets.find((s) => s.supplierId === supplierId) ?? null;

  function selectSupplier(id: string) {
    setSupplierId(id);
    setSearchParams(id ? { supplierId: id } : {}, { replace: true });
  }

  const supplierProductsQuery = useQuery({
    queryKey: ['guideline-price-supplier-products', supplierId],
    queryFn: () =>
      unwrap<SupplierProductPrice[]>(
        apiClient.get('/sales/guideline-prices/supplier-products', { params: { supplierId } }),
      ),
    enabled: !!supplierId,
  });

  // Union of Purchasing history (the normal case) and any product that already has a saved line
  // for this sheet — keeps a manually-priced product visible even if it has no purchase history.
  const rows: ProductRow[] = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const p of supplierProductsQuery.data ?? []) {
      map.set(p.productId, {
        productId: p.productId,
        name: p.nameAr || p.nameEn,
        capacity: p.barcode ?? '—',
        brand: p.brandNameAr || p.brandNameEn || '—',
        purchasePrice: Number(p.purchasePrice) || 0,
      });
    }
    for (const line of selectedSheet?.lines ?? []) {
      if (!map.has(line.productId)) {
        map.set(line.productId, {
          productId: line.productId,
          name: line.product?.nameAr || line.product?.nameEn || '—',
          capacity: line.product?.barcode ?? '—',
          brand: line.product?.brand?.nameAr || line.product?.brand?.nameEn || '—',
          purchasePrice: 0,
        });
      }
    }
    return Array.from(map.values());
  }, [supplierProductsQuery.data, selectedSheet]);

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

  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const line of selectedSheet?.lines ?? []) initial[line.productId] = String(Number(line.price));
    setPrices(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet?.id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const lines = Object.entries(prices)
        .filter(([, price]) => price !== '')
        .map(([productId, price]) => ({ productId, price: Number(price) }));
      return apiClient.patch(`/sales/guideline-prices/${selectedSheet!.id}`, { lines });
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
        buildPdfFileName('الأسعار الاسترشادية', selectedSheet?.supplier?.companyName, `${title} ${localToday()}`),
        'portrait',
      );
    } catch {
      toast.error(t('common.saveFailed'));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  const discountRate = (selectedSheet?.discountPercentage ?? 0) / 100;

  const columns: Column<ProductRow>[] = [
    { header: t('guidelinePrices.capacity'), accessor: (r) => r.capacity },
    { header: t('guidelinePrices.itemName'), accessor: (r) => r.name },
    { header: t('guidelinePrices.brand'), accessor: (r) => r.brand },
    { header: t('guidelinePrices.purchasePrice'), accessor: (r) => formatAmount(r.purchasePrice) },
    { header: t('guidelinePrices.discountValue'), accessor: (r) => formatAmount(r.purchasePrice * discountRate) },
    {
      header: t('guidelinePrices.netPurchasePrice'),
      accessor: (r) => formatAmount(r.purchasePrice * (1 - discountRate)),
    },
    {
      header: t('guidelinePrices.expectedSalePrice'),
      accessor: (r) => (
        <Input
          type="number"
          min="0"
          step="0.01"
          value={prices[r.productId] ?? ''}
          onChange={(e) => setPrices((p) => ({ ...p, [r.productId]: e.target.value }))}
          disabled={!canEdit}
        />
      ),
    },
  ];

  const sortOptions: { value: SortField; label: string }[] = [
    { value: 'capacity', label: t('guidelinePrices.capacity') },
    { value: 'brand', label: t('guidelinePrices.brand') },
  ];

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
            {canEdit && selectedSheet && (
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

      {!supplierId ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {t('guidelinePrices.pickCompanyPrompt')}
        </div>
      ) : (
        <div ref={printRef} className="printable-document">
          <DocumentLetterhead
            docTypeLabel={t('guidelinePrices.tabLabel')}
            metaLine={`${t('guidelinePrices.company')}: ${selectedSheet?.supplier?.companyName ?? ''}  |  ${title}`}
            company={company}
          />
          <DataTable
            columns={columns}
            data={sortedRows}
            keyField={(r) => r.productId}
            isLoading={supplierProductsQuery.isLoading}
          />
        </div>
      )}
    </div>
  );
}
