# Task 8 — Terminal 3 adapter
Agent/role: integration   Branch: task-8-terminal3   Date: 2026-09-08 (UTC)

## What this integration actually proves — read this first

A confirmed address change now carries evidence from a **real Terminal 3 session**: `handshake()` → `authenticate()` → a platform-assigned tenant DID, read back from the response and never constructed. The API key, the SIWE signature and the DID are genuine, and the session is opened from the deployed Vercel Function as well as locally.

It does **not** prove either of the following, and the code says so rather than implying otherwise:

1. **No protected TEE contract was executed.** A protected action needs a registered WASM contract (`tenant.contracts.register` / `execute`), which means a Rust `wasm32-wasip2` build and a separate agent key with its own credits — explicitly out of scope in PLAN.md §10 and TASKS.md Task 8 item 1. Terminal 3 therefore issued no operation id, so `evidence.provider_reference` is **null**. A locally-built string there would read as provider evidence and would be a lie in precisely the place this project asks people to trust it.
2. **TEE attestation is not verified.** `fetchTrustedManifest('testnet')` still fails: `Trust manifest at https://cn-api.sg.testnet.t3n.terminal3.io/api/trust-manifest is malformed.` SDK 5.x's `isSignedTrustManifest` requires `rtmr1_allowlist`; the testnet manifest publishes only `rtmr3_allowlist`. The only anchor that connects is `{ unsafe_trust_server: true }`, which skips attestation pinning. So `evidence.verified` is **false**, `IntegrationStatus.terminal3.identity_verified` is **false**, and the UI renders "Not verified".

Honest one-line summary for a demo: *an authenticated agent identity authorised this change; the TEE attestation behind that identity could not be verified today.*

## Completed

- [x] `@terminal3/t3n-sdk@5.10.0` added to `apps/api`.
- [x] `apps/api/src/adapters/terminal3Adapter.ts` implements the `Terminal3Adapter` interface Task 5 shipped. The SDK is imported **lazily** inside the connect path, so a deployment running in mock mode never loads the WASM component.
- [x] Wired into `proposalService.confirmProposal`: dispatched **after** the atomic `pending → executing` claim and **before** the order row is updated.
- [x] Failure semantics (Task 8 item 3): a refused session → proposal `failed` + `address_change/failed` audit row + `TERMINAL3_UNAVAILABLE` (502); a hang past 15 s → proposal `outcome_unknown` + `address_change/outcome_unknown` audit row + `ACTION_OUTCOME_UNKNOWN` (504, **not** retryable). Never a blind retry (PLAN.md §8.4).
- [x] `mode()` returns `live` only once a real session exists; configured-but-unproven reports `unavailable`.
- [x] One session is cached per process and reused across confirms; a failed attempt drops the cache so the next confirm retries instead of replaying a stale rejection.
- [x] 7 adapter unit tests with the connect step injected, so they assert the evidence and failure mapping without loading WASM.

## Commands actually run (with result)

- `npx tsx scripts/preflight/terminal3-smoke.mts` → **FAIL**, `Trust manifest … is malformed.` (unchanged from Task 0, re-checked today)
- `T3N_UNSAFE_TRUST=1 npx tsx scripts/preflight/terminal3-smoke.mts` → **PASS**, `Connected as: did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba (420 ms)`
- `pnpm --filter api test` → **33 passed** (17 integration + 9 Azure + 7 Terminal 3), exit 0
- `pnpm typecheck`, `pnpm build`, `vercel build` → exit 0

### Local confirm with `TERMINAL3_MODE=live`

```
health before: {"api":"ok","model":"mock","terminal3":"unavailable"}
confirm: 200 in 516ms -> "succeeded"
  action address_change/allowed/ADDRESS_UPDATED
    evidence={"source":"terminal3","verified":false,
              "agent_did":"did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba",
              "provider_reference":null}
health after: {"api":"ok","model":"mock","terminal3":"live"}
integration: terminal3 {mode:"live", agent_did:"did:t3n:d8cc…", identity_verified:false}
```

### Vercel compatibility (Task 8 item 5) — **works**

The documented risk was the SDK's WASM component breaking under a bundler. It does not here:

- `vercel build` traces the SDK **and** its single WASM artifact into the function bundle: `node_modules/.pnpm/@terminal3+t3n-sdk@5.10.0…/dist/wasm/generated/session.core.wasm`. That is the only `.wasm` the installed package ships, so nothing is missing.
- No bundling step is involved — `api/index.ts` imports the built `apps/api/dist`, and Vercel traces `node_modules` as-is, so the SDK stays effectively external. If a `tsup` step is ever added, mark `@terminal3/t3n-sdk` **external**.
- No filesystem writes outside the SDK's own package directory were needed.
- `TERMINAL3_MODE=live` was set for the **Preview** environment and the branch redeployed. Against the Preview URL:

```
health (fresh instance): {"api":"ok","model":"unavailable","terminal3":"unavailable"}
confirm (3.5 s):         200 -> "succeeded"
  address_change/allowed/ADDRESS_UPDATED
    evidence={"source":"terminal3","verified":false,
              "agent_did":"did:t3n:d8cc263e050eb3697ddf0cdf03a995e388a5aaba",
              "provider_reference":null}
health after:            {"api":"ok","model":"live","terminal3":"live"}
```

That satisfies the "Done when": **the Vercel Preview shows `terminal3: live`**, with a real DID, from the deployed function. The 3.5 s includes a cold SDK load plus handshake and authenticate; warm instances reuse the session.

## Not done / blocked

- **No protected TEE contract.** See the top section. Doing it needs: a second key from the claim page (an agent DID's credits are separate from the tenant's and start at zero), `git clone Terminal-3/z-tenant-flight`, `rustup target add wasm32-wasip2`, `cargo build --release`, then `tenant.contracts.register` + `execute`. The SDK methods are confirmed in `docs/terminal3/reference.md`; the blocker is build-time and credits, not knowledge. Until then `provider_reference` stays null.
- **Attestation pinning is broken on testnet, not by us.** Nobody has asked Terminal 3 devrel yet — TASKS.md Task 8 item 1 says to ask first. Worth a message to https://t.me/terminal3developer or devrel@terminal3.io: *"testnet trust manifest (version 1787800421, signed 2026-08-27) has `rtmr3_allowlist` but SDK 5.x `isSignedTrustManifest` requires `rtmr1_allowlist` — which SDK version matches the current testnet manifest?"* If they ship a fixed manifest, `verified` flips to true with **no code change**: the adapter already prefers the pinned manifest and only falls back after it throws.
- **Production is still `TERMINAL3_MODE=mock`** at the time of writing. Preview is `live`. Flipping Production is a Task 9/11 decision; the code path is identical and proven on Preview.
- The 15 s adapter timeout is a guess, not a measured p99. Observed: 420–516 ms local, 3.5 s cold on Vercel.
- Terminal 3 credit consumption was not measured. Authentication appeared not to consume credits across roughly a dozen sessions, but nothing was checked against a balance endpoint.

## Contract change requests

- none. `Evidence` already models exactly what is true here: `source: "terminal3"`, a real `agent_did`, a null `provider_reference`, and `verified: false`.

## Notes for the next lane

- **Task 9 (deploy):** to make Production match Preview, `vercel env rm TERMINAL3_MODE production` then add `live`. Nothing else changes. If Terminal 3 has an outage during the demo, setting it back to `mock` is a one-variable rollback — the local stand-in returns `source: "local"` evidence and confirms keep working.
- **Task 10 (verification):** the honest sentence for the walkthrough is at the top of this file. Do not let a slide say "TEE-verified"; the UI already renders "Not verified" and the action detail sheet shows `provider_reference: Not available`.
- **The confirm path now has three terminal outcomes**, not two: `succeeded`, `failed`, and `outcome_unknown`. The frontend already renders all three (Design.md §8.2), including the rule that an `outcome_unknown` card offers no Retry button.
- **A latent defect was fixed here**, worth knowing because it was invisible before: `authorize()` previously could not throw — the local stand-in always resolved — so `confirmProposal` had no error path after claiming `executing`. A real adapter that throws would have left the proposal in `executing` permanently, and every later confirm would answer `409 REQUEST_IN_PROGRESS` with nothing able to clear it, since a Vercel Function does no background work. Adding a real provider is exactly what exposes that class of bug.
