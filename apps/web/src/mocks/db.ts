import {
  CUSTOMER_ALEX_ID,
  addressFixtures,
  orderFixtures,
  orderOwnership,
  type Action,
  type ActionOutcome,
  type ActionType,
  type AddressSummary,
  type ChatTurnCard,
  type Order,
  type Proposal,
  type ProposalStatus,
} from '@parcelguard/contracts';

/**
 * In-memory demo state for MSW (Design.md §11).
 *
 * It mirrors the *semantics* of the real backend — ownership, proposal state
 * machine, idempotency, version bumps — so the UI exercises the same paths it
 * will hit live. It is not a security boundary: a browser mock cannot enforce
 * an HttpOnly session, and nothing here should ever be cited as proof that
 * the backend denies anything.
 */

export const MOCK_LATENCY_MS = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 450);

/** Deterministic scenarios, triggered by phrases in the message (Design.md §11). */
export type Scenario = 'normal' | 'timeout' | 'rate_limited' | 'unavailable' | 'unknown' | 'failed' | 'expired';

export function detectScenario(message: string): Scenario {
  const text = message.toLowerCase();
  if (text.includes('simulate timeout')) return 'timeout';
  if (text.includes('simulate rate limit')) return 'rate_limited';
  if (text.includes('simulate outage')) return 'unavailable';
  if (text.includes('simulate unknown')) return 'unknown';
  if (text.includes('simulate failure')) return 'failed';
  if (text.includes('simulate expiry')) return 'expired';
  return 'normal';
}

interface MockProposal extends Proposal {
  scenario: Scenario;
}

interface State {
  sessionActive: boolean;
  orders: Record<string, Order>;
  conversations: Set<string>;
  proposals: Record<string, MockProposal>;
  actions: Action[];
  /** session+key -> stored ProposalResult, mirroring the real idempotency table. */
  idempotency: Map<string, { proposalId: string; response: unknown }>;
  seenClientMessageIds: Map<string, { content: string; turn: unknown }>;
  counter: number;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function initialOrders(): Record<string, Order> {
  const owned: Record<string, Order> = {};
  for (const [id, order] of Object.entries(orderFixtures)) {
    owned[id] = clone(order as Order);
  }
  return owned;
}

export const state: State = {
  sessionActive: false,
  orders: initialOrders(),
  conversations: new Set(),
  proposals: {},
  actions: [],
  idempotency: new Map(),
  seenClientMessageIds: new Map(),
  counter: 0,
};

export function resetState(): void {
  state.sessionActive = false;
  state.orders = initialOrders();
  state.conversations = new Set();
  state.proposals = {};
  state.actions = [];
  state.idempotency = new Map();
  state.seenClientMessageIds = new Map();
  state.counter = 0;
}

export const nextId = (prefix: string) => `${prefix}_${(state.counter += 1)}`;

/** Only Alex's orders exist as far as the UI is concerned (PLAN.md §6.1). */
export const ownedOrders = (): Order[] =>
  Object.values(state.orders).filter((order) => orderOwnership[order.id as keyof typeof orderFixtures] === CUSTOMER_ALEX_ID);

export const ownedAddresses = (): AddressSummary[] => [
  addressFixtures.addr_alex_home,
  addressFixtures.addr_alex_office,
];

export const findOwnedOrder = (orderId: string): Order | null =>
  ownedOrders().find((order) => order.id === orderId.toUpperCase()) ?? null;

export function recordAction(input: {
  conversationId: string;
  type: ActionType;
  outcome: ActionOutcome;
  reasonCode: string;
  summary: string;
}): Action {
  const action: Action = {
    id: nextId('act'),
    conversation_id: input.conversationId,
    type: input.type,
    outcome: input.outcome,
    reason_code: input.reasonCode,
    summary: input.summary,
    created_at: new Date().toISOString(),
    // Mock mode performs no external call, and says so (PLAN.md §7.5).
    evidence: { source: 'mock', agent_did: null, provider_reference: null, verified: false },
  };
  state.actions.unshift(action);
  return action;
}

export function createProposal(input: {
  conversationId: string;
  order: Order;
  address: AddressSummary;
  scenario: Scenario;
}): MockProposal {
  const ttlMs = input.scenario === 'expired' ? -1000 : 5 * 60 * 1000;
  const proposal: MockProposal = {
    id: nextId('prop'),
    conversation_id: input.conversationId,
    order_id: input.order.id,
    target_address_ref: input.address.id,
    expected_order_version: input.order.version,
    status: 'pending',
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
    scenario: input.scenario,
  };
  state.proposals[proposal.id] = proposal;
  return proposal;
}

export function setProposalStatus(proposalId: string, status: ProposalStatus): void {
  const proposal = state.proposals[proposalId];
  if (proposal) proposal.status = status;
}

/** Applies the address change and bumps the version, as the real backend does. */
export function applyAddressChange(proposal: MockProposal): Order {
  const order = state.orders[proposal.order_id];
  if (!order) throw new Error(`Unknown order ${proposal.order_id}`);
  const address = ownedAddresses().find((entry) => entry.id === proposal.target_address_ref);
  order.address_ref = proposal.target_address_ref;
  order.address_label = address?.label ?? proposal.target_address_ref;
  order.version += 1;
  return clone(order);
}

/** The card the chat shows for a freshly created proposal. */
export const proposalCard = (proposal: Proposal, fromLabel: string, toLabel: string): ChatTurnCard => ({
  type: 'address_change_proposal',
  proposal_id: proposal.id,
  order_id: proposal.order_id,
  from_address_label: fromLabel,
  to_address_label: toLabel,
  status: proposal.status,
  expires_at: proposal.expires_at,
});
