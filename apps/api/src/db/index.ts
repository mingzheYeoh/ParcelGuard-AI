import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * Database connection module (TASKS.md §1.2 rule 6).
 *
 * The `postgres` (postgres.js) client and the Drizzle instance are created
 * once at module scope so that warm Vercel Function instances reuse the same
 * pooled connection instead of opening a new one per request. This module
 * must not be imported anywhere that would create it lazily per-request.
 *
 * DATABASE_URL must point at a pooled connection string in deployed
 * environments (Neon pooler / pgbouncer). Locally it points at plain
 * Postgres (see apps/api/.env.example and docs/handoffs/task-4.md).
 */

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
    );
  }
  return url;
}

// `max: 1` keeps local/dev usage predictable; in Vercel Functions each warm
// instance holds its own small pool via the pooled connection string, so a
// low per-instance max is intentional (avoids exhausting the upstream
// pooler's connection budget across many concurrent function instances).
export const sql = postgres(getDatabaseUrl(), {
  max: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;
