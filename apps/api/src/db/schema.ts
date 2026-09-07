import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * Drizzle ORM schema for ParcelGuard AI (Task 4).
 *
 * Table shapes follow PLAN.md §6.2/§6.3/§7.4/§7.5. IDs are the human-readable
 * business identifiers used across the API contract (e.g. "ORD-1001",
 * "cus_demo_alex") rather than generated UUIDs, so the seed fixtures and the
 * API responses share the same primary keys.
 *
 * Money is stored as integer minor units (PLAN.md §6.2). Timestamps are
 * `timestamptz`, always written/read as UTC.
 */

// ---------------------------------------------------------------------------
// Enums (PLAN.md §6.2)
// ---------------------------------------------------------------------------

export const orderStatusEnum = pgEnum('order_status', [
  'processing',
  'shipped',
  'delivered',
]);

export const proposalStatusEnum = pgEnum('proposal_status', [
  'pending',
  'executing',
  'succeeded',
  'cancelled',
  'expired',
  'denied',
  'failed',
  'outcome_unknown',
]);

export const actionOutcomeEnum = pgEnum('action_outcome', [
  'allowed',
  'denied',
  'failed',
  'outcome_unknown',
]);

export const actionTypeEnum = pgEnum('action_type', [
  'order_lookup',
  'address_change_proposal',
  'address_change',
  'agent_refusal',
  'policy_denied',
]);

export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant']);

// ---------------------------------------------------------------------------
// Customers / addresses
// ---------------------------------------------------------------------------

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const addresses = pgTable('addresses', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  city: text('city').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  status: orderStatusEnum('status').notNull(),
  currency: text('currency').notNull().default('MYR'),
  totalMinor: integer('total_minor').notNull(),
  addressRef: text('address_ref')
    .notNull()
    .references(() => addresses.id),
  // Optimistic concurrency token (PLAN.md §7.4 ORDER_CHANGED). Incremented on
  // every state-changing update (e.g. a successful address change).
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceMinor: integer('unit_price_minor').notNull(),
});

export const orderTimeline = pgTable('order_timeline', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  label: text('label').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
});

// ---------------------------------------------------------------------------
// Sessions (PLAN.md §6.3)
// ---------------------------------------------------------------------------

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
});

// ---------------------------------------------------------------------------
// Conversations / messages
// ---------------------------------------------------------------------------

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  // §7: at most one in-flight message request per conversation.
  requestInProgress: boolean('request_in_progress').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    // Client-supplied idempotency token for POST /conversations/:id/messages
    // (PLAN.md §8.3). Unique per conversation; nullable because assistant
    // messages are not client-submitted.
    clientMessageId: text('client_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('messages_conversation_client_message_id_key').on(
      table.conversationId,
      table.clientMessageId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Proposals (PLAN.md §7.4)
// ---------------------------------------------------------------------------

export const proposals = pgTable('proposals', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  targetAddressRef: text('target_address_ref')
    .notNull()
    .references(() => addresses.id),
  // Order.version expected at confirm time; mismatch => 409 ORDER_CHANGED.
  expectedOrderVersion: integer('expected_order_version').notNull(),
  status: proposalStatusEnum('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Actions (PLAN.md §7.5 — redacted audit trail)
// ---------------------------------------------------------------------------

export const actions = pgTable('actions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  type: actionTypeEnum('type').notNull(),
  outcome: actionOutcomeEnum('outcome').notNull(),
  reasonCode: text('reason_code'),
  summary: text('summary').notNull(),
  // { source: "local" | "terminal3" | "mock", agent_did, provider_reference, verified }
  evidence: jsonb('evidence').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Idempotency keys (PLAN.md §7.4, TASKS.md §1.2 rule 3 — DB-backed, no
// process-level locks)
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    proposalId: text('proposal_id').references(() => proposals.id),
    // Stored ProposalResult JSON, written once the confirm request settles.
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('idempotency_keys_session_id_key_key').on(table.sessionId, table.key),
  ],
);
