import { z } from 'zod';
import {
  actionResponseSchema,
  actionsListResponseSchema,
  apiPaths,
  bootstrapResponseSchema,
  chatTurnSchema,
  conversationCreateResponseSchema,
  demoSessionResponseSchema,
  errorEnvelopeSchema,
  orderResponseSchema,
  ordersListResponseSchema,
  proposalCancelResponseSchema,
  proposalResultSchema,
  successEnvelopeSchema,
  type ErrorCode,
} from '@parcelguard/contracts';

/**
 * The only way the UI talks to the API (Design.md §11). Components never
 * import fixtures — in mock mode MSW answers these same paths with the same
 * envelopes, so switching VITE_API_MODE changes nothing above this file.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** A transport or protocol failure that has no server-issued error code. */
export type ClientFailureCode = 'NETWORK' | 'MALFORMED_RESPONSE';

export class ApiClientError extends Error {
  readonly code: ErrorCode | ClientFailureCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(input: {
    code: ErrorCode | ClientFailureCode;
    message: string;
    status: number;
    retryable: boolean;
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.requestId = input.requestId ?? null;
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${path.startsWith('/api') ? '' : BASE_URL}${path}`, {
      // The session is an HttpOnly cookie; every call must carry it.
      credentials: 'include',
      ...init,
      // Headers last: spreading `init` after them drops content-type, and
      // Fastify then parses no body at all (422 on a valid message). MSW does
      // not read content-type, so only a live request exposes that.
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch (cause) {
    // A live failure stays a failure — never a silent fall back to mock data
    // (PLAN.md §11 F4).
    throw new ApiClientError({
      code: 'NETWORK',
      message: 'We could not reach the service.',
      status: 0,
      retryable: true,
      requestId: null,
    });
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiClientError({
        code: 'MALFORMED_RESPONSE',
        message: 'The service returned an unexpected response.',
        status: response.status,
        retryable: false,
      });
    }
    throw new ApiClientError({
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      status: response.status,
      retryable: parsed.data.error.retryable,
      requestId: parsed.data.request_id,
    });
  }

  const envelope = successEnvelopeSchema(schema).safeParse(body);
  if (!envelope.success) {
    throw new ApiClientError({
      code: 'MALFORMED_RESPONSE',
      message: 'The service returned data this app does not understand.',
      status: response.status,
      retryable: false,
    });
  }
  return envelope.data.data;
}

const post = (body: unknown = {}, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers,
});

export const api = {
  startSession: () => request(apiPaths.demoSession(), demoSessionResponseSchema, post()),
  bootstrap: () => request(apiPaths.bootstrap(), bootstrapResponseSchema),
  listOrders: () => request(apiPaths.orders(), ordersListResponseSchema),
  getOrder: (id: string) => request(apiPaths.order(id), orderResponseSchema),
  createConversation: () =>
    request(apiPaths.conversations(), conversationCreateResponseSchema, post()),
  sendMessage: (conversationId: string, input: { clientMessageId: string; content: string }) =>
    request(
      apiPaths.conversationMessages(conversationId),
      chatTurnSchema,
      post({ client_message_id: input.clientMessageId, content: input.content }),
    ),
  /** The idempotency key is generated once per confirmation intent and reused on retries. */
  confirmProposal: (proposalId: string, idempotencyKey: string) =>
    request(
      apiPaths.proposalConfirm(proposalId),
      proposalResultSchema,
      post({}, { 'idempotency-key': idempotencyKey }),
    ),
  cancelProposal: (proposalId: string) =>
    request(apiPaths.proposalCancel(proposalId), proposalCancelResponseSchema, post()),
  listActions: (conversationId: string) =>
    request(
      `${apiPaths.actions()}?conversation_id=${encodeURIComponent(conversationId)}`,
      actionsListResponseSchema,
    ),
  getAction: (id: string) => request(apiPaths.action(id), actionResponseSchema),
};
