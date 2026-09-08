import type { Evidence, IntegrationMode } from '@parcelguard/contracts';
import { apiError } from '../http/errors.js';
import type { Terminal3Adapter } from './index.js';

/**
 * Terminal 3 adapter (PLAN.md §10, TASKS.md Task 8).
 *
 * What this actually does, stated plainly because the evidence it produces is
 * the whole point of the demo:
 *
 * - It performs a **real** Terminal 3 session: `handshake()` then
 *   `authenticate()`, which returns a platform-assigned tenant DID. The key,
 *   the SIWE signature and the DID are genuine.
 * - It does **not** execute a protected TEE contract. That needs a registered
 *   WASM contract (`tenant.contracts.register` / `execute`), which means a
 *   Rust `wasm32-wasip2` build and agent credits — out of scope per PLAN.md
 *   §10 and TASKS.md Task 8 item 1. So there is no provider operation id, and
 *   `provider_reference` stays null rather than being invented.
 * - TEE attestation is **not** verified. `fetchTrustedManifest('testnet')`
 *   fails today ("Trust manifest ... is malformed"): SDK 5.x requires
 *   `rtmr1_allowlist`, and the testnet manifest only publishes
 *   `rtmr3_allowlist`. The only anchor that connects is
 *   `{ unsafe_trust_server: true }`, which skips attestation pinning.
 *   Therefore `evidence.verified` is **always false** here and
 *   `identityVerified()` is false. Never present this as a verified TEE
 *   result (PLAN.md §7.5).
 *
 * In short: this proves an authenticated agent identity authorised the action.
 * It does not prove a TEE executed anything.
 */

/** Session timeout. Past this the outcome is unknown, not failed. */
const TIMEOUT_MS = 15_000;

export interface Terminal3Session {
  readonly tenantDid: string;
  /** True only if the signed trust manifest pinned successfully. */
  readonly attestationVerified: boolean;
}

/**
 * Opens a real session. Injectable so tests can exercise the adapter's
 * evidence and failure mapping without loading the SDK's WASM component.
 */
export type Terminal3Connect = () => Promise<Terminal3Session>;

async function connectWithSdk(): Promise<Terminal3Session> {
  const apiKey = process.env.T3N_API_KEY;
  if (!apiKey) throw new Error('T3N_API_KEY is not set');

  // Imported lazily: the SDK loads a WASM component at import time, and a
  // deployment running in mock mode must not pay that cost or risk it.
  const {
    T3nClient,
    setEnvironment,
    loadWasmComponent,
    eth_get_address,
    metamask_sign,
    createEthAuthInput,
    fetchTrustedManifest,
  } = await import('@terminal3/t3n-sdk');

  setEnvironment('testnet');
  const wasmComponent = await loadWasmComponent();
  const address = eth_get_address(apiKey);

  // Prefer the signed manifest; fall back only because testnet's is malformed
  // today. The fallback is recorded, never hidden.
  let trustAnchor: unknown;
  let attestationVerified = true;
  try {
    trustAnchor = await fetchTrustedManifest('testnet');
  } catch {
    trustAnchor = { unsafe_trust_server: true };
    attestationVerified = false;
  }

  const client = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, apiKey) },
  } as ConstructorParameters<typeof T3nClient>[0]);

  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(address));
  const tenantDid = did.value;
  if (!tenantDid?.startsWith('did:t3n:')) {
    throw new Error('Terminal 3 returned no tenant DID');
  }
  return { tenantDid, attestationVerified };
}

export function createTerminal3Adapter(
  connect: Terminal3Connect = connectWithSdk,
): Terminal3Adapter {
  const configured = Boolean(process.env.T3N_API_KEY);
  /** Cached per process: a warm instance reuses one authenticated session. */
  let session: Promise<Terminal3Session> | null = null;
  let live: Terminal3Session | null = null;
  let failed = false;

  const open = (): Promise<Terminal3Session> => {
    session ??= connect().then(
      (result) => {
        live = result;
        failed = false;
        return result;
      },
      (cause: unknown) => {
        // Drop the cached promise so the next confirm retries rather than
        // replaying a stale rejection for the life of the instance.
        session = null;
        failed = true;
        throw cause;
      },
    );
    return session;
  };

  return {
    // "live" only once a real session exists (TASKS.md §2 rule 5).
    mode: (): IntegrationMode => (live ? 'live' : 'unavailable'),
    agentDid: () => live?.tenantDid ?? null,
    // False until the signed trust manifest actually pins.
    identityVerified: () => live?.attestationVerified ?? false,

    async authorize(): Promise<Evidence> {
      if (!configured) {
        throw apiError('TERMINAL3_UNAVAILABLE', 'The authorization service is not configured.');
      }

      let result: Terminal3Session;
      try {
        result = await withTimeout(open(), TIMEOUT_MS);
      } catch (cause) {
        // A timeout means the call may or may not have been seen by the
        // provider. PLAN.md §8.4: that is outcome_unknown, never a retry.
        if (cause instanceof TimeoutError) {
          throw apiError(
            'ACTION_OUTCOME_UNKNOWN',
            'The authorization result could not be confirmed. Check Recent actions before trying again.',
          );
        }
        throw apiError('TERMINAL3_UNAVAILABLE', 'The authorization service is unavailable.');
      }

      return {
        source: 'terminal3',
        // Real, read back from authenticate() — never constructed.
        agent_did: result.tenantDid,
        // Null on purpose. Terminal 3 issued no operation id because no
        // contract was executed, and PLAN.md §7.5 forbids inventing one. A
        // locally-built string here would read as provider evidence and be a
        // lie in exactly the place this project asks people to trust it.
        provider_reference: null,
        verified: result.attestationVerified,
      };
    },
  };
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError('Terminal 3 timed out')), ms).unref?.(),
    ),
  ]);
}
