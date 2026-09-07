import { HttpResponse, delay, http } from 'msw';
import {
  apiPaths,
  type ChatTurn,
  type ChatTurnCard,
  type ErrorCode,
  type ProposalResult,
} from '@parcelguard/contracts';
import {
  MOCK_LATENCY_MS,
  applyAddressChange,
  createProposal,
  detectScenario,
  findOwnedOrder,
  nextId,
  ownedAddresses,
  ownedOrders,
  proposalCard,
  recordAction,
  setProposalStatus,
  state,
} from './db';

/**
 * MSW handlers (Design.md §11). Same paths, same envelopes, same enum values
 * as the live API, so the UI cannot tell them apart — and every §7.6 status
 * code is reachable through a deterministic trigger rather than random chance.
 */

const ok = <T>(data: T, status = 200) =>
  HttpResponse.json({ data, request_id: nextId('req') }, { status });

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'MODEL_RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'TERMINAL3_UNAVAILABLE',
  'MODEL_TIMEOUT',
]);

const fail = (status: number, code: ErrorCode, message: string) =>
  HttpResponse.json(
    { error: { code, message, retryable: RETRYABLE.has(code) }, request_id: nextId('req') },
    { status },
  );

const requireSession = () =>
  state.sessionActive ? null : fail(401, 'SESSION_REQUIRED', 'Start a demo session first');

const path = (suffix: string) => `*${suffix}`;

export const handlers = [
  http.post(path(apiPaths.demoSession()), async () => {
    await delay(MOCK_LATENCY_MS);
    state.sessionActive = true;
    return ok({ customer: { display_name: 'Alex Tan' }, demo: true as const });
  }),

  http.get(path(apiPaths.health()), async () =>
    ok({ api: 'ok' as const, model: 'mock' as const, terminal3: 'mock' as const }),
  ),

  http.get(path(apiPaths.bootstrap()), async () => {
    await delay(MOCK_LATENCY_MS);
    return (
      requireSession() ??
      ok({
        customer: { display_name: 'Alex Tan' },
        addresses: ownedAddresses(),
        integration: {
          model: { mode: 'mock' as const, provider: null, deployment: null },
          terminal3: { mode: 'mock' as const, agent_did: null, identity_verified: false },
        },
      })
    );
  }),

  http.get(path(apiPaths.orders()), async () => {
    await delay(MOCK_LATENCY_MS);
    return requireSession() ?? ok({ items: ownedOrders() });
  }),

  http.get(path('/api/v1/orders/:id'), async ({ params }) => {
    await delay(MOCK_LATENCY_MS);
    const denied = requireSession();
    if (denied) return denied;
    const order = findOwnedOrder(String(params.id));
    // ORD-2001 and a nonexistent id are indistinguishable (PLAN.md §7.6).
    return order ? ok(order) : fail(404, 'ORDER_UNAVAILABLE', 'Order not available');
  }),

  http.post(path(apiPaths.conversations()), async () => {
    await delay(MOCK_LATENCY_MS);
    const denied = requireSession();
    if (denied) return denied;
    const id = nextId('conv');
    state.conversations.add(id);
    return ok({ id, created_at: new Date().toISOString() });
  }),

  http.post(path('/api/v1/conversations/:id/messages'), async ({ params, request }) => {
    const denied = requireSession();
    if (denied) return denied;

    const conversationId = String(params.id);
    if (!state.conversations.has(conversationId)) {
      return fail(404, 'RESOURCE_UNAVAILABLE', 'Resource not available');
    }

    const body = (await request.json()) as { client_message_id?: string; content?: string };
    const content = (body.content ?? '').trim();
    const clientMessageId = body.client_message_id ?? '';
    if (content.length === 0 || [...content].length > 2000) {
      return fail(422, 'INVALID_INPUT', 'content must be 1-2000 characters after trimming');
    }

    // Replay semantics of PLAN.md §8.3.
    const seen = state.seenClientMessageIds.get(clientMessageId);
    if (seen) {
      if (seen.content !== content) {
        return fail(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This client_message_id was already used with different content',
        );
      }
      await delay(MOCK_LATENCY_MS);
      return ok(seen.turn as ChatTurn);
    }

    const scenario = detectScenario(content);
    if (scenario === 'timeout') {
      await delay(MOCK_LATENCY_MS * 2);
      return fail(504, 'MODEL_TIMEOUT', 'The assistant took too long to respond.');
    }
    if (scenario === 'rate_limited') {
      await delay(MOCK_LATENCY_MS);
      return fail(429, 'MODEL_RATE_LIMITED', 'Too many requests. Try again shortly.');
    }
    if (scenario === 'unavailable') {
      await delay(MOCK_LATENCY_MS);
      return fail(502, 'MODEL_UNAVAILABLE', 'The assistant is unavailable right now.');
    }

    await delay(MOCK_LATENCY_MS);
    const turn = buildTurn(conversationId, content, scenario);
    state.seenClientMessageIds.set(clientMessageId, { content, turn });
    return ok(turn);
  }),

  http.post(path('/api/v1/proposals/:id/confirm'), async ({ params, request }) => {
    const denied = requireSession();
    if (denied) return denied;

    const proposalId = String(params.id);
    const proposal = state.proposals[proposalId];
    if (!proposal) return fail(404, 'RESOURCE_UNAVAILABLE', 'Resource not available');

    const key = request.headers.get('idempotency-key');
    if (!key) return fail(422, 'INVALID_INPUT', 'Idempotency-Key header is required');

    const stored = state.idempotency.get(key);
    if (stored && stored.proposalId !== proposalId) {
      return fail(409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was used for another proposal');
    }
    if (stored) {
      await delay(MOCK_LATENCY_MS);
      return ok(stored.response as ProposalResult);
    }

    if (proposal.status === 'cancelled' || proposal.status === 'failed') {
      return fail(409, 'PROPOSAL_STATE_CONFLICT', `Proposal is ${proposal.status}`);
    }
    if (new Date(proposal.expires_at).getTime() <= Date.now()) {
      setProposalStatus(proposalId, 'expired');
      return fail(410, 'PROPOSAL_EXPIRED', 'This request expired. Please ask again.');
    }

    const order = state.orders[proposal.order_id];
    if (order && order.version !== proposal.expected_order_version) {
      setProposalStatus(proposalId, 'failed');
      return fail(409, 'ORDER_CHANGED', 'This order changed. Refresh it and ask again.');
    }

    setProposalStatus(proposalId, 'executing');
    await delay(MOCK_LATENCY_MS);

    if (proposal.scenario === 'unknown') {
      // Dispatched, outcome not confirmed. No retry button, no invented lookup.
      setProposalStatus(proposalId, 'outcome_unknown');
      const action = recordAction({
        conversationId: proposal.conversation_id,
        type: 'address_change',
        outcome: 'outcome_unknown',
        reasonCode: 'ACTION_OUTCOME_UNKNOWN',
        summary: `Update status for ${proposal.order_id} is not confirmed`,
      });
      const result: ProposalResult = {
        proposal_id: proposalId,
        status: 'outcome_unknown',
        order: null,
        action_id: action.id,
      };
      state.idempotency.set(key, { proposalId, response: result });
      return ok(result);
    }

    if (proposal.scenario === 'failed') {
      setProposalStatus(proposalId, 'failed');
      const action = recordAction({
        conversationId: proposal.conversation_id,
        type: 'address_change',
        outcome: 'failed',
        reasonCode: 'TERMINAL3_UNAVAILABLE',
        summary: `Could not update ${proposal.order_id}`,
      });
      const result: ProposalResult = {
        proposal_id: proposalId,
        status: 'failed',
        order: null,
        action_id: action.id,
      };
      state.idempotency.set(key, { proposalId, response: result });
      return ok(result);
    }

    const updated = applyAddressChange(proposal);
    setProposalStatus(proposalId, 'succeeded');
    const action = recordAction({
      conversationId: proposal.conversation_id,
      type: 'address_change',
      outcome: 'allowed',
      reasonCode: 'ADDRESS_UPDATED',
      summary: `Updated ${updated.id} to ${updated.address_label}`,
    });
    const result: ProposalResult = {
      proposal_id: proposalId,
      status: 'succeeded',
      order: updated,
      action_id: action.id,
    };
    state.idempotency.set(key, { proposalId, response: result });
    return ok(result);
  }),

  http.post(path('/api/v1/proposals/:id/cancel'), async ({ params }) => {
    const denied = requireSession();
    if (denied) return denied;
    const proposal = state.proposals[String(params.id)];
    if (!proposal) return fail(404, 'RESOURCE_UNAVAILABLE', 'Resource not available');
    if (proposal.status === 'cancelled') {
      return ok({ proposal_id: proposal.id, status: 'cancelled' as const });
    }
    if (proposal.status !== 'pending') {
      return fail(409, 'PROPOSAL_STATE_CONFLICT', `Proposal is ${proposal.status}`);
    }
    await delay(MOCK_LATENCY_MS);
    setProposalStatus(proposal.id, 'cancelled');
    return ok({ proposal_id: proposal.id, status: 'cancelled' as const });
  }),

  http.get(path(apiPaths.actions()), async ({ request }) => {
    const denied = requireSession();
    if (denied) return denied;
    const conversationId = new URL(request.url).searchParams.get('conversation_id');
    if (!conversationId || !state.conversations.has(conversationId)) {
      return fail(404, 'RESOURCE_UNAVAILABLE', 'Resource not available');
    }
    return ok({
      items: state.actions.filter((action) => action.conversation_id === conversationId).slice(0, 100),
    });
  }),

  http.get(path('/api/v1/actions/:id'), async ({ params }) => {
    const denied = requireSession();
    if (denied) return denied;
    const action = state.actions.find((entry) => entry.id === String(params.id));
    return action ? ok(action) : fail(404, 'RESOURCE_UNAVAILABLE', 'Resource not available');
  }),
];

/**
 * The mock assistant. Intent matching is deliberately simple and deterministic;
 * the point is to exercise the card union and the policy outcomes, not to
 * imitate a model. Every denial below is what the real backend would decide.
 */
function buildTurn(conversationId: string, content: string, scenario: string): ChatTurn {
  const cards: ChatTurnCard[] = [];
  const actionIds: string[] = [];
  const orderId = content.match(/\bORD-\d{3,}\b/i)?.[0]?.toUpperCase();
  const lower = content.toLowerCase();
  const wantsChange = /(change|update|move|switch|send|redirect)/i.test(content) && /(address|office|home)/i.test(content);
  let text: string;

  if (wantsChange && orderId) {
    const order = findOwnedOrder(orderId);
    if (!order) {
      const action = recordAction({
        conversationId,
        type: 'order_lookup',
        outcome: 'denied',
        reasonCode: 'ORDER_UNAVAILABLE',
        summary: `Denied lookup of ${orderId}`,
      });
      actionIds.push(action.id);
      cards.push({
        type: 'action_result',
        outcome: 'denied',
        reason_code: 'ORDER_UNAVAILABLE',
        title: 'Order not available',
        description: "This order isn't available in your account.",
        action_id: action.id,
      });
      text = "I couldn't find that order in your account.";
    } else if (order.status !== 'processing') {
      const action = recordAction({
        conversationId,
        type: 'policy_denied',
        outcome: 'denied',
        reasonCode: 'ORDER_NOT_EDITABLE',
        summary: `Denied address change on ${order.id}`,
      });
      actionIds.push(action.id);
      cards.push({
        type: 'action_result',
        outcome: 'denied',
        reason_code: 'ORDER_NOT_EDITABLE',
        title: 'Shipped orders cannot be updated',
        description: `${order.id} has already shipped, so its delivery address can no longer be changed.`,
        action_id: action.id,
      });
      text = `${order.id} has already shipped.`;
    } else {
      const target =
        ownedAddresses().find((address) => lower.includes(address.label.toLowerCase())) ??
        ownedAddresses().find((address) => address.id !== order.address_ref);
      const address = target ?? ownedAddresses()[0]!;
      const proposal = createProposal({ conversationId, order, address, scenario: scenario as never });
      const action = recordAction({
        conversationId,
        type: 'address_change_proposal',
        outcome: 'allowed',
        reasonCode: 'PROPOSAL_CREATED',
        summary: `Proposed moving ${order.id} to ${address.label}`,
      });
      actionIds.push(action.id);
      cards.push(proposalCard(proposal, order.address_label, address.label));
      text = `I can move ${order.id} to your ${address.label} address. Confirm to apply it.`;
    }
  } else if (orderId) {
    const order = findOwnedOrder(orderId);
    if (!order) {
      const action = recordAction({
        conversationId,
        type: 'order_lookup',
        outcome: 'denied',
        reasonCode: 'ORDER_UNAVAILABLE',
        summary: `Denied lookup of ${orderId}`,
      });
      actionIds.push(action.id);
      cards.push({
        type: 'action_result',
        outcome: 'denied',
        reason_code: 'ORDER_UNAVAILABLE',
        title: 'Order not available',
        description: "This order isn't available in your account.",
        action_id: action.id,
      });
      text = "I couldn't find that order in your account.";
    } else {
      const action = recordAction({
        conversationId,
        type: 'order_lookup',
        outcome: 'allowed',
        reasonCode: 'ORDER_FOUND',
        summary: `Looked up ${order.id}`,
      });
      actionIds.push(action.id);
      cards.push({ type: 'order_summary', order });
      text = `Here are the details for ${order.id}.`;
    }
  } else if (/what can you (help|do)/i.test(content)) {
    text =
      'I can look up your orders and move an order that has not shipped yet to one of your saved addresses. Everything here is synthetic demo data.';
  } else {
    text = 'I can look up an order or move it to a saved address. Which order number?';
  }

  return {
    conversation_id: conversationId,
    message: { id: nextId('msg'), role: 'assistant', content: text },
    cards,
    action_ids: actionIds,
  };
}
