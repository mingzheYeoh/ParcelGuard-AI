# Running the ParcelGuard demo

Everything here has been executed against the deployed app. Numbers are measured, not estimated.

**Live:** https://parcel-guard-ai.vercel.app

---

## 1. Fifteen minutes before

### Reset the data

The demo needs `ORD-1002` sitting at **Home**. A rehearsal moves it to Office, and the assistant then correctly answers *"that is already your Office address"* — right behaviour, dead demo. This is what broke the first rehearsal, so it is step one.

```powershell
cd "C:\Users\Yeoh Ming Zhe\Documents\ParcelGuard-AI"
$env:DATABASE_URL = (Select-String -Path .vercel\.env.production.local -Pattern '^DATABASE_URL=' | Select-Object -First 1).Line -replace '^DATABASE_URL=','' -replace '^"|"$',''
cd apps\api
pnpm db:seed
Remove-Item Env:\DATABASE_URL
```

Expected:

```
Seeding ep-withered-star-….neon.tech
Seed complete: cus_demo_alex (ORD-1001, ORD-1002, ORD-1003, ORD-1004), cus_demo_other (2 denial fixture).
```

> **The first line is the check.** Without an explicit `DATABASE_URL` the seed silently rewrites your **local** database and finishes in ~1.6 s. The remote seed takes ~14 s. Under two seconds means you did not touch production.
>
> **Delete the variable afterwards.** `dotenv` does not override an existing env var, so a leftover production `DATABASE_URL` makes `pnpm test` run against production. That has already happened once in this project.

### Warm the function up

A cold Vercel instance takes **4.4–6.7 s** on the first confirm — SDK WASM load, Terminal 3 handshake, then the contract call. Warm it is **0.9 s**.

```bash
node scripts/testcases.mjs https://parcel-guard-ai.vercel.app
```

This runs all 14 checks (~40 s), warms the instance, and tells you the app is healthy. Then **re-seed** (it consumed the change) and do not touch anything else.

### Have these ready

- Browser at https://parcel-guard-ai.vercel.app, **Demo details** panel closed
- A terminal in the repo root
- The public agent-card URL in a second tab (§4)

---

## 2. The two-minute walkthrough

The point of this product is not that an AI can change an address. It is that **it cannot change one it should not** — and that you can check afterwards who authorized it.

### 0:00 — Frame it

> "This is an order-support assistant. It can look up orders and re-route deliveries. The interesting part is not what it can do — it's what it can't, and how you check."

### 0:15 — A normal lookup

Type:

```
Where is my order ORD-1002?
```

An `order_summary` card appears in ~2.5 s. Say:

> "Every fact on that card came from a tool call against the database. The model isn't allowed to state an order fact it didn't read — no invented tracking numbers, no guessed ETAs."

### 0:40 — The change, in two steps

Type:

```
Please change the address of ORD-1002 to Office
```

A **proposal** card appears — not a confirmation.

> "It has not changed anything. It's proposing. Nothing is written until a person clicks Confirm — that's the boundary."

Click **Confirm change**. Green *Address updated*, and two rows appear in Recent actions.

### 1:10 — The refusal

Type:

```
Change the address of ORD-1001 to Office
```

> "That one already shipped. The assistant doesn't apologise and try again — it's refused, and the refusal is recorded as a denial with a reason code. The same rule is enforced a second time inside a trusted enclave, which I'll show you."

### 1:30 — The evidence

Open the address-change row in **Recent actions**.

> "Source: Terminal 3. That's the DID of the agent identity that authorized it — the assistant's own identity, not the operator's. The provider reference is the contract id and sequence number Terminal 3 assigned to the execution.
>
> And it says **Verified** — the session is pinned to the cluster's signed trust manifest. That pin checks RTMR3, which is the weaker of the two measurements Terminal 3 defines; RTMR1 is not published on testnet yet. So: attested, not fully attested.""

### 1:50 — Close

> "An authenticated agent identity authorized this change, inside an enclave whose measurement we pinned against Terminal 3's signed manifest. That pin covers RTMR3, not the stronger RTMR1, which testnet does not publish yet. Everything you saw is real, and that is the one caveat."

---

## 3. The fourteen checks

`scripts/testcases.mjs` runs these against any deployment. Each asserts a specific card type or error code — a check that only proves the server is awake would have passed through every defect this project actually shipped.

```bash
node scripts/testcases.mjs                                    # local, :3001
node scripts/testcases.mjs https://parcel-guard-ai.vercel.app # production
node scripts/testcases.mjs https://parcel-guard-ai.vercel.app 9   # one case
```

Exit code is the number of failures.

| # | Case | What would be broken if it failed |
|---|------|-----------------------------------|
| 1 | Session and workspace load | The customer boundary — another customer's orders in the list |
| 2 | Lookup, processing order | The read path, and facts coming from tools |
| 3 | Lookup, delivered multi-item order | Item lists and multi-step timelines |
| 4 | Proposal writes nothing | The whole premise: no mutation before confirmation |
| 5 | Confirm applies the change once | The write path and the optimistic-concurrency guard |
| 6 | Evidence names a real agent + reference | The claim the project rests on |
| 7 | Replayed Idempotency-Key doesn't act twice | Retry safety — a double address change |
| 8 | Confirm without a key is refused | The header that makes a retry safe can't be optional |
| 9 | Shipped order can't be re-routed | The permission rule (journey D) |
| 10 | Delivered order can't be re-routed | The rule is "only processing", not "not shipped" |
| 11 | Foreign order is invisible, not just refused | A different error for a real id confirms it exists |
| 12 | Foreign shipped order leaks no status | Ownership must be checked before editability |
| 13 | A change to the current address is refused | Pointless writes, and the enclave's `ADDRESS_UNCHANGED` |
| 14 | Bypass instruction is refused | Prompt injection (journey E) |

Last full run against production: **14/14**.

> Cases 4–7 change data. Re-seed before a demo.

### The fixtures behind them

| Order | Owner | Status | Ships to | Exists for |
|---|---|---|---|---|
| ORD-1001 | Alex | shipped | Home | the refusal |
| ORD-1002 | Alex | processing | Home | the change that succeeds |
| ORD-1003 | Alex | delivered | Office | a second refusal, multi-item |
| ORD-1004 | Alex | processing | Office | a **spare** changeable order |
| ORD-2001 | other | processing | — | must 404 |
| ORD-2002 | other | shipped | — | must 404, status not disclosed |

ORD-1004 is the spare: if a rehearsal consumes ORD-1002 and there is no time to re-seed, run the live demo on ORD-1004 and say "move it to Home" instead.

---

## 4. Showing the Terminal 3 integration

Four commands. Run them from the repo root. None prints a key.

### The audience can verify this one themselves — no account, no key

```bash
curl https://cn-api.sg.testnet.t3n.terminal3.io/api/agent-card/did:t3n:82ae29ec8c2ad3ba36093db525795a594342a968
```

Returns the assistant's ERC-8004 registration card, served by Terminal 3:

```json
{"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
 "name":"ParcelGuard Assistant",
 "description":"Order-support assistant for ParcelGuard…",
 "services":[{"name":"DID","endpoint":"did:t3n:82ae29ec…","version":"v1"}]}
```

> "That's the agent's public identity. Anyone can resolve it. The DID in the audit trail is this one."

### Terminal 3's own record of what ran

```bash
npx tsx scripts/t3n/activity.mts 10
```

```
balance: {"available":19819907372,…,"credit_exhausted":false}

seq 203594  human  parcelguard-authz::authorize-address-change  success  f60e15afbd022761…
seq 203573  human  parcelguard-authz::authorize-address-change  success  3a9f1d2f63239638…
```

> "This is not our log. It's Terminal 3's ledger, read with our key. Each row has a SHA-256 of the entry."

The balance prints first because an exhausted credit balance fails like an outage.

### Deploy or re-deploy the enclave contract

```bash
# build (needs rustup + the wasm32-wasip2 target)
cd contracts/parcelguard-authz && cargo build --target wasm32-wasip2 --release && cd ../..

# register and execute both the allowed and denied paths
npx tsx scripts/t3n/deploy-contract.mts
npx tsx scripts/t3n/deploy-contract.mts --skip-register    # execute only
```

```
contracts.register -> contract_id 928, z:d8cc263e…:parcelguard-authz
execute ORD-1002 processing -> allowed/ADDRESS_CHANGE_AUTHORIZED   411 ms
execute ORD-1001 shipped    -> denied/ORDER_NOT_EDITABLE           298 ms
```

> "The permission rule runs inside the enclave. A shipped order is refused there too — and a refusal is a successful execution that returned 'denied', so it lands in the ledger as a decision, not as a crash."

### The agent identity and its grant

```bash
AGENT_KEY=0x… npx tsx scripts/t3n/agent-flow.mts
AGENT_KEY=0x… npx tsx scripts/t3n/register-agent-card.mts
```

`agent-flow` calls the contract as an **ungranted** agent *before* issuing the grant. Run it only if you are prepared to say what it prints (§6).

---

## 5. Answering "is any of this actually real?"

| Question | Answer | Show them |
|---|---|---|
| Is the model real? | Azure OpenAI, tool-calling | `GET /api/v1/health` → `"model":"live"` after one turn |
| Is the database real? | Neon Postgres | order versions increment across confirms |
| Is Terminal 3 real? | Real session, real DID, real contract execution | the public agent card; `activity.mts` |
| Is the enclave decision real? | Yes — contract 928, `z:…:parcelguard-authz` | `deploy-contract.mts --skip-register` |
| Is the attestation verified? | **Pinned against the signed manifest — RTMR3 only.** | the UI renders "Verified"; say what it covers |

---

## 6. What not to claim

Each of these was tested and came back negative. Saying otherwise turns a solid demo into a false one.

**"Fully TEE-verified"** — the manifest *is* pinned and `evidence.verified` is `true`, but the pin covers **RTMR3 only**. Testnet publishes no `rtmr1_allowlist`, and the SDK's own types call that one "the real rootfs-integrity signal". Say "attested against the signed manifest, RTMR3", not "TEE-verified" unqualified.

This also depends on the SDK version, which is worth knowing before someone upgrades it: **5.2.x accepts an rtmr3-only manifest; 5.3+ requires rtmr1 and rejects testnet's outright**, falling back to `unsafe_trust_server` — no attestation at all. The dependency is pinned to `5.2.0` for exactly this reason. Verified by installing both and calling `fetchTrustedManifest('testnet')`:

```
5.2.0  -> PINNED MANIFEST
5.12.0 -> Trust manifest at …/api/trust-manifest is malformed.
```

**"The agent grant restricts what the assistant can do"** — it does not, for this contract. Terminal 3 enforces grants at the egress boundary, and `parcelguard-authz` makes no outbound calls. Measured:

```
1. agent calls with NO grant   -> ALLOWED
2. tenant issues the grant     -> tx:121:203568
3. agent calls WITH the grant  -> ALLOWED
```

The grant is real, scoped to one contract and one function, and revocable — it is simply not the thing that gates this call. What actually constrains the assistant is the two-tool allowlist, `policyService.ts`, and the enclave rule.

**"The ledger proves an agent, not a person, acted"** — `caller_type` still reads `human`. That field comes from an agent-registry check, and the registry record is written by `create-agent` on `tee:organisation/contracts`, which needs an organisation. Probed: `OrgPolicyNotInitialised`. A self-claimed key and an org-provisioned agent are different mechanisms.

**"The enclave verifies the order"** — it cannot. It has no access to the database. It rules on the facts it is handed. Ownership stays enforced in `policyService.ts`. The enclave is a second, independent check on the *rule*, not on the *facts*.

---

## 7. When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| Demo details says **Not connected** | Cold instance; `mode()` reports `live` only after a real call succeeds in that process | Do one chat turn first. It is honest, not broken. |
| "That is already your Office address" | ORD-1002 was consumed by a rehearsal | Re-seed, or switch to ORD-1004 and say "to Home" |
| Confirm takes ~6 s | Cold start | Warm it before the audience arrives (§1) |
| Seed finishes in ~1.6 s | It hit your **local** database | Check the `Seeding …` line names `neon.tech` |
| Tests fail against production data | A leftover `DATABASE_URL` in the shell | `Remove-Item Env:\DATABASE_URL` |
| Terminal 3 misbehaves mid-event | — | Set `TERMINAL3_MODE=mock` in Vercel and redeploy. The app keeps working and reports `source: "local"` evidence honestly. Same for `MODEL_PROVIDER=mock`. |

---

## 8. Running it locally

```bash
pnpm install
cp apps/api/.env.example apps/api/.env     # fill in the values
cd apps/api && pnpm db:migrate && pnpm db:seed && cd ../..
pnpm dev                                    # api :3001, web :5173
```

`apps/web/.env.example` sets `VITE_API_MODE`. `mock` runs entirely on MSW with no backend; `live` talks to the API. Deployed builds are always `live`.

To run the enclave contract locally, add to `apps/api/.env`:

```
TERMINAL3_MODE=live
T3N_AGENT_KEY=<the assistant's key>
T3N_TENANT_DID=did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba
```

Without `T3N_AGENT_KEY` the contract is called with the tenant's identity instead, and `evidence.agent_did` names the operator rather than the assistant.

---

## 9. Rotating the agent key

The assistant's key is a plain secp256k1 private key. To replace it:

1. Claim a new key at the Terminal 3 claim page (a fresh key comes with its own credits, separate from the tenant's).
2. `AGENT_KEY=0x… npx tsx scripts/t3n/register-agent-card.mts` — publishes the card for the new DID.
3. `vercel env rm T3N_AGENT_KEY preview` / `production`, then add the new value; redeploy.
4. The contract is unaffected — it belongs to the tenant DID, not the agent.

The old DID's card can be withdrawn with `--unpublish`.
