# Task 10 — End-to-end verification on Preview
Agent/role: deploy + frontend   Branch: task-10-verification   Date: 2026-09-08 (UTC)

Everything below was executed against a **Vercel Preview deployment** — real function, real Azure deployment, real Terminal 3 session, real Neon database, and a frontend built with `VITE_API_MODE=live` (no MSW in the bundle). Nothing here was run against a local server or a mock.

## PLAN.md §14 — backend and integrated stages

| Criterion | Result | Evidence |
|---|---|---|
| Lists and details expose only owned orders | **PASS** | `GET /orders` → exactly `ORD-1001`, `ORD-1002`. `GET /orders/ORD-2001` → `404`, byte-identical to a nonexistent id |
| Cross-session conversation/proposal/action access is denied | **PASS (with a caveat)** | A second session reading an unknown conversation → `404`; no cookie → `401`. Caveat below: every demo session binds to the same customer, so the customer boundary is what the API tests cover |
| Foreign address references and shipped-order changes are rejected | **PASS** | Journey D → `policy_denied/ORDER_NOT_EDITABLE`, no mutation. Foreign address → `404 RESOURCE_UNAVAILABLE` |
| No mutation before confirmation; expired / version-conflicting proposals rejected | **PASS** | Proposal alone changes nothing; expired → `410`; order version bumped underneath → `409 ORDER_CHANGED` |
| Duplicate confirmation executes once; uncertain external writes not blindly retried | **PASS** | Same key → identical stored body; different key on a succeeded proposal → `200` with the stored result, order still `version 2`; key reused on another proposal → `409` |
| Model facts come from tools; missing facts are not invented | **PASS** | Journey A's summary matches the seeded order exactly; no ETA or tracking invented; a request with no order number gets a question, not a guess |
| No provider secrets in browser bundles or responses | **PASS** | Bundle grep below: 0 hits for `AZURE`, `T3N`, `DATABASE_URL`, `SESSION_SECRET`, `api-key`, `t3n-sdk` |
| At least one actual Azure tool-call cycle passes | **PASS** | Journey B: the model chained `get_order` → `propose_address_change` on the deployed function |
| At least one Terminal 3 protected action has actual provider evidence | **PARTIAL — by design** | Real session and real DID, but no TEE contract execution and no verified attestation. See the honest wording below |

## The checklist in TASKS.md Task 10

### 1. Journeys A–E on the Preview

| Journey | Latency | Cards | Audit row |
|---|---|---|---|
| A — owned lookup | 2.8–3.1 s | `order_summary` | `order_lookup/allowed/ORDER_FOUND` |
| B — change unshipped | 2.3–2.5 s | `address_change_proposal` | `address_change_proposal/allowed/PROPOSAL_CREATED` |
| C — unauthorized | 2.3–2.7 s | `action_result/ORDER_UNAVAILABLE` | `order_lookup/denied/ORDER_UNAVAILABLE` |
| D — shipped denial | 2.2–2.5 s | `action_result/ORDER_NOT_EDITABLE` | `policy_denied/denied/ORDER_NOT_EDITABLE` |
| E — bypass attempt | 1.2–1.3 s | none | `agent_refusal/denied/AGENT_REFUSED` |

Journey C leaked nothing: no name, phone, address or summary of the other customer's order.

### 2. Duplicate confirm, same and different Idempotency-Key

```
first confirm                            -> succeeded, order version 2
same key replayed                        -> identical response body (True)
different key on the succeeded proposal  -> 200, stored result, still version 2
key reused on a different proposal       -> 409 IDEMPOTENCY_CONFLICT
confirm with no Idempotency-Key          -> 422 INVALID_INPUT
```

### 3. Expired proposal — **PASS**

Rather than lowering the TTL through an env var (which would mean adding test-only configuration to product code), the proposal row's `expires_at` was moved into the past directly in the Preview database, then confirmed: `410 PROPOSAL_EXPIRED`. Same test for a cancelled proposal → `409 PROPOSAL_STATE_CONFLICT`.

### 4. Cross-session access — **PASS, with an honest caveat**

`DEMO_MODE` binds **every** session to `cus_demo_alex` (PLAN.md §6.3), so two browser profiles are two sessions of the *same customer* and are supposed to see the same conversation. Opening a second profile therefore cannot demonstrate the boundary; it would only show that the demo customer can read their own data.

What was verified instead: a second session reading an unknown conversation id → `404`; no cookie → `401`; a foreign order → `404`. The real customer boundary is covered by an API test that inserts a conversation owned by `cus_demo_other` and asserts `404` for both `/actions/:id` and `/actions?conversation_id=`.

### 5. Bundle audit — **PASS**

Grepped the JavaScript the Preview actually serves (`/assets/index-*.js`, 419 546 bytes):

```
AZURE: 0    T3N: 0    DATABASE_URL: 0    SESSION_SECRET: 0    api-key: 0    t3n-sdk: 0
```

`msw` also returns 0, confirming the deployed build is genuinely live rather than mocked.

### 6. Latency — recorded

| Measurement | Value |
|---|---|
| `GET /health`, cold function instance | 0.65 s |
| `GET /health`, warm | 0.57 s |
| One full model turn (Azure tool call → policy → proposal) | 2.8 s |
| Confirm including a cold Terminal 3 session | 4.4 s |
| Confirm on a warm instance (session reused) | ~0.5 s locally |

`maxDuration` is 60 s, so the worst observed path uses under 8 % of the budget.

## Screenshots (`docs/screenshots/preview/`)

| File | What it shows |
|---|---|
| `01-preview-live-workspace.jpg` | Preview serves the UI, session cookie works, two orders from Neon, no "Demo mode" badge |
| `02-preview-live-confirm.jpg` | Proposal → Confirm → "Address updated", activity shows both rows |
| `03-preview-evidence-not-verified.jpg` | Action detail: `Source terminal3`, real DID, `Provider reference: Not available`, `Verified: Not verified` |
| `04-preview-denial-cards.jpg` | Permission denial and its audit row |
| `05-preview-responsive-390-1000.jpg` | 390 px and 1000 px, rendered same-origin on the deployed app |

## Two defects found here and fixed

1. **A failed turn made retry impossible.** Design.md §9 tells the UI to reuse `client_message_id` after a model timeout, and it does — but the claim row was written before the agent loop and survived a failure, so every retry answered `409 REQUEST_IN_PROGRESS` **forever**. A model timeout mid-demo would have bricked that conversation. Fixed in PR #11, test written failing first.
2. **Denial cards repeated their own title.** The card description was the `ApiError` message ("Order not available"), so the permission card read "Order not available / Order not available" instead of Design.md §8.3's "This order isn't available in your account." The frontend's MSW handlers already used the specified copy, so mock and live disagreed on what the customer reads. Fixed in PR #12; verified on the Preview afterwards.

## Not done / blocked

- **A protected TEE contract still has not executed**, so the §14 line "at least one Terminal 3 protected action has actual provider evidence" is only partially met: the evidence is a real authenticated identity, not a contract execution, and attestation is unverified because testnet's trust manifest is malformed. The UI states this rather than papering over it. Full reasoning in `docs/handoffs/task-8.md`.
- **390 px was rendered in a same-origin iframe on the deployed app**, not in a 390 px browser window — the browser here is maximised and ignores resize. Media queries resolve against the iframe viewport so the breakpoints shown are real, but touch targets and the mobile keyboard remain unverified on a physical device.
- **Preview and Production share one Neon database**, so a Preview test mutates the demo data. Every run above re-seeded first; anyone repeating them must do the same, or journey B returns `ADDRESS_UNCHANGED` because ORD-1002 is already at Office — which is what happened on the first pass here.
- Accessibility was not audited with a tool (no axe run, no contrast measurement). Keyboard operation and focus rings were exercised by hand in Task 3.

## Contract change requests

- none.

## Notes for the next lane

- **Task 11:** re-seed Production before the rehearsal — it still holds mutated state from the Task 7 runs. The one-command rollback if an integration misbehaves is `TERMINAL3_MODE=mock` or `MODEL_PROVIDER=mock`; both keep the app working and report their mode honestly.
- **Demo ordering matters:** `/health` and the Demo details panel report `unavailable` on a cold function instance until a real call succeeds in it. Do one chat turn before opening Demo details.
- The verification scripts used here are not committed — they were throwaway `curl` drivers. What is committed is the API test suite (35 tests), which covers the same semantics against a real database.
