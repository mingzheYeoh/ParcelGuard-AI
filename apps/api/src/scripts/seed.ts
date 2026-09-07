import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

/**
 * db:seed — idempotently (re)creates the PLAN.md §6.1 demo fixtures.
 *
 * Safe to run repeatedly (Task 11 re-runs it against Production between demo
 * takes): customers/addresses/orders are upserted by their fixed business
 * id, and each order's items/timeline are replaced wholesale so a
 * previously-confirmed address change (ORD-1002 moved to Office) is reset
 * back to its original fixture state.
 */

const now = () => new Date().toISOString();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
    );
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  await db.transaction(async (tx) => {
    // ---- customers -------------------------------------------------------
    await tx
      .insert(schema.customers)
      .values([
        { id: 'cus_demo_alex', displayName: 'Alex Tan' },
        { id: 'cus_demo_other', displayName: 'Other Customer' },
      ])
      .onConflictDoUpdate({
        target: schema.customers.id,
        set: { displayName: schema.customers.displayName },
      });

    // ---- addresses ---------------------------------------------------------
    await tx
      .insert(schema.addresses)
      .values([
        { id: 'addr_alex_home', customerId: 'cus_demo_alex', label: 'Home', city: 'Kuala Lumpur' },
        { id: 'addr_alex_office', customerId: 'cus_demo_alex', label: 'Office', city: 'Kuala Lumpur' },
        { id: 'addr_other_home', customerId: 'cus_demo_other', label: 'Home', city: 'Kuala Lumpur' },
      ])
      .onConflictDoUpdate({
        target: schema.addresses.id,
        set: { label: schema.addresses.label, city: schema.addresses.city },
      });

    // ---- orders (PLAN.md §6.1) -------------------------------------------
    const orderFixtures = [
      {
        id: 'ORD-1001',
        customerId: 'cus_demo_alex',
        status: 'shipped' as const,
        currency: 'MYR',
        totalMinor: 12900,
        addressRef: 'addr_alex_home',
        version: 1,
        item: { id: 'item_ord-1001_1', name: 'Wireless Keyboard', quantity: 1, unitPriceMinor: 12900 },
        timeline: [
          { id: 'tl_ord-1001_1', status: 'processing', label: 'Order placed', occurredAt: '2026-09-01T02:00:00Z' },
          { id: 'tl_ord-1001_2', status: 'shipped', label: 'Order shipped', occurredAt: '2026-09-02T06:30:00Z' },
        ],
      },
      {
        id: 'ORD-1002',
        customerId: 'cus_demo_alex',
        status: 'processing' as const,
        currency: 'MYR',
        totalMinor: 8900,
        addressRef: 'addr_alex_home',
        version: 1,
        item: { id: 'item_ord-1002_1', name: 'Laptop Stand', quantity: 1, unitPriceMinor: 8900 },
        timeline: [
          { id: 'tl_ord-1002_1', status: 'processing', label: 'Order placed', occurredAt: '2026-09-03T01:15:00Z' },
        ],
      },
      {
        id: 'ORD-2001',
        customerId: 'cus_demo_other',
        status: 'processing' as const,
        currency: 'MYR',
        totalMinor: 15900,
        addressRef: 'addr_other_home',
        version: 1,
        item: { id: 'item_ord-2001_1', name: 'USB-C Hub', quantity: 1, unitPriceMinor: 15900 },
        timeline: [
          { id: 'tl_ord-2001_1', status: 'processing', label: 'Order placed', occurredAt: '2026-09-04T04:45:00Z' },
        ],
      },
    ];

    for (const fixture of orderFixtures) {
      await tx
        .insert(schema.orders)
        .values({
          id: fixture.id,
          customerId: fixture.customerId,
          status: fixture.status,
          currency: fixture.currency,
          totalMinor: fixture.totalMinor,
          addressRef: fixture.addressRef,
          version: fixture.version,
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: schema.orders.id,
          set: {
            customerId: fixture.customerId,
            status: fixture.status,
            currency: fixture.currency,
            totalMinor: fixture.totalMinor,
            addressRef: fixture.addressRef,
            version: fixture.version,
            updatedAt: now(),
          },
        });

      // Replace items/timeline wholesale so a re-seed resets any demo edits.
      await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, fixture.id));
      await tx.insert(schema.orderItems).values({
        id: fixture.item.id,
        orderId: fixture.id,
        name: fixture.item.name,
        quantity: fixture.item.quantity,
        unitPriceMinor: fixture.item.unitPriceMinor,
      });

      await tx.delete(schema.orderTimeline).where(eq(schema.orderTimeline.orderId, fixture.id));
      await tx.insert(schema.orderTimeline).values(
        fixture.timeline.map((event) => ({
          id: event.id,
          orderId: fixture.id,
          status: event.status,
          label: event.label,
          occurredAt: event.occurredAt,
        })),
      );
    }
  });

  console.log('Seed complete: cus_demo_alex (ORD-1001, ORD-1002), cus_demo_other (ORD-2001).');
  await client.end();
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
