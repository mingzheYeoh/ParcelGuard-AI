import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/http/errors.js';
import { createTerminal3Adapter } from '../src/adapters/terminal3Adapter.js';

/**
 * The connect step is injected, so these assert what the adapter *claims*
 * about a session without loading the SDK's WASM component. Whether Terminal 3
 * itself works is proved by the preflight and the live confirm recorded in
 * docs/handoffs/task-8.md.
 */

const DID = 'did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const configured = () => vi.stubEnv('T3N_API_KEY', 'test-key');

describe('evidence', () => {
  it('reports the real DID, no invented reference, and unverified attestation', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => ({
      tenantDid: DID,
      attestationVerified: false,
    }));

    const evidence = await adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' });

    expect(evidence).toEqual({
      source: 'terminal3',
      agent_did: DID,
      // Null because no contract was executed — PLAN.md §7.5 forbids inventing
      // a provider reference, and a fabricated one is the exact failure this
      // project asks people to trust it not to commit.
      provider_reference: null,
      verified: false,
    });
  });

  it('only claims verified when the trust manifest actually pinned', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => ({
      tenantDid: DID,
      attestationVerified: true,
    }));
    await expect(
      adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' }),
    ).resolves.toMatchObject({ verified: true });
    expect(adapter.identityVerified()).toBe(true);
  });
});

describe('mode reporting', () => {
  it('is unavailable until a session exists, then live', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => ({
      tenantDid: DID,
      attestationVerified: false,
    }));

    expect(adapter.mode()).toBe('unavailable');
    expect(adapter.agentDid()).toBeNull();
    expect(adapter.identityVerified()).toBe(false);

    await adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' });

    expect(adapter.mode()).toBe('live');
    expect(adapter.agentDid()).toBe(DID);
    // Still false: a live session is not a verified attestation.
    expect(adapter.identityVerified()).toBe(false);
  });

  it('reuses one session across confirmations', async () => {
    configured();
    const connect = vi.fn(async () => ({ tenantDid: DID, attestationVerified: false }));
    const adapter = createTerminal3Adapter(connect);

    await adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' });
    await adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_home' });

    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('failure mapping', () => {
  it('refuses to authorize when no key is configured', async () => {
    // test/setup.ts loads apps/api/.env, which has a real key — clear it here.
    vi.stubEnv('T3N_API_KEY', '');
    const adapter = createTerminal3Adapter(async () => ({
      tenantDid: DID,
      attestationVerified: false,
    }));
    const error = (await adapter
      .authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' })
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
  });

  it('maps a refused session to TERMINAL3_UNAVAILABLE and retries next time', async () => {
    configured();
    const connect = vi
      .fn<() => Promise<{ tenantDid: string; attestationVerified: boolean }>>()
      .mockRejectedValueOnce(new Error('handshake refused'))
      .mockResolvedValueOnce({ tenantDid: DID, attestationVerified: false });
    const adapter = createTerminal3Adapter(connect);

    const error = (await adapter
      .authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' })
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
    expect(adapter.mode()).toBe('unavailable');

    // A failed session must not be cached as a permanent rejection.
    await expect(
      adapter.authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' }),
    ).resolves.toMatchObject({ agent_did: DID });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('maps a hang to ACTION_OUTCOME_UNKNOWN, never a retryable failure', async () => {
    configured();
    vi.useFakeTimers();
    const adapter = createTerminal3Adapter(() => new Promise(() => {}));

    const pending = adapter
      .authorize({ orderId: 'ORD-1002', addressRef: 'addr_alex_office' })
      .catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(16_000);
    const error = (await pending) as ApiError;

    expect(error.code).toBe('ACTION_OUTCOME_UNKNOWN');
    // PLAN.md §7.6: after dispatch, an uncertain outcome is not retryable.
    expect(error.retryable).toBe(false);
  });
});
