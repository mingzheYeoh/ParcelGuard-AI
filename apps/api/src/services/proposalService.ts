import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Evidence, Order, Proposal, ProposalResult } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { conversations, idempotencyKeys, proposals } from '../db/schema.js';
import { PROPOSAL_TTL_MS } from '../config.js';
import { ApiError, apiError, notFound } from '../http/errors.js';
import { requireUnexpired } from './policyService.js';
import { applyAddressChange } from '../repositories/orderRepository.js';
import { recordAction } from './auditService.js';
import type { Terminal3Adapter } from '../adapters/index.js';
import type { SessionContext } from './sessionService.js';

/**
 * Proposal state machine and idempotent confirmation (PLAN.md §7.4, §8.4).
 *
 * Every transition is a conditional UPDATE rather than a read-then-write, so
 * two concurrent confirms of the same proposal cannot both execute even across
 * separate Vercel Function instances (TASKS.md §1.2 rule 2).
 */

const nowIso = () => new Date().toISOString();

const toProposal = (row: typeof proposals.$inferSelect): Proposal => ({
  id: row.id,
  conversation_id: row.conversationId,
  order_id: row.orderId,
  target_address_ref: row.targetAddressRef,
  expected_order_version: row.expectedOrderVersion,
  status: row.status,
  expires_at: new Date(row.expiresAt).toISOString(),
});

/**
 * Creates a pending proposal, superseding any earlier pending proposal for the
 * same order.
 *
 * PLAN.md §8.4 requires guarding concurrent proposals for one order. Of the
 * three readings — supersede, reject the new one, or return the existing one —
 * this takes supersede: the most recently stated intent wins, and the older
 * card in the transcript flips to cancelled so the UI can never offer two live
 * confirm buttons for the same order.
 */
export async function createProposal(
  db: Database,
  input: { conversationId: string; order: Order; addressRef: string },
): Promise<Proposal> {
  await db
    .update(proposals)
    .set({ status: 'cancelled', updatedAt: nowIso() })
    .where(and(eq(proposals.orderId, input.order.id), eq(proposals.status, 'pending')));

  const rows = await db
    .insert(proposals)
    .values({
      id: `prop_${randomUUID()}`,
      conversationId: input.conversationId,
      orderId: input.order.id,
      targetAddressRef: input.addressRef,
      expectedOrderVersion: input.order.version,
      status: 'pending',
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error('Failed to create proposal');
  return toProposal(row);
}

async function loadOwnedProposal(
  db: Database,
  proposalId: string,
  customerId: string,
): Promise<typeof proposals.$inferSelect> {
  const rows = await db
    .select({ proposal: proposals })
    .from(proposals)
    .innerJoin(conversations, eq(proposals.conversationId, conversations.id))
    .where(and(eq(proposals.id, proposalId), eq(conversations.customerId, customerId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('resource');
  return row.proposal;
}

/** The stored ProposalResult of an already-executed proposal, if any. */
async function storedResult(db: Database, proposalId: string): Promise<ProposalResult | null> {
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.proposalId, proposalId))
    .limit(1);
  const response = rows[0]?.response;
  return response ? (response as ProposalResult) : null;
}

export async function confirmProposal(
  db: Database,
  input: {
    proposalId: string;
    session: SessionContext;
    idempotencyKey: string | undefined;
    terminal3: Terminal3Adapter;
  },
): Promise<ProposalResult> {
  const { proposalId, session, idempotencyKey, terminal3 } = input;
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw apiError('INVALID_INPUT', 'Idempotency-Key header is required');
  }

  const proposal = await loadOwnedProposal(db, proposalId, session.customerId);

  // Uniqueness is session + key (PLAN.md §7.4). Insert-then-read makes the
  // check atomic: a concurrent request with the same key loses the insert and
  // reads the winner's row.
  await db
    .insert(idempotencyKeys)
    .values({
      id: `idem_${randomUUID()}`,
      sessionId: session.sessionId,
      key: idempotencyKey,
      proposalId,
    })
    .onConflictDoNothing({ target: [idempotencyKeys.sessionId, idempotencyKeys.key] });

  const claims = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.sessionId, session.sessionId),
        eq(idempotencyKeys.key, idempotencyKey),
      ),
    )
    .limit(1);
  const claim = claims[0];
  if (claim && claim.proposalId !== proposalId) {
    throw apiError('IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was used for another proposal');
  }
  if (claim?.response) return claim.response as ProposalResult;

  // A succeeded proposal replays its stored result even under a different key.
  if (proposal.status === 'succeeded') {
    const previous = await storedResult(db, proposalId);
    if (previous) return previous;
  }
  if (proposal.status === 'executing') {
    throw apiError('REQUEST_IN_PROGRESS', 'This confirmation is already being processed');
  }
  if (proposal.status === 'expired') {
    throw apiError('PROPOSAL_EXPIRED', 'This proposal has expired. Ask again to get a new one.');
  }
  if (proposal.status !== 'pending') {
    throw apiError('PROPOSAL_STATE_CONFLICT', `Proposal is ${proposal.status}`);
  }

  const expiresAt = new Date(proposal.expiresAt).toISOString();
  if (new Date(expiresAt).getTime() <= Date.now()) {
    await db
      .update(proposals)
      .set({ status: 'expired', updatedAt: nowIso() })
      .where(and(eq(proposals.id, proposalId), eq(proposals.status, 'pending')));
  }
  requireUnexpired(expiresAt);

  // Atomic pending -> executing claim (PLAN.md §8.4).
  const claimed = await db
    .update(proposals)
    .set({ status: 'executing', updatedAt: nowIso() })
    .where(and(eq(proposals.id, proposalId), eq(proposals.status, 'pending')))
    .returning();
  if (claimed.length === 0) {
    throw apiError('REQUEST_IN_PROGRESS', 'This confirmation is already being processed');
  }

  // The proposal is now claimed `executing`. Any throw from here must leave a
  // terminal status behind, or the proposal is stuck at 409 forever — nothing
  // clears it, because a Vercel Function does no background work.
  let evidence: Evidence;
  try {
    evidence = await terminal3.authorize({
      orderId: proposal.orderId,
      addressRef: proposal.targetAddressRef,
    });
  } catch (cause) {
    // PLAN.md §8.4: after dispatch an uncertain outcome is outcome_unknown,
    // not a retryable failure. A clean refusal before dispatch is a failure.
    const unknown = cause instanceof ApiError && cause.code === 'ACTION_OUTCOME_UNKNOWN';
    await db
      .update(proposals)
      .set({ status: unknown ? 'outcome_unknown' : 'failed', updatedAt: nowIso() })
      .where(eq(proposals.id, proposalId));
    await recordAction(db, {
      conversationId: proposal.conversationId,
      type: 'address_change',
      outcome: unknown ? 'outcome_unknown' : 'failed',
      reasonCode: cause instanceof ApiError ? cause.code : 'TERMINAL3_UNAVAILABLE',
      summary: unknown
        ? `Authorization result for ${proposal.orderId} is unconfirmed`
        : `Authorization for ${proposal.orderId} was not granted`,
      evidence: {
        source: 'terminal3',
        agent_did: null,
        provider_reference: null,
        verified: false,
      },
    });
    throw cause;
  }

  const order = await applyAddressChange(db, {
    orderId: proposal.orderId,
    customerId: session.customerId,
    addressRef: proposal.targetAddressRef,
    expectedVersion: proposal.expectedOrderVersion,
  });

  if (!order) {
    // The order moved under the proposal: fail loudly instead of overwriting
    // the concurrent change (PLAN.md §8.4).
    await db
      .update(proposals)
      .set({ status: 'failed', updatedAt: nowIso() })
      .where(eq(proposals.id, proposalId));
    await recordAction(db, {
      conversationId: proposal.conversationId,
      type: 'address_change',
      outcome: 'failed',
      reasonCode: 'ORDER_CHANGED',
      summary: `${proposal.orderId} changed before the update could be applied`,
      evidence,
    });
    throw apiError('ORDER_CHANGED', 'This order changed. Refresh it and ask again.');
  }

  await db
    .update(proposals)
    .set({ status: 'succeeded', updatedAt: nowIso() })
    .where(eq(proposals.id, proposalId));

  const action = await recordAction(db, {
    conversationId: proposal.conversationId,
    type: 'address_change',
    outcome: 'allowed',
    reasonCode: 'ADDRESS_UPDATED',
    summary: `Updated ${order.id} to ${order.address_label}`,
    evidence,
  });

  const result: ProposalResult = {
    proposal_id: proposalId,
    status: 'succeeded',
    order,
    action_id: action.id,
  };

  await db
    .update(idempotencyKeys)
    .set({ response: result })
    .where(
      and(
        eq(idempotencyKeys.sessionId, session.sessionId),
        eq(idempotencyKeys.key, idempotencyKey),
      ),
    );

  return result;
}

export async function cancelProposal(
  db: Database,
  proposalId: string,
  session: SessionContext,
): Promise<{ proposal_id: string; status: 'cancelled' }> {
  const proposal = await loadOwnedProposal(db, proposalId, session.customerId);

  // Repeated cancellation is not an error (PLAN.md §7.4).
  if (proposal.status === 'cancelled') return { proposal_id: proposalId, status: 'cancelled' };
  if (proposal.status !== 'pending') {
    throw apiError('PROPOSAL_STATE_CONFLICT', `Proposal is ${proposal.status}`);
  }

  const cancelled = await db
    .update(proposals)
    .set({ status: 'cancelled', updatedAt: nowIso() })
    .where(and(eq(proposals.id, proposalId), eq(proposals.status, 'pending')))
    .returning();
  if (cancelled.length === 0) {
    throw apiError('PROPOSAL_STATE_CONFLICT', 'Proposal is no longer pending');
  }
  return { proposal_id: proposalId, status: 'cancelled' };
}
