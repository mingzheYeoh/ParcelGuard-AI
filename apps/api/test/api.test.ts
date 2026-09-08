import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  CUSTOMER_OTHER_ID,
  errorEnvelopeSchema,
  orderSchema,
  proposalResultSchema,
} from '@parcelguard/contracts';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { closeDb, getDb } from '../src/db/index.js';
import { conversations, orders, proposals } from '../src/db/schema.js';
import { recordAction } from '../src/services/auditService.js';
import { seedFixtures } from '../src/scripts/seed.js';

/**
 * Integration tests for TASKS.md Task 5 "Done when". They run against the real
 * local PostgreSQL from DATABASE_URL (see apps/api/.env.example) because the
 * behaviours under test — conditional updates, unique idempotency keys,
 * ownership joins — are database semantics, and an in-memory fake would prove
 * nothing about them (TASKS.md §1.2 rule 1).
 */

const db = getDb();
let app: FastifyInstance;

beforeEach(async () => {
  await seedFixtures(db);
  app = buildApp({ logger: false, deps: { db } });
  await app.ready();
});

afterAll(async () => {
  await closeDb();
});

/** Starts a demo session and returns its cookie header value. */
async function startSession(): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/demo/session' });
  expect(response.statusCode).toBe(200);
  const cookie = response.cookies.find((entry) => entry.name === 'pg_session');
  expect(cookie, 'demo session must set the pg_session cookie').toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
  return `pg_session=${cookie?.value}`;
}

async function openConversation(cookie: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/conversations',
    headers: { cookie },
    payload: {},
  });
  expect(response.statusCode).toBe(200);
  return response.json().data.id as string;
}

async function say(cookie: string, conversationId: string, content: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/conversations/${conversationId}/messages`,
    headers: { cookie },
    payload: { client_message_id: randomUUID(), content },
  });
}

/** Drives the chat to a pending proposal and returns its id. */
async function proposeOfficeMove(cookie: string, conversationId: string): Promise<string> {
  const response = await say(cookie, conversationId, 'Please change the address of ORD-1002 to Office');
  expect(response.statusCode).toBe(200);
  const card = response.json().data.cards[0];
  expect(card.type).toBe('address_change_proposal');
  return card.proposal_id as string;
}

describe('session boundary', () => {
  it('rejects customer endpoints without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(response.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('SESSION_REQUIRED');
  });

  it('serves health without a session and reports honest modes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ api: 'ok', model: 'mock', terminal3: 'mock' });
  });

  it('accepts a mutation from the deployment own Vercel hostnames', async () => {
    // Every Preview has its own hostname, so a fixed APP_ORIGIN rejected the
    // Preview UI's own requests. The allowed set is derived per deployment.
    vi.stubEnv('VERCEL_URL', 'parcel-guard-abc123.vercel.app');
    vi.stubEnv('VERCEL_BRANCH_URL', 'parcel-guard-git-task-9.vercel.app');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'parcel-guard-ai.vercel.app');
    const cookie = await startSession();

    for (const origin of [
      'https://parcel-guard-abc123.vercel.app',
      'https://parcel-guard-git-task-9.vercel.app',
      'https://parcel-guard-ai.vercel.app',
      'http://localhost:5173',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/conversations',
        headers: { cookie, origin },
        payload: {},
      });
      expect(response.statusCode, `origin ${origin}`).toBe(200);
    }

    // A lookalike on the same suffix is still refused: a wildcard would let
    // any page hosted on vercel.app forge authenticated requests.
    const impostor = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie, origin: 'https://parcel-guard-attacker.vercel.app' },
      payload: {},
    });
    expect(impostor.statusCode).toBe(401);
    vi.unstubAllEnvs();
  });

  it('refuses a mutation from a foreign origin', async () => {
    const cookie = await startSession();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie, origin: 'https://evil.example' },
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('order authorization', () => {
  it('returns only the two owned orders', async () => {
    const cookie = await startSession();
    const response = await app.inject({ method: 'GET', url: '/api/v1/orders', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const ids = response.json().data.items.map((order: { id: string }) => order.id);
    expect(ids).toEqual(['ORD-1001', 'ORD-1002']);
  });

  it('serves an owned order and hides a foreign one behind the same 404', async () => {
    const cookie = await startSession();
    const owned = await app.inject({ method: 'GET', url: '/api/v1/orders/ORD-1001', headers: { cookie } });
    expect(owned.statusCode).toBe(200);
    expect(() => orderSchema.parse(owned.json().data)).not.toThrow();

    const foreign = await app.inject({ method: 'GET', url: '/api/v1/orders/ORD-2001', headers: { cookie } });
    const missing = await app.inject({ method: 'GET', url: '/api/v1/orders/ORD-9999', headers: { cookie } });
    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    // Indistinguishable: existence of ORD-2001 is never disclosed.
    expect(foreign.json().error).toEqual(missing.json().error);
  });

  it('denies a foreign order through the chat tool as well', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const response = await say(cookie, conversationId, 'Show me ORD-2001');
    expect(response.statusCode).toBe(200);
    const card = response.json().data.cards[0];
    expect(card.type).toBe('action_result');
    expect(card.outcome).toBe('denied');
    expect(card.reason_code).toBe('ORDER_UNAVAILABLE');
  });
});

describe('business rules', () => {
  it('denies an address change on a shipped order', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const response = await say(cookie, conversationId, 'Change the address of ORD-1001 to Office');
    expect(response.statusCode).toBe(200);
    const card = response.json().data.cards[0];
    expect(card.type).toBe('action_result');
    expect(card.outcome).toBe('denied');
    expect(card.reason_code).toBe('ORDER_NOT_EDITABLE');
  });

  it('rejects an empty message with 422', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: { client_message_id: randomUUID(), content: '   ' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_INPUT');
  });

  it('replays the stored turn for a repeated client_message_id', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const clientMessageId = randomUUID();
    const payload = { client_message_id: clientMessageId, content: 'Show me ORD-1002' };

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload,
    });
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data).toEqual(first.json().data);

    const conflicting = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: { client_message_id: clientMessageId, content: 'Something else entirely' },
    });
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('proposal confirmation (PLAN.md §7.4)', () => {
  it('confirms once and replays the stored result on retry', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const proposalId = await proposeOfficeMove(cookie, conversationId);
    const key = randomUUID();

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie, 'idempotency-key': key },
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const result = proposalResultSchema.parse(first.json().data);
    expect(result.status).toBe('succeeded');
    expect(result.order?.address_label).toBe('Office');
    expect(result.order?.version).toBe(2);

    const retry = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie, 'idempotency-key': key },
      payload: {},
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toEqual(first.json().data);

    // Never executed twice: the order is still at version 2.
    const order = await app.inject({ method: 'GET', url: '/api/v1/orders/ORD-1002', headers: { cookie } });
    expect(order.json().data.version).toBe(2);
  });

  it('requires an Idempotency-Key', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const proposalId = await proposeOfficeMove(cookie, conversationId);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie },
      payload: {},
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_INPUT');
  });

  it('rejects reusing a key for a different proposal with 409', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const first = await proposeOfficeMove(cookie, conversationId);
    const key = randomUUID();
    await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${first}/confirm`,
      headers: { cookie, 'idempotency-key': key },
      payload: {},
    });

    // A second, different proposal (move back Home) reusing the same key.
    const second = await say(cookie, conversationId, 'Change the address of ORD-1002 to Home');
    const secondId = second.json().data.cards[0].proposal_id as string;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${secondId}/confirm`,
      headers: { cookie, 'idempotency-key': key },
      payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns 410 for an expired proposal', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const proposalId = await proposeOfficeMove(cookie, conversationId);

    await db
      .update(proposals)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(proposals.id, proposalId));

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: {},
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe('PROPOSAL_EXPIRED');
  });

  it('returns 409 ORDER_CHANGED when the order moved under the proposal', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const proposalId = await proposeOfficeMove(cookie, conversationId);

    // Simulate a concurrent change: the version the proposal expects is stale.
    await db.update(orders).set({ version: 5 }).where(eq(orders.id, 'ORD-1002'));

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ORDER_CHANGED');
  });

  it('cancels a pending proposal and reports conflict after it succeeded', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    const proposalId = await proposeOfficeMove(cookie, conversationId);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/cancel`,
      headers: { cookie },
      payload: {},
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data).toEqual({ proposal_id: proposalId, status: 'cancelled' });

    // Repeated cancellation stays 200 (PLAN.md §7.4).
    const again = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/cancel`,
      headers: { cookie },
      payload: {},
    });
    expect(again.statusCode).toBe(200);

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/v1/proposals/${proposalId}/confirm`,
      headers: { cookie, 'idempotency-key': randomUUID() },
      payload: {},
    });
    expect(confirm.statusCode).toBe(409);
    expect(confirm.json().error.code).toBe('PROPOSAL_STATE_CONFLICT');
  });
});

describe('activity', () => {
  it('lists actions for an owned conversation and 404s a foreign one', async () => {
    const cookie = await startSession();
    const conversationId = await openConversation(cookie);
    await say(cookie, conversationId, 'Show me ORD-1001');

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/actions?conversation_id=${conversationId}`,
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.items.length).toBeGreaterThan(0);
    expect(listed.json().data.items[0].evidence).toEqual({
      source: 'local',
      agent_did: null,
      provider_reference: null,
      verified: false,
    });

    const unknownConversation = await app.inject({
      method: 'GET',
      url: `/api/v1/actions?conversation_id=conv_${randomUUID()}`,
      headers: { cookie },
    });
    expect(unknownConversation.statusCode).toBe(404);
    expect(unknownConversation.json().error.code).toBe('RESOURCE_UNAVAILABLE');
  });

  it('404s an action belonging to another customer', async () => {
    // Every demo session binds to the same customer, so the real boundary can
    // only be exercised against a conversation owned by cus_demo_other.
    const foreignConversationId = `conv_${randomUUID()}`;
    await db
      .insert(conversations)
      .values({ id: foreignConversationId, customerId: CUSTOMER_OTHER_ID });
    const foreignAction = await recordAction(db, {
      conversationId: foreignConversationId,
      type: 'order_lookup',
      outcome: 'allowed',
      reasonCode: 'ORDER_FOUND',
      summary: 'Looked up ORD-2001',
      evidence: { source: 'local', agent_did: null, provider_reference: null, verified: false },
    });

    const cookie = await startSession();
    const byId = await app.inject({
      method: 'GET',
      url: `/api/v1/actions/${foreignAction.id}`,
      headers: { cookie },
    });
    const byConversation = await app.inject({
      method: 'GET',
      url: `/api/v1/actions?conversation_id=${foreignConversationId}`,
      headers: { cookie },
    });
    expect(byId.statusCode).toBe(404);
    expect(byConversation.statusCode).toBe(404);
  });
});
