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
  console.log('Dropping and recreating schema "public" ...');
  await client.unsafe('DROP SCHEMA public CASCADE');
  await client.unsafe('CREATE SCHEMA public');
  console.log('Schema reset. Run db:migrate && db:seed next.');
  await client.end();
}

main().catch((error) => {
  console.error('Reset failed:', error);
  process.exit(1);
});
