// Task 0 preflight: one authenticated Terminal 3 call, copied from the official Quickstart
// (docs/terminal3/quickstart.md). Prints only the tenant DID; never prints the key.
//
// Usage (from repo root):
//   pnpm add -D @terminal3/t3n-sdk tsx   # once, at the root (plain Node, no bundler)
//   npx tsx scripts/preflight/terminal3-smoke.mts
//
// Reads T3N_API_KEY from apps/api/.env (or the shell environment).
import { readFileSync } from 'node:fs';
import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
} from '@terminal3/t3n-sdk';

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

const T3N_API_KEY = readEnvKey();
if (!T3N_API_KEY || T3N_API_KEY.startsWith('<')) {
  console.error('Set T3N_API_KEY in apps/api/.env (claim it at https://www.terminal3.io/claim-page).');
  process.exit(2);
}

setEnvironment('testnet');
const started = Date.now();
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(T3N_API_KEY);

// Preferred: pin the cluster's signed trust manifest (attestation verified).
// Observed 2026-09-07: SDK 5.x requires `rtmr1_allowlist`, which the testnet manifest does not
// yet include -> "Trust manifest ... is malformed". Set T3N_UNSAFE_TRUST=1 to fall back to
// `{ unsafe_trust_server: true }` (skips TEE attestation pinning; identity/auth still real).
let trustAnchor: Parameters<typeof T3nClient.prototype.constructor>[0]['trustAnchor'];
let trustMode = 'pinned-manifest';
try {
  trustAnchor = await fetchTrustedManifest('testnet');
} catch (err) {
  if (process.env.T3N_UNSAFE_TRUST !== '1') {
    console.error(String(err));
    console.error('Re-run with T3N_UNSAFE_TRUST=1 to verify the key without attestation pinning.');
    process.exit(1);
  }
  trustAnchor = { unsafe_trust_server: true };
  trustMode = 'unsafe_trust_server (attestation NOT verified)';
}

const t3n = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, T3N_API_KEY) },
});

await t3n.handshake();
const did = await t3n.authenticate(createEthAuthInput(address));
const tenantDid = did.value;

console.log(`Connected as: ${tenantDid} (${Date.now() - started} ms) trust=${trustMode}`);
console.log(tenantDid?.startsWith('did:t3n:') ? 'TERMINAL3 PREFLIGHT: PASS' : 'TERMINAL3 PREFLIGHT: FAIL');
process.exit(tenantDid?.startsWith('did:t3n:') ? 0 : 1);
