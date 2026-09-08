# Task 11 — Production promotion and demo rehearsal
Agent/role: lead   Branch: task-11-production   Date: 2026-09-08 (UTC)

## Completed

- [x] `main` merged → Production deployed. Live at **https://parcel-guard-ai.vercel.app**
- [x] Task 10 items 1, 2 and 5 re-run **on the Production URL**.
- [x] `db:seed` run against the Production database (idempotent), ORD-1002 back on `Home` at version 1.
- [x] PLAN.md §15 two-minute demo rehearsed twice, with the reset timed.
- [x] README status table rewritten from verified results.

## Commands actually run (with result)

### Task 10 item 5 — bundle audit on Production

The JavaScript Production actually serves:

```
AZURE: 0   T3N: 0   DATABASE_URL: 0   SESSION_SECRET: 0   api-key: 0   msw: 0
```

### Task 10 item 1 — journeys on Production

| Journey | Latency | Cards |
|---|---|---|
| A owned lookup | 2.3 s | `order_summary` |
| B change unshipped | 2.7 s | `address_change_proposal` |
| C unauthorized | 2.7 s | `action_result/ORDER_UNAVAILABLE` |
| D shipped denial | 5.3 s | `action_result/ORDER_NOT_EDITABLE` |
| E bypass attempt | 2.8 s | none, `agent_refusal` recorded |

### Task 10 item 2 — idempotency on Production

```
first confirm                            -> succeeded, version 2
same key replayed                        -> identical body (True)
different key on the succeeded proposal  -> 200, stored result
key reused on a different proposal       -> 409
```

Also on Production: no cookie → `401`; unknown conversation → `404`; foreign order → `404`.

### Demo rehearsals (PLAN.md §15, on Production)

| Beat | Take 1 | Take 2 |
|---|---|---|
| 0:15 lookup ORD-1001 | 2.6 s, `order_summary` | 2.5 s, `order_summary` |
| 0:40 propose ORD-1002 → Office | 2.3 s, `address_change_proposal` | 2.3 s |
| — confirm | 0.4 s, `succeeded`, version 1 → 2 | 0.4 s, same |
| 1:10 denial ORD-2001 | 3.1 s, `ORDER_UNAVAILABLE` | 2.0 s |
| 1:35 evidence | `source=terminal3`, real DID, `verified=false` | same |
| **Total API time on the demo path** | **9.6 s** | **8.4 s** |

Nine to ten seconds of machine time inside a two-minute slot leaves the rest for narration.

### Reset procedure — **14 s**, comfortably under the 30 s requirement

```bash
vercel env pull --environment production        # once per machine
cd apps/api && pnpm exec tsx src/scripts/seed.ts
```

The seed is idempotent: it upserts by fixed business id and replaces each order's items and timeline wholesale, so a previously confirmed address change is reset to `Home` at version 1.

**The first rehearsal attempt failed and that is worth recording:** the proposal step returned no card because ORD-1002 was already on Office from the preceding verification run, so the assistant correctly answered `ADDRESS_UNCHANGED`. Correct behaviour, useless demo. **Always seed immediately before a take.**

## Status table — matches `GET /api/v1/health` on Production

```
{"api":"ok","model":"live","terminal3":"live"}
```

README now reads `live` for both, with the Terminal 3 caveat stated inline rather than buried: real session and real DID, no TEE contract execution, attestation unverified, `provider_reference` shown as "Not available" instead of an invented id.

## Not done / blocked

- **No protected TEE contract.** Unchanged from Task 8 and stated wherever the integration is described. If someone wants to close it: a second key from the claim page (agent credits are separate), `Terminal-3/z-tenant-flight`, `rustup target add wasm32-wasip2`, `cargo build --release`, then `tenant.contracts.register` + `execute`.
- **Nobody has asked Terminal 3 devrel** about the malformed testnet trust manifest. If they publish a manifest with `rtmr1_allowlist`, `verified` flips to true with no code change — the adapter already prefers the pinned manifest.
- **Preview and Production share one Neon database.** Running a Preview test mutates the demo data. Fine for one event, wrong beyond it: create a Neon branch for Preview.
- **390 px is verified in a same-origin iframe, not on a physical device.** Touch targets and the mobile keyboard remain unverified.
- **No accessibility audit tool was run** (no axe, no contrast measurement).
- `vercel dev` still fails on the owner's Windows machine (it shells out to `yarn`). Not needed; the Vite proxy is the dev loop.

## Contract change requests

- none.

## Demo operating notes

1. **Seed first.** 14 s, and without it journey B has nothing to propose.
2. **Do one chat turn before opening Demo details.** `/health` and the integration panel honestly report `unavailable` on a cold function instance until a real call succeeds in it.
3. **Rollback is one variable.** `TERMINAL3_MODE=mock` or `MODEL_PROVIDER=mock` in the Vercel project, then redeploy: the app keeps working and reports the mock mode honestly instead of failing.
4. **Say what the evidence means.** "An authenticated agent identity authorised this change; the TEE attestation behind that identity could not be verified today." The UI already shows "Not verified" — do not let a slide say otherwise.
5. Deterministic failure scenarios still exist in the frontend's mock mode only (`simulate timeout`, `simulate outage`, …); they do nothing against the live API.
