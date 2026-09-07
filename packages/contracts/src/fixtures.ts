/**
 * Fixtures — PLAN.md §6.1.
 *
 * The demo session belongs to `cus_demo_alex`. `GET /orders` and
 * `GET /bootstrap` return only ORD-1001 and ORD-1002. ORD-2001 belongs to
 * `cus_demo_other` and is the backend denial fixture — it must never be
 * returned by bootstrap or any authorized list (PLAN.md §6.1, journey C).
 *
 * Addresses are labels + city only — no street addresses, phone numbers, or
 * identity documents are stored or exposed (PLAN.md §6.1).
 */
import type { AddressSummary, Order } from './index.js';

export const CUSTOMER_ALEX_ID = 'cus_demo_alex';
export const CUSTOMER_OTHER_ID = 'cus_demo_other';

/** addr_alex_home / addr_alex_office — the current session's saved addresses. */
export const addressFixtures = {
  addr_alex_home: { id: 'addr_alex_home', label: 'Home', city: 'Kuala Lumpur' },
  addr_alex_office: { id: 'addr_alex_office', label: 'Office', city: 'Kuala Lumpur' },
  // Not exposed to the demo session; exists only so ORD-2001 has a valid address_ref.
  addr_other_home: { id: 'addr_other_home', label: 'Home', city: 'Kuala Lumpur' },
} as const satisfies Record<string, AddressSummary>;

/**
 * ORD-1001 / ORD-1002 belong to {@link CUSTOMER_ALEX_ID} (the current demo
 * session); ORD-2001 belongs to {@link CUSTOMER_OTHER_ID} and is the backend
 * denial fixture — it must never be returned by `/bootstrap` or `/orders`.
 */
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
} as const satisfies Record<string, Order>;

/** Customer ownership map — which fixture orders belong to which fixture customer. */
export const orderOwnership: Record<keyof typeof orderFixtures, string> = {
  'ORD-1001': CUSTOMER_ALEX_ID,
  'ORD-1002': CUSTOMER_ALEX_ID,
  'ORD-2001': CUSTOMER_OTHER_ID,
};
