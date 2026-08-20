import { forwardRef, MouseEvent, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getErrorMessage, unwrap } from '../../lib/api-client';
import { formatAmount, formatQuantity } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Tooltip } from '../../components/ui/Tooltip';
import { PackageQuantity } from '../../components/ui/PackageQuantity';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany, useIsPressManagerRestricted, useIsSalesRep } from '../../lib/use-active-company';
import { LetterheadCompany } from '../sales/DocumentLetterhead';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';

interface Product {
  id: string;
  sku?: string;
  barcode?: string;
  nameEn: string;
  nameAr?: string;
  brandId?: string | null;
  categoryId?: string | null;
  unitId: string;
  sellingPrice: number | null;
  purchasePrice: number;
  reorderLevel: number;
  averageCost: number;
  packageTypeId: string;
  unitsPerPackage: number;
  packagePurchasePrice: number | null;
  packageSellingPrice: number | null;
  notes?: string;
  isActive: boolean;
  isSellable?: boolean;
}

interface Unit {
  id: string;
  code: string;
  nameEn: string;
  categoryId: string;
}

interface PackageType {
  id: string;
  nameEn: string;
  categoryId: string;
}

interface Brand {
  id: string;
  nameEn: string;
  categoryId: string;
}

interface ProductCategory {
  id: string;
  nameEn: string;
}

interface StockLevel {
  quantityOnHand: number;
  product: { id: string };
  warehouse: { id: string; nameEn: string; branchId?: string | null };
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface WarehouseQuantity {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

interface PurchaseReceipt {
  productId: string;
  receiptDate: string;
  quantityPackages: number;
  totalAmount: number;
  paidAmount: number;
  warehouse?: { id: string; branchId?: string | null } | null;
}

interface Company extends LetterheadCompany {
  id: string;
}

const emptyForm = {
  sku: '',
  barcode: '',
  name: '',
  unitId: '',
  reorderLevel: '0',
  notes: '',
  packageTypeId: '',
  unitsPerPackage: '',
  brandId: '',
  categoryId: '',
  isSellable: false,
  sellingPrice: '',
};

type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/** Same three-way rule the status Badge column already used inline — pulled out so the raw
 * materials table's default sort/filter (Printing Press only) can share it instead of
 * re-deriving the same total-vs-reorderLevel comparison a second time. */
function computeStockStatus(total: number, reorderLevel: number): StockStatus {
  if (total <= 0) return 'OUT_OF_STOCK';
  if (total <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

const STOCK_STATUS_PRIORITY: Record<StockStatus, number> = { IN_STOCK: 1, LOW_STOCK: 2, OUT_OF_STOCK: 3 };

/** Print/PDF are triggered from the parent's own top bar (the standalone ProductsPage's
 * PageHeader, or — for the Printing Press tenant — SuppliersPage's unified top bar when this is
 * embedded as its "المواد الخام" tab), not from a button rendered inside this component. */
export interface ProductsTabHandle {
  print: () => void;
  downloadPdf: () => Promise<void>;
}

interface ProductsTabProps {
  /** Lets the parent's "تحميل PDF" button (which lives outside this component) disable itself
   * for the duration of the export, since `pdfLoading` itself can't be read through a ref. */
  onPdfLoadingChange?: (loading: boolean) => void;
}

interface RepProductRow {
  id: string;
  sku: string | null;
  barcode: string | null;
  nameAr: string;
  nameEn: string;
  packageTypeNameAr: string | null;
  packageTypeNameEn: string | null;
  availabilityStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

/** "مندوب" role's entire product/inventory screen — a stripped four-column view (code/barcode,
 * name, package type, availability status) sourced from a dedicated backend endpoint that never
 * selects quantity/cost/price columns in the first place (see ProductsService.findRepViewForCompany),
 * so there's nothing sensitive to accidentally leak here even client-side. No stat cards, no
 * add/edit/delete — this role only ever browses. */
export function RepProductsView() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [search, setSearch] = useState('');
  const productsQuery = useQuery({
    queryKey: ['products-rep-view', companyId],
    queryFn: () => unwrap<RepProductRow[]>(apiClient.get('/inventory/products/rep-view')),
    enabled: !!companyId,
  });
  const rows = useMemo(() => {
    const all = productsQuery.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (r) =>
        r.nameAr?.toLowerCase().includes(term) ||
        r.nameEn?.toLowerCase().includes(term) ||
        r.sku?.toLowerCase().includes(term) ||
        r.barcode?.toLowerCase().includes(term),
    );
  }, [productsQuery.data, search]);

  const columns: Column<RepProductRow>[] = [
    { header: t('products.codeOrBarcode'), accessor: (r) => r.sku || r.barcode || '—' },
    { header: t('fields.nameAr'), accessor: (r) => r.nameAr || r.nameEn },
    { header: t('fields.packageType'), accessor: (r) => r.packageTypeNameAr || r.packageTypeNameEn || '—' },
    {
      header: t('fields.stockStatus'),
      accessor: (r) =>
        r.availabilityStatus === 'OUT_OF_STOCK' ? (
          <Badge color="red">{t('warehouse.outOfStock')}</Badge>
        ) : r.availabilityStatus === 'LOW_STOCK' ? (
          <Badge color="yellow">{t('warehouse.lowStock')}</Badge>
        ) : (
          <Badge color="green">{t('warehouse.inStock')}</Badge>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-3 max-w-sm">
        <Input
          type="search"
          placeholder={t('products.searchPlaceholder') ?? ''}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DataTable
        columns={columns}
        data={rows}
        keyField={(r) => r.id}
        isLoading={productsQuery.isLoading}
        searchable={false}
      />
    </div>
  );
}

/** Embeddable body of the products screen, reused as-is by the standalone `ProductsPage` route
 * (all companies) and, for Printing Press, as the "المواد الخام" sub-tab inside SuppliersPage —
 * see that file's tab restructuring for why. Owns its own "+ إضافة" action, matching every other
 * embeddable tab in that section (SuppliersTab, ImportCargoTab). */
export const ProductsTab = forwardRef<ProductsTabHandle, ProductsTabProps>(function ProductsTab(
  { onPdfLoadingChange },
  ref,
) {
  const { t } = useTranslation();
  const { isPrintingPress, isAirConditioning } = useActiveCompany();
  const isManagerRestricted = useIsPressManagerRestricted();
  const isSalesRep = useIsSalesRep();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('inventory.product.create'));
  const canEdit = useAuthStore((s) => s.hasPermission('inventory.product.edit'));
  const canDelete = useAuthStore((s) => s.hasPermission('inventory.product.delete'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [breakdownProduct, setBreakdownProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  // Printing Press only — everything below drives its "من تاريخ/إلى تاريخ" filter, summary cards,
  // and print/PDF export.
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  // Printing Press only — "تصفية حسب الفرع"; empty string means every branch (الكل).
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StockStatus>('ALL');
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    onPdfLoadingChange?.(pdfLoading);
  }, [pdfLoading, onPdfLoadingChange]);

  // Printing Press restricts the search bar to name/category/brand only (see displayedProducts
  // below), matched client-side instead of via the backend's broader 5-field ILIKE search (which
  // also matches SKU/barcode) — every other company keeps using that shared backend search as-is.
  const productsQuery = useQuery({
    queryKey: ['products', companyId, isPrintingPress ? undefined : search],
    queryFn: () =>
      unwrap<Product[]>(
        apiClient.get('/inventory/products', {
          params: { companyId, search: isPrintingPress ? undefined : search || undefined },
        }),
      ),
    enabled: !!companyId,
  });

  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => unwrap<Unit[]>(apiClient.get('/settings/units')),
  });

  const packageTypesQuery = useQuery({
    queryKey: ['package-types'],
    queryFn: () => unwrap<PackageType[]>(apiClient.get('/settings/package-types')),
  });

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: () => unwrap<Brand[]>(apiClient.get('/settings/brands')),
  });

  const categoriesQuery = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => unwrap<ProductCategory[]>(apiClient.get('/settings/product-categories')),
  });

  const stockLevelsQuery = useQuery({
    queryKey: ['stock-levels', companyId],
    queryFn: () => unwrap<StockLevel[]>(apiClient.get('/inventory/stock/levels', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Printing Press only — backs "متوسط سعر شراء الوحدة" (weighted average across every receipt
  // ever recorded for the product, not just the latest one) and "المبلغ المدفوع" below.
  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
    enabled: isPrintingPress,
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Printing Press only — powers "تصفية حسب الفرع" above the table.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  // Both the per-row purchase/paid columns and the summary cards below recompute live from this
  // — an empty dateRange (the default) matches every receipt, so nothing changes until the user
  // actually picks a period.
  const dateFilteredReceipts = useMemo(
    () => (receiptsQuery.data ?? []).filter((r) => inDateRange(r.receiptDate, dateRange)),
    [receiptsQuery.data, dateRange],
  );

  // Printing Press only — narrows the same receipts further to just the selected branch's
  // warehouse(s), stacking with the date-range filter above rather than replacing it.
  const branchFilteredReceipts = useMemo(
    () =>
      isPrintingPress && branchFilter
        ? dateFilteredReceipts.filter((r) => r.warehouse?.branchId === branchFilter)
        : dateFilteredReceipts,
    [dateFilteredReceipts, branchFilter, isPrintingPress],
  );

  const purchaseTotalsByProduct = useMemo(() => {
    const map = new Map<string, { totalCost: number; totalPackages: number; totalPaid: number }>();
    for (const r of branchFilteredReceipts) {
      const entry = map.get(r.productId) ?? { totalCost: 0, totalPackages: 0, totalPaid: 0 };
      entry.totalCost += Number(r.totalAmount ?? 0);
      entry.totalPackages += Number(r.quantityPackages ?? 0);
      entry.totalPaid += Number(r.paidAmount ?? 0);
      map.set(r.productId, entry);
    }
    return map;
  }, [branchFilteredReceipts]);

  // Weighted average cost per package (e.g. per carton) across every receipt for this product —
  // total spent divided by total packages bought, not the single most recent receipt's price.
  function averageUnitPurchasePrice(productId: string): number {
    const totals = purchaseTotalsByProduct.get(productId);
    if (!totals || totals.totalPackages <= 0) return 0;
    return totals.totalCost / totals.totalPackages;
  }

  function totalPaidForProduct(productId: string): number {
    return purchaseTotalsByProduct.get(productId)?.totalPaid ?? 0;
  }

  // Printing Press only — same branch narrowing as branchFilteredReceipts above, applied to
  // on-hand stock so "الكمية المتاحة" / "إجمالي السعر" reflect just the selected branch too.
  const branchFilteredStockLevels = useMemo(
    () =>
      isPrintingPress && branchFilter
        ? (stockLevelsQuery.data ?? []).filter((l) => l.warehouse?.branchId === branchFilter)
        : (stockLevelsQuery.data ?? []),
    [stockLevelsQuery.data, branchFilter, isPrintingPress],
  );

  const quantityByProduct = useMemo(() => {
    const map = new Map<string, WarehouseQuantity[]>();
    for (const level of branchFilteredStockLevels) {
      const productId = level.product?.id;
      if (!productId) continue;
      const rows = map.get(productId) ?? [];
      rows.push({
        warehouseId: level.warehouse?.id,
        warehouseName: level.warehouse?.nameEn ?? '—',
        quantity: Number(level.quantityOnHand),
      });
      map.set(productId, rows);
    }
    return map;
  }, [branchFilteredStockLevels]);

  function totalQuantity(productId: string): number {
    return (quantityByProduct.get(productId) ?? []).reduce((sum, r) => sum + r.quantity, 0);
  }

  // Printing Press only — narrows the table (and everything derived from it below) to just
  // item name / category / brand matches, deliberately excluding SKU/barcode which this tenant's
  // raw-materials table doesn't even display as columns. Every other company keeps relying on the
  // backend's own broader search (see productsQuery above), so this is a no-op there. Calls the
  // categoryLabel/brandLabel function declarations defined further below — safe since function
  // declarations are hoisted within this component's scope.
  const displayedProducts = useMemo(() => {
    const rows = productsQuery.data ?? [];
    if (!isPrintingPress) return rows;
    const q = search.trim().toLowerCase();
    const searched = q
      ? rows.filter((p) => {
          const name = (p.nameEn || p.nameAr || '').toLowerCase();
          return name.includes(q) || categoryLabel(p).toLowerCase().includes(q) || brandLabel(p).toLowerCase().includes(q);
        })
      : rows;
    const statusOf = (p: Product) => computeStockStatus(totalQuantity(p.id), Number(p.reorderLevel ?? 0));
    const filtered = statusFilter === 'ALL' ? searched : searched.filter((p) => statusOf(p) === statusFilter);
    // Default sort: متوفر أولاً، يليه منخفض، ثم غير متوفر في نهاية الجدول.
    return [...filtered].sort((a, b) => STOCK_STATUS_PRIORITY[statusOf(a)] - STOCK_STATUS_PRIORITY[statusOf(b)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.data, isPrintingPress, search, statusFilter, categoriesQuery.data, brandsQuery.data, quantityByProduct]);

  // displayedProducts is exactly "المواد الخام المعروضة بالجدول" (server-filtered for other
  // companies, client-filtered for Press) — receipts for products outside that set never enter
  // these sums.
  const visibleProductIds = useMemo(() => new Set(displayedProducts.map((p) => p.id)), [displayedProducts]);
  const visibleDateFilteredReceipts = useMemo(
    () => branchFilteredReceipts.filter((r) => visibleProductIds.has(r.productId)),
    [branchFilteredReceipts, visibleProductIds],
  );
  const totalPurchasesSum = useMemo(
    () => visibleDateFilteredReceipts.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0),
    [visibleDateFilteredReceipts],
  );
  const totalPaidSum = useMemo(
    () => visibleDateFilteredReceipts.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0),
    [visibleDateFilteredReceipts],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/inventory/products', {
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        nameEn: form.name,
        nameAr: form.name,
        unitId: form.unitId,
        reorderLevel: Number(form.reorderLevel),
        notes: form.notes || undefined,
        packageTypeId: form.packageTypeId,
        unitsPerPackage: Number(form.unitsPerPackage),
        brandId: form.brandId || undefined,
        categoryId: form.categoryId,
        isSellable: form.isSellable,
        sellingPrice: form.isSellable && form.sellingPrice ? Number(form.sellingPrice) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
      setForm(emptyForm);
      toast.success(t('common.addedSuccessfully'));
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/inventory/products/${editingId}`, {
        sku: form.sku || undefined,
        barcode: form.barcode || undefined,
        nameEn: form.name,
        nameAr: form.name,
        unitId: form.unitId,
        reorderLevel: Number(form.reorderLevel),
        notes: form.notes || undefined,
        packageTypeId: form.packageTypeId,
        unitsPerPackage: Number(form.unitsPerPackage),
        brandId: form.brandId || null,
        categoryId: form.categoryId,
        isSellable: form.isSellable,
        sellingPrice: form.isSellable && form.sellingPrice ? Number(form.sellingPrice) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(t('common.savedSuccessfully'));
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => toast.error(getErrorMessage(err, t('common.saveFailed'))),
  });

  async function handleDelete(e: MouseEvent, product: Product) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: product.nameEn }) });
    if (ok) deleteMutation.mutate(product.id);
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingId(product.id);
    setForm({
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      name: product.nameEn,
      unitId: product.unitId ?? '',
      reorderLevel: String(product.reorderLevel ?? 0),
      notes: product.notes ?? '',
      packageTypeId: product.packageTypeId,
      unitsPerPackage: String(product.unitsPerPackage ?? ''),
      brandId: product.brandId ?? '',
      categoryId: product.categoryId ?? '',
      isSellable: product.isSellable ?? false,
      sellingPrice: product.sellingPrice != null ? String(product.sellingPrice) : '',
    });
    setModalOpen(true);
  }

  function packageLabel(r: Product): string {
    if (!r.packageTypeId || !r.unitsPerPackage) return '—';
    const p = packageTypesQuery.data?.find((x) => x.id === r.packageTypeId);
    return `${p?.nameEn ?? '?'} (${formatQuantity(r.unitsPerPackage)})`;
  }

  function brandLabel(r: Product): string {
    if (!r.brandId) return '—';
    return brandsQuery.data?.find((b) => b.id === r.brandId)?.nameEn ?? '—';
  }

  function categoryLabel(r: Product): string {
    if (!r.categoryId) return '—';
    return categoriesQuery.data?.find((c) => c.id === r.categoryId)?.nameEn ?? '—';
  }

  const columns: Column<Product>[] = [
    // Printing Press treats these as raw materials: SKU/barcode are dropped (not how this
    // tenant tracks materials) in favor of surfacing Category prominently for easy sorting.
    ...(isPrintingPress
      ? []
      : [
          { header: t('fields.sku'), accessor: (r: Product) => r.sku ?? '—', width: '8%' },
          // AC (Air Conditioning) company only — this column shows the same underlying barcode
          // data, just relabeled "القدرة" (capacity); every other company keeps "الباركود".
          {
            header: t(isAirConditioning ? 'products.capacityLabel' : 'fields.barcode'),
            accessor: (r: Product) => r.barcode ?? '—',
            width: '10%',
          },
        ]),
    { header: t('common.name'), accessor: (r) => <bdi dir="ltr">{r.nameEn}</bdi> },
    ...(isPrintingPress ? [{ header: t('fields.category'), accessor: (r: Product) => categoryLabel(r) }] : []),
    { header: t('fields.brand'), accessor: (r) => brandLabel(r) },
    { header: t('fields.package'), accessor: (r) => packageLabel(r) },
    // Manager role, Press branch only: this single column is dropped (everything else — stat
    // cards, filters, remaining columns — stays visible), so the manager relies on physical
    // counting rather than the system-recorded on-hand quantity.
    ...(isManagerRestricted
      ? []
      : [
          {
            header: t('fields.availableQuantity'),
            accessor: (r: Product) => {
              const total = totalQuantity(r.id);
              const display = (
                <PackageQuantity
                  baseQuantity={total}
                  unitsPerPackage={r.unitsPerPackage}
                  packageUnitName={packageTypesQuery.data?.find((p) => p.id === r.packageTypeId)?.nameEn}
                />
              );
              return (
                <button
                  type="button"
                  className="text-primary-600 underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBreakdownProduct(r);
                  }}
                >
                  {display}
                </button>
              );
            },
            align: 'right' as const,
            width: '12%',
          },
        ]),
    {
      header: t('fields.stockStatus'),
      accessor: (r) => {
        // Stock status is a company-wide question: it's evaluated against the total quantity
        // across every warehouse, never a single warehouse's balance in isolation.
        const current = totalQuantity(r.id);
        const minRequired = Number(r.reorderLevel ?? 0);
        const status = computeStockStatus(current, minRequired);
        const shortage = Math.max(0, minRequired - current);
        const badge =
          status === 'OUT_OF_STOCK' ? (
            <Badge color="red">{t('warehouse.outOfStock')}</Badge>
          ) : status === 'LOW_STOCK' ? (
            <Badge color="yellow">{t('warehouse.lowStock')}</Badge>
          ) : (
            <Badge color="green">{t('warehouse.inStock')}</Badge>
          );
        return (
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                <div>
                  {t('products.stockTooltipMinRequired')}: {formatAmount(minRequired)}
                </div>
                <div>
                  {t('products.stockTooltipShortage')}: {shortage > 0 ? formatAmount(shortage) : t('products.stockTooltipNone')}
                </div>
              </div>
            }
          >
            {badge}
          </Tooltip>
        );
      },
      align: 'center',
      width: '9%',
    },
    // Printing Press has no use for selling-price tracking on raw materials (per the Purchasing
    // form hiding both selling-price fields for this tenant) — it swaps them for the unit
    // purchase price and the material's total on-hand stock value instead.
    ...(isPrintingPress
      ? [
          {
            header: t('fields.unitPurchasePrice'),
            accessor: (r: Product) => formatAmount(averageUnitPurchasePrice(r.id)),
            align: 'right' as const,
            width: '9%',
          },
          {
            header: t('fields.totalPrice'),
            accessor: (r: Product) => formatAmount(totalQuantity(r.id) * Number(r.averageCost)),
            align: 'right' as const,
            width: '9%',
          },
          {
            header: t('fields.paidAmount'),
            accessor: (r: Product) => formatAmount(totalPaidForProduct(r.id)),
            align: 'right' as const,
            width: '9%',
          },
        ]
      : [
          {
            header: t('fields.packageAverageCost'),
            accessor: (r: Product) =>
              r.packagePurchasePrice != null
                ? formatAmount(Number(r.averageCost) * (r.unitsPerPackage ? Number(r.unitsPerPackage) : 1))
                : '—',
            align: 'right' as const,
            width: '9%',
          },
          {
            header: t('fields.packageSellingPrice'),
            accessor: (r: Product) => (r.packageSellingPrice != null ? formatAmount(r.packageSellingPrice) : '—'),
            align: 'right' as const,
            width: '9%',
          },
          {
            header: t('fields.sellingPrice'),
            accessor: (r: Product) => (r.sellingPrice != null ? formatAmount(r.sellingPrice) : '—'),
            align: 'right' as const,
            width: '9%',
          },
        ]),
    // Printing Press swaps the active/inactive Status column for the raw material's own selling
    // price (only meaningful there, since isSellable raw materials are the ones sold directly) —
    // every other company keeps the Status column exactly as before.
    ...(isPrintingPress
      ? [
          {
            header: t('fields.sellingPriceColumn'),
            accessor: (r: Product) => formatAmount(r.sellingPrice ?? 0),
            align: 'right' as const,
            width: '9%',
          },
        ]
      : [
          {
            header: t('common.status'),
            accessor: (r: Product) => (
              <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? t('common.active') : t('common.inactive')}</Badge>
            ),
          },
        ]),
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            accessor: (r: Product) => (
              <div className="flex justify-center gap-3">
                {canEdit && (
                  <button
                    type="button"
                    className="text-primary-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(r);
                    }}
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={(e) => handleDelete(e, r)}
                    disabled={deleteMutation.isPending}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ),
            align: 'center' as const,
          },
        ]
      : []),
  ];

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('printDocument.rawMaterialsTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName(t('printDocument.rawMaterialsTitle'), company?.nameAr || company?.nameEn, localToday()),
        'portrait',
      );
    } catch (err) {
      toast.error(t('products.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Raw materials PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  useImperativeHandle(ref, () => ({ print: handlePrint, downloadPdf: handleDownloadPdf }));

  if (isSalesRep) return <RepProductsView />;

  return (
    <div>
      {canCreate && (
        <div className="mb-3 flex justify-end print:hidden">
          <Button onClick={openCreateModal}>+ {t('common.create')}</Button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-3 print:hidden">
        {/* Printing Press only — the date-range filter renders first in markup so it lands on the
            row's right (RTL) side, with the search box after it landing on the left; every other
            company never renders this block, so its position here has no effect there. */}
        {isPrintingPress && <DateRangeFilter value={dateRange} onChange={setDateRange} />}

        <div className="max-w-sm min-w-[220px] flex-1">
          <Input
            type="search"
            placeholder={t(isPrintingPress ? 'products.searchPlaceholderPress' : 'products.searchPlaceholder') ?? ''}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isPrintingPress && (
          <div className="max-w-xs">
            <FormField label={t('products.filterByBranch')}>
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">{t('common.all')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}

        {/* Sits right beside the branch filter in the same flex row (not a separate row) — the
            table itself is always sorted متوفر → منخفض → غير متوفر regardless of this filter's
            value; this just narrows which rows are shown. */}
        {isPrintingPress && (
          <div className="max-w-xs">
            <FormField label={t('products.filterByStockStatus')}>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | StockStatus)}>
                <option value="ALL">{t('common.all')}</option>
                <option value="IN_STOCK">{t('warehouse.inStock')}</option>
                <option value="LOW_STOCK">{t('warehouse.lowStock')}</option>
                <option value="OUT_OF_STOCK">{t('warehouse.outOfStock')}</option>
              </Select>
            </FormField>
          </div>
        )}
      </div>

      <div ref={printRef} className={isPrintingPress ? 'printable-document raw-materials-print' : 'raw-materials-print'}>
        {/* Print/PDF-only heading — deliberately just the title, not the full company letterhead
            used by invoices/statements elsewhere: this report shows the table and nothing else
            once printed, per the raw-materials print spec. */}
        {isPrintingPress && (
          <div className="raw-materials-print-header">
            <h1
              style={{
                textAlign: 'center',
                fontSize: '16pt',
                fontWeight: 800,
                color: '#1e3a8a',
                margin: '0 0 16px',
              }}
            >
              {t('printDocument.rawMaterialsTitle')}
            </h1>
          </div>
        )}

        {isPrintingPress && (
          <div className="raw-materials-print-summary mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 print:hidden">
            <Card>
              <div className="text-sm text-[var(--text-muted)]">{t('fields.totalPurchases')}</div>
              <div className="mt-1 text-xl font-semibold">{formatAmount(totalPurchasesSum)}</div>
            </Card>
            <Card>
              <div className="text-sm text-[var(--text-muted)]">{t('fields.paidAmount')}</div>
              <div className="mt-1 text-xl font-semibold">{formatAmount(totalPaidSum)}</div>
            </Card>
          </div>
        )}

        {/* pageSize forced to the full array length so print/PDF (which only ever captures rows
            actually mounted in the DOM) gets every row, not just the current on-screen page. */}
        <DataTable
          columns={columns}
          data={displayedProducts}
          keyField={(r) => r.id}
          isLoading={productsQuery.isLoading}
          searchable={false}
          pageSize={Math.max(displayedProducts.length, 1)}
        />
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t('common.edit') : t('common.create')}
        widthClass="max-w-2xl"
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) updateMutation.mutate();
            else createMutation.mutate();
          }}
        >
          {!isPrintingPress && (
            <FormField label={t('fields.sku')} required>
              <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </FormField>
          )}
          {!isPrintingPress && (
            // AC (Air Conditioning) company only — same underlying barcode field/column, just
            // relabeled "القدرة" (capacity); every other company keeps "الباركود".
            <FormField label={t(isAirConditioning ? 'products.capacityLabel' : 'fields.barcode')}>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </FormField>
          )}
          <FormField label={t('common.name')}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label={t('fields.reorderLevel')}>
            <Input
              type="number"
              step="0.01"
              value={form.reorderLevel}
              onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.category')} required>
            <SearchableSelect
              required
              value={form.categoryId}
              options={(categoriesQuery.data ?? []).map((c) => ({ value: c.id, label: c.nameEn }))}
              // Changing the category always clears the brand/package/unit — none of those chosen
              // under the previous category are valid for the new one, so there's no case where
              // keeping any of them makes sense (see the three dependent lists below).
              onChange={(v) => setForm({ ...form, categoryId: v, brandId: '', packageTypeId: '', unitId: '' })}
            />
          </FormField>
          <FormField label={t('fields.brand')}>
            <Select
              value={form.brandId}
              disabled={!form.categoryId}
              onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            >
              <option value="">{form.categoryId ? '—' : t('products.selectCategoryFirst')}</option>
              {(brandsQuery.data ?? [])
                .filter((b) => b.categoryId === form.categoryId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameEn}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label={t('fields.package')}>
            <Select
              required
              value={form.packageTypeId}
              disabled={!form.categoryId}
              onChange={(e) => setForm({ ...form, packageTypeId: e.target.value })}
            >
              <option value="">{form.categoryId ? '—' : t('products.selectCategoryFirst')}</option>
              {(packageTypesQuery.data ?? [])
                .filter((p) => p.categoryId === form.categoryId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameEn}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label={t('fields.unit')}>
            <Select
              required
              value={form.unitId}
              disabled={!form.categoryId}
              onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            >
              <option value="">{form.categoryId ? '—' : t('products.selectCategoryFirst')}</option>
              {(unitsQuery.data ?? [])
                .filter((u) => u.categoryId === form.categoryId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nameEn}
                  </option>
                ))}
            </Select>
          </FormField>
          <div className="col-span-2">
            <FormField label={t('fields.unitsPerPackage')}>
              <Input
                required
                type="number"
                step="1"
                min="1"
                value={form.unitsPerPackage}
                onChange={(e) => setForm({ ...form, unitsPerPackage: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('common.notes')}>
              <textarea
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-primary-500"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </FormField>
          </div>
          {isPrintingPress && (
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isSellable}
                onChange={(e) => setForm({ ...form, isSellable: e.target.checked })}
              />
              {t('fields.isSellable')}
            </label>
          )}
          {isPrintingPress && form.isSellable && (
            <div className="col-span-2">
              <FormField label={t('fields.suggestedSellingPrice')}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={t('fields.suggestedSellingPricePlaceholder') ?? ''}
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                />
              </FormField>
            </div>
          )}
          <p className="col-span-2 text-xs text-[var(--text-muted)]">{t('fields.pricingViaReceiptHint')}</p>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!breakdownProduct}
        onClose={() => setBreakdownProduct(null)}
        title={breakdownProduct ? `${t('products.quantityByWarehouse')} — ${breakdownProduct.nameEn}` : ''}
      >
        {breakdownProduct && (
          <ul className="divide-y divide-[var(--border)]">
            {(quantityByProduct.get(breakdownProduct.id) ?? []).filter((r) => r.quantity > 0).length === 0 ? (
              <li className="py-3 text-center text-sm text-[var(--text-muted)]">{t('products.noStock')}</li>
            ) : (
              (quantityByProduct.get(breakdownProduct.id) ?? [])
                .filter((r) => r.quantity > 0)
                .map((r) => (
                  <li key={r.warehouseId} className="flex items-center justify-between py-2 text-sm">
                    <span>{r.warehouseName}</span>
                    <span className="font-medium">
                      <PackageQuantity
                        baseQuantity={r.quantity}
                        unitsPerPackage={breakdownProduct.unitsPerPackage}
                        packageUnitName={
                          packageTypesQuery.data?.find((p) => p.id === breakdownProduct.packageTypeId)?.nameEn
                        }
                      />
                    </span>
                  </li>
                ))
            )}
          </ul>
        )}
      </Modal>
    </div>
  );
});

/** Standalone route wrapper for every company except Printing Press (which embeds ProductsTab
 * directly inside SuppliersPage instead) — adds the page-level title this tab intentionally omits
 * so it isn't duplicated when nested under another section's own heading. */
export function ProductsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t('nav.products')} />
      <ProductsTab />
    </div>
  );
}
