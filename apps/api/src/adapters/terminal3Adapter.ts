import type { Evidence, IntegrationMode } from '@parcelguard/contracts';
import { config } from '../config.js';
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
 * - It executes a **real protected contract**: `z:<tid>:parcelguard-authz`,
 *   the WASM component in `contracts/parcelguard-authz`, which makes the
 *   address-change decision inside the enclave. `provider_reference` is built
 *   from the `contract_id` and `seq_no` the node assigned to that execution —
 *   both read out of the response, neither invented — and locates the call in
 *   the tenant activity ledger.
 * - The enclave has **no access to this application's database**. It decides
 *   on the facts it is handed and cannot confirm they are true. Ownership and
 *   order state stay enforced in `policyService.ts`, which is the only party
 *   that can see the data; the enclave is a second, independent check on the
 *   rule, not a replacement for the first one.
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

/** The facts the enclave rules on. It sees nothing else. */
export interface EnclaveRequest {
  readonly order_id: string;
  readonly order_status: string;
  readonly from_address_ref: string;
  readonly to_address_ref: string;
  readonly proposal_id: string;
}

/** Exactly the JSON `authorize-address-change` returns. */
export interface EnclaveDecision {
  readonly decision: 'allowed' | 'denied';
  readonly reason_code: string;
  readonly contract_id: number;
  readonly seq_no: number;
  readonly decided_at: number;
  /** Hex of the DID the enclave saw calling it. Its own view, not our claim. */
  readonly calling_did: string | null;
}

/**
 * Returns whatever the node sent. It is validated in `authorize`, not here:
 * the response crosses a trust boundary, and a guard that only covers the
 * production executor is not a guard.
 */
export type EnclaveExecute = (request: EnclaveRequest) => Promise<unknown>;

export interface Terminal3Session {
  /**
   * DID this session authenticated as. The tenant's when running on
   * T3N_API_KEY, the assistant's when T3N_AGENT_KEY is set — so it is named
   * for what it is rather than for one of the two things it can be.
   */
  readonly sessionDid: string;
  /** True only if the signed trust manifest pinned successfully. */
  readonly attestationVerified: boolean;
  /** Runs the registered contract. Injected in tests so they need no WASM. */
  readonly execute: EnclaveExecute;
}

/**
 * Must match the registered `tail@version`. Bumping the contract means
 * registering the new version *and* changing this — deliberately coupled, so
 * the app can never execute a version nobody deployed.
 */
const CONTRACT_TAIL = 'parcelguard-authz';
const CONTRACT_VERSION = '0.1.0';
const CONTRACT_FUNCTION = 'authorize-address-change';

/**
 * Opens a real session. Injectable so tests can exercise the adapter's
 * evidence and failure mapping without loading the SDK's WASM component.
 */
export type Terminal3Connect = () => Promise<Terminal3Session>;

async function connectWithSdk(): Promise<Terminal3Session> {
  // Run as the assistant when it has its own key, otherwise as the tenant.
  const agentKey = config.terminal3AgentKey();
  const apiKey = agentKey ?? process.env.T3N_API_KEY;
  if (!apiKey) throw new Error('T3N_API_KEY is not set');
  if (agentKey && agentKey === process.env.T3N_API_KEY) {
    throw new Error('T3N_AGENT_KEY must differ from T3N_API_KEY — they are one identity');
  }
  // The contract is owned by the tenant, so its canonical name needs the
  // owner's DID. Running as the agent means the session can no longer supply it.
  const ownerDid = agentKey ? config.terminal3TenantDid() : undefined;
  if (agentKey && !ownerDid) {
    throw new Error('T3N_TENANT_DID is required when T3N_AGENT_KEY is set');
  }

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
    canonicalTenantName,
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
  const sessionDid = did.value;
  if (!sessionDid?.startsWith('did:t3n:')) {
    throw new Error('Terminal 3 returned no DID');
  }

  const contractId = canonicalTenantName(ownerDid ?? sessionDid, CONTRACT_TAIL);

  const execute: EnclaveExecute = (request) =>
    client.executeAndDecode({
      contract_id: contractId,
      contract_version: CONTRACT_VERSION,
      function_name: CONTRACT_FUNCTION,
      input: request,
    });

  return { sessionDid, attestationVerified, execute };
}

/**
 * The SDK types `execute` as `unknown`, so the shape is checked here rather
 * than cast. A response this code cannot read is a failure, never a silent
 * `allowed`.
 */
function asDecision(raw: unknown): EnclaveDecision {
  const value = raw as Partial<EnclaveDecision> | null;
  if (
    !value ||
    (value.decision !== 'allowed' && value.decision !== 'denied') ||
    typeof value.reason_code !== 'string' ||
    typeof value.contract_id !== 'number' ||
    typeof value.seq_no !== 'number' ||
    (value.calling_did !== null && typeof value.calling_did !== 'string')
  ) {
    throw new Error('Terminal 3 returned an unreadable contract response');
  }
  return value as EnclaveDecision;
}

export function createTerminal3Adapter(
  connect: Terminal3Connect = connectWithSdk,
): Terminal3Adapter {
  const configured = Boolean(process.env.T3N_API_KEY ?? config.terminal3AgentKey());
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
    agentDid: () => live?.sessionDid ?? null,
    // False until the signed trust manifest actually pins.
    identityVerified: () => live?.attestationVerified ?? false,

    async authorize(input): Promise<Evidence> {
      if (!configured) {
        throw apiError('TERMINAL3_UNAVAILABLE', 'The authorization service is not configured.');
      }

      let session: Terminal3Session;
      let decision: EnclaveDecision;
      try {
        session = await withTimeout(open(), TIMEOUT_MS);
        decision = asDecision(
          await withTimeout(
            session.execute({
              order_id: input.orderId,
              order_status: input.orderStatus,
              from_address_ref: input.fromAddressRef,
              to_address_ref: input.addressRef,
              proposal_id: input.proposalId,
            }),
            TIMEOUT_MS,
          ),
        );
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

      // The enclave reports the DID it saw calling it. If that disagrees with
      // the identity this process believes it authenticated as, the evidence
      // would name the wrong actor — refuse rather than record a claim we
      // cannot stand behind.
      const expected = session.sessionDid.replace('did:t3n:', '');
      if (decision.calling_did && decision.calling_did !== expected) {
        throw apiError(
          'TERMINAL3_UNAVAILABLE',
          'The authorization service reported a different caller than expected.',
        );
      }

      if (decision.decision !== 'allowed') {
        // The enclave refused a change the application had already approved,
        // so the two disagree. Fail the confirmation rather than proceed —
        // a second opinion is only worth having if it can stop the first.
        throw apiError(
          decision.reason_code === 'ORDER_NOT_EDITABLE' ? 'ORDER_NOT_EDITABLE' : 'INVALID_INPUT',
          'The authorization service refused this change.',
        );
      }

      return {
        source: 'terminal3',
        // Real, read back from authenticate() and cross-checked against the
        // DID the enclave itself reported seeing.
        agent_did: session.sessionDid,
        // Composed from two values the Terminal 3 node assigned to this
        // execution and returned in the response: the contract's registration
        // id, and the store sequence number at the moment of the decision
        // (the host documents `seq-no` as the audit/replay correlation key).
        // Nothing here is locally invented.
        //
        // It is *not* the id of the node's activity-ledger row for this call:
        // that row is written after the decision returns and carries its own,
        // slightly later seq_no plus a SHA-256 of the entry. Observed on
        // testnet: decision 202946 -> ledger row 202949. Read the ledger with
        // `npx tsx scripts/t3n/activity.mts` to see the node's own record.
        provider_reference: `t3n:${decision.contract_id}:${decision.seq_no}`,
        verified: session.attestationVerified,
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
