// Registers and executes the ParcelGuard authorization contract on Terminal 3
// testnet, then reads the call back out of the tenant activity ledger.
//
// This is the step that turns `evidence.provider_reference` from null into a
// real, provider-issued reference: the ledger row the node stamps for the
// execution, carrying its own SHA-256.
//
// Usage (from repo root):
//   npx tsx scripts/t3n/deploy-contract.mts            # register + execute
//   npx tsx scripts/t3n/deploy-contract.mts --skip-register
//
// Reads T3N_API_KEY from the environment or apps/api/.env. Never prints it.
import { readFileSync } from 'node:fs';
import {
  T3nClient,
  TenantClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  getNodeUrl,
} from '@terminal3/t3n-sdk';

// The SDK ships minified, so an uncaught rejection dumps ~2 MB of one-line
// bundle into the terminal. Print the message and stop.
process.on('unhandledRejection', (err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

const TAIL = 'parcelguard-authz';
const VERSION = '0.1.0';
const FUNCTION = 'authorize-address-change';
const WASM = new URL(
  '../../contracts/parcelguard-authz/target/wasm32-wasip2/release/parcelguard_authz.wasm',
  import.meta.url,
);

function readEnvKey(): string | undefined {
  if (process.env.T3N_API_KEY) return process.env.T3N_API_KEY;
  try {
    const line = readFileSync(new URL('../../apps/api/.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('T3N_API_KEY='));
    return line?.slice('T3N_API_KEY='.length).trim();
  } catch {
    return undefined;
  }
}

function show(label: string, value: unknown): void {
  console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`);
}

const key = readEnvKey();
if (!key || key.startsWith('<')) {
  console.error('T3N_API_KEY is not set.');
  process.exit(2);
}

setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(key);

// Same anchor policy as the adapter: prefer the signed manifest, fall back
// only because testnet's is malformed today, and say which one was used.
let trustAnchor: unknown;
let attestation = 'pinned-manifest';
try {
  trustAnchor = await fetchTrustedManifest('testnet');
} catch {
  trustAnchor = { unsafe_trust_server: true };
  attestation = 'unsafe_trust_server (attestation NOT verified)';
}

const t3n = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, key) },
} as ConstructorParameters<typeof T3nClient>[0]);

await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value as string;
console.log(`tenant DID: ${tenantDid}   trust=${attestation}`);

const baseUrl = getNodeUrl();
console.log(`node: ${baseUrl}`);
const tenant = new TenantClient({
  environment: 'testnet',
  t3n: t3n as never,
  tenantDid,
  baseUrl,
  endpoint: baseUrl,
});

// 1. The tenant must be admitted before it can own contracts. On testnet this
//    is self-serve and idempotent, so claiming an already-admitted tenant is
//    the normal path, not an error.
try {
  show('tenant.me', await tenant.tenant.me());
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`tenant.me failed (${message}) — attempting self-admit`);
  show('tenant.claim', await tenant.tenant.claim());
}

// 2. Register the compiled contract.
if (!process.argv.includes('--skip-register')) {
  const wasm = new Uint8Array(readFileSync(WASM));
  console.log(`registering ${TAIL}@${VERSION} (${wasm.byteLength} bytes)`);
  show('contracts.register', await tenant.contracts.register({ tail: TAIL, version: VERSION, wasm }));
}

show('contracts.list', await tenant.contracts.list());

// 3. Execute it. The denial case is exercised too: a shipped order must come
//    back decided, not errored — that is the whole point of putting the rule
//    in the enclave rather than trusting the caller to have applied it.
for (const input of [
  {
    order_id: 'ORD-1002',
    order_status: 'processing',
    from_address_ref: 'addr_alex_home',
    to_address_ref: 'addr_alex_office',
    proposal_id: 'prop_demo_allowed',
  },
  {
    order_id: 'ORD-1001',
    order_status: 'shipped',
    from_address_ref: 'addr_alex_home',
    to_address_ref: 'addr_alex_office',
    proposal_id: 'prop_demo_denied',
  },
]) {
  const started = Date.now();
  const result = await tenant.contracts.execute(TAIL, {
    version: VERSION,
    functionName: FUNCTION,
    input,
  });
  console.log(`\nexecute ${input.order_id} (${input.order_status}) — ${Date.now() - started} ms`);
  show('  result', result);
}

// 4. Read the node's own record of what just ran.
try {
  const log = await (t3n as unknown as {
    getActivityLog: (o: unknown) => Promise<unknown>;
  }).getActivityLog({ limit: 5 });
  show('\nactivity log (newest first)', log);
} catch (err) {
  console.log(`\ngetActivityLog unavailable: ${String(err)}`);
}
