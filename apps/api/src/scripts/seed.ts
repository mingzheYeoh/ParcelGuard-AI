import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import {
  CUSTOMER_ALEX_ID,
  CUSTOMER_OTHER_ID,
  addressFixtures,
  orderFixtures,
  orderOwnership,
} from '@parcelguard/contracts';
import * as schema from '../db/schema.js';

/**
 * db:seed — idempotently (re)creates the PLAN.md §6.1 demo fixtures.
 *
 * The fixture *data* lives in `@parcelguard/contracts` (Task 2) and is the
 * single source of truth shared with the frontend's MSW handlers. This script
 * only maps those API-shaped objects onto table rows and adds the two
 * server-only facts contracts deliberately does not expose: which customer
 * owns each order/address, and customer display names.
 *
 * Safe to run repeatedly (Task 11 re-runs it against Production between demo
 * takes): rows are upserted by their fixed business id, and each order's
 * items/timeline are replaced wholesale so a previously-confirmed address
 * change (ORD-1002 moved to Office) is reset back to its fixture state.
 */

const now = () => new Date().toISOString();

/** Server-only (PLAN.md §6.2: `customer_id` is never sent to the browser). */
const customerDisplayNames: Record<string, string> = {
  [CUSTOMER_ALEX_ID]: 'Alex Tan',
  [CUSTOMER_OTHER_ID]: 'Other Customer',
};

/** Server-only address ownership; contracts exposes label + city only. */
const addressOwnership: Record<keyof typeof addressFixtures, string> = {
  addr_alex_home: CUSTOMER_ALEX_ID,
  addr_alex_office: CUSTOMER_ALEX_ID,
  addr_other_home: CUSTOMER_OTHER_ID,
};

/** `ORD-1001` -> `item_ord-1001_1`, keeping ids stable across re-seeds. */
const rowId = (prefix: string, orderId: string, index: number) =>
  `${prefix}_${orderId.toLowerCase()}_${index + 1}`;

/**
 * Writes the fixtures with an existing connection. Exported so the Task 5
 * integration tests can reset to a known state between cases without shelling
 * out to this script.
 */
export async function seedFixtures(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.customers)
      .values(
        Object.entries(customerDisplayNames).map(([id, displayName]) => ({ id, displayName })),
      )
      .onConflictDoUpdate({
        target: schema.customers.id,
        set: { displayName: schema.customers.displayName },
      });

    await tx
      .insert(schema.addresses)
      .values(
        Object.values(addressFixtures).map((address) => ({
          id: address.id,
          customerId: addressOwnership[address.id as keyof typeof addressFixtures],
          label: address.label,
          city: address.city,
        })),
      )
      .onConflictDoUpdate({
        target: schema.addresses.id,
        set: { label: schema.addresses.label, city: schema.addresses.city },
      });

    for (const order of Object.values(orderFixtures)) {
      const row = {
        id: order.id,
        customerId: orderOwnership[order.id as keyof typeof orderFixtures],
        status: order.status,
        currency: order.currency,
        totalMinor: order.total_minor,
        addressRef: order.address_ref,
        version: order.version,
        updatedAt: now(),
      };

      await tx
        .insert(schema.orders)
        .values(row)
        .onConflictDoUpdate({ target: schema.orders.id, set: row });

      // Replace items/timeline wholesale so a re-seed resets any demo edits.
      await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
      await tx.insert(schema.orderItems).values(
        order.items.map((item, index) => ({
          id: rowId('item', order.id, index),
          orderId: order.id,
          name: item.name,
          quantity: item.quantity,
          unitPriceMinor: item.unit_price_minor,
        })),
      );

      await tx.delete(schema.orderTimeline).where(eq(schema.orderTimeline.orderId, order.id));
      await tx.insert(schema.orderTimeline).values(
        order.timeline.map((event, index) => ({
          id: rowId('tl', order.id, index),
          orderId: order.id,
          status: event.status,
          label: event.label,
          occurredAt: event.occurred_at,
        })),
      );
    }
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.',
    );
  }

  const client = postgres(databaseUrl, { max: 1 });
  await seedFixtures(drizzle(client, { schema }) as unknown as Database);

  const owned = Object.entries(orderOwnership)
    .filter(([, customerId]) => customerId === CUSTOMER_ALEX_ID)
    .map(([orderId]) => orderId);
  console.log(
    `Seed complete: ${CUSTOMER_ALEX_ID} (${owned.join(', ')}), ` +
      `${CUSTOMER_OTHER_ID} (${Object.keys(orderOwnership).length - owned.length} denial fixture).`,
  );
  await client.end();
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
