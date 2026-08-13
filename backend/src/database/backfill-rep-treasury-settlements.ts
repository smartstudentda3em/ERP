import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * One-off backfill for the new "خزينة المناديب" FIFO settlement tracking
 * (CashMovementsService.settleRepTreasuryFifo). Any رep who already had money transferred out of
 * their REP_TREASURY pocket *before* this feature shipped has that reduction reflected in their
 * balance (SUM(INCOME) - SUM(EXPENSE)) but not in any row's new settledAmount column — every old
 * invoice/receipt row would otherwise show up as fully outstanding in the breakdown, summing to
 * more than the rep's real balance. This applies the exact same FIFO rule those future transfers
 * use, but retroactively: for each rep, sum every REP_TREASURY EXPENSE (TRANSFER) row ever
 * recorded for them, then sweep that total across their INCOME rows oldest-first. Safe to run more
 * than once — a rep with nothing left to backfill (settledAmount already caught up) is a no-op.
 */
async function main() {
  await AppDataSource.initialize();

  const reps: Array<{ id: string; name: string }> = await AppDataSource.query(`
    SELECT DISTINCT sr.id, sr.name
    FROM sales_representatives sr
    INNER JOIN cash_movements m ON m."salesRepresentativeId" = sr.id AND m.account = 'REP_TREASURY'
  `);

  if (reps.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No sales representatives with REP_TREASURY movements found — nothing to backfill.');
    await AppDataSource.destroy();
    return;
  }

  let touchedReps = 0;
  for (const rep of reps) {
    await AppDataSource.transaction(async (manager) => {
      const [{ total: transferredOutRaw }] = await manager.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements
         WHERE "salesRepresentativeId" = $1 AND account = 'REP_TREASURY' AND type = 'EXPENSE' AND "sourceType" = 'TRANSFER'`,
        [rep.id],
      );
      let remaining = Number(transferredOutRaw);
      if (remaining <= 0.005) return;

      const rows: Array<{ id: string; amount: string; settledAmount: string }> = await manager.query(
        `SELECT id, amount, "settledAmount" FROM cash_movements
         WHERE "salesRepresentativeId" = $1 AND account = 'REP_TREASURY' AND type = 'INCOME'
           AND (amount - "settledAmount") > 0.005
         ORDER BY "movementDate" ASC, "createdAt" ASC`,
        [rep.id],
      );

      let repTouched = false;
      for (const row of rows) {
        if (remaining <= 0.005) break;
        const rowRemaining = Number(row.amount) - Number(row.settledAmount);
        const consume = Math.min(rowRemaining, remaining);
        await manager.query(`UPDATE cash_movements SET "settledAmount" = "settledAmount" + $1 WHERE id = $2`, [
          consume,
          row.id,
        ]);
        remaining -= consume;
        repTouched = true;
      }
      if (repTouched) touchedReps += 1;
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Backfilled settledAmount for ${touchedReps} of ${reps.length} representative(s) with prior transfers.`);

  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Rep-treasury settlement backfill failed:', err);
  process.exit(1);
});
