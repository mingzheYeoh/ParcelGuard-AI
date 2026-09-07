/**
 * @parcelguard/contracts — shared Zod schemas, TypeScript types, fixtures, and
 * path constants for `apps/web` and `apps/api`.
 *
 * Source of truth: PLAN.md §6 (data/sessions) and §7 (API contract v1).
 * Frozen after Task 2 per TASKS.md §2.3 — changes go through
 * docs/handoffs/*.md "Contract change requests" + a PLAN.md §7 update in the
 * same commit (TASKS.md §4.3).
 */
import { z } from 'zod';

export const API_BASE_PATH = '/api/v1';

// ---------------------------------------------------------------------------
// Enums — PLAN.md §6.2 / §7.6
// ---------------------------------------------------------------------------

/** IntegrationMode — PLAN.md §7.1. */
export const integrationModeSchema = z.enum(['mock', 'live', 'unavailable']);
export type IntegrationMode = z.infer<typeof integrationModeSchema>;

/** Order status — PLAN.md §6.2. */
export const orderStatusSchema = z.enum(['processing', 'shipped', 'delivered']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Proposal status — PLAN.md §6.2. */
export const proposalStatusSchema = z.enum([
  'pending',
  'executing',
  'succeeded',
  'cancelled',
  'expired',
  'denied',
  'failed',
  'outcome_unknown',
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

/** Action outcome — PLAN.md §6.2. */
export const actionOutcomeSchema = z.enum(['allowed', 'denied', 'failed', 'outcome_unknown']);
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>;

/** Action type — PLAN.md §6.2. */
export const actionTypeSchema = z.enum([
  'order_lookup',
  'address_change_proposal',
  'address_change',
  'agent_refusal',
  'policy_denied',
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

/** Chat message role — PLAN.md §7.3 example (`message.role`). */
export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/** Evidence source — PLAN.md §7.5 (`source = local | terminal3 | mock`). */
export const evidenceSourceSchema = z.enum(['local', 'terminal3', 'mock']);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

/**
 * Error codes — PLAN.md §7.6, plus `DEMO_MODE_DISABLED` for the
 * "404 outside demo mode" response on `POST /demo/session` (§7.1 table names
 * the status code but not a code string; this name follows the same
 * SCREAMING_SNAKE_CASE convention as every other code in §7.6).
 *
 * `INTERNAL_ERROR` (500) covers an unexpected server fault. Without it a
 * handler that throws something unforeseen has no truthful code to put in the
 * envelope and has to borrow one that means something else.
 */
export const errorCodeSchema = z.enum([
  'DEMO_MODE_DISABLED',
  'SESSION_REQUIRED',
  'ORDER_UNAVAILABLE',
  'RESOURCE_UNAVAILABLE',
  'ORDER_CHANGED',
  'REQUEST_IN_PROGRESS',
  'IDEMPOTENCY_CONFLICT',
  'PROPOSAL_STATE_CONFLICT',
  'CONVERSATION_LIMIT_REACHED',
  'PROPOSAL_EXPIRED',
  'INVALID_INPUT',
  'ORDER_NOT_EDITABLE',
  'MODEL_RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'TERMINAL3_UNAVAILABLE',
  'MODEL_TIMEOUT',
  'ACTION_OUTCOME_UNKNOWN',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

// ---------------------------------------------------------------------------
// Envelopes — PLAN.md §7
// ---------------------------------------------------------------------------

/** Success envelope — PLAN.md §7 (`{"data": ..., "request_id":"req_..."}`). */
export const successEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, request_id: z.string() });

/** Error envelope — PLAN.md §7. `error.code` is one of {@link errorCodeSchema}. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
  }),
  request_id: z.string(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Core objects — PLAN.md §6.2
// ---------------------------------------------------------------------------

/** Item — PLAN.md §6.2. Money stored as integer minor units. */
export const itemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unit_price_minor: z.number().int().nonnegative(),
});
export type Item = z.infer<typeof itemSchema>;

/** TimelineEvent — PLAN.md §6.2. `occurred_at` is UTC ISO 8601. */
export const timelineEventSchema = z.object({
  status: z.string(),
  label: z.string(),
  occurred_at: z.iso.datetime(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/** AddressSummary — PLAN.md §6.2. Labels/city only; never a street address. */
export const addressSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  city: z.string(),
});
export type AddressSummary = z.infer<typeof addressSummarySchema>;

/**
 * Order — PLAN.md §6.2. `currency` is fixed to "MYR" for this project.
 */
export const orderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  currency: z.literal('MYR'),
  total_minor: z.number().int().nonnegative(),
  items: z.array(itemSchema),
  address_ref: z.string(),
  address_label: z.string(),
  version: z.number().int().nonnegative(),
  timeline: z.array(timelineEventSchema),
});
export type Order = z.infer<typeof orderSchema>;

/**
 * Conversation — PLAN.md §6.2. `customer_id` is server-only (never sent to
 * the browser); {@link conversationCreateResponseSchema} is the client-facing
 * shape returned by `POST /conversations`.
 */
export const conversationSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  created_at: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** Proposal — PLAN.md §6.2. */
export const proposalSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  order_id: z.string(),
  target_address_ref: z.string(),
  expected_order_version: z.number().int().nonnegative(),
  status: proposalStatusSchema,
  expires_at: z.iso.datetime(),
});
export type Proposal = z.infer<typeof proposalSchema>;

/** Evidence — PLAN.md §7.5. A provider reference alone does not prove verification. */
export const evidenceSchema = z.object({
  source: evidenceSourceSchema,
  agent_did: z.string().nullable(),
  provider_reference: z.string().nullable(),
  verified: z.boolean(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** Action — PLAN.md §6.2 / §7.5. */
export const actionSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  type: actionTypeSchema,
  outcome: actionOutcomeSchema,
  reason_code: z.string(),
  summary: z.string(),
  created_at: z.iso.datetime(),
  evidence: evidenceSchema,
});
export type Action = z.infer<typeof actionSchema>;

// ---------------------------------------------------------------------------
// IntegrationStatus — PLAN.md §7.2
// ---------------------------------------------------------------------------

export const modelIntegrationStatusSchema = z.object({
  mode: integrationModeSchema,
  provider: z.string().nullable(),
  deployment: z.string().nullable(),
});
export type ModelIntegrationStatus = z.infer<typeof modelIntegrationStatusSchema>;

export const terminal3IntegrationStatusSchema = z.object({
  mode: integrationModeSchema,
  agent_did: z.string().nullable(),
  identity_verified: z.boolean(),
});
export type Terminal3IntegrationStatus = z.infer<typeof terminal3IntegrationStatusSchema>;

export const integrationStatusSchema = z.object({
  model: modelIntegrationStatusSchema,
  terminal3: terminal3IntegrationStatusSchema,
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

// ---------------------------------------------------------------------------
// ChatTurn — PLAN.md §7.3 (tagged-union cards[])
// ---------------------------------------------------------------------------

export const orderSummaryCardSchema = z.object({
  type: z.literal('order_summary'),
  order: orderSchema,
});
export type OrderSummaryCard = z.infer<typeof orderSummaryCardSchema>;

export const addressChangeProposalCardSchema = z.object({
  type: z.literal('address_change_proposal'),
  proposal_id: z.string(),
  order_id: z.string(),
  from_address_label: z.string(),
  to_address_label: z.string(),
  status: proposalStatusSchema,
  expires_at: z.iso.datetime(),
});
export type AddressChangeProposalCard = z.infer<typeof addressChangeProposalCardSchema>;

export const actionResultCardSchema = z.object({
  type: z.literal('action_result'),
  outcome: actionOutcomeSchema,
  reason_code: z.string(),
  title: z.string(),
  description: z.string(),
  action_id: z.string().nullable(),
});
export type ActionResultCard = z.infer<typeof actionResultCardSchema>;

/** Tagged union of every ChatTurn card variant — PLAN.md §7.3. */
export const chatTurnCardSchema = z.discriminatedUnion('type', [
  orderSummaryCardSchema,
  addressChangeProposalCardSchema,
  actionResultCardSchema,
]);
export type ChatTurnCard = z.infer<typeof chatTurnCardSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** ChatTurn — PLAN.md §7.3. Success data of `POST /conversations/:id/messages`. */
export const chatTurnSchema = z.object({
  conversation_id: z.string(),
  message: chatMessageSchema,
  cards: z.array(chatTurnCardSchema),
  action_ids: z.array(z.string()),
});
export type ChatTurn = z.infer<typeof chatTurnSchema>;

// ---------------------------------------------------------------------------
// ProposalResult — PLAN.md §7.4
// ---------------------------------------------------------------------------

export const proposalResultSchema = z.object({
  proposal_id: z.string(),
  status: proposalStatusSchema,
  order: orderSchema.nullable(),
  action_id: z.string(),
});
export type ProposalResult = z.infer<typeof proposalResultSchema>;

// ---------------------------------------------------------------------------
// Endpoint request/response schemas — PLAN.md §7.1
// ---------------------------------------------------------------------------

/** GET /api/v1/health success payload. */
export const healthResponseSchema = z.object({
  api: z.literal('ok'),
  model: integrationModeSchema,
  terminal3: integrationModeSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** POST /api/v1/demo/session — request body is `{}`. */
export const demoSessionRequestSchema = z.object({});
export type DemoSessionRequest = z.infer<typeof demoSessionRequestSchema>;

export const demoSessionResponseSchema = z.object({
  customer: z.object({ display_name: z.string() }),
  demo: z.literal(true),
});
export type DemoSessionResponse = z.infer<typeof demoSessionResponseSchema>;

/** GET /api/v1/bootstrap success payload. */
export const bootstrapResponseSchema = z.object({
  customer: z.object({ display_name: z.string() }),
  addresses: z.array(addressSummarySchema),
  integration: integrationStatusSchema,
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;

/** GET /api/v1/orders success payload. */
export const ordersListResponseSchema = z.object({
  items: z.array(orderSchema),
});
export type OrdersListResponse = z.infer<typeof ordersListResponseSchema>;

/** GET /api/v1/orders/:id success payload is a bare Order. */
export const orderResponseSchema = orderSchema;

/** POST /api/v1/conversations — request body is `{}`. */
export const conversationCreateRequestSchema = z.object({});
export type ConversationCreateRequest = z.infer<typeof conversationCreateRequestSchema>;

export const conversationCreateResponseSchema = z.object({
  id: z.string(),
  created_at: z.iso.datetime(),
});
export type ConversationCreateResponse = z.infer<typeof conversationCreateResponseSchema>;

/**
 * POST /api/v1/conversations/:id/messages — request body.
 * `content` must be 1–2000 Unicode code points after trimming (PLAN.md §7.1);
 * enforced server-side (Task 5) since `.trim()` semantics belong to the
 * runtime that receives the raw string, not to this shared schema alone —
 * kept here too so both lanes validate identically before calling the API.
 */
export const messageCreateRequestSchema = z.object({
  client_message_id: z.string(),
  content: z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= 2000, {
      message: 'content must be at most 2000 Unicode code points',
    }),
});
export type MessageCreateRequest = z.infer<typeof messageCreateRequestSchema>;

/** POST /api/v1/proposals/:id/confirm — request body is `{}`; Idempotency-Key is a header. */
export const proposalConfirmRequestSchema = z.object({});
export type ProposalConfirmRequest = z.infer<typeof proposalConfirmRequestSchema>;

/** POST /api/v1/proposals/:id/cancel — request body is `{}`. */
export const proposalCancelRequestSchema = z.object({});
export type ProposalCancelRequest = z.infer<typeof proposalCancelRequestSchema>;

export const proposalCancelResponseSchema = z.object({
  proposal_id: z.string(),
  status: z.literal('cancelled'),
});
export type ProposalCancelResponse = z.infer<typeof proposalCancelResponseSchema>;

/** GET /api/v1/actions success payload (requires `conversation_id` query param). */
export const actionsListResponseSchema = z.object({
  items: z.array(actionSchema),
});
export type ActionsListResponse = z.infer<typeof actionsListResponseSchema>;

/** GET /api/v1/actions/:id success payload is a bare Action. */
export const actionResponseSchema = actionSchema;

// ---------------------------------------------------------------------------
// apiPaths — shared path strings for web and api (PLAN.md §7.1)
// ---------------------------------------------------------------------------

export const apiPaths = {
  demoSession: () => `${API_BASE_PATH}/demo/session`,
  health: () => `${API_BASE_PATH}/health`,
  bootstrap: () => `${API_BASE_PATH}/bootstrap`,
  orders: () => `${API_BASE_PATH}/orders`,
  order: (id: string) => `${API_BASE_PATH}/orders/${id}`,
  conversations: () => `${API_BASE_PATH}/conversations`,
  conversationMessages: (id: string) => `${API_BASE_PATH}/conversations/${id}/messages`,
  proposalConfirm: (id: string) => `${API_BASE_PATH}/proposals/${id}/confirm`,
  proposalCancel: (id: string) => `${API_BASE_PATH}/proposals/${id}/cancel`,
  actions: () => `${API_BASE_PATH}/actions`,
  action: (id: string) => `${API_BASE_PATH}/actions/${id}`,
} as const satisfies Record<string, (...args: never[]) => string>;
export type ApiPaths = typeof apiPaths;

// ---------------------------------------------------------------------------
// Fixtures — PLAN.md §6.1 (packages/contracts/src/fixtures.ts)
// ---------------------------------------------------------------------------

export * from './fixtures.js';
