import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useToast } from '../../components/ui/Toast';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { PackageQuantity } from '../../components/ui/PackageQuantity';
import { localToday } from '../../lib/date-utils';

interface StockLevel {
  id: string;
  quantityOnHand: number;
  averageCost: number;
  product: {
    id: string;
    nameEn: string;
    sku: string;
    unitsPerPackage?: number | null;
    unit?: { nameEn: string } | null;
    packageType?: { nameEn: string } | null;
  };
  warehouse: { id: string; nameEn: string; nameAr?: string | null };
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdAt: string;
  product: { nameEn: string; unitsPerPackage?: number | null };
  warehouse: { nameEn: string };
  referenceNumber?: string;
}

// Inflow: goods physically entering the warehouse (purchases, returns from customers, opening
// stock, positive adjustments, incoming transfers). Everything else is an outflow.
const INFLOW_MOVEMENT_TYPES = new Set([
  'PURCHASE_RECEIPT',
  'SALES_RETURN',
  'ADJUSTMENT_IN',
  'TRANSFER_IN',
  'OPENING_STOCK',
]);

function isInflowMovement(type: string): boolean {
  return INFLOW_MOVEMENT_TYPES.has(type);
}

interface Product {
  id: string;
  sku: string;
  nameEn: string;
  unitId: string;
  purchasePrice: number;
  sellingPrice?: number | null;
  packageTypeId?: string | null;
  unitsPerPackage?: number | null;
  packagePurchasePrice?: number | null;
  packageSellingPrice?: number | null;
}

interface Warehouse {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface Unit {
  id: string;
  nameEn: string;
}

interface PackageType {
  id: string;
  nameEn: string;
}

interface StockTransfer {
  id: string;
  documentNumber: string;
  transferDate: string;
  createdByName: string;
  fromWarehouse: { nameEn: string };
  toWarehouse: { nameEn: string };
  lines: { productId: string; quantity: number; product: { nameEn: string } }[];
}

type UnitKind = 'UNIT' | 'PACKAGE';

const emptyTransferForm = {
  fromWarehouseId: '',
  toWarehouseId: '',
  productId: '',
  unitKind: 'PACKAGE' as UnitKind,
  quantity: '0',
  notes: '',
};

export function StockPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canAdjustStock = useAuthStore((s) => s.hasPermission('inventory.stock.edit'));
  const [tab, setTab] = useState<'levels' | 'movements' | 'transfers'>('levels');
  const [showDepleted, setShowDepleted] = useState(false);
  // Levels tab's own two-filter bar (product name/SKU search + warehouse dropdown), applied
  // together rather than through DataTable's generic single search box below.
  const [productSearch, setProductSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    productId: '',
    warehouseId: '',
    unitKind: 'UNIT' as UnitKind,
    systemQuantity: '0',
    countedQuantity: '0',
    unitCost: '0',
  });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);

  const levelsQuery = useQuery({
    queryKey: ['stock-levels', companyId],
    queryFn: () => unwrap<StockLevel[]>(apiClient.get('/inventory/stock/levels', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Depleted (zero-balance) rows are hidden by default — the toggle below opts back in. The
  // product search matches name OR sku; the warehouse dropdown narrows to one specific warehouse
  // (empty = all) — both apply together, on top of the depleted filter.
  const visibleLevels = (levelsQuery.data ?? []).filter((l) => {
    if (!showDepleted && Number(l.quantityOnHand) <= 0) return false;
    if (warehouseFilter && l.warehouse?.id !== warehouseFilter) return false;
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      const matchesName = l.product?.nameEn?.toLowerCase().includes(q) ?? false;
      const matchesSku = l.product?.sku?.toLowerCase().includes(q) ?? false;
      if (!matchesName && !matchesSku) return false;
    }
    return true;
  });

  const movementsQuery = useQuery({
    queryKey: ['stock-movements', companyId],
    queryFn: () => unwrap<StockMovement[]>(apiClient.get('/inventory/stock/movements', { params: { companyId } })),
    enabled: tab === 'movements' && !!companyId,
  });

  const transfersQuery = useQuery({
    queryKey: ['stock-transfers', companyId],
    queryFn: () => unwrap<StockTransfer[]>(apiClient.get('/inventory/stock/transfers', { params: { companyId } })),
    enabled: tab === 'transfers' && !!companyId,
  });

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products', { params: { companyId } })),
    enabled: (adjustOpen || transferOpen) && !!companyId,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', companyId],
    queryFn: () => unwrap<Warehouse[]>(apiClient.get('/settings/warehouses', { params: { companyId } })),
    enabled: (tab === 'levels' || adjustOpen || transferOpen) && !!companyId,
  });
  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => unwrap<Unit[]>(apiClient.get('/settings/units')),
    enabled: adjustOpen || transferOpen,
  });
  const packageTypesQuery = useQuery({
    queryKey: ['package-types'],
    queryFn: () => unwrap<PackageType[]>(apiClient.get('/settings/package-types')),
    enabled: adjustOpen || transferOpen,
  });

  const selectedProduct = productsQuery.data?.find((p) => p.id === adjustForm.productId);
  const canAdjustByPackage = !!(selectedProduct?.packageTypeId && selectedProduct?.unitsPerPackage);
  const unitsPerPackage = selectedProduct?.unitsPerPackage ?? 1;

  function unitName(id?: string | null): string {
    return unitsQuery.data?.find((u) => u.id === id)?.nameEn ?? '';
  }

  function packageTypeName(id?: string | null): string {
    return packageTypesQuery.data?.find((p) => p.id === id)?.nameEn ?? '';
  }

  // The transfer modal shows availability in packages only, never a leftover-units remainder —
  // unlike PackageQuantity elsewhere in the app, since a transfer always moves whole packages.
  function formatPackages(baseQuantity: number, unitsPerPackage?: number | null, packageUnitName?: string): string {
    if (!unitsPerPackage) return String(baseQuantity);
    return `${Math.floor(baseQuantity / unitsPerPackage)} ${packageUnitName ?? ''}`.trim();
  }

  // Same available-quantity figure, expressed in whichever unit the transfer form currently has
  // selected — packages (via formatPackages above) or raw base units.
  function formatByUnitKind(
    baseQuantity: number,
    unitKind: UnitKind,
    unitsPerPackage?: number | null,
    packageUnitName?: string,
    unitNm?: string,
  ): string {
    if (unitKind === 'PACKAGE') return formatPackages(baseQuantity, unitsPerPackage, packageUnitName);
    return `${baseQuantity} ${unitNm ?? ''}`.trim();
  }

  function resetSelection(productId: string, warehouseId: string) {
    const product = productsQuery.data?.find((p) => p.id === productId);
    const level = levelsQuery.data?.find((l) => l.product?.id === productId && l.warehouse?.id === warehouseId);
    setAdjustForm((f) => ({
      ...f,
      productId,
      warehouseId,
      unitKind: 'UNIT',
      systemQuantity: level ? String(level.quantityOnHand) : '0',
      countedQuantity: level ? String(level.quantityOnHand) : '0',
      unitCost: product ? String(product.purchasePrice) : '0',
    }));
  }

  function switchUnitKind(unitKind: UnitKind) {
    const level = levelsQuery.data?.find(
      (l) => l.product?.id === adjustForm.productId && l.warehouse?.id === adjustForm.warehouseId,
    );
    const baseQty = level?.quantityOnHand ?? 0;
    const displayQty = unitKind === 'PACKAGE' ? baseQty / unitsPerPackage : baseQty;
    const unitCost =
      unitKind === 'PACKAGE'
        ? (selectedProduct?.packagePurchasePrice ?? Number(selectedProduct?.purchasePrice ?? 0) * unitsPerPackage)
        : Number(selectedProduct?.purchasePrice ?? 0);
    setAdjustForm((f) => ({
      ...f,
      unitKind,
      systemQuantity: String(displayQty),
      countedQuantity: String(displayQty),
      unitCost: String(unitCost),
    }));
  }

  const adjustMutation = useMutation({
    mutationFn: () => {
      const factor = adjustForm.unitKind === 'PACKAGE' ? unitsPerPackage : 1;
      return apiClient.post('/inventory/stock/adjustments', {
        adjustmentDate: localToday(),
        warehouseId: adjustForm.warehouseId,
        lines: [
          {
            productId: adjustForm.productId,
            systemQuantity: Number(adjustForm.systemQuantity) * factor,
            countedQuantity: Number(adjustForm.countedQuantity) * factor,
            unitCost: Number(adjustForm.unitCost) / factor,
          },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      // An adjustment can change total inventory value (counted vs. system quantity/cost differ),
      // so both the company-wide card and the per-warehouse view on WarehousesPage must refresh too.
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-products'] });
      setAdjustOpen(false);
      setAdjustForm({
        productId: '',
        warehouseId: '',
        unitKind: 'UNIT',
        systemQuantity: '0',
        countedQuantity: '0',
        unitCost: '0',
      });
    },
  });

  // --- Stock transfer ---------------------------------------------------------
  const selectedTransferProduct = productsQuery.data?.find((p) => p.id === transferForm.productId);
  const canTransferByPackage = !!(selectedTransferProduct?.packageTypeId && selectedTransferProduct?.unitsPerPackage);
  const transferUnitsPerPackage = selectedTransferProduct?.unitsPerPackage ?? 1;
  const fromLevel = levelsQuery.data?.find(
    (l) => l.product?.id === transferForm.productId && l.warehouse?.id === transferForm.fromWarehouseId,
  );
  const availableQty = fromLevel ? Number(fromLevel.quantityOnHand) : 0;
  // The transfer factor: how many base units one entered "package" is worth — 1 when the form is
  // in UNIT mode, so entered quantities pass straight through with no conversion.
  const transferFactor = transferForm.unitKind === 'PACKAGE' ? transferUnitsPerPackage : 1;
  const availableInSelectedUnit = availableQty / transferFactor;

  const sameWarehouseSelected =
    !!transferForm.fromWarehouseId && transferForm.fromWarehouseId === transferForm.toWarehouseId;
  const quantityExceedsAvailable = Number(transferForm.quantity) > availableInSelectedUnit;
  const transferValid =
    !!transferForm.fromWarehouseId &&
    !!transferForm.toWarehouseId &&
    !!transferForm.productId &&
    !sameWarehouseSelected &&
    Number(transferForm.quantity) > 0 &&
    !quantityExceedsAvailable;

  function openTransfer() {
    setTransferForm(emptyTransferForm);
    setTransferOpen(true);
  }

  function resetTransferProduct(productId: string) {
    const product = productsQuery.data?.find((p) => p.id === productId);
    const canPackage = !!(product?.packageTypeId && product?.unitsPerPackage);
    setTransferForm((f) => ({ ...f, productId, unitKind: canPackage ? 'PACKAGE' : 'UNIT', quantity: '0' }));
  }

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/inventory/stock/transfers', {
        transferDate: localToday(),
        fromWarehouseId: transferForm.fromWarehouseId,
        toWarehouseId: transferForm.toWarehouseId,
        notes: transferForm.notes || undefined,
        lines: [{ productId: transferForm.productId, quantity: Number(transferForm.quantity) * transferFactor }],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      // A transfer doesn't change the company-wide total, but it does move value between
      // warehouses — WarehousesPage's per-warehouse cards must reflect the new split immediately.
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-products'] });
      setTransferOpen(false);
      setTransferForm(emptyTransferForm);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  const levelColumns: Column<StockLevel>[] = [
    { header: t('fields.sku'), accessor: (r) => r.product?.sku },
    { header: t('common.name'), accessor: (r) => r.product?.nameEn },
    { header: t('fields.warehouse'), accessor: (r) => r.warehouse?.nameAr || r.warehouse?.nameEn },
    {
      header: t('table.onHand'),
      accessor: (r) => (
        <PackageQuantity
          baseQuantity={Number(r.quantityOnHand)}
          unitsPerPackage={r.product?.unitsPerPackage}
          packageUnitName={r.product?.packageType?.nameEn}
          unitName={r.product?.unit?.nameEn}
        />
      ),
      align: 'right',
    },
    {
      header: t('fields.packageAverageCost'),
      accessor: (r) => formatAmount(Number(r.averageCost) * (r.product?.unitsPerPackage || 1)),
      align: 'right',
    },
  ];

  const movementColumns: Column<StockMovement>[] = [
    { header: t('common.date'), accessor: (r) => new Date(r.createdAt).toLocaleString() },
    { header: t('table.reference'), accessor: (r) => r.referenceNumber ?? '—' },
    { header: t('common.type'), accessor: (r) => t(`stock.movementTypes.${r.type}`, r.type) },
    {
      header: t('stock.movementDirection'),
      accessor: (r) => (
        <Badge color={isInflowMovement(r.type) ? 'green' : 'red'}>
          {isInflowMovement(r.type) ? t('stock.inflow') : t('stock.outflow')}
        </Badge>
      ),
      align: 'center',
    },
    { header: t('common.name'), accessor: (r) => r.product?.nameEn },
    { header: t('fields.warehouse'), accessor: (r) => r.warehouse?.nameEn },
    {
      header: t('fields.quantityPackages'),
      // Package count, not base units — a movement of 400 base units at 100 units/package reads
      // as "4" here (matching how quantities are entered everywhere else: Purchasing, stock
      // levels), not the raw base-unit figure this column used to show. Reuses the same
      // PackageQuantity component the Stock Levels tab already uses, so a non-exact-multiple
      // remainder is shown rather than silently lost.
      accessor: (r) => (
        <PackageQuantity baseQuantity={r.quantity} unitsPerPackage={r.product?.unitsPerPackage} />
      ),
      align: 'right',
    },
    { header: t('table.totalCost'), accessor: (r) => formatAmount(r.totalCost), align: 'right' },
  ];

  const transferColumns: Column<StockTransfer>[] = [
    { header: t('stock.transferNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.transferDate },
    { header: t('stock.fromWarehouse'), accessor: (r) => r.fromWarehouse?.nameEn },
    { header: t('stock.toWarehouse'), accessor: (r) => r.toWarehouse?.nameEn },
    { header: t('fields.product'), accessor: (r) => r.lines?.[0]?.product?.nameEn ?? '—' },
    {
      header: t('fields.quantity'),
      accessor: (r) => formatAmount(r.lines?.[0]?.quantity ?? 0),
      align: 'right',
    },
    { header: t('stock.createdBy'), accessor: (r) => r.createdByName },
  ];

  const tabs: { key: 'levels' | 'movements' | 'transfers'; label: string }[] = [
    { key: 'levels', label: t('stock.stockLevels') },
    { key: 'movements', label: t('stock.movementReport') },
    { key: 'transfers', label: t('stock.stockTransfer') },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.stock')}
        actions={
          tab === 'transfers' ? (
            <Button onClick={openTransfer}>+ {t('stock.newTransfer')}</Button>
          ) : canAdjustStock ? (
            <Button onClick={() => setAdjustOpen(true)}>{t('stock.stockAdjustment')}</Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      {tab === 'levels' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              placeholder={t('stock.searchProductPlaceholder')}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="max-w-xs"
            >
              <option value="">{t('stock.allWarehouses')}</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameAr || w.nameEn}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input type="checkbox" checked={showDepleted} onChange={(e) => setShowDepleted(e.target.checked)} />
              {t('stock.showDepletedProducts')}
            </label>
          </div>
          <DataTable
            columns={levelColumns}
            data={visibleLevels}
            keyField={(r) => r.id}
            isLoading={levelsQuery.isLoading}
            searchable={false}
          />
        </>
      )}
      {tab === 'movements' && (
        <DataTable
          columns={movementColumns}
          data={movementsQuery.data ?? []}
          keyField={(r) => r.id}
          isLoading={movementsQuery.isLoading}
        />
      )}
      {tab === 'transfers' && (
        <DataTable
          columns={transferColumns}
          data={transfersQuery.data ?? []}
          keyField={(r) => r.id}
          isLoading={transfersQuery.isLoading}
        />
      )}

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title={t('stock.stockAdjustment')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            adjustMutation.mutate();
          }}
        >
          <FormField label={t('fields.product')}>
            <Select
              required
              value={adjustForm.productId}
              onChange={(e) => resetSelection(e.target.value, adjustForm.warehouseId)}
            >
              <option value="">{t('actions.selectProduct')}</option>
              {(productsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fields.warehouse')}>
            <Select
              required
              value={adjustForm.warehouseId}
              onChange={(e) => resetSelection(adjustForm.productId, e.target.value)}
            >
              <option value="">{t('actions.selectWarehouse')}</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          {canAdjustByPackage && (
            <div className="col-span-2">
              <FormField label={t('fields.unit')}>
                <Select value={adjustForm.unitKind} onChange={(e) => switchUnitKind(e.target.value as UnitKind)}>
                  <option value="UNIT">{unitName(selectedProduct!.unitId)}</option>
                  <option value="PACKAGE">{packageTypeName(selectedProduct!.packageTypeId)}</option>
                </Select>
              </FormField>
            </div>
          )}
          <FormField label={t('fields.systemQuantity')}>
            <Input
              type="number"
              value={adjustForm.systemQuantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, systemQuantity: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.countedQuantity')}>
            <Input
              type="number"
              value={adjustForm.countedQuantity}
              onChange={(e) => setAdjustForm({ ...adjustForm, countedQuantity: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.unitCost')}>
            <Input
              type="number"
              step="0.01"
              value={adjustForm.unitCost}
              onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: e.target.value })}
            />
          </FormField>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdjustOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title={t('stock.newTransfer')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (transferValid) transferMutation.mutate();
          }}
        >
          <FormField label={t('stock.fromWarehouse')}>
            <Select
              required
              value={transferForm.fromWarehouseId}
              onChange={(e) =>
                setTransferForm((f) => ({
                  ...f,
                  fromWarehouseId: e.target.value,
                  toWarehouseId: f.toWarehouseId === e.target.value ? '' : f.toWarehouseId,
                }))
              }
            >
              <option value="">{t('actions.selectWarehouse')}</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('stock.toWarehouse')}>
            <Select
              required
              value={transferForm.toWarehouseId}
              onChange={(e) => setTransferForm((f) => ({ ...f, toWarehouseId: e.target.value }))}
            >
              <option value="">{t('actions.selectWarehouse')}</option>
              {(warehousesQuery.data ?? [])
                .filter((w) => w.id !== transferForm.fromWarehouseId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nameEn}
                  </option>
                ))}
            </Select>
          </FormField>
          {sameWarehouseSelected && (
            <div className="col-span-2 -mt-2 text-sm text-red-600">{t('stock.sameWarehouseError')}</div>
          )}

          <div className="col-span-2">
            <FormField label={t('fields.product')}>
              <Select
                required
                value={transferForm.productId}
                onChange={(e) => resetTransferProduct(e.target.value)}
              >
                <option value="">{t('actions.selectProduct')}</option>
                {(productsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {selectedTransferProduct && canTransferByPackage && (
            <div className="col-span-2">
              <FormField label={t('fields.unit')}>
                <Select
                  value={transferForm.unitKind}
                  onChange={(e) => setTransferForm((f) => ({ ...f, unitKind: e.target.value as UnitKind, quantity: '0' }))}
                >
                  <option value="PACKAGE">{packageTypeName(selectedTransferProduct.packageTypeId)}</option>
                  <option value="UNIT">{unitName(selectedTransferProduct.unitId)}</option>
                </Select>
              </FormField>
            </div>
          )}

          {selectedTransferProduct && (
            <div className="col-span-2 space-y-3">
              <div className="rounded-lg bg-[var(--table-header-bg)] p-3 text-sm">
                <div className="text-xs text-[var(--text-muted)]">{t('stock.availableQuantity')}</div>
                <div className="font-semibold text-primary-600">
                  {transferForm.fromWarehouseId
                    ? formatByUnitKind(
                        availableQty,
                        transferForm.unitKind,
                        selectedTransferProduct.unitsPerPackage,
                        packageTypeName(selectedTransferProduct.packageTypeId),
                        unitName(selectedTransferProduct.unitId),
                      )
                    : '—'}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs text-[var(--text-muted)]">{t('stock.availabilityByWarehouse')}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(warehousesQuery.data ?? []).map((w) => {
                    const level = levelsQuery.data?.find(
                      (l) => l.product?.id === transferForm.productId && l.warehouse?.id === w.id,
                    );
                    return (
                      <div key={w.id} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                        <div className="text-xs text-[var(--text-muted)]">{w.nameEn}</div>
                        <div className="font-medium">
                          {formatByUnitKind(
                            level ? Number(level.quantityOnHand) : 0,
                            transferForm.unitKind,
                            selectedTransferProduct.unitsPerPackage,
                            packageTypeName(selectedTransferProduct.packageTypeId),
                            unitName(selectedTransferProduct.unitId),
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <FormField label={t('stock.transferredQuantity')}>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={transferForm.quantity}
              onChange={(e) => setTransferForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </FormField>
          <div className="flex items-end">
            {quantityExceedsAvailable && (
              <div className="text-sm text-red-600">{t('stock.exceedsAvailableError')}</div>
            )}
          </div>

          <div className="col-span-2">
            <FormField label={t('stock.transferNotes')}>
              <Input
                value={transferForm.notes}
                onChange={(e) => setTransferForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </FormField>
          </div>

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTransferOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!transferValid || transferMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
