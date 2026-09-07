import 'dotenv/config';
import postgres from 'postgres';

/**
 * db:reset — DEV ONLY. Drops and recreates the `public` schema, then the
 * caller (see package.json `db:reset` script) re-runs db:migrate and
 * db:seed. Never point this at a Preview/Production DATABASE_URL.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production.');
  }

  const client = postgres(databaseUrl, { max: 1 });
  console.log('Dropping and recreating schemas "public" and "drizzle" ...');
  await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await client.unsafe('CREATE SCHEMA public');
  // drizzle-kit records applied migrations in its own `drizzle` schema. Leaving
  // it behind makes the following db:migrate a no-op against an empty public
  // schema, and db:seed then fails with 42P01 undefined_table.
  await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
  console.log('Schema reset. Run db:migrate && db:seed next.');
  await client.end();
}

main().catch((error) => {
  console.error('Reset failed:', error);
  process.exit(1);
});
