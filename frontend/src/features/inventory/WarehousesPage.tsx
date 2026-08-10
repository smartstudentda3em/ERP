import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input, Select, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { PackageQuantity } from '../../components/ui/PackageQuantity';

interface WarehouseOption {
  id: string;
  code: string;
  nameEn: string;
}

interface LookupOption {
  id: string;
  nameEn: string;
}

type StockStatus = 'in' | 'out' | 'low';

interface ProductRow {
  stockLevelId: string;
  productId: string;
  sku?: string;
  barcode?: string;
  nameEn: string;
  nameAr?: string;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  unit: { id: string; code: string; name: string } | null;
  packageType: { id: string; code: string; name: string } | null;
  unitsPerPackage: number | null;
  quantityOnHand: number;
  packageBreakdown: { packages: number; remainderUnits: number } | null;
  reservedQuantity: number;
  minimumStock: number;
  purchasePrice: number;
  sellingPrice: number;
  packagePurchasePrice: number | null;
  packageSellingPrice: number | null;
  location: string | null;
  status: StockStatus;
  updatedAt: string;
}

interface Summary {
  totalProducts: number;
  totalPackageQuantity: number;
  totalUnits: number;
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
}

interface CompanySummary {
  inventoryValue: number;
}

interface PagedResult {
  items: ProductRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function WarehousesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress } = useActiveCompany();

  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [status, setStatus] = useState<'' | StockStatus>('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  const debouncedWarehouseSearch = useDebounced(warehouseSearch);
  const debouncedProductSearch = useDebounced(productSearch);

  // Company-wide total, independent of the warehouse/category/brand/status filters below —
  // the same live SUM across all stock_levels the Dashboard's "قيمة المخزون" card and the
  // Partners > Assets tab already use, so this figure always agrees with those.
  const companySummaryQuery = useQuery({
    queryKey: ['dashboard-summary', companyId],
    queryFn: () => unwrap<CompanySummary>(apiClient.get('/dashboard/summary', { params: { companyId } })),
    enabled: !!companyId,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses-search', companyId, debouncedWarehouseSearch],
    queryFn: () =>
      unwrap<WarehouseOption[]>(
        apiClient.get('/settings/warehouses', { params: { companyId, search: debouncedWarehouseSearch || undefined } }),
      ),
    enabled: !!companyId,
  });

  const categoriesQuery = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => unwrap<LookupOption[]>(apiClient.get('/settings/product-categories')),
  });

  const brandsQuery = useQuery({
    queryKey: ['brands'],
    queryFn: () => unwrap<LookupOption[]>(apiClient.get('/settings/brands')),
  });

  const summaryQuery = useQuery({
    queryKey: ['warehouse-summary', selectedWarehouseId],
    queryFn: () => unwrap<Summary>(apiClient.get(`/inventory/warehouse-view/${selectedWarehouseId}/summary`)),
    enabled: !!selectedWarehouseId,
  });

  const productsQuery = useQuery({
    queryKey: [
      'warehouse-products',
      selectedWarehouseId,
      debouncedProductSearch,
      categoryId,
      brandId,
      status,
      page,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      unwrap<PagedResult>(
        apiClient.get(`/inventory/warehouse-view/${selectedWarehouseId}/products`, {
          params: {
            search: debouncedProductSearch || undefined,
            categoryId: categoryId || undefined,
            brandId: brandId || undefined,
            status: status || undefined,
            page,
            limit: 20,
            sortBy,
            sortOrder,
          },
        }),
      ),
    enabled: !!selectedWarehouseId,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    setPage(1);
  }, [selectedWarehouseId, debouncedProductSearch, categoryId, brandId, status]);

  function handleSort(key: string) {
    if (sortBy === key) setSortOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    else {
      setSortBy(key);
      setSortOrder('ASC');
    }
  }

  const statusColumn: Column<ProductRow> = {
    header: t('common.status'),
    accessor: (r) => (
      <Badge color={r.status === 'out' ? 'red' : r.status === 'low' ? 'yellow' : 'green'}>
        {r.status === 'out'
          ? t('warehouse.outOfStock')
          : r.status === 'low'
            ? t('warehouse.lowStock')
            : t('warehouse.inStock')}
      </Badge>
    ),
  };

  // Printing Press's raw-material stock has no meaningful SKU/barcode/category (those fields exist
  // on the Product record but are never surfaced for this tenant elsewhere — see ProductsPage.tsx's
  // isPrintingPress SKU-field hiding) and never carries a package selling price since raw materials
  // aren't sold as-is. Its purchasing columns are also reframed to what a press buyer actually
  // tracks: the running weighted-average package cost plus its per-unit equivalent, instead of the
  // single package-purchase-price snapshot every other tenant sees.
  const columns: Column<ProductRow>[] = isPrintingPress
    ? [
        { header: t('warehouse.productName'), accessor: (r) => r.nameEn, sortKey: 'name' },
        { header: t('fields.packagingType'), accessor: (r) => r.packageType?.name ?? '—', sortKey: 'packageType' },
        {
          header: t('warehouse.availableQuantity'),
          accessor: (r) => (
            <PackageQuantity
              baseQuantity={r.quantityOnHand}
              unitsPerPackage={r.unitsPerPackage}
              packageUnitName={r.packageType?.name}
              unitName={r.unit?.name}
            />
          ),
          align: 'right',
          sortKey: 'quantity',
        },
        {
          header: t('warehouse.reservedQuantity'),
          accessor: (r) => formatAmount(r.reservedQuantity),
          align: 'right',
          sortKey: 'reserved',
        },
        { header: t('warehouse.minStock'), accessor: (r) => formatAmount(r.minimumStock), align: 'right', sortKey: 'minStock' },
        {
          header: t('warehouse.avgPackagePurchasePrice'),
          accessor: (r) => (r.packagePurchasePrice != null ? formatAmount(r.packagePurchasePrice) : '—'),
          align: 'right',
          sortKey: 'packagePurchasePrice',
        },
        {
          header: t('warehouse.unitPurchasePrice'),
          accessor: (r) => (r.purchasePrice != null ? formatAmount(r.purchasePrice) : '—'),
          align: 'right',
          sortKey: 'purchasePrice',
        },
        {
          header: t('warehouse.location'),
          accessor: (r) => r.location ?? t('warehouse.noLocation'),
          sortKey: 'location',
        },
        statusColumn,
        {
          header: t('warehouse.lastUpdated'),
          accessor: (r) => new Date(r.updatedAt).toLocaleDateString(),
          sortKey: 'updatedAt',
        },
      ]
    : [
        { header: t('warehouse.productCode'), accessor: (r) => r.sku ?? '—', sortKey: 'code' },
        { header: t('fields.barcode'), accessor: (r) => r.barcode ?? '—', sortKey: 'barcode' },
        { header: t('warehouse.productName'), accessor: (r) => r.nameEn, sortKey: 'name' },
        { header: t('fields.category'), accessor: (r) => r.category?.name ?? '—', sortKey: 'category' },
        { header: t('fields.packagingType'), accessor: (r) => r.packageType?.name ?? '—', sortKey: 'packageType' },
        {
          header: t('warehouse.availableQuantity'),
          accessor: (r) => (
            <PackageQuantity
              baseQuantity={r.quantityOnHand}
              unitsPerPackage={r.unitsPerPackage}
              packageUnitName={r.packageType?.name}
              unitName={r.unit?.name}
            />
          ),
          align: 'right',
          sortKey: 'quantity',
        },
        {
          header: t('warehouse.reservedQuantity'),
          accessor: (r) => formatAmount(r.reservedQuantity),
          align: 'right',
          sortKey: 'reserved',
        },
        { header: t('warehouse.minStock'), accessor: (r) => formatAmount(r.minimumStock), align: 'right', sortKey: 'minStock' },
        {
          header: t('fields.packagePurchasePrice'),
          accessor: (r) => (r.packagePurchasePrice != null ? formatAmount(r.packagePurchasePrice) : '—'),
          align: 'right',
          sortKey: 'packagePurchasePrice',
        },
        {
          header: t('fields.packageSellingPrice'),
          accessor: (r) => (r.packageSellingPrice != null ? formatAmount(r.packageSellingPrice) : '—'),
          align: 'right',
          sortKey: 'packageSellingPrice',
        },
        {
          header: t('warehouse.location'),
          accessor: (r) => r.location ?? t('warehouse.noLocation'),
          sortKey: 'location',
        },
        statusColumn,
        {
          header: t('warehouse.lastUpdated'),
          accessor: (r) => new Date(r.updatedAt).toLocaleDateString(),
          sortKey: 'updatedAt',
        },
      ];

  const summary = summaryQuery.data;

  return (
    <div>
      <PageHeader
        title={t('warehouse.title')}
        actions={
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs text-[var(--text-muted)]">{t('warehouse.totalInventoryValueAll')}</div>
            <div className="mt-1 text-xl font-semibold">
              {companySummaryQuery.data ? formatAmount(companySummaryQuery.data.inventoryValue) : '—'}
            </div>
          </div>
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t('common.search')}>
            <Input
              placeholder={t('warehouse.searchWarehouse')}
              value={warehouseSearch}
              onChange={(e) => setWarehouseSearch(e.target.value)}
            />
          </FormField>
          <FormField label={t('warehouse.selectWarehouse')}>
            <Select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)}>
              <option value="">—</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Card>

      {!selectedWarehouseId ? (
        <Card className="p-12 text-center text-[var(--text-muted)]">{t('warehouse.selectPrompt')}</Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.totalProducts')}</div>
              <div className="mt-1 text-lg font-semibold">{summary?.totalProducts ?? '—'}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">
                {t(isPrintingPress ? 'warehouse.totalUnits' : 'warehouse.totalPackageQuantity')}
              </div>
              <div className="mt-1 text-lg font-semibold">
                {summary ? formatAmount(isPrintingPress ? summary.totalUnits : summary.totalPackageQuantity) : '—'}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.totalValue')}</div>
              <div className="mt-1 text-lg font-semibold">{summary ? formatAmount(summary.totalValue) : '—'}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.lowStockItems')}</div>
              <div className="mt-1 text-lg font-semibold text-yellow-600">{summary?.lowStockItems ?? '—'}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.outOfStockItems')}</div>
              <div className="mt-1 text-lg font-semibold text-red-600">{summary?.outOfStockItems ?? '—'}</div>
            </Card>
          </div>

          <Card className="mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label={t('warehouse.filters')}>
                <Input
                  placeholder={t('warehouse.searchProducts')}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </FormField>
              <FormField label={t('fields.category')}>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t('warehouse.allCategories')}</option>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('fields.brand')}>
                <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">{t('warehouse.allBrands')}</option>
                  {(brandsQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('warehouse.stockStatus')}>
                <Select value={status} onChange={(e) => setStatus(e.target.value as '' | StockStatus)}>
                  <option value="">{t('warehouse.allStatus')}</option>
                  <option value="in">{t('warehouse.inStock')}</option>
                  <option value="low">{t('warehouse.lowStock')}</option>
                  <option value="out">{t('warehouse.outOfStock')}</option>
                </Select>
              </FormField>
            </div>
          </Card>

          <DataTable
            columns={columns}
            data={productsQuery.data?.items ?? []}
            keyField={(r) => r.stockLevelId}
            isLoading={productsQuery.isLoading}
            searchable={false}
            onRowClick={(r) => navigate(`/inventory/warehouses/products/${r.productId}?warehouseId=${selectedWarehouseId}`)}
            serverPagination={{
              page: productsQuery.data?.page ?? 1,
              totalPages: productsQuery.data?.totalPages ?? 1,
              onPageChange: setPage,
            }}
            sort={{ sortBy, sortOrder, onSortChange: handleSort }}
          />
        </>
      )}
    </div>
  );
}
