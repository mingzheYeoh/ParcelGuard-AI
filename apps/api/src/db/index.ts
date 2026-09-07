import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * Database connection module (TASKS.md §1.2 rule 6).
 *
 * The client is created once per process and memoised, so warm Vercel Function
 * instances reuse the same pool instead of opening one per request. Creation is
 * lazy on purpose: importing this module must not throw when DATABASE_URL is
 * absent, otherwise a misconfigured deployment loses `GET /api/v1/health` — the
 * one endpoint whose job is to report that something is misconfigured
 * (PLAN.md §7.1, TASKS.md §2 rule 5).
 *
 * DATABASE_URL must be a pooled connection string in deployed environments
 * (Neon pooler / pgbouncer); locally it points at plain Postgres.
 */

let client: postgres.Sql | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!database) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
      );
    }
    // A low per-instance max is intentional: many concurrent function
    // instances share one upstream pooler budget.
    client = postgres(url, {
      max: process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    database = drizzle(client, { schema });
  }
  return database;
}

/** Closes the pool. Local/test teardown only — never inside a request. */
export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
  database = undefined;
}

export type Database = ReturnType<typeof getDb>;
