import { CommissionException } from './entities/commission-exception.entity';

/** One sales representative's product/category commission overrides, indexed for O(1) lookup. */
export interface RepCommissionExceptions {
  byProductId: Map<string, number>;
  byCategoryId: Map<string, number>;
}

/** Groups a flat CommissionException[] by salesRepresentativeId — shared by every caller that
 * needs more than one rep's exceptions at once (e.g. a company-wide report), so the per-rep
 * bucket shape stays identical everywhere. */
export function buildExceptionsByRepId(
  exceptions: CommissionException[],
): Map<string, RepCommissionExceptions> {
  const byRepId = new Map<string, RepCommissionExceptions>();
  for (const e of exceptions) {
    if (!byRepId.has(e.salesRepresentativeId)) {
      byRepId.set(e.salesRepresentativeId, { byProductId: new Map(), byCategoryId: new Map() });
    }
    const bucket = byRepId.get(e.salesRepresentativeId)!;
    if (e.productId) bucket.byProductId.set(e.productId, Number(e.commissionRate));
    else if (e.categoryId) bucket.byCategoryId.set(e.categoryId, Number(e.commissionRate));
  }
  return byRepId;
}

/**
 * The single source of truth for "what commission rate applies to this sales-invoice line for
 * this rep": the line's product-specific exception, else its category's exception, else the
 * rep's own general commissionRate. Shared by the Branch Managers Commission report
 * (sales-representatives.controller.ts) and the مدير فرع invoice-list filter
 * (sales-invoices.service.ts) so "0% commission" can never mean two different things depending on
 * which screen is asking.
 */
export function resolveLineCommissionRate(
  line: { productId: string; categoryId: string | null },
  exceptions: RepCommissionExceptions | undefined,
  generalRate: number,
): number {
  return (
    exceptions?.byProductId.get(line.productId) ??
    (line.categoryId ? exceptions?.byCategoryId.get(line.categoryId) : undefined) ??
    generalRate
  );
}
