import type { ErrorCode } from '@parcelguard/contracts';

/**
 * HTTP status per error code — PLAN.md §7.6, verbatim. `DEMO_MODE_DISABLED`
 * covers the "404 outside demo mode" row of the §7.1 endpoint table.
 */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  DEMO_MODE_DISABLED: 404,
  SESSION_REQUIRED: 401,
  ORDER_UNAVAILABLE: 404,
  RESOURCE_UNAVAILABLE: 404,
  ORDER_CHANGED: 409,
  REQUEST_IN_PROGRESS: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PROPOSAL_STATE_CONFLICT: 409,
  CONVERSATION_LIMIT_REACHED: 409,
  PROPOSAL_EXPIRED: 410,
  INVALID_INPUT: 422,
  ORDER_NOT_EDITABLE: 422,
  MODEL_RATE_LIMITED: 429,
  MODEL_UNAVAILABLE: 502,
  TERMINAL3_UNAVAILABLE: 502,
  MODEL_TIMEOUT: 504,
  ACTION_OUTCOME_UNKNOWN: 504,
  INTERNAL_ERROR: 500,
};

/**
 * Retryability — PLAN.md §7.6. Only provider-side failures encountered
 * *before* a write is dispatched are retryable. `ACTION_OUTCOME_UNKNOWN` is
 * deliberately false: after dispatch an uncertain outcome must never be
 * blindly repeated.
 */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'MODEL_RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'TERMINAL3_UNAVAILABLE',
  'MODEL_TIMEOUT',
]);

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.retryable = RETRYABLE.has(code);
  }
}

/** Shorthand: `throw apiError('ORDER_UNAVAILABLE', 'Order not available')`. */
export const apiError = (code: ErrorCode, message: string) => new ApiError(code, message);

/**
 * 404 for anything the session does not own — PLAN.md §7.6 "Do not disclose
 * existence". Used for foreign orders (ORD-2001) and cross-session actions
 * alike so the two are indistinguishable from outside.
 */
export const notFound = (what: 'order' | 'resource') =>
  what === 'order'
    ? apiError('ORDER_UNAVAILABLE', 'Order not available')
    : apiError('RESOURCE_UNAVAILABLE', 'Resource not available');
