import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * One-off repair for the "duplicate key value violates unique constraint ...cash_movements..." error
 * reported on capital injections ("زيادة رأس المال") for a specific company. CashMovementsService
 * already retries a documentNumber collision up to 3 times (see isDuplicateDocumentNumber in
 * cash-movements.service.ts), but that only self-heals a small drift — if a company's
 * numbering_series."nextNumber" counter is more than 3 numbers behind the highest documentNumber
 * actually used in cash_movements (e.g. historical rows were ever inserted directly against the
 * database rather than through CashMovementsService.record()/NumberingSeriesService.reserveNumber()),
 * every attempt collides and the raw Postgres error reaches the user instead. This walks every
 * company's CASH_MOVEMENT series, finds the highest numeric suffix already in use under that
 * series' *current* prefix/suffix, and bumps nextNumber past it — never backward, so a company
 * that's already safely ahead is untouched. Safe to run more than once.
 *
 * Also reports (but does not attempt to fix) any exact-duplicate documentNumber rows found — those
 * would mean the unique constraint itself is missing on this database and needs `npm run schema:sync`
 * run first, since no data-level fix can restore a constraint that was never applied.
 */
async function main() {
  await AppDataSource.initialize();

  const duplicates: Array<{ companyId: string; documentNumber: string; count: string }> = await AppDataSource.query(`
    SELECT "companyId", "documentNumber", COUNT(*) AS count
    FROM cash_movements
    GROUP BY "companyId", "documentNumber"
    HAVING COUNT(*) > 1
  `);
  if (duplicates.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARNING: found ${duplicates.length} exact-duplicate documentNumber group(s) already in cash_movements — ` +
        `this means the unique constraint is not actually enforced on this database (run "npm run schema:sync" ` +
        `first). Groups: ${JSON.stringify(duplicates)}`,
    );
  }

  const series: Array<{
    id: string;
    companyId: string;
    companyCode: string;
    prefix: string;
    suffix: string;
    nextNumber: number;
  }> = await AppDataSource.query(`
    SELECT ns.id, ns."companyId", c.code AS "companyCode", ns.prefix, ns.suffix, ns."nextNumber"
    FROM numbering_series ns
    INNER JOIN companies c ON c.id = ns."companyId"
    WHERE ns."documentType" = 'CASH_MOVEMENT'
  `);

  let touched = 0;
  for (const s of series) {
    const rows: Array<{ documentNumber: string }> = await AppDataSource.query(
      `SELECT "documentNumber" FROM cash_movements WHERE "companyId" = $1`,
      [s.companyId],
    );

    let maxUsed = 0;
    for (const { documentNumber } of rows) {
      if (!documentNumber.startsWith(s.prefix) || !documentNumber.endsWith(s.suffix)) continue;
      const middle = documentNumber.slice(s.prefix.length, documentNumber.length - s.suffix.length);
      if (!/^\d+$/.test(middle)) continue;
      maxUsed = Math.max(maxUsed, parseInt(middle, 10));
    }

    if (maxUsed + 1 > s.nextNumber) {
      await AppDataSource.query(`UPDATE numbering_series SET "nextNumber" = $1 WHERE id = $2`, [maxUsed + 1, s.id]);
      // eslint-disable-next-line no-console
      console.log(
        `${s.companyCode}: CASH_MOVEMENT nextNumber was ${s.nextNumber}, behind highest used number ${maxUsed} — bumped to ${maxUsed + 1}.`,
      );
      touched += 1;
    } else {
      // eslint-disable-next-line no-console
      console.log(`${s.companyCode}: CASH_MOVEMENT nextNumber (${s.nextNumber}) already ahead of highest used number (${maxUsed}) — no change.`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Done. Corrected ${touched} of ${series.length} company CASH_MOVEMENT series.`);

  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Cash-movement numbering drift fix failed:', err);
  process.exit(1);
});
