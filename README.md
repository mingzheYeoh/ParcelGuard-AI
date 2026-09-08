# ParcelGuard AI

An AI support assistant that helps with your orders **and cannot exceed its permissions**.

Customers ask about their orders in natural language. The model picks tools; the backend enforces ownership and business rules; a protected contract inside a Terminal 3 enclave re-decides every address change; and each action is recorded with evidence you can check against the provider's own ledger.

**Live: https://parcel-guard-ai.vercel.app**

---

## What is actually true

| Part | State | How to check it yourself |
|---|---|---|
| Frontend | done | open the app; 390 px and 1440 px both verified |
| PostgreSQL (Neon) | done | 11 tables, migrations + idempotent seed |
| Backend | done | `pnpm -r test` → 13 contract + 39 API tests against a real database |
| Model — Azure OpenAI | **live** | `GET /api/v1/health` → `"model":"live"` after one turn |
| Terminal 3 session + DID | **live** | evidence shows a real `did:t3n:…` |
| Protected TEE contract | **executes** | `npx tsx scripts/t3n/deploy-contract.mts --skip-register` |
| TEE attestation | **not verified** | the UI says "Not verified" — see below |
| End-to-end behaviour | **14/14** | `node scripts/testcases.mjs https://parcel-guard-ai.vercel.app` |

### The permission boundary, concretely

A confirmed address change opens a real Terminal 3 session **and executes a protected contract** — `z:<tid>:parcelguard-authz` (contract id 928), a Rust/WASM component that makes the permission decision **inside the enclave**. The evidence stores the agent DID and a `provider_reference` built from the contract id and sequence number the node assigned to that execution. Nothing in it is composed locally.

The enclave has **no access to this database**. It cannot confirm the order exists or that the customer owns it — it rules on the facts it is handed. Ownership stays enforced in `apps/api/src/services/policyService.ts`. The enclave is a second, independent check on the *rule*, not on the *facts*.

### What this project does not claim

- **Not TEE-verified.** `fetchTrustedManifest('testnet')` fails today — SDK 5.x requires `rtmr1_allowlist`, testnet publishes only `rtmr3_allowlist` — so the anchor falls back to `unsafe_trust_server`, `evidence.verified` is `false`, and the UI renders "Not verified". A fixed manifest flips this to true with no code change.
- **The agent-auth grant enforces nothing here.** Terminal 3 gates grants at the egress boundary and this contract makes no outbound calls. Measured by calling as an *ungranted* agent before issuing the grant: allowed either way. What constrains the assistant is the two-tool allowlist, `policyService.ts`, and the enclave rule.
- **The ledger says `caller_type: human`.** That field reads an agent-registry record written by `create-agent` on `tee:organisation/contracts`, which requires an organisation this tenant does not have.

Full reasoning and the commands that produced each result: **[docs/DEMO.md](docs/DEMO.md) §6**.

---

## Verify it in one command

```bash
node scripts/testcases.mjs https://parcel-guard-ai.vercel.app
```

Fourteen checks, each asserting a specific card type or error code — not merely a 200. They cover the customer boundary, that a proposal writes nothing, idempotent confirms, shipped/delivered refusals, foreign-order invisibility, and a prompt-injection attempt. Exit code is the number of failures.

> Cases 4–7 change data. Re-seed first (`pnpm db:seed` in `apps/api`).

---

## Running it

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # fill in the values
cd apps/api && pnpm db:migrate && pnpm db:seed && cd ../..
pnpm dev                                     # api :3001, web :5173
```

`VITE_API_MODE=mock` runs the frontend entirely on MSW with no backend; `live` talks to the API. Deployed builds are always `live`.

### The Terminal 3 scripts

| Command | What it does |
|---|---|
| `npx tsx scripts/t3n/activity.mts` | Terminal 3's own ledger of contract calls — credit balance, seq, SHA-256 per entry |
| `npx tsx scripts/t3n/deploy-contract.mts` | registers the WASM contract, then runs the allowed and denied paths |
| `AGENT_KEY=… npx tsx scripts/t3n/agent-flow.mts` | measures whether an agent grant is enforced (it is not — see above) |
| `AGENT_KEY=… npx tsx scripts/t3n/register-agent-card.mts` | publishes the ERC-8004 agent card |

The assistant's public identity is resolvable by anyone, with no key:

```bash
curl https://cn-api.sg.testnet.t3n.terminal3.io/api/agent-card/did:t3n:82ae29ec8c2ad3ba36093db525795a594342a968
```

Rebuilding the contract needs `rustup target add wasm32-wasip2`, then `cargo build --target wasm32-wasip2 --release` in `contracts/parcelguard-authz`. On Windows the host half of the build needs the MSVC C++ workload.

---

## Layout

| Path | What |
|---|---|
| `apps/web` | React + Vite frontend |
| `apps/api` | Fastify backend, Drizzle, adapters for Azure and Terminal 3 |
| `packages/contracts` | Zod schemas, shared types, and the demo fixtures |
| `contracts/parcelguard-authz` | the Rust/WASM contract that runs in the enclave |
| `api/index.ts` | the Vercel Function wrapper |
| `scripts/` | the 14 end-to-end checks and the Terminal 3 tools |
| [PLAN.md](PLAN.md) | scope, journeys, data model, API contract, acceptance criteria |
| [Design.md](Design.md) | tokens, layout, components, interaction |
| [docs/DEMO.md](docs/DEMO.md) | **how to run the demo**, the 14 checks, what not to claim |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | local setup and PR workflow for contributors |
| `docs/terminal3/` | vendored Terminal 3 ADK reference |

---

## Notes

`GET /api/v1/health` reports `unavailable` on a cold function instance until a real call succeeds inside it. That is deliberate: an integration is reported live only once it has been proven in that process, never because it is configured. Do one chat turn before reading it.

A cold confirm takes 4.4–6.7 s (WASM load, handshake, contract call); warm, 0.9 s.

All orders, customers, and addresses are synthetic. No real personal data is stored or displayed.
