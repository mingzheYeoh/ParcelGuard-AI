import type { AddressSummary, Order } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { getAddress } from '../repositories/addressRepository.js';
import { getOrder } from '../repositories/orderRepository.js';
import { apiError, notFound } from '../http/errors.js';

/**
 * The single place every authorization and business rule is decided
 * (PLAN.md §8.1). Both the REST routes and the model's tool gateway call
 * these, so a tool call can never reach data a direct request could not —
 * the property journeys C and E in PLAN.md §3 are about.
 */

/** 404 for a foreign or nonexistent order — existence is never disclosed. */
export async function requireOwnedOrder(
  db: Database,
  orderId: string,
  customerId: string,
): Promise<Order> {
  const order = await getOrder(db, orderId, customerId);
  if (!order) throw notFound('order');
  return order;
}

/** Only `processing` orders are editable (PLAN.md §3 journey D). */
export function requireEditableOrder(order: Order): void {
  if (order.status !== 'processing') {
    throw apiError(
      'ORDER_NOT_EDITABLE',
      `${order.id} has already ${order.status === 'shipped' ? 'shipped' : 'been delivered'} and its address can no longer be changed`,
    );
  }
}

/** The target address must be one of *this* customer's saved addresses. */
export async function requireOwnedAddress(
  db: Database,
  addressRef: string,
  customerId: string,
): Promise<AddressSummary> {
  const address = await getAddress(db, addressRef, customerId);
  if (!address) throw notFound('resource');
  return address;
}

/** Guards the confirm path: a proposal past its TTL can never execute. */
export function requireUnexpired(expiresAt: string): void {
  if (new Date(expiresAt).getTime() <= Date.now()) {
    throw apiError('PROPOSAL_EXPIRED', 'This proposal has expired. Ask again to get a new one.');
  }
}
