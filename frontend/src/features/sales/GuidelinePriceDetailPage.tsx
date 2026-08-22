import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { formatAmount } from '../../lib/number-format';
import { monthNameOnly } from '../../lib/date-utils';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { FormField, Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';

interface GuidelinePriceLine {
  id: string;
  productId: string;
  price: number;
  product?: { nameEn: string; nameAr?: string | null; barcode?: string | null } | null;
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
  purchasePrice: number;
}

interface ProductRow {
  productId: string;
  name: string;
  capacity: string;
  purchasePrice: number;
}

/**
 * AC-only — opens from clicking a month/year row in GuidelinePricesTab.tsx's grouped list. A
 * merged row has no single company, so this page owns picking WHICH of that month's companies to
 * work on (top filter, scoped to only the companies that already have a sheet for this month/year
 * — see GuidelinePricesTab.tsx's "manage companies" popover, which is this page's other entry
 * point via its own ✏️ button, pre-selecting the company through ?supplierId=).
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

  const sheetsQuery = useQuery({
    queryKey: ['guideline-price-sheets', companyId],
    queryFn: () => unwrap<GuidelinePriceSheet[]>(apiClient.get('/sales/guideline-prices', { params: { companyId } })),
    enabled: !!companyId,
  });

  const groupSheets = (sheetsQuery.data ?? []).filter((s) => String(s.year) === year && String(s.month) === month);
  const supplierOptions = groupSheets.map((s) => ({ value: s.supplierId, label: s.supplier?.companyName ?? '—' }));

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
        purchasePrice: Number(p.purchasePrice) || 0,
      });
    }
    for (const line of selectedSheet?.lines ?? []) {
      if (!map.has(line.productId)) {
        map.set(line.productId, {
          productId: line.productId,
          name: line.product?.nameAr || line.product?.nameEn || '—',
          capacity: line.product?.barcode ?? '—',
          purchasePrice: 0,
        });
      }
    }
    return Array.from(map.values());
  }, [supplierProductsQuery.data, selectedSheet]);

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

  const discountRate = (selectedSheet?.discountPercentage ?? 0) / 100;

  const columns: Column<ProductRow>[] = [
    { header: t('guidelinePrices.capacity'), accessor: (r) => r.capacity },
    { header: t('guidelinePrices.itemName'), accessor: (r) => r.name },
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

  const title = year && month ? `${monthNameOnly(Number(month), i18n.language)} ${year}` : '';

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          canEdit && selectedSheet ? (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {t('common.save')}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 max-w-xs">
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

      {!supplierId ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-muted)]">
          {t('guidelinePrices.pickCompanyPrompt')}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyField={(r) => r.productId}
          isLoading={supplierProductsQuery.isLoading}
        />
      )}
    </div>
  );
}
