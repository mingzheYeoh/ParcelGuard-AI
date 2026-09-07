import 'dotenv/config';

/**
 * Test environment. DATABASE_URL must point at a local PostgreSQL that has had
 * `pnpm --filter api db:migrate` run against it; the tests re-seed themselves.
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env, point it at a local ' +
      'PostgreSQL, and run `pnpm --filter api db:migrate` before `pnpm --filter api test`.',
  );
}

process.env.SESSION_SECRET ??= 'test_session_secret_at_least_16_chars';
process.env.APP_ORIGIN ??= 'http://localhost:5173';
process.env.DEMO_MODE ??= 'true';
process.env.MODEL_PROVIDER ??= 'mock';
process.env.TERMINAL3_MODE ??= 'mock';
