# Task 12 — A protected TEE contract, and a real provider reference
Agent/role: integration   Branch: task-12-tee-contract   Date: 2026-09-08 (UTC)

This closes the item every earlier handoff carried forward: **no protected TEE
contract had ever executed**, so `evidence.provider_reference` was `null` and
the Terminal 3 integration proved an authenticated identity and nothing else.

## What now runs, and what it proves

`contracts/parcelguard-authz` is a WASM component (Rust, `wasm32-wasip2`) that
makes the address-change permission decision **inside the enclave**. It is
registered on testnet as `z:d8cc263e…:parcelguard-authz`, contract id **928**.

It imports only `tenant-context` and `logging`. No `http`, no `kv-store`. It
therefore reaches nothing outside itself, which means there is no egress grant
to configure and no stored secret it could leak — and, as it turns out, no
enforcement point for an agent grant either (see the open question below).

**What executing it proves:** the decision is made somewhere ParcelGuard cannot
rewrite, and the node keeps its own row for the call — caller, function,
outcome, and a SHA-256 of the entry.

**What it does not prove**, stated in `wit/world.wit` rather than left to the
demo narration: the enclave has no access to this application's database. It
cannot confirm the order exists, that the customer owns it, or that the status
it was handed is the status on the row. It rules on the facts it is given.
Ownership stays enforced in `policyService.ts`, the only party that can see
the data. The enclave is a **second, independent check on the rule**, not a
replacement for the first one.

## Evidence, before and after

```
before   {"source":"terminal3","agent_did":"did:t3n:d8cc263e…",
          "provider_reference":null,"verified":false}

after    {"source":"terminal3","agent_did":"did:t3n:d8cc263e…",
          "provider_reference":"t3n:928:203544","verified":false}
```

`provider_reference` is `t3n:<contract_id>:<seq_no>` — the contract's
registration id and the store sequence number at the moment of the decision,
both assigned by the node and read out of the response. Nothing is composed
locally.

It is **not** the id of the node's activity-ledger row for the same call. That
row is written after the decision returns and carries its own, slightly later
seq_no plus the SHA-256. Observed on testnet: decision `202946` → ledger row
`202949`. An earlier draft of the code comment claimed the reference located
the ledger row directly; that was wrong and is corrected.

`verified` is still **false**. Attestation pinning is unchanged from Task 8 —
testnet's trust manifest still publishes `rtmr3_allowlist` where SDK 5.x wants
`rtmr1_allowlist`, so the anchor is still `unsafe_trust_server`.

## Commands actually run (with result)

```
cargo test  (host target)      -> 5 passed   policy logic, incl. fail-closed
cargo build --target wasm32-wasip2 --release -> parcelguard_authz.wasm, 140098 B
contracts.register             -> contract_id 928
execute ORD-1002 processing    -> allowed/ADDRESS_CHANGE_AUTHORIZED   411 ms
execute ORD-1001 shipped       -> denied/ORDER_NOT_EDITABLE           298 ms
pnpm -r test                   -> contracts 13, api 38
pnpm typecheck, pnpm build     -> exit 0
```

### Through the product

| Where | Confirm latency | provider_reference |
|---|---|---|
| local server, `TERMINAL3_MODE=live` | 1.83 s | `t3n:928:202946` |
| Vercel Preview, cold instance | **6.74 s** | `t3n:928:203540` |
| Vercel Preview, warm instance | **0.92 s** | `t3n:928:203544` |

The cold number is the one to plan a demo around. It is up from Task 8's 3.5 s
because the contract execution is a second round trip on top of the session.
Warm confirms got *faster* than Task 8 measured, because the session is reused.

`scripts/t3n/activity.mts` reads the node's own record:

```
seq 202949  human  parcelguard-authz::authorize-address-change  success  66e77a92…
seq 202925  human  parcelguard-authz::authorize-address-change  success  9db43c83…
```

## Two defects found while writing the tests

1. **The response shape was validated in the wrong place.** The check lived
   inside `connectWithSdk`, so it only covered the production executor. An
   unreadable response reached the decision branch and was treated as a
   **denial** — which claims the enclave decided when it had not. Moved to
   `authorize`, the boundary the response actually crosses.
2. **The adapter ruled on stale facts.** It passed the order row the proposal
   was written against. Between proposal and confirm an order can ship, which
   is precisely the case a second check exists for. `confirmProposal` now
   re-reads the order.

## Open question, not yet answered — agent grants may not be enforced here

Terminal 3's Agent Auth docs say enforcement happens at the egress boundary:

> An agent with no matching grant can still call the contract — the call just
> fails at the point it tries to reach the network, with `host/http.egress_denied`.

`parcelguard-authz` makes no outbound calls. So an ungranted agent may well be
able to call it, which would make the grant **recorded but not enforced** for
this contract. That would not be a bug in the grant; it would be a fact about
where the boundary sits, and the demo must not claim otherwise.

`scripts/t3n/agent-flow.mts` answers it by experiment rather than assumption:
it calls the contract as an ungranted agent **first**, then issues the grant,
then calls again, then prints the ledger. It needs `AGENT_KEY` — a second key
from the claim page, since an agent DID's credits are separate and start at
zero. The script refuses to run if `AGENT_KEY` equals `T3N_API_KEY`, because
one identity used twice demonstrates nothing.

## Not done / blocked

- **`AGENT_KEY` is not available yet**, so nothing in Task 12 exercises a
  separate agent identity. The ledger currently records every call as
  `caller_type: human`, `actor` = the tenant.
- **The ledger's `caller_type` comes from an agent-registry check on the
  actor**, so a bare second key may still report `human` until the agent is
  registered (agent card, per `docs/terminal3/register-agent.md`). Whether
  registration is needed for `caller_type: agent` is untested.
- **Attestation still unverified** — unchanged, and nobody has asked Terminal 3
  devrel about the malformed testnet manifest.
- **The contract version is pinned in two places** — `CONTRACT_VERSION` in
  `terminal3Adapter.ts` and the registered `tail@version`. Deliberate: the app
  cannot execute a version nobody deployed. Bumping means re-registering *and*
  editing the constant.
- **A timeout during `authorize` still maps to `outcome_unknown`.** That rule
  was written when the Terminal 3 call was the dispatch step. The contract has
  no side effects outside the enclave and the order write happens after it, so
  a timeout there provably leaves the customer's order untouched — meaning
  `failed` would be more honest than "we don't know". Not changed here because
  it is a behaviour change beyond this task; flagged for a decision.

## Contract change requests

- none. `Evidence` already models this: `provider_reference` was always
  `string | null`, and it is now a string.

## Notes for the next lane

- **Demo timing changed.** Cold confirm is ~6.7 s on Vercel. Do one confirm
  before the audience is watching, or narrate the cold start.
- **Rollback is still one variable.** `TERMINAL3_MODE=mock` skips the SDK, the
  contract, and the WASM load entirely.
- **`npx tsx scripts/t3n/activity.mts`** is the thing to show if anyone asks
  whether the evidence is real: it is Terminal 3's record, not ours.
- **Rebuilding the contract** needs the Rust toolchain: `rustup target add
  wasm32-wasip2`, then `cargo build --target wasm32-wasip2 --release` in
  `contracts/parcelguard-authz`. Windows needs the MSVC C++ build tools for
  the host half of the build (proc macros); Visual Studio 2022 Community with
  the C++ workload is enough.
