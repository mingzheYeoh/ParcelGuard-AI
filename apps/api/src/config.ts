import type { IntegrationMode } from '@parcelguard/contracts';

/**
 * Environment access. Read through functions, never cached at module scope,
 * so tests can set process.env per case and so a Vercel Function picks up the
 * values of the instance it actually runs in (TASKS.md §0.3).
 */
export const config = {
  demoMode: () => process.env.DEMO_MODE !== 'false',
  appOrigin: () => process.env.APP_ORIGIN ?? 'http://localhost:5173',
  /**
   * Origins allowed to send a mutation (PLAN.md §6.3).
   *
   * A single fixed APP_ORIGIN cannot work on Vercel: every Preview deployment
   * has its own hostname, so a Preview UI's own requests were rejected with
   * 401. Vercel exposes the deployment's real hostnames at runtime, so they
   * are derived rather than guessed:
   *
   * - `VERCEL_URL`                    this deployment's generated domain
   * - `VERCEL_BRANCH_URL`             the branch alias (what a PR link opens)
   * - `VERCEL_PROJECT_PRODUCTION_URL` the production domain, always set
   *
   * Exact matches only. A wildcard such as `*.vercel.app` would let any page
   * hosted anywhere on vercel.app forge authenticated requests — that is a
   * CSRF hole, not a convenience.
   */
  allowedOrigins: (): readonly string[] => {
    const origins = new Set<string>([config.appOrigin()]);
    for (const host of [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]) {
      if (host) origins.add(`https://${host}`);
    }
    return [...origins];
  },
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
