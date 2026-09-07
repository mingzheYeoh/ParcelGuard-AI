import { and, asc, eq } from 'drizzle-orm';
import type { AddressSummary } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { addresses } from '../db/schema.js';

/** Saved addresses of the session's customer only (PLAN.md §8.2). */
export async function listAddresses(
  db: Database,
  customerId: string,
): Promise<AddressSummary[]> {
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.customerId, customerId))
    .orderBy(asc(addresses.id));
  return rows.map((row) => ({ id: row.id, label: row.label, city: row.city }));
}

/** Null when the address does not exist *or* belongs to another customer. */
export async function getAddress(
  db: Database,
  addressId: string,
  customerId: string,
): Promise<AddressSummary | null> {
  const rows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, addressId), eq(addresses.customerId, customerId)))
    .limit(1);
  const row = rows[0];
  return row ? { id: row.id, label: row.label, city: row.city } : null;
}
