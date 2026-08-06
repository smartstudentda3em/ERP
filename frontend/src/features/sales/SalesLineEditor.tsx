import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { useActiveCompany } from '../../lib/use-active-company';

export type UnitKind = 'UNIT' | 'PACKAGE';

export interface SalesLineForm {
  productId: string;
  quantity: string;
  unitPrice: string;
  unitKind: UnitKind;
}

interface Product {
  id: string;
  sku: string;
  nameEn: string;
  unitId: string;
  sellingPrice: number | null;
  purchasePrice: number | null;
  packageTypeId?: string | null;
  unitsPerPackage?: number | null;
  packagePurchasePrice?: number | null;
  packageSellingPrice?: number | null;
}

interface Unit {
  id: string;
  nameEn: string;
}

interface PackageType {
  id: string;
  nameEn: string;
}

export function emptyLine(): SalesLineForm {
  return { productId: '', quantity: '1', unitPrice: '0', unitKind: 'UNIT' };
}

export function linesToPayload(lines: SalesLineForm[]) {
  return lines
    .filter((l) => l.productId)
    .map((l) => ({
      productId: l.productId,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      unitKind: l.unitKind,
    }));
}

export function computeGrandTotal(lines: SalesLineForm[]): number {
  return linesToPayload(lines).reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

/** Suggested price and purchase cost for whichever unit (package or base unit) is selected. */
function pricingFor(product: Product, unitKind: UnitKind): { suggestedPrice: number | null; purchasePrice: number | null } {
  if (unitKind === 'PACKAGE') {
    const unitsPerPackage = product.unitsPerPackage ?? 1;
    return {
      suggestedPrice: product.packageSellingPrice ?? (product.sellingPrice !== null ? product.sellingPrice * unitsPerPackage : null),
      purchasePrice: product.packagePurchasePrice ?? (product.purchasePrice !== null ? product.purchasePrice * unitsPerPackage : null),
    };
  }
  return { suggestedPrice: product.sellingPrice, purchasePrice: product.purchasePrice };
}

export function SalesLineEditor({
  lines,
  onChange,
  warnOnSellBelowCost = true,
}: {
  lines: SalesLineForm[];
  onChange: (lines: SalesLineForm[]) => void;
  warnOnSellBelowCost?: boolean;
}) {
  const { t } = useTranslation();
  // Printing Press only: the "الصنف" list sources from its own "المنتجات" sales catalog
  // (ProductType.CATALOG_ITEM) instead of the raw-materials Product list — see
  // ProductsService.findAllForCompany/findCatalogForCompany for how the two never mix. Every
  // other company keeps fetching the unfiltered raw-materials endpoint exactly as before.
  const { isPrintingPress } = useActiveCompany();
  const productsQuery = useQuery({
    queryKey: isPrintingPress ? ['printing-products-catalog'] : ['products'],
    queryFn: () =>
      unwrap<Product[]>(apiClient.get(isPrintingPress ? '/inventory/products/catalog' : '/inventory/products')),
  });
  // Printing Press only — raw materials explicitly flagged "قابلة للبيع المباشر" (e.g. الأختام)
  // sell alongside catalog items; selling one deducts real warehouse stock, unlike a catalog item.
  const sellableRawMaterialsQuery = useQuery({
    queryKey: ['printing-sellable-raw-materials'],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products/sellable-raw-materials')),
    enabled: isPrintingPress,
  });
  const products = useMemo(
    () => [...(productsQuery.data ?? []), ...(isPrintingPress ? sellableRawMaterialsQuery.data ?? [] : [])],
    [productsQuery.data, sellableRawMaterialsQuery.data, isPrintingPress],
  );
  const unitsQuery = useQuery({
    queryKey: ['units'],
    queryFn: () => unwrap<Unit[]>(apiClient.get('/settings/units')),
  });
  const packageTypesQuery = useQuery({
    queryKey: ['package-types'],
    queryFn: () => unwrap<PackageType[]>(apiClient.get('/settings/package-types')),
  });

  function unitName(id?: string | null): string {
    return unitsQuery.data?.find((u) => u.id === id)?.nameEn ?? '';
  }

  function packageTypeName(id?: string | null): string {
    return packageTypesQuery.data?.find((p) => p.id === id)?.nameEn ?? '';
  }

  function updateLine(index: number, patch: Partial<SalesLineForm>) {
    const next = [...lines];
    next[index] = { ...next[index], ...patch };
    if (patch.productId) {
      const product = products.find((p) => p.id === patch.productId);
      next[index].unitKind = 'UNIT';
      if (product && product.sellingPrice !== null) next[index].unitPrice = String(product.sellingPrice);
    }
    onChange(next);
  }

  function switchUnitKind(index: number, unitKind: UnitKind) {
    const line = lines[index];
    const product = products.find((p) => p.id === line.productId);
    const next = [...lines];
    next[index] = { ...line, unitKind };
    if (product) {
      const suggested = pricingFor(product, unitKind).suggestedPrice;
      if (suggested !== null) next[index].unitPrice = String(suggested);
    }
    onChange(next);
  }

  return (
    <div className="col-span-2">
      <div className="mb-2 grid grid-cols-12 gap-2 text-xs font-medium text-[var(--text-muted)]">
        <div className="col-span-5">{t('fields.product')}</div>
        <div className="col-span-2">{t('fields.quantity')}</div>
        <div className="col-span-2">{t('fields.unitPrice')}</div>
        <div className="col-span-2" />
        <div className="col-span-1" />
      </div>
      {lines.map((line, i) => {
        const product = products.find((p) => p.id === line.productId);
        // Printing Press catalog items always carry a hidden, invisible-to-the-user placeholder
        // package (unitsPerPackage=1) purely to satisfy the shared products table's schema — never
        // a real second unit tier, so the toggle never makes sense to show here.
        const canSellByPackage = !isPrintingPress && !!(product?.packageTypeId && product?.unitsPerPackage);
        const unitPrice = Number(line.unitPrice || 0);
        const quantity = Number(line.quantity || 0);
        const pricing = product ? pricingFor(product, line.unitKind) : null;
        const profitPerUnit = pricing?.purchasePrice != null ? unitPrice - pricing.purchasePrice : null;
        const belowCost = profitPerUnit !== null && profitPerUnit < 0;

        return (
          <div key={i} className="mb-2">
            <div className="grid grid-cols-12 gap-2">
              <Select
                className="col-span-5"
                value={line.productId}
                onChange={(e) => updateLine(i, { productId: e.target.value })}
              >
                <option value="">{t('actions.selectProduct')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {isPrintingPress ? p.nameEn : `${p.sku} — ${p.nameEn}`}
                  </option>
                ))}
              </Select>
              <Input
                className="col-span-2"
                type="number"
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
              />
              <Input
                className={`col-span-2 ${belowCost && warnOnSellBelowCost ? 'border-yellow-500' : ''}`}
                type="number"
                step="0.01"
                title={t('fields.actualSellingPrice')}
                value={line.unitPrice}
                onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
              />
              <div className="col-span-2">
                {canSellByPackage ? (
                  <Select value={line.unitKind} onChange={(e) => switchUnitKind(i, e.target.value as UnitKind)}>
                    <option value="UNIT">{unitName(product!.unitId)}</option>
                    <option value="PACKAGE">{packageTypeName(product!.packageTypeId)}</option>
                  </Select>
                ) : (
                  product && <span className="text-xs text-[var(--text-muted)]">{unitName(product.unitId)}</span>
                )}
              </div>
              <button
                type="button"
                className="col-span-1 text-red-600"
                onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
            {product && pricing && (
              <div className="col-span-12 mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 ps-0 text-xs text-[var(--text-muted)]">
                {pricing.suggestedPrice != null && (
                  <span>
                    {t('fields.suggestedPrice')}: <span className="font-medium">{formatAmount(pricing.suggestedPrice)}</span>{' '}
                    <span className="italic">({t('fields.referenceOnly')})</span>
                  </span>
                )}
                {profitPerUnit !== null && (
                  <span className={belowCost ? 'font-medium text-red-600' : ''}>
                    {t('fields.profit')}: {formatAmount(profitPerUnit)} × {quantity} ={' '}
                    {formatAmount(profitPerUnit * quantity)}
                  </span>
                )}
                {belowCost && warnOnSellBelowCost && (
                  <span className="font-medium text-red-600">⚠ {t('fields.belowCostWarning')}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="secondary" onClick={() => onChange([...lines, emptyLine()])}>
        {t('actions.addLine')}
      </Button>
      <div className="mt-3 text-end text-sm font-semibold">
        {t('common.total')}: {formatAmount(computeGrandTotal(lines))}
      </div>
    </div>
  );
}
