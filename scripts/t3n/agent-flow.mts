// Gives the agent its own Terminal 3 identity and an explicit, scoped grant to
// call ParcelGuard's authorization contract — then proves what that grant does.
//
// The order of the steps is the point. The ungranted call is made BEFORE the
// grant is issued, because the Terminal 3 docs say enforcement happens at the
// egress boundary:
//
//   "An agent with no matching grant can still call the contract — the call
//    just fails at the point it tries to reach the network."
//
// `parcelguard-authz` deliberately makes no outbound calls, so whether an
// ungranted agent is refused is an open question this script answers instead
// of assuming. Whatever it reports is what the docs will say.
//
// Usage (from repo root):
//   AGENT_KEY=0x... npx tsx scripts/t3n/agent-flow.mts
//
// AGENT_KEY must be a SECOND key from the claim page, never the tenant's
// T3N_API_KEY: an agent DID's credits are separate and start at zero, and
// reusing the tenant key would make the two identities indistinguishable —
// which is the one thing this step exists to demonstrate.
import { readFileSync } from 'node:fs';
import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  getNodeUrl,
  getContractVersion,
  canonicalTenantName,
} from '@terminal3/t3n-sdk';

const CONTRACT_TAIL = 'parcelguard-authz';
const CONTRACT_VERSION = '0.1.0';
const FUNCTION = 'authorize-address-change';

const DECISION_INPUT = {
  order_id: 'ORD-1002',
  order_status: 'processing',
  from_address_ref: 'addr_alex_home',
  to_address_ref: 'addr_alex_office',
  proposal_id: 'prop_agent_flow',
};

process.on('unhandledRejection', (err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

function envKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    return readFileSync(new URL('../../apps/api/.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`))
      ?.slice(name.length + 1)
      .trim();
  } catch {
    return undefined;
  }
}

const tenantKey = envKey('T3N_API_KEY');
const agentKey = envKey('AGENT_KEY');

if (!tenantKey) {
  console.error('T3N_API_KEY is not set.');
  process.exit(2);
}
if (!agentKey) {
  console.error(
    'AGENT_KEY is not set. Claim a SECOND key at the Terminal 3 claim page —\n' +
      "an agent DID's credits are separate from the tenant's and start at zero,\n" +
      'and reusing T3N_API_KEY would make the two identities the same one.',
  );
  process.exit(2);
}
if (agentKey === tenantKey) {
  console.error('AGENT_KEY must differ from T3N_API_KEY — they would be one identity.');
  process.exit(2);
}

setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const baseUrl = getNodeUrl();

let trustAnchor: unknown;
let attestation = 'pinned-manifest';
try {
  trustAnchor = await fetchTrustedManifest('testnet');
} catch {
  trustAnchor = { unsafe_trust_server: true };
  attestation = 'unsafe_trust_server (attestation NOT verified)';
}

async function connect(key: string): Promise<{ client: T3nClient; did: string }> {
  const address = eth_get_address(key);
  const client = new T3nClient({
    trustAnchor,
    wasmComponent,
    handlers: { EthSign: metamask_sign(address, undefined, key) },
  } as ConstructorParameters<typeof T3nClient>[0]);
  await client.handshake();
  const did = await client.authenticate(createEthAuthInput(address));
  return { client, did: did.value as string };
}

/** Calls the contract and reports how it went, without throwing. */
async function callContract(
  client: T3nClient,
  contractId: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const raw = await client.execute({
      contract_id: contractId,
      contract_version: CONTRACT_VERSION,
      function_name: FUNCTION,
      input: DECISION_INPUT,
    });
    return { ok: true, detail: typeof raw === 'string' ? raw : JSON.stringify(raw) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

console.log(`trust: ${attestation}`);
console.log(`node:  ${baseUrl}\n`);

const tenant = await connect(tenantKey);
console.log(`tenant DID: ${tenant.did}`);
const agent = await connect(agentKey);
console.log(`agent  DID: ${agent.did}`);
if (agent.did === tenant.did) {
  console.error('\nThe two keys authenticated to the SAME DID — this proves nothing. Stopping.');
  process.exit(1);
}

const contractId = canonicalTenantName(tenant.did, CONTRACT_TAIL);
console.log(`contract:   ${contractId}\n`);

// --- 1. Ungranted. Run this before any grant exists. -----------------------
console.log('1. agent calls the contract with NO grant');
const ungranted = await callContract(agent.client, contractId);
console.log(`   ${ungranted.ok ? 'ALLOWED' : 'REFUSED'}: ${ungranted.detail.slice(0, 200)}\n`);

// --- 2. The data owner grants the agent one function on one contract. ------
console.log('2. tenant (data owner) issues an agent-auth-update grant');
const userContractVersion = await getContractVersion(baseUrl, 'tee:user/contracts');
const grant = await tenant.client.execute({
  contract_id: 'tee:user/contracts',
  contract_version: userContractVersion,
  function_name: 'agent-auth-update',
  input: {
    agents: [
      {
        agentDid: agent.did,
        scripts: [
          {
            scriptName: contractId,
            versionReq: CONTRACT_VERSION,
            // Exactly one function. Not "*".
            functions: [FUNCTION],
            // The contract reaches no network, so this is empty by design
            // rather than by omission.
            allowedHosts: [],
          },
        ],
      },
    ],
  },
});
console.log(`   grant written: ${String(grant).slice(0, 200)}\n`);

// --- 3. Granted. -----------------------------------------------------------
console.log('3. agent calls the contract WITH the grant');
const granted = await callContract(agent.client, contractId);
console.log(`   ${granted.ok ? 'ALLOWED' : 'REFUSED'}: ${granted.detail.slice(0, 300)}\n`);

// --- 4. What the node recorded. -------------------------------------------
const report = await (
  tenant.client as unknown as {
    getActivityLog: (o: unknown) => Promise<{ entries: Record<string, unknown>[] }>;
  }
).getActivityLog({ limit: 8 });

console.log('4. activity ledger (newest first)');
for (const e of report.entries) {
  const who = String(e.actor) === agent.did ? 'AGENT ' : 'tenant';
  console.log(
    `   seq ${e.seq_no}  ${String(e.caller_type).padEnd(5)}  ${who}  ` +
      `${String(e.contract).split(':').pop()}::${e.function}  ${e.outcome}`,
  );
}

console.log(
  `\nSummary: ungranted=${ungranted.ok ? 'ALLOWED' : 'REFUSED'}  granted=${granted.ok ? 'ALLOWED' : 'REFUSED'}`,
);
