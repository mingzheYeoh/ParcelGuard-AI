import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Order } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { addresses, orderItems, orderTimeline, orders } from '../db/schema.js';

/**
 * Order reads/writes. Every function takes `customerId` from the trusted
 * session — there is no "get this order by id" without an owner check, so a
 * foreign order (ORD-2001) is indistinguishable from a nonexistent one
 * (PLAN.md §6.1, §7.6).
 */

type OrderRow = typeof orders.$inferSelect;

async function hydrate(db: Database, rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const refs = [...new Set(rows.map((row) => row.addressRef))];

  const [items, timeline, addressRows] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id)),
    db
      .select()
      .from(orderTimeline)
      .where(inArray(orderTimeline.orderId, ids))
      .orderBy(asc(orderTimeline.occurredAt)),
    db.select().from(addresses).where(inArray(addresses.id, refs)),
  ]);

  const labelByRef = new Map(addressRows.map((row) => [row.id, row.label]));

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    currency: 'MYR' as const,
    total_minor: row.totalMinor,
    items: items
      .filter((item) => item.orderId === row.id)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price_minor: item.unitPriceMinor,
      })),
    address_ref: row.addressRef,
    address_label: labelByRef.get(row.addressRef) ?? row.addressRef,
    version: row.version,
    timeline: timeline
      .filter((event) => event.orderId === row.id)
      .map((event) => ({
        status: event.status,
        label: event.label,
        occurred_at: new Date(event.occurredAt).toISOString(),
      })),
  }));
}

export async function listOrders(db: Database, customerId: string): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.customerId, customerId))
    .orderBy(asc(orders.id));
  return hydrate(db, rows);
}

/** Returns null for both "does not exist" and "belongs to someone else". */
export async function getOrder(
  db: Database,
  orderId: string,
  customerId: string,
): Promise<Order | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
    .limit(1);
  const hydrated = await hydrate(db, rows);
  return hydrated[0] ?? null;
}

/**
 * Conditional update — the write half of optimistic concurrency (PLAN.md §8.4).
 * Returns null when the version moved under us; the caller turns that into
 * 409 ORDER_CHANGED rather than overwriting a concurrent change.
 */
export async function applyAddressChange(
  db: Database,
  input: { orderId: string; customerId: string; addressRef: string; expectedVersion: number },
): Promise<Order | null> {
  const updated = await db
    .update(orders)
    .set({
      addressRef: input.addressRef,
      version: input.expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(orders.id, input.orderId),
        eq(orders.customerId, input.customerId),
        eq(orders.version, input.expectedVersion),
      ),
    )
    .returning();

  if (updated.length === 0) return null;
  return getOrder(db, input.orderId, input.customerId);
}
