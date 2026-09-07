import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * db:migrate — applies pending migrations from apps/api/drizzle/.
 *
 * Run only from a developer shell or CI (TASKS.md §1.2 rule 5: migrations
 * never run at Vercel Function cold start). Uses its own single connection
 * (max: 1) rather than the shared pool in src/db/index.ts, and closes it
 * when done.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
    );
  }

  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('Running migrations from ./drizzle ...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');

  await migrationClient.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
