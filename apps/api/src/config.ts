import type { IntegrationMode } from '@parcelguard/contracts';

/**
 * Environment access. Read through functions, never cached at module scope,
 * so tests can set process.env per case and so a Vercel Function picks up the
 * values of the instance it actually runs in (TASKS.md §0.3).
 */
export const config = {
  demoMode: () => process.env.DEMO_MODE !== 'false',
  appOrigin: () => process.env.APP_ORIGIN ?? 'http://localhost:5173',
  /** Cookie signing key. Required: an unsigned demo cookie is a forgeable session. */
  sessionSecret: (): string => {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        'SESSION_SECRET must be set to at least 16 characters (see apps/api/.env.example).',
      );
    }
    return secret;
  },
  /** `Secure` is dropped only on localhost so the demo works over plain http. */
  secureCookies: () => !config.appOrigin().startsWith('http://localhost'),
  modelProvider: () => process.env.MODEL_PROVIDER ?? 'mock',
  terminal3Mode: (): IntegrationMode =>
    process.env.TERMINAL3_MODE === 'live' ? 'live' : 'mock',
};

export const SESSION_COOKIE = 'pg_session';
/** PLAN.md §7.4: proposals expire after five minutes. */
export const PROPOSAL_TTL_MS = 5 * 60 * 1000;
/** PLAN.md §7.1: at most 100 completed turns per conversation. */
export const MAX_TURNS_PER_CONVERSATION = 100;
/** PLAN.md §7.1: at most the 100 most recent actions, newest first. */
export const MAX_ACTIONS_RETURNED = 100;
