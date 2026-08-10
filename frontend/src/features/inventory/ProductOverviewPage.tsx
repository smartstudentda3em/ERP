import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, formatQuantity } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { PackageQuantity } from '../../components/ui/PackageQuantity';

interface PackageBreakdown {
  packages: number;
  remainderUnits: number;
}

interface StockByWarehouse {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: number;
  reservedQuantity: number;
  location: string | null;
  packageBreakdown: PackageBreakdown | null;
}

interface Movement {
  id: string;
  date: string;
  type: string;
  warehouseName?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceNumber?: string;
}

interface PurchaseHistoryRow {
  documentNumber: string;
  date: string;
  supplierName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

interface SalesHistoryRow {
  documentNumber: string;
  date: string;
  customerName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ProductOverview {
  product: {
    id: string;
    sku?: string;
    barcode?: string;
    nameEn: string;
    nameAr?: string;
    category: { id: string; name: string } | null;
    brand: { id: string; name: string } | null;
    unit: { id: string; name: string } | null;
    purchasePrice: number;
    sellingPrice: number;
    averageCost: number;
    reorderLevel: number;
    imageUrl?: string;
    packageType: { id: string; name: string } | null;
    unitsPerPackage: number | null;
    packagePurchasePrice: number | null;
    packageSellingPrice: number | null;
    notes?: string;
    isActive: boolean;
  };
  stockByWarehouse: StockByWarehouse[];
  movements: Movement[];
  purchaseHistory: PurchaseHistoryRow[];
  salesHistory: SalesHistoryRow[];
  supplier: string | null;
}

type TabKey = 'movements' | 'purchases' | 'sales';

export function ProductOverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();
  const warehouseId = searchParams.get('warehouseId') ?? undefined;
  const [tab, setTab] = useState<TabKey>('movements');

  const overviewQuery = useQuery({
    queryKey: ['product-overview', productId, warehouseId],
    queryFn: () =>
      unwrap<ProductOverview>(
        apiClient.get(`/inventory/warehouse-view/products/${productId}/overview`, {
          params: { warehouseId },
        }),
      ),
    enabled: !!productId,
  });

  const data = overviewQuery.data;
  const currentWarehouseStock = data?.stockByWarehouse.find((s) => s.warehouseId === warehouseId);
  const otherWarehousesQty = data
    ? data.stockByWarehouse
        .filter((s) => s.warehouseId !== warehouseId)
        .reduce((sum, s) => sum + s.quantityOnHand, 0)
    : 0;

  return (
    <div>
      <PageHeader
        title={data?.product.nameEn ?? t('warehouse.productOverview')}
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('warehouse.back')}
          </Button>
        }
      />

      {overviewQuery.isLoading || !data ? (
        <Card className="p-12 text-center text-[var(--text-muted)]">{t('common.loading')}</Card>
      ) : (
        <>
          <Card className="mb-4">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
              {data.product.imageUrl ? (
                <img
                  src={data.product.imageUrl}
                  alt={data.product.nameEn}
                  className="h-32 w-32 rounded-lg border border-[var(--border)] object-cover"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-[var(--border)] bg-black/5 text-3xl dark:bg-white/5">
                  📦
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.sku')}</div>
                  <div className="font-medium">{data.product.sku ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.barcode')}</div>
                  <div className="font-medium">{data.product.barcode ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.category')}</div>
                  <div className="font-medium">{data.product.category?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.brand')}</div>
                  <div className="font-medium">{data.product.brand?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.unit')}</div>
                  <div className="font-medium">{data.product.unit?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.purchasePrice')}</div>
                  <div className="font-medium">{formatAmount(data.product.purchasePrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('fields.sellingPrice')}</div>
                  <div className="font-medium">{formatAmount(data.product.sellingPrice)}</div>
                </div>
                {data.product.packageType && data.product.unitsPerPackage && (
                  <>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">{t('fields.package')}</div>
                      <div className="font-medium">
                        {data.product.packageType.name} ({formatQuantity(data.product.unitsPerPackage)} × {data.product.unit?.name})
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">{t('fields.packagePurchasePrice')}</div>
                      <div className="font-medium">{formatAmount(data.product.packagePurchasePrice ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">{t('fields.packageSellingPrice')}</div>
                      <div className="font-medium">{formatAmount(data.product.packageSellingPrice ?? 0)}</div>
                    </div>
                  </>
                )}
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('warehouse.supplier')}</div>
                  <div className="font-medium">{data.supplier ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t('common.status')}</div>
                  <Badge color={data.product.isActive ? 'green' : 'gray'}>
                    {data.product.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </div>
                {data.product.notes && (
                  <div className="col-span-2 sm:col-span-4">
                    <div className="text-xs text-[var(--text-muted)]">{t('common.notes')}</div>
                    <div className="font-medium">{data.product.notes}</div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.currentQuantity')}</div>
              <div className="mt-1 text-lg font-semibold">
                <PackageQuantity
                  baseQuantity={currentWarehouseStock?.quantityOnHand ?? 0}
                  unitsPerPackage={data.product.unitsPerPackage}
                  packageUnitName={data.product.packageType?.name}
                  unitName={data.product.unit?.name}
                />
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.reservedQuantity')}</div>
              <div className="mt-1 text-lg font-semibold">
                <PackageQuantity
                  baseQuantity={currentWarehouseStock?.reservedQuantity ?? 0}
                  unitsPerPackage={data.product.unitsPerPackage}
                  packageUnitName={data.product.packageType?.name}
                  unitName={data.product.unit?.name}
                />
              </div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('warehouse.otherWarehouses')}</div>
              <div className="mt-1 text-lg font-semibold">
                <PackageQuantity
                  baseQuantity={otherWarehousesQty}
                  unitsPerPackage={data.product.unitsPerPackage}
                  packageUnitName={data.product.packageType?.name}
                  unitName={data.product.unit?.name}
                />
              </div>
            </Card>
          </div>

          <Card className="mb-4">
            <div className="mb-3 text-sm font-semibold text-[var(--text-muted)]">{t('fields.warehouse')}</div>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t('fields.warehouse')}</th>
                    <th>{t('warehouse.availableQuantity')}</th>
                    <th>{t('warehouse.reservedQuantity')}</th>
                    <th>{t('warehouse.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stockByWarehouse.map((s) => (
                    <tr key={s.warehouseId}>
                      <td>{s.warehouseName}</td>
                      <td>
                        <PackageQuantity
                          baseQuantity={s.quantityOnHand}
                          unitsPerPackage={data.product.unitsPerPackage}
                          packageUnitName={data.product.packageType?.name}
                          unitName={data.product.unit?.name}
                        />
                      </td>
                      <td>
                        <PackageQuantity
                          baseQuantity={s.reservedQuantity}
                          unitsPerPackage={data.product.unitsPerPackage}
                          packageUnitName={data.product.packageType?.name}
                          unitName={data.product.unit?.name}
                        />
                      </td>
                      <td>{s.location ?? t('warehouse.noLocation')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <Tabs
              tabs={[
                { key: 'movements', label: t('warehouse.stockMovements') },
                { key: 'purchases', label: t('warehouse.purchaseHistory') },
                { key: 'sales', label: t('warehouse.salesHistory') },
              ]}
              active={tab}
              onChange={(k) => setTab(k as TabKey)}
            />

            {tab === 'movements' && (
              <HistoryTable
                emptyLabel={t('warehouse.noHistory')}
                headers={[t('common.date'), t('common.type'), t('fields.warehouse'), t('fields.quantity'), t('fields.unitCost'), t('table.totalCost'), t('table.reference')]}
                rows={data.movements.map((m) => [
                  new Date(m.date).toLocaleString(),
                  m.type,
                  m.warehouseName ?? '—',
                  m.quantity,
                  formatAmount(m.unitCost),
                  formatAmount(m.totalCost),
                  m.referenceNumber ?? '—',
                ])}
              />
            )}
            {tab === 'purchases' && (
              <HistoryTable
                emptyLabel={t('warehouse.noHistory')}
                headers={[t('table.documentNumber'), t('common.date'), t('fields.supplier'), t('fields.quantity'), t('fields.unitCost'), t('fields.lineTotal')]}
                rows={data.purchaseHistory.map((p) => [
                  p.documentNumber,
                  p.date,
                  p.supplierName,
                  p.quantity,
                  formatAmount(p.unitCost),
                  formatAmount(p.lineTotal),
                ])}
              />
            )}
            {tab === 'sales' && (
              <HistoryTable
                emptyLabel={t('warehouse.noHistory')}
                headers={[t('table.documentNumber'), t('common.date'), t('fields.customer'), t('fields.quantity'), t('fields.unitPrice'), t('fields.lineTotal')]}
                rows={data.salesHistory.map((s) => [
                  s.documentNumber,
                  s.date,
                  s.customerName,
                  s.quantity,
                  formatAmount(s.unitPrice),
                  formatAmount(s.lineTotal),
                ])}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function HistoryTable({
  headers,
  rows,
  emptyLabel,
}: {
  headers: string[];
  rows: (string | number)[][];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="app-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
