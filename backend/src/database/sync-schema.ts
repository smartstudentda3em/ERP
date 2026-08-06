import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * This foundation build ships TypeORM entities as the schema source of truth rather than a
 * hand-authored migration, because generating an accurate `migration:generate` diff requires
 * introspecting a live Postgres instance. Run this once against a fresh database to create all
 * tables/FKs/indexes from the entities. Once the schema is running in a real environment, use
 * `npm run migration:generate` to snapshot a proper timestamped migration for future changes —
 * see docs/DATABASE.md.
 */
async function main() {
  await AppDataSource.initialize();
  await AppDataSource.synchronize();
  // eslint-disable-next-line no-console
  console.log('Database schema synchronized from entities.');
  await AppDataSource.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Schema sync failed:', err);
  process.exit(1);
});
