import { DataSource } from 'typeorm';
import { StockMovementType } from '../../../entities/enums';

/**
 * "الكمية المستهلكة": genuine outflow only — stock actually withdrawn/dispensed from a
 * warehouse (sold, written off, or moved out to another warehouse). PURCHASE_RETURN and
 * SALES_RETURN are deliberately excluded: both are reversals of an earlier movement, not
 * consumption of this warehouse's stock.
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
    .addSelect('COALESCE(SUM(m.quantity), 0)', 'total')
    .from('stock_movements', 'm')
    .where('m."companyId" = :companyId', { companyId })
    .andWhere('m."warehouseId" = :warehouseId', { warehouseId })
    .andWhere('m."productId" IN (:...productIds)', { productIds })
    .andWhere('m.type IN (:...types)', { types: CONSUMED_MOVEMENT_TYPES })
    .andWhere('m."createdAt"::date >= :dateFrom', { dateFrom })
    .andWhere('m."createdAt"::date <= :dateTo', { dateTo })
    .groupBy('m."productId"')
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
