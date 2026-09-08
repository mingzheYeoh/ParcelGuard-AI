// Registers the assistant as a public agent on Terminal 3: an ERC-8004
// registration card, stored under its own DID and published world-readable at
// `GET /api/agent-card/<did>`.
//
// Why this exists beyond discoverability: the activity ledger's `caller_type`
// comes from an agent-registry check on the actor, so an unregistered key is
// logged as `human` no matter what it is used for. This is what makes the
// ledger able to say an *agent* acted.
//
//   AGENT_KEY=0x... npx tsx scripts/t3n/register-agent-card.mts
//   AGENT_KEY=0x... npx tsx scripts/t3n/register-agent-card.mts --unpublish
//
// The card claims only what this project can back. It lists no A2A or MCP
// endpoint, because there is none, and it does not claim `tee-attestation`
// support: the attestation behind this identity is unverified today (testnet's
// trust manifest is malformed), and a public card is the last place to imply
// otherwise.
import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  getNodeUrl,
  createOrgDataClientFromSession,
} from '@terminal3/t3n-sdk';

process.on('unhandledRejection', (err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

const agentKey = process.env.AGENT_KEY ?? process.env.T3N_AGENT_KEY;
if (!agentKey) {
  console.error('AGENT_KEY is not set — this registers the assistant, not the tenant.');
  process.exit(2);
}

setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const baseUrl = getNodeUrl();
const address = eth_get_address(agentKey);

let trustAnchor: unknown;
try {
  trustAnchor = await fetchTrustedManifest('testnet');
} catch {
  trustAnchor = { unsafe_trust_server: true };
}

const t3n = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, agentKey) },
} as ConstructorParameters<typeof T3nClient>[0]);
await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const agentDid = did.value as string;
console.log(`agent DID: ${agentDid}`);

const orgData = createOrgDataClientFromSession(t3n, baseUrl);

if (process.argv.includes('--unpublish')) {
  console.log(
    JSON.stringify(await orgData.agentCardUnpublish({ ownerDid: agentDid, agentDid }), null, 2),
  );
  process.exit(0);
}

const card = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'ParcelGuard Assistant',
  description:
    'Order-support assistant for ParcelGuard. Looks up a customer\u2019s own orders and ' +
    'proposes delivery-address changes, which a person must confirm. Each confirmation ' +
    'is decided by the z:\u2026:parcelguard-authz contract inside a Terminal 3 enclave; the ' +
    'assistant cannot apply a change the contract refuses.',
  services: [{ name: 'DID', endpoint: agentDid, version: 'v1' }],
  x402Support: false,
  active: true,
  registrations: [],
};

console.log('\nsetting private card…');
console.log(
  JSON.stringify(
    await orgData.agentCardSet({ ownerDid: agentDid, agentDid, card: JSON.stringify(card) }),
    null,
    2,
  ),
);

console.log('\npublishing…');
console.log(
  JSON.stringify(await orgData.agentCardPublish({ ownerDid: agentDid, agentDid }), null, 2),
);

console.log(`\npublic card: ${baseUrl}/api/agent-card/${agentDid}`);
