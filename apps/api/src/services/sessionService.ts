import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { CUSTOMER_ALEX_ID } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { customers, sessions } from '../db/schema.js';
import { apiError } from '../http/errors.js';

/**
 * Demo sessions (PLAN.md §6.3). The customer is fixed server-side and a
 * customer_id from a request body is never trusted. This is not production
 * authentication; it exists only to make the authorization boundary real.
 */

export interface SessionContext {
  readonly sessionId: string;
  readonly customerId: string;
  readonly displayName: string;
}

export async function createDemoSession(db: Database): Promise<SessionContext> {
  const sessionId = `sess_${randomUUID()}`;
  await db.insert(sessions).values({ id: sessionId, customerId: CUSTOMER_ALEX_ID });
  const customer = await loadCustomer(db, CUSTOMER_ALEX_ID);
  return { sessionId, customerId: CUSTOMER_ALEX_ID, displayName: customer };
}

/** Throws 401 SESSION_REQUIRED for a missing, unknown, or expired session. */
export async function loadSession(db: Database, sessionId: string): Promise<SessionContext> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const row = rows[0];
  if (!row || (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now())) {
    throw apiError('SESSION_REQUIRED', 'Start a demo session first');
  }
  return {
    sessionId: row.id,
    customerId: row.customerId,
    displayName: await loadCustomer(db, row.customerId),
  };
}

async function loadCustomer(db: Database, customerId: string): Promise<string> {
  const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Customer ${customerId} is missing. Run: pnpm --filter api db:seed`);
  }
  return row.displayName;
}
