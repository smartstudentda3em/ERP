import { DataSource } from 'typeorm';
import { StockMovementType } from '../../../entities/enums';

/**
 * "الكمية المستهلكة": genuine outflow only — stock actually withdrawn/dispensed from a
 * warehouse (sold, written off, or moved out to another warehouse). PURCHASE_RETURN is excluded
 * entirely: it reverses a purchase, never counted as consumption in the first place.
 *
 * SALES_RETURN is different: it reverses a SALES_ISSUE that *was* counted (e.g. deleting or
 * cancelling a sales invoice restores the stock via a SALES_RETURN movement — see
 * SalesInvoicesService.remove()). If we simply excluded it like PURCHASE_RETURN, the original
 * SALES_ISSUE would stay counted forever and this figure would never reflect the cancellation —
 * available quantity goes back up but consumed quantity stays stale. So SALES_RETURN is netted
 * (subtracted) against the outflow types below instead, and the per-product total is floored at
 * 0 since a product can never have "negative consumption" for a period.
 *
 * Single source of truth shared by WarehouseViewService's "المخازن" table and
 * StockAuditsService's "بدء جرد جديد" entry screen — both must show the exact same number for
 * the same (product, warehouse, period), so this is computed in exactly one place rather than
 * two independently-maintained copies of the same query drifting apart again.
 */
export const CONSUMED_MOVEMENT_TYPES = [
  StockMovementType.SALES_ISSUE,
  StockMovementType.ADJUSTMENT_OUT,
  StockMovementType.TRANSFER_OUT,
];

/** One grouped SUM query, scoped to just the given product ids (never a warehouse's whole
 * catalog), so callers stay cheap regardless of how many products they're asking about. */
export async function getConsumedQuantitiesByProductId(
  dataSource: DataSource,
  companyId: string,
  warehouseId: string,
  productIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  const rows = await dataSource
    .createQueryBuilder()
    .select('m."productId"', 'productId')
    .addSelect(
      `GREATEST(0, COALESCE(SUM(CASE WHEN m.type = :salesReturn THEN -m.quantity ELSE m.quantity END), 0))`,
      'total',
    )
    .from('stock_movements', 'm')
    .where('m."companyId" = :companyId', { companyId })
    .andWhere('m."warehouseId" = :warehouseId', { warehouseId })
    .andWhere('m."productId" IN (:...productIds)', { productIds })
    .andWhere('m.type IN (:...types)', { types: [...CONSUMED_MOVEMENT_TYPES, StockMovementType.SALES_RETURN] })
    .andWhere('m."createdAt"::date >= :dateFrom', { dateFrom })
    .andWhere('m."createdAt"::date <= :dateTo', { dateTo })
    .setParameter('salesReturn', StockMovementType.SALES_RETURN)
    .groupBy('m."productId"')
    .getRawMany();

  for (const r of rows) result.set(r.productId, Number(r.total));
  return result;
}

/** "الكمية المشتراة" (Warehouses table, Air Conditioning only) — total packages ever actually
 * received into the company for each product, company-wide across every warehouse and all time
 * (never scoped to the warehouse currently being viewed or to any date range). Unlike
 * GuidelinePricesService's own "عدد العبوات المشتراة" column, free-goods receipts are NOT excluded
 * here — this column represents genuine physical receiving (a free/in-kind receipt still enters
 * real stock, per PurchaseReceipt.isFreeGoods's own doc comment), not a cost-distribution base, so
 * excluding them would silently undercount a product that was ever received as free goods even
 * once. One grouped SUM query scoped to just the given product ids, same cost discipline as
 * getConsumedQuantitiesByProductId above. */
export async function getPurchasedQuantitiesByProductId(
  dataSource: DataSource,
  companyId: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  const rows = await dataSource
    .createQueryBuilder()
    .select('pr."productId"', 'productId')
    .addSelect('COALESCE(SUM(pr."quantityPackages"), 0)', 'total')
    .from('purchase_receipts', 'pr')
    .where('pr."companyId" = :companyId', { companyId })
    .andWhere('pr."productId" IN (:...productIds)', { productIds })
    .groupBy('pr."productId"')
    .getRawMany();

  for (const r of rows) result.set(r.productId, Number(r.total));
  return result;
}

/** 'YYYY-MM-DD' for the first day of the current calendar month, and for today — the "الفترة
 * الحالية" default the Warehouses page falls back to when its own date filter is left empty. */
export function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateFrom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const dateTo = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return { dateFrom, dateTo };
}

/** First/last day of the calendar month `dateStr` falls in (e.g. '2026-07-15' ->
 * '2026-07-01'..'2026-07-31') — the "period" a monthly stock audit's own consumedQuantity is
 * scoped to: the entire audited month, not just the days counted so far. */
export function monthRange(dateStr: string): { dateFrom: string; dateTo: string } {
  const [y, m] = dateStr.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();
  return { dateFrom: `${y}-${pad(m)}-01`, dateTo: `${y}-${pad(m)}-${pad(lastDay)}` };
}

/** Jan 1 - Dec 31 of the calendar year `dateStr` falls in (e.g. '2026-01-15' ->
 * '2026-01-01'..'2026-12-31') — the "period" an annual stock audit's own consumedQuantity is
 * scoped to (Stationery/Air Conditioning only — Printing Press keeps the monthly monthRange()
 * above). */
export function yearRange(dateStr: string): { dateFrom: string; dateTo: string } {
  const [y] = dateStr.split('-').map(Number);
  return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
}
