import { z } from 'zod';
import type { ChatTurnCard, ErrorCode } from '@parcelguard/contracts';
import type { Database } from '../db/index.js';
import { ApiError } from '../http/errors.js';
import type { ToolCall, ToolResult } from '../adapters/index.js';
import { requireEditableOrder, requireOwnedAddress, requireOwnedOrder } from './policyService.js';
import { createProposal } from './proposalService.js';
import { recordAction } from './auditService.js';
import type { SessionContext } from './sessionService.js';

/**
 * Fixed tool allowlist and schema checks (PLAN.md §8.1 toolGateway, §8.2).
 *
 * There are exactly two tools and neither takes a customer id — the customer
 * comes from the trusted session, so no amount of prompt text can make the
 * model read another customer's order (PLAN.md §3 journey E). Every tool goes
 * through policyService, the same code path the REST routes use.
 */

const TOOL_SCHEMAS = {
  get_order: z.object({ order_id: z.string().min(1).max(64) }),
  propose_address_change: z.object({
    order_id: z.string().min(1).max(64),
    address_ref: z.string().min(1).max(64),
  }),
} as const;

export interface ToolOutcome {
  readonly result: ToolResult;
  readonly cards: ChatTurnCard[];
  readonly actionIds: string[];
}

/** Evidence for anything that never left this process (PLAN.md §7.5). */
const LOCAL_EVIDENCE = {
  source: 'local',
  agent_did: null,
  provider_reference: null,
  verified: false,
} as const;

export async function executeTool(
  db: Database,
  input: { call: ToolCall; session: SessionContext; conversationId: string },
): Promise<ToolOutcome> {
  const { call, session, conversationId } = input;
  const schema = TOOL_SCHEMAS[call.name];
  if (!schema) {
    throw new Error(`Unknown tool: ${String((call as { name: string }).name)}`);
  }

  if (call.name === 'get_order') {
    const args = TOOL_SCHEMAS.get_order.parse(call.args);
    try {
      const order = await requireOwnedOrder(db, args.order_id.toUpperCase(), session.customerId);
      const action = await recordAction(db, {
        conversationId,
        type: 'order_lookup',
        outcome: 'allowed',
        reasonCode: 'ORDER_FOUND',
        summary: `Looked up ${order.id}`,
        evidence: LOCAL_EVIDENCE,
      });
      return {
        result: { name: 'get_order', ok: true, order },
        cards: [{ type: 'order_summary', order }],
        actionIds: [action.id],
      };
    } catch (error) {
      return denial(db, {
        error,
        conversationId,
        type: 'order_lookup',
        // Deliberately identical for "does not exist" and "belongs to someone
        // else" — the denial must not disclose that ORD-2001 exists.
        fallbackTitle: 'Order not available',
        summary: `Denied lookup of ${args.order_id}`,
      });
    }
  }

  const args = TOOL_SCHEMAS.propose_address_change.parse(call.args);
  try {
    const order = await requireOwnedOrder(db, args.order_id.toUpperCase(), session.customerId);
    requireEditableOrder(order);
    const address = await requireOwnedAddress(db, args.address_ref, session.customerId);

    if (order.address_ref === address.id) {
      const action = await recordAction(db, {
        conversationId,
        type: 'agent_refusal',
        outcome: 'denied',
        reasonCode: 'ADDRESS_UNCHANGED',
        summary: `${order.id} already ships to ${address.label}`,
        evidence: LOCAL_EVIDENCE,
      });
      return {
        result: {
          name: 'propose_address_change',
          ok: false,
          reason: `${order.id} already ships to your ${address.label} address.`,
        },
        cards: [
          {
            type: 'action_result',
            outcome: 'denied',
            reason_code: 'ADDRESS_UNCHANGED',
            title: 'No change needed',
            description: `${order.id} already ships to your ${address.label} address.`,
            action_id: action.id,
          },
        ],
        actionIds: [action.id],
      };
    }

    const proposal = await createProposal(db, {
      conversationId,
      order,
      addressRef: address.id,
    });
    const action = await recordAction(db, {
      conversationId,
      type: 'address_change_proposal',
      outcome: 'allowed',
      reasonCode: 'PROPOSAL_CREATED',
      summary: `Proposed moving ${order.id} to ${address.label}`,
      evidence: LOCAL_EVIDENCE,
    });

    return {
      result: {
        name: 'propose_address_change',
        ok: true,
        summary: `I can move ${order.id} to your ${address.label} address. Confirm to apply it.`,
      },
      cards: [
        {
          type: 'address_change_proposal',
          proposal_id: proposal.id,
          order_id: order.id,
          from_address_label: order.address_label,
          to_address_label: address.label,
          status: proposal.status,
          expires_at: proposal.expires_at,
        },
      ],
      actionIds: [action.id],
    };
  } catch (error) {
    return denial(db, {
      error,
      conversationId,
      type: 'policy_denied',
      fallbackTitle: 'Change not allowed',
      summary: `Denied address change on ${args.order_id}`,
    });
  }
}

/**
 * Customer-facing copy for a denial card, per Design.md §8.3. The ApiError
 * message is written for a REST caller ("Order not available"); using it as
 * the card description made the card repeat its own title and drop the wording
 * the design specifies. The frontend's MSW handlers already used these exact
 * strings, so live and mock now read identically.
 */
const DENIAL_COPY: Partial<Record<ErrorCode, { title: string; description: string }>> = {
  ORDER_UNAVAILABLE: {
    title: 'Order not available',
    description: "This order isn't available in your account.",
  },
  RESOURCE_UNAVAILABLE: {
    title: 'Not available',
    description: "That isn't available in your account.",
  },
  ORDER_NOT_EDITABLE: {
    title: 'Shipped orders cannot be updated',
    description: "This order has already shipped, so its delivery address can't be changed.",
  },
};

/**
 * Turns a policy exception into a 200-with-denial-card turn. PLAN.md §7.6:
 * a chat denial that the system handled successfully is not an HTTP error —
 * only direct REST calls return the status code.
 */
async function denial(
  db: Database,
  input: {
    error: unknown;
    conversationId: string;
    type: 'order_lookup' | 'policy_denied';
    fallbackTitle: string;
    summary: string;
  },
): Promise<ToolOutcome> {
  if (!(input.error instanceof ApiError)) throw input.error;

  const action = await recordAction(db, {
    conversationId: input.conversationId,
    type: input.type,
    outcome: 'denied',
    reasonCode: input.error.code,
    summary: input.summary,
    evidence: LOCAL_EVIDENCE,
  });

  const copy = DENIAL_COPY[input.error.code] ?? {
    title: input.fallbackTitle,
    description: input.error.message,
  };

  return {
    result:
      input.type === 'order_lookup'
        ? { name: 'get_order', ok: false, reason: copy.description }
        : { name: 'propose_address_change', ok: false, reason: copy.description },
    cards: [
      {
        type: 'action_result',
        outcome: 'denied',
        reason_code: input.error.code,
        title: copy.title,
        description: copy.description,
        action_id: action.id,
      },
    ],
    actionIds: [action.id],
  };
}
