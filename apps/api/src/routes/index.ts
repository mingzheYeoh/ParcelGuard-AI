import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  API_BASE_PATH,
  type BootstrapResponse,
  type HealthResponse,
  type IntegrationStatus,
  messageCreateRequestSchema,
} from '@parcelguard/contracts';
import { SESSION_COOKIE, config } from '../config.js';
import { apiError, notFound } from '../http/errors.js';
import type { ModelAdapter, Terminal3Adapter } from '../adapters/index.js';
import type { Database } from '../db/index.js';
import { listOrders } from '../repositories/orderRepository.js';
import { listAddresses } from '../repositories/addressRepository.js';
import { createDemoSession, loadSession, type SessionContext } from '../services/sessionService.js';
import { requireOwnedOrder } from '../services/policyService.js';
import { createConversation, postMessage } from '../services/conversationService.js';
import { cancelProposal, confirmProposal } from '../services/proposalService.js';
import { getAction, listActions } from '../services/auditService.js';

export interface RouteDeps {
  readonly getDb: () => Database;
  readonly model: ModelAdapter;
  readonly terminal3: Terminal3Adapter;
}

/** PLAN.md §7: every success response is {data, request_id}. */
const ok = <T>(request: FastifyRequest, data: T) => ({ data, request_id: request.id });

const integrationStatus = (deps: RouteDeps): IntegrationStatus => ({
  model: {
    mode: deps.model.mode(),
    provider: deps.model.provider(),
    deployment: deps.model.deployment(),
  },
  terminal3: {
    mode: deps.terminal3.mode(),
    agent_did: deps.terminal3.agentDid(),
    identity_verified: deps.terminal3.identityVerified(),
  },
});

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  /**
   * Reads the signed session cookie. An unsigned or unknown cookie is treated
   * as no session at all — a client can never assert its own customer id
   * (PLAN.md §6.3).
   */
  async function requireSession(request: FastifyRequest): Promise<SessionContext> {
    const raw = request.cookies[SESSION_COOKIE];
    if (!raw) throw apiError('SESSION_REQUIRED', 'Start a demo session first');
    const unsigned = request.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) {
      throw apiError('SESSION_REQUIRED', 'Start a demo session first');
    }
    return loadSession(deps.getDb(), unsigned.value);
  }

  // -------------------------------------------------------------------------
  // Health — public, no session, no secrets (PLAN.md §7.1)
  // -------------------------------------------------------------------------
  app.get(`${API_BASE_PATH}/health`, async (request) => {
    const data: HealthResponse = {
      api: 'ok',
      model: deps.model.mode(),
      terminal3: deps.terminal3.mode(),
    };
    return ok(request, data);
  });

  // -------------------------------------------------------------------------
  // Demo session (PLAN.md §6.3)
  // -------------------------------------------------------------------------
  app.post(`${API_BASE_PATH}/demo/session`, async (request, reply) => {
    if (!config.demoMode()) {
      throw apiError('DEMO_MODE_DISABLED', 'Demo sessions are disabled');
    }
    const session = await createDemoSession(deps.getDb());
    reply.setCookie(SESSION_COOKIE, session.sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies(),
      signed: true,
    });
    return ok(request, { customer: { display_name: session.displayName }, demo: true as const });
  });

  // -------------------------------------------------------------------------
  // Bootstrap / orders
  // -------------------------------------------------------------------------
  app.get(`${API_BASE_PATH}/bootstrap`, async (request) => {
    const session = await requireSession(request);
    const data: BootstrapResponse = {
      customer: { display_name: session.displayName },
      addresses: await listAddresses(deps.getDb(), session.customerId),
      integration: integrationStatus(deps),
    };
    return ok(request, data);
  });

  app.get(`${API_BASE_PATH}/orders`, async (request) => {
    const session = await requireSession(request);
    return ok(request, { items: await listOrders(deps.getDb(), session.customerId) });
  });

  app.get<{ Params: { id: string } }>(`${API_BASE_PATH}/orders/:id`, async (request) => {
    const session = await requireSession(request);
    // Same policy path as the model's tool: a foreign order is a 404 here too.
    const order = await requireOwnedOrder(deps.getDb(), request.params.id, session.customerId);
    return ok(request, order);
  });

  // -------------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------------
  app.post(`${API_BASE_PATH}/conversations`, async (request) => {
    const session = await requireSession(request);
    return ok(request, await createConversation(deps.getDb(), session));
  });

  app.post<{ Params: { id: string } }>(
    `${API_BASE_PATH}/conversations/:id/messages`,
    async (request) => {
      const session = await requireSession(request);
      const parsed = messageCreateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw apiError('INVALID_INPUT', 'content must be 1-2000 characters after trimming');
      }
      const turn = await postMessage(deps.getDb(), {
        conversationId: request.params.id,
        session,
        clientMessageId: parsed.data.client_message_id,
        content: parsed.data.content,
        model: deps.model,
      });
      return ok(request, turn);
    },
  );

  // -------------------------------------------------------------------------
  // Proposals (PLAN.md §7.4)
  // -------------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    `${API_BASE_PATH}/proposals/:id/confirm`,
    async (request) => {
      const session = await requireSession(request);
      const result = await confirmProposal(deps.getDb(), {
        proposalId: request.params.id,
        session,
        idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        terminal3: deps.terminal3,
      });
      return ok(request, result);
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API_BASE_PATH}/proposals/:id/cancel`,
    async (request) => {
      const session = await requireSession(request);
      return ok(request, await cancelProposal(deps.getDb(), request.params.id, session));
    },
  );

  // -------------------------------------------------------------------------
  // Activity (session-scoped)
  // -------------------------------------------------------------------------
  app.get<{ Querystring: { conversation_id?: string } }>(
    `${API_BASE_PATH}/actions`,
    async (request) => {
      const session = await requireSession(request);
      const conversationId = request.query.conversation_id;
      if (!conversationId) throw notFound('resource');
      return ok(request, {
        items: await listActions(deps.getDb(), conversationId, session.customerId),
      });
    },
  );

  app.get<{ Params: { id: string } }>(`${API_BASE_PATH}/actions/:id`, async (request) => {
    const session = await requireSession(request);
    return ok(request, await getAction(deps.getDb(), request.params.id, session.customerId));
  });
}

/**
 * Origin check on mutations (PLAN.md §6.3). A cross-site POST that rides the
 * cookie is refused before it reaches a handler. The contract has no dedicated
 * CSRF code, so this reports SESSION_REQUIRED: from the caller's perspective
 * the session was not honoured, which is exactly what happened.
 */
export function assertOrigin(request: FastifyRequest, _reply: FastifyReply): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.origin;
  if (origin && origin !== config.appOrigin()) {
    throw apiError('SESSION_REQUIRED', 'Request origin is not allowed');
  }
}
