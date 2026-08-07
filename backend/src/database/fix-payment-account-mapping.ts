import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * One-off data correction for the "الحساب" mis-mapping bug in SalesPaymentsService.create():
 * before the fix, every non-Printing-Press receipt was hard-defaulted to the CASH treasury
 * account regardless of the payment `method` actually recorded (bank transfer, cheque, card,
 * online) — so a receipt paid by bank transfer (e.g. RCV-000001) shows "نقدي" instead of "بنكي"
 * in the المقبوضات table, and its money silently fed the cash drawer balance instead of the bank
 * balance. This finds every sales_payments row still carrying that wrong default (method is a
 * non-cash method but paymentAccount is CASH/unset) and, for each one, flips both the receipt's
 * own paymentAccount column AND its linked cash_movements row's account column to BANK — so the
 * displayed column and the actual treasury balance it feeds are corrected together. Safe to run
 * more than once: the WHERE clause only ever matches rows still in the broken state.
 */
async function main() {
  await AppDataSource.initialize();

  const broken: Array<{ id: string; documentNumber: string; cashMovementId: string | null; amount: string }> =
    await AppDataSource.query(`
      SELECT id, "documentNumber", "cashMovementId", amount
      FROM sales_payments
      WHERE method <> 'CASH' AND (COALESCE("paymentAccount", 'CASH') = 'CASH')
    `);

  if (broken.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No mis-mapped sales_payments rows found — nothing to correct.');
    await AppDataSource.destroy();
    return;
  }

  await AppDataSource.transaction(async (manager) => {
    for (const row of broken) {
      await manager.query(`UPDATE sales_payments SET "paymentAccount" = 'BANK' WHERE id = $1`, [row.id]);
      if (row.cashMovementId) {
        await manager.query(`UPDATE cash_movements SET account = 'BANK' WHERE id = $1 AND account = 'CASH'`, [
          row.cashMovementId,
        ]);
      }
    }
  });

  // eslint-disable-next-line no-console
  console.log(`Corrected ${broken.length} receipt(s) from CASH to BANK:`);
  for (const row of broken) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.documentNumber} (${row.amount})`);
  }

  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Payment account correction failed:', err);
  process.exit(1);
});
