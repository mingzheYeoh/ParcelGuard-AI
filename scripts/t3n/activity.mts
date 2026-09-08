// Reads Terminal 3's own record of what this tenant's contracts did.
//
// This is the other half of `evidence.provider_reference`: the app stores a
// reference, and this shows the node's independent row for the same call —
// caller, function, outcome, and a SHA-256 of the entry.
//
//   npx tsx scripts/t3n/activity.mts            # last 10 rows
//   npx tsx scripts/t3n/activity.mts 20         # last 20
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

process.on('unhandledRejection', (err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

const key =
  process.env.T3N_API_KEY ??
  readFileSync(new URL('../../apps/api/.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('T3N_API_KEY='))
    ?.slice('T3N_API_KEY='.length)
    .trim();
if (!key) {
  console.error('T3N_API_KEY is not set.');
  process.exit(2);
}

setEnvironment('testnet');
const wasmComponent = await loadWasmComponent();
const address = eth_get_address(key);
let trustAnchor: unknown;
try {
  trustAnchor = await fetchTrustedManifest('testnet');
} catch {
  trustAnchor = { unsafe_trust_server: true };
}
const t3n = new T3nClient({
  trustAnchor,
  wasmComponent,
  handlers: { EthSign: metamask_sign(address, undefined, key) },
} as ConstructorParameters<typeof T3nClient>[0]);
await t3n.handshake();
await t3n.authenticate(createEthAuthInput(address));

// Credit balance first: an agent identity's credits are separate from its
// tenant's and start at zero, so an exhausted balance is a demo-killing
// failure mode that looks like an outage.
try {
  const usage = await (
    t3n as unknown as { getUsage: (o?: unknown) => Promise<{ balance?: Record<string, unknown> }> }
  ).getUsage({ limit: 1 });
  console.log(`balance: ${JSON.stringify(usage.balance)}
`);
} catch (err) {
  console.log(`balance unavailable: ${err instanceof Error ? err.message : String(err)}
`);
}

const limit = Number(process.argv[2] ?? 10);
const report = await (
  t3n as unknown as { getActivityLog: (o: unknown) => Promise<{ entries: Record<string, unknown>[] }> }
).getActivityLog({ limit });

for (const e of report.entries) {
  const contract = String(e.contract).split(':').pop();
  console.log(
    `seq ${e.seq_no}  ${String(e.caller_type).padEnd(5)}  ${contract}::${e.function}  ${e.outcome}  ${String(e.hash).slice(0, 16)}…`,
  );
}
