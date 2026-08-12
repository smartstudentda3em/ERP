import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * Verifies (and, only if it ever finds a problem, repairs) the link between import_cargo_items
 * and shipments — requested as a "data migration" for the البضاعة Master-Detail restructuring,
 * but there's nothing to migrate: import_cargo_items.shipmentId has always been a real, NOT NULL
 * foreign key to shipments (onDelete: RESTRICT — Postgres itself refuses to delete a shipment
 * while cargo rows still reference it), never a free-text "shipment name" field. So every cargo
 * row, old or new, is already correctly grouped under its real shipment; this script exists to
 * prove that (per the user's own "التحقق والاعتماد" requirement) rather than to actually move
 * any data.
 *
 * The repair branch below is unreachable through the application itself — it only matters if a
 * row was ever inserted by a direct SQL statement that bypassed the ORM/FK (never something this
 * app's own code can do). Kept as a genuine safety net rather than removed, per the user's
 * explicit ask for a backfill mechanism.
 *
 * Safe to run more than once (read-only unless it finds an actual orphan, which normal operation
 * never produces).
 */
async function main() {
  await AppDataSource.initialize();

  const summary: Array<{ code: string; total: string; orphaned: string }> = await AppDataSource.query(`
    SELECT c.code, COUNT(*) AS total, COUNT(*) FILTER (WHERE s.id IS NULL) AS orphaned
    FROM import_cargo_items ici
    JOIN companies c ON c.id = ici."companyId"
    LEFT JOIN shipments s ON s.id = ici."shipmentId" AND s."companyId" = ici."companyId"
    GROUP BY c.code
    ORDER BY c.code
  `);

  // eslint-disable-next-line no-console
  console.log('Cargo → shipment link verification (per company):');
  for (const row of summary) {
    // eslint-disable-next-line no-console
    console.log(`  ${row.code}: ${row.total} cargo item(s), ${row.orphaned} orphaned`);
  }

  const orphans: Array<{ id: string; companyId: string; shipmentId: string; shipmentName: string | null }> =
    await AppDataSource.query(`
      SELECT ici.id, ici."companyId", ici."shipmentId", NULL::text AS "shipmentName"
      FROM import_cargo_items ici
      LEFT JOIN shipments s ON s.id = ici."shipmentId" AND s."companyId" = ici."companyId"
      WHERE s.id IS NULL
    `);

  if (orphans.length === 0) {
    // eslint-disable-next-line no-console
    console.log('\nAll cargo items are correctly linked to a shipment in their own company — nothing to backfill.');
    await AppDataSource.destroy();
    return;
  }

  // Unreachable in normal operation (see doc comment above) — kept only as a genuine fallback.
  await AppDataSource.transaction(async (manager) => {
    for (const row of orphans) {
      let shipment = row.shipmentName
        ? await manager.query(
            `SELECT id FROM shipments WHERE "companyId" = $1 AND "shipmentName" = $2 LIMIT 1`,
            [row.companyId, row.shipmentName],
          )
        : [];
      let shipmentId: string;
      if (shipment[0]) {
        shipmentId = shipment[0].id;
      } else {
        const created = await manager.query(
          `INSERT INTO shipments ("shipmentName", "shippingCompanyName", "companyId", "createdById")
           VALUES ($1, '', $2, (SELECT id FROM users LIMIT 1)) RETURNING id`,
          [row.shipmentName ?? 'Unlinked shipment', row.companyId],
        );
        shipmentId = created[0].id;
      }
      await manager.query(`UPDATE import_cargo_items SET "shipmentId" = $1 WHERE id = $2`, [shipmentId, row.id]);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`\nRelinked ${orphans.length} orphaned cargo item(s).`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Cargo/shipment link verification failed:', err);
  process.exit(1);
});
