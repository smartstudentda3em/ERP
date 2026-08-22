import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * One-off data migration for the Air Conditioning company only, run by explicit request: every
 * existing AC purchase receipt that was originally paid out of الخزينة النقدي (CASH) — from before
 * the "رصيد المورد" payment source existed — is re-sourced to have been paid from رصيد المورد
 * instead. For each one this does exactly what PurchaseReceiptsService/AcSupplierPaymentsService
 * would have done had "رصيد المورد" been chosen at the time:
 *   1. Deletes the linked cash_movements row — CashMovementsService.getBalance is a live SUM over
 *      this table with no cached balance anywhere, so removing an EXPENSE row is by itself exactly
 *      "returning that money to the Cash treasury"; nothing else needs to change for the balance
 *      to come back to what it was before these purchases.
 *   2. Inserts a matching NEGATIVE ac_supplier_payments row tagged with that receipt's id (mirrors
 *      AcSupplierPaymentsService.deductForPurchase) so the supplier's "دفعات المورد" balance drops
 *      by the same amount — intentionally allowed to go negative, since the balance-sufficiency
 *      check in deductForPurchase was removed in this same change for exactly this reason.
 *
 * Bank-paid receipts are untouched — only CASH is in scope, per the request. Safe to re-run: the
 * query only ever matches AC/CASH/PURCHASE_RECEIPT movements whose receipt has no
 * ac_supplier_payments row yet, so an already-migrated receipt is never touched twice.
 */
async function main() {
  await AppDataSource.initialize();

  const rows: Array<{
    cashMovementId: string;
    cashAmount: string;
    companyId: string;
    receiptId: string;
    documentNumber: string;
    supplierId: string;
    supplierName: string;
    receiptDate: string;
    createdById: string;
  }> = await AppDataSource.query(`
    SELECT
      cm.id AS "cashMovementId",
      cm.amount AS "cashAmount",
      cm."companyId" AS "companyId",
      pr.id AS "receiptId",
      pr."documentNumber" AS "documentNumber",
      pr."supplierId" AS "supplierId",
      s."companyName" AS "supplierName",
      pr."receiptDate" AS "receiptDate",
      pr."createdById" AS "createdById"
    FROM cash_movements cm
    JOIN companies c ON c.id = cm."companyId"
    JOIN purchase_receipts pr ON pr.id = cm."sourceId"
    JOIN suppliers s ON s.id = pr."supplierId"
    WHERE c.code = 'AC'
      AND cm.account = 'CASH'
      AND cm."sourceType" = 'PURCHASE_RECEIPT'
      AND NOT EXISTS (
        SELECT 1 FROM ac_supplier_payments asp WHERE asp."purchaseReceiptId" = pr.id
      )
    ORDER BY pr."receiptDate" ASC
  `);

  if (rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No CASH-sourced AC purchase receipts found needing migration — nothing to do.');
    await AppDataSource.destroy();
    return;
  }

  let totalReturned = 0;
  const bySupplier = new Map<string, number>();

  await AppDataSource.transaction(async (manager) => {
    for (const row of rows) {
      const amount = Number(row.cashAmount);
      await manager.query(`DELETE FROM cash_movements WHERE id = $1`, [row.cashMovementId]);
      await manager.query(
        `INSERT INTO ac_supplier_payments
           ("companyId", "supplierId", "paymentDate", amount, "purchaseReceiptId", notes, "createdById")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.companyId,
          row.supplierId,
          row.receiptDate,
          -amount,
          row.receiptId,
          `ترحيل بأثر رجعي: نقل مصدر الدفع من الخزينة النقدي إلى رصيد المورد لفاتورة مشتريات رقم ${row.documentNumber}`,
          row.createdById,
        ],
      );
      totalReturned += amount;
      bySupplier.set(row.supplierName, (bySupplier.get(row.supplierName) ?? 0) + amount);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`Migrated ${rows.length} receipt(s) from CASH to رصيد المورد, returning ${totalReturned.toFixed(2)} to the Cash treasury:`);
  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.documentNumber} (${row.supplierName}): ${Number(row.cashAmount).toFixed(2)}`);
  }
  // eslint-disable-next-line no-console
  console.log('\nBy supplier:');
  for (const [name, amount] of bySupplier) {
    // eslint-disable-next-line no-console
    console.log(`  ${name}: ${amount.toFixed(2)}`);
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('AC cash-to-supplier-balance migration failed:', err);
  process.exit(1);
});
