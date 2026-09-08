import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/http/errors.js';
import {
  createTerminal3Adapter,
  type EnclaveDecision,
  type Terminal3Session,
} from '../src/adapters/terminal3Adapter.js';

/**
 * The connect step is injected, so these assert what the adapter *claims*
 * about a session without loading the SDK's WASM component. Whether Terminal 3
 * itself works is proved by the preflight and the live confirm recorded in
 * docs/DEMO.md.
 */

const DID = 'did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba';

/** What the deployed contract actually returned on testnet, shape for shape. */
const ALLOWED: EnclaveDecision = {
  decision: 'allowed',
  reason_code: 'ADDRESS_CHANGE_AUTHORIZED',
  contract_id: 928,
  seq_no: 202892,
  decided_at: 1788844871,
  calling_did: DID.replace('did:t3n:', ''),
};

/** A session whose enclave call returns `decision`. */
const sessionWith = (
  decision: EnclaveDecision | (() => Promise<EnclaveDecision>),
  attestationVerified = false,
): Terminal3Session => ({
  sessionDid: DID,
  attestationVerified,
  execute: typeof decision === 'function' ? decision : async () => decision,
});

/** The five facts every authorize call carries. */
const CONFIRM = {
  orderId: 'ORD-1002',
  addressRef: 'addr_alex_office',
  orderStatus: 'processing',
  fromAddressRef: 'addr_alex_home',
  proposalId: 'prop_test',
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const configured = () => vi.stubEnv('T3N_API_KEY', 'test-key');

describe('evidence', () => {
  it('reports the real DID, a provider-issued reference, and unverified attestation', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => sessionWith(ALLOWED));

    const evidence = await adapter.authorize(CONFIRM);

    expect(evidence).toEqual({
      source: 'terminal3',
      agent_did: DID,
      // Composed only from values the node assigned to this execution and
      // returned in the response. PLAN.md §7.5 forbids inventing one, and
      // every part of this string came back from Terminal 3.
      provider_reference: 't3n:928:202892',
      verified: false,
    });
  });

  it('only claims verified when the trust manifest actually pinned', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => sessionWith(ALLOWED, true));
    await expect(
      adapter.authorize(CONFIRM),
    ).resolves.toMatchObject({ verified: true });
    expect(adapter.identityVerified()).toBe(true);
  });
});

describe('mode reporting', () => {
  it('is unavailable until a session exists, then live', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () => sessionWith(ALLOWED));

    expect(adapter.mode()).toBe('unavailable');
    expect(adapter.agentDid()).toBeNull();
    expect(adapter.identityVerified()).toBe(false);

    await adapter.authorize(CONFIRM);

    expect(adapter.mode()).toBe('live');
    expect(adapter.agentDid()).toBe(DID);
    // Still false: a live session is not a verified attestation.
    expect(adapter.identityVerified()).toBe(false);
  });

  it('reuses one session across confirmations', async () => {
    configured();
    const connect = vi.fn(async () => sessionWith(ALLOWED));
    const adapter = createTerminal3Adapter(connect);

    await adapter.authorize(CONFIRM);
    await adapter.authorize({ ...CONFIRM, addressRef: 'addr_alex_home' });

    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('failure mapping', () => {
  it('refuses to authorize when no key is configured', async () => {
    // test/setup.ts loads apps/api/.env, which has a real key — clear it here.
    vi.stubEnv('T3N_API_KEY', '');
    const adapter = createTerminal3Adapter(async () => sessionWith(ALLOWED));
    const error = (await adapter
      .authorize(CONFIRM)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
  });

  it('maps a refused session to TERMINAL3_UNAVAILABLE and retries next time', async () => {
    configured();
    const connect = vi
      .fn<() => Promise<Terminal3Session>>()
      .mockRejectedValueOnce(new Error('handshake refused'))
      .mockResolvedValueOnce(sessionWith(ALLOWED));
    const adapter = createTerminal3Adapter(connect);

    const error = (await adapter
      .authorize(CONFIRM)
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
    expect(adapter.mode()).toBe('unavailable');

    // A failed session must not be cached as a permanent rejection.
    await expect(
      adapter.authorize(CONFIRM),
    ).resolves.toMatchObject({ agent_did: DID });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('stops the confirmation when the enclave refuses', async () => {
    // The application already approved this change before reaching here, so a
    // refusal means the two disagree. A second opinion that cannot stop the
    // first one is decoration.
    configured();
    const adapter = createTerminal3Adapter(async () =>
      sessionWith({
        decision: 'denied',
        reason_code: 'ORDER_NOT_EDITABLE',
        contract_id: 928,
        seq_no: 202922,
        decided_at: 1788844896,
        calling_did: DID.replace('did:t3n:', ''),
      }),
    );

    const error = (await adapter.authorize(CONFIRM).catch((caught: unknown) => caught)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('ORDER_NOT_EDITABLE');
    // Never retryable: repeating a refused decision cannot change it.
    expect(error.retryable).toBe(false);
  });

  it('refuses a contract response it cannot read rather than assuming allowed', async () => {
    configured();
    const adapter = createTerminal3Adapter(async () =>
      sessionWith(async () => ({ unexpected: true }) as unknown as EnclaveDecision),
    );
    const error = (await adapter.authorize(CONFIRM).catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
  });

  it('refuses when the enclave saw a different caller than we authenticated as', async () => {
    // Evidence that names the wrong actor is worse than no evidence: this is
    // the one field the audit trail asks people to trust.
    configured();
    const adapter = createTerminal3Adapter(async () =>
      sessionWith({ ...ALLOWED, calling_did: 'deadbeef00000000000000000000000000000000' }),
    );
    const error = (await adapter.authorize(CONFIRM).catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('TERMINAL3_UNAVAILABLE');
  });

  it('maps a hang to ACTION_OUTCOME_UNKNOWN, never a retryable failure', async () => {
    configured();
    vi.useFakeTimers();
    const adapter = createTerminal3Adapter(() => new Promise(() => {}));

    const pending = adapter
      .authorize(CONFIRM)
      .catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(16_000);
    const error = (await pending) as ApiError;

    expect(error.code).toBe('ACTION_OUTCOME_UNKNOWN');
    // PLAN.md §7.6: after dispatch, an uncertain outcome is not retryable.
    expect(error.retryable).toBe(false);
  });
});
