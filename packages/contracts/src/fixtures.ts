/**
 * Fixtures — PLAN.md §6.1.
 *
 * The demo session belongs to `cus_demo_alex`. `GET /orders` and
 * `GET /bootstrap` return only the `ORD-1xxx` orders. The `ORD-2xxx` orders
 * belong to `cus_demo_other` and are the backend denial fixtures — they must
 * never be returned by bootstrap or any authorized list (journey C).
 *
 * The set is shaped so every rule in the system has a fixture that exercises
 * it, without needing a reset between checks:
 *
 * | Order    | Owner | Status     | What it is for                          |
 * |----------|-------|------------|-----------------------------------------|
 * | ORD-1001 | Alex  | shipped    | change refused, ORDER_NOT_EDITABLE       |
 * | ORD-1002 | Alex  | processing | the change that succeeds (Home start)    |
 * | ORD-1003 | Alex  | delivered  | change refused; multi-item, full timeline|
 * | ORD-1004 | Alex  | processing | a SECOND changeable order (Office start) |
 * | ORD-2001 | other | processing | foreign order, must 404                  |
 * | ORD-2002 | other | shipped    | foreign order that is also not editable  |
 *
 * Two changeable orders matter in practice: a rehearsal consumes one, and
 * without a spare the live run needs a database reset first — which is what
 * broke the first Task 11 rehearsal.
 *
 * ORD-1002 starts at Home and ORD-1004 at Office, so "move it to Office" and
 * "move it to Home" both have a fixture where the change is real rather than
 * ADDRESS_UNCHANGED.
 *
 * Addresses are labels + city only — no street addresses, phone numbers, or
 * identity documents are stored or exposed (PLAN.md §6.1).
 */
import type { AddressSummary, Order } from './index.js';

export const CUSTOMER_ALEX_ID = 'cus_demo_alex';
export const CUSTOMER_OTHER_ID = 'cus_demo_other';

/**
 * The demo session's saved addresses are the three `addr_alex_*` entries.
 * `addr_other_home` belongs to the other customer and is never exposed — it
 * exists so a foreign order has a valid `address_ref`, and so there is a real
 * address id that must still be refused as a change target.
 */
export const addressFixtures = {
  addr_alex_home: { id: 'addr_alex_home', label: 'Home', city: 'Kuala Lumpur' },
  addr_alex_office: { id: 'addr_alex_office', label: 'Office', city: 'Kuala Lumpur' },
  // A third address in a different city, so a change is visible as more than
  // a label swap.
  addr_alex_parents: { id: 'addr_alex_parents', label: 'Parents', city: 'Penang' },
  addr_other_home: { id: 'addr_other_home', label: 'Home', city: 'Kuala Lumpur' },
} as const satisfies Record<string, AddressSummary>;

/** See the table above for what each order exists to exercise. */
export const orderFixtures = {
  'ORD-1001': {
    id: 'ORD-1001',
    status: 'shipped',
    currency: 'MYR',
    total_minor: 12900,
    items: [{ name: 'Wireless Keyboard', quantity: 1, unit_price_minor: 12900 }],
    address_ref: 'addr_alex_home',
    address_label: 'Home',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-09-01T02:00:00Z' },
      { status: 'shipped', label: 'Order shipped', occurred_at: '2026-09-03T06:30:00Z' },
    ],
  },
  'ORD-1002': {
    id: 'ORD-1002',
    status: 'processing',
    currency: 'MYR',
    total_minor: 8900,
    items: [{ name: 'Laptop Stand', quantity: 1, unit_price_minor: 8900 }],
    address_ref: 'addr_alex_home',
    address_label: 'Home',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-09-05T03:15:00Z' },
    ],
  },
  'ORD-1003': {
    id: 'ORD-1003',
    status: 'delivered',
    currency: 'MYR',
    total_minor: 23800,
    items: [
      { name: 'Mechanical Keyboard', quantity: 1, unit_price_minor: 18900 },
      { name: 'Wrist Rest', quantity: 1, unit_price_minor: 4900 },
    ],
    address_ref: 'addr_alex_office',
    address_label: 'Office',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-08-25T01:10:00Z' },
      { status: 'shipped', label: 'Order shipped', occurred_at: '2026-08-27T04:45:00Z' },
      { status: 'delivered', label: 'Delivered', occurred_at: '2026-08-29T08:20:00Z' },
    ],
  },
  'ORD-1004': {
    id: 'ORD-1004',
    status: 'processing',
    currency: 'MYR',
    total_minor: 30700,
    items: [
      { name: 'Monitor Arm', quantity: 1, unit_price_minor: 21900 },
      { name: 'HDMI Cable', quantity: 2, unit_price_minor: 3400 },
      { name: 'Cable Clips', quantity: 1, unit_price_minor: 2000 },
    ],
    address_ref: 'addr_alex_office',
    address_label: 'Office',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-09-06T07:40:00Z' },
    ],
  },
  'ORD-2001': {
    id: 'ORD-2001',
    status: 'processing',
    currency: 'MYR',
    total_minor: 15900,
    items: [{ name: 'USB-C Hub', quantity: 1, unit_price_minor: 15900 }],
    address_ref: 'addr_other_home',
    address_label: 'Home',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-09-04T09:00:00Z' },
    ],
  },
  'ORD-2002': {
    id: 'ORD-2002',
    status: 'shipped',
    currency: 'MYR',
    total_minor: 4500,
    items: [{ name: 'Screen Cleaner', quantity: 1, unit_price_minor: 4500 }],
    address_ref: 'addr_other_home',
    address_label: 'Home',
    version: 1,
    timeline: [
      { status: 'processing', label: 'Order confirmed', occurred_at: '2026-09-02T05:05:00Z' },
      { status: 'shipped', label: 'Order shipped', occurred_at: '2026-09-04T02:30:00Z' },
    ],
  },
} as const satisfies Record<string, Order>;

/** Customer ownership map — which fixture orders belong to which fixture customer. */
export const orderOwnership: Record<keyof typeof orderFixtures, string> = {
  'ORD-1001': CUSTOMER_ALEX_ID,
  'ORD-1002': CUSTOMER_ALEX_ID,
  'ORD-1003': CUSTOMER_ALEX_ID,
  'ORD-1004': CUSTOMER_ALEX_ID,
  'ORD-2001': CUSTOMER_OTHER_ID,
  'ORD-2002': CUSTOMER_OTHER_ID,
};

/** Ids the demo session may see. Derived, so a new fixture cannot be forgotten. */
export const ownedOrderIds = Object.entries(orderOwnership)
  .filter(([, customerId]) => customerId === CUSTOMER_ALEX_ID)
  .map(([orderId]) => orderId)
  .sort();
