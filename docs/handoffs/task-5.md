# Task 5 — Fastify core on PostgreSQL
Agent/role: backend   Branch: task-5-api-core   Date: 2026-09-08 (UTC)

## Completed

- [x] `buildApp()` in `src/app.ts` registers plugins, routes, a request-id generator (`req_<uuid>`), an Origin guard, and one error handler that renders every failure as the PLAN.md §7 error envelope. No global mutable state beyond the DB pool. `server.ts` is unchanged and still the only place that calls `listen()`.
- [x] Session (PLAN.md §6.3): `POST /demo/session` inserts a `sessions` row bound to `cus_demo_alex` and sets a **signed** HttpOnly cookie (`pg_session`, `SameSite=Lax`, `Secure` off only on localhost). `customer_id` is never read from a request body. Cookie signing uses `SESSION_SECRET`, which `config.sessionSecret()` refuses to default.
- [x] `policyService`: `requireOwnedOrder` (404 for foreign *and* nonexistent, identical body), `requireEditableOrder` (`processing` only), `requireOwnedAddress`, `requireUnexpired`. Both the REST routes and the model's tool gateway call these — there is no second code path to data.
- [x] `proposalService`: `pending → executing → succeeded | failed`, 5-minute TTL, atomic `UPDATE ... WHERE status='pending'` claim, `session_id + key` idempotency table, stored-result replay, `ORDER_CHANGED` on version mismatch, cancel semantics of §7.4.
- [x] Messages: DB-backed in-flight flag (conditional UPDATE, released in `finally`), 100-turn limit, `client_message_id` replay of the **stored turn** and 409 on the same id with different content.
- [x] `auditService`: redacted actions, newest-first, capped at 100; evidence is exactly `{source:"local", agent_did:null, provider_reference:null, verified:false}` until Task 8.
- [x] `toolGateway`: exactly the two tools of §8.2, Zod-validated, customer injected from the session; unknown tools rejected. Bounded loop of 3 rounds / 4 tool calls (§8.3).
- [x] Adapter seams for Tasks 7 and 8: `ModelAdapter` and `Terminal3Adapter` in `src/adapters/index.ts` with mock implementations. `mode()` reports `mock`, never `live`.
- [x] Error envelope and codes exactly as §7.6, including the 404 that hides ORD-2001.
- [x] 17 integration tests (Vitest + `app.inject()`) against real PostgreSQL.

## Commands actually run (with result)

- `pnpm --filter api exec drizzle-kit generate` → `drizzle/0001_ordinary_giant_girl.sql` (`ALTER TABLE "messages" ADD COLUMN "turn" jsonb;`)
- `pnpm --filter api db:migrate` → `Migrations complete.` exit 0
- `pnpm --filter api test` → **17 passed (17)**, exit 0
- `pnpm typecheck` → 3 workspaces Done, exit 0
- `pnpm build` → contracts + api `tsc`, web `vite build` ✓, exit 0
- `pnpm test` (root) → contracts 11 passed, api 17 passed, exit 0

The "Done when" scenarios, each an assertion in `apps/api/test/api.test.ts`:

| Required scenario | Test |
|---|---|
| owned vs foreign order | `serves an owned order and hides a foreign one behind the same 404` — asserts the two error bodies are byte-identical |
| shipped-order edit denial | `denies an address change on a shipped order` → `action_result` card, `ORDER_NOT_EDITABLE` |
| proposal confirm success | `confirms once and replays the stored result on retry` → version 1 → 2, label `Office` |
| duplicate confirm returns stored result | same test — second call returns an identical body, order still at version 2 |
| key reuse on another proposal → 409 | `rejects reusing a key for a different proposal with 409` |
| expired → 410 | `returns 410 for an expired proposal` |
| version mismatch → 409 | `returns 409 ORDER_CHANGED when the order moved under the proposal` |
| cross-session action access → 404 | `404s an action belonging to another customer` |

## Not done / blocked

- ~~The end-to-end half of "Done when" is not verified yet.~~ **Done** — see "End-to-end with Task 3" below.
- **One bug found and fixed during testing, worth knowing about**: the mock model matched saved-address labels with ``new RegExp(`\b${label}\b`)``. Inside a template literal `\b` is a **backspace character**, not a word boundary, so no address ever matched and every address-change request fell through to "which address?". Replaced with a lowercase substring check — a label is data and could contain regex metacharacters anyway.
- `REQUEST_IN_PROGRESS` on concurrent messages is implemented as a conditional UPDATE but is not covered by a test; a deterministic test needs two overlapping in-flight requests. The single-request paths that set and release the flag are covered.
- Session expiry is honoured on read (`sessions.expires_at`) but nothing sets it — demo sessions currently live until the row is deleted.

### End-to-end with Task 3 (both tasks' "Done when")

Ran on a local merge of `task-5-api-core` and `task-3-frontend`: this API on :3001 against local PostgreSQL, the frontend with `VITE_API_MODE=live` on :5173 through the Vite `/api` proxy.

- `POST /api/v1/demo/session` → 200, real signed `pg_session` cookie (`HttpOnly; SameSite=Lax`)
- `GET /api/v1/orders` → the two owned orders, straight from PostgreSQL
- Chat → proposal card → Confirm → success, then verified in the database: `ORD-1002.address_ref = addr_alex_office`, `version` 1 → 2, proposal `succeeded`, action `address_change/allowed/ADDRESS_UPDATED` with evidence `{source: local, verified: false}`, stored idempotency response present

**Two bugs the live run found, both fixed here:**

1. `src/server.ts` never loaded dotenv, so `pnpm --filter api dev` crashed with "SESSION_SECRET must be set" even though `apps/api/.env` had it. Only the scripts imported `dotenv/config`. The import now sits in `server.ts` — the local-only entry point — so `app.ts` still has no dotenv dependency for Vercel.
2. The mock model refused Design.md §5.4's own suggested chip, "Send ORD-1002 to my office instead.": its intent vocabulary had no `send`, and it required the literal word "address". Naming a saved address now counts as the address signal. The frontend's MSW mock had a looser vocabulary, so mock and live disagreed on the demo's happy path.

## Contract change requests

- **`packages/contracts` needs no change to merge this**, but there is a real gap: PLAN.md §7.6 defines no code for an *unexpected server failure*. `errorCodeSchema` therefore has nothing to put in the envelope when a handler throws something unforeseen. The error handler currently answers `502` with `RESOURCE_UNAVAILABLE`, which is the least-wrong member of the enum but does mean the code and the status disagree. Proposal for the lead: add `INTERNAL_ERROR` (502, `retryable:false`) to §7.6 and to `errorCodeSchema`. Not urgent — it only fires on a bug.
- `SESSION_REQUIRED` (401) is also used for a rejected `Origin` on mutations, since §7.6 has no CSRF code. From the caller's side the session was not honoured, so the code is truthful; flagged here rather than silently overloaded.

## Notes for the next lane

- **Task 6 (deploy):** `buildApp()` takes `{ deps }` for tests only; production needs no arguments. The DB client is created lazily and memoised in `src/db/index.ts`, so importing the app **does not** require `DATABASE_URL` — `GET /api/v1/health` answers on a misconfigured deployment instead of the function crashing at import. Keep that property when wrapping it in `api/index.ts`.
- **Task 7 (Azure):** implement `ModelAdapter` from `src/adapters/index.ts` and pass it as `deps.model`. `decide()` receives the user message, the customer's saved addresses, and prior tool results; return `{kind:'tool_call'}` or `{kind:'message'}`. Do not call the database or apply policy inside the adapter — `toolGateway` already does both, so an Azure-driven tool call is subject to exactly the same checks as the mock's. Report `mode()` honestly: `unavailable` when the key or deployment is missing.
- **Task 8 (Terminal 3):** implement `Terminal3Adapter.authorize()` and pass it as `deps.terminal3`. It is called *after* the proposal is claimed `executing` and *before* the order row is updated. Return real evidence or evidence with `verified:false` — never fabricate a DID or reference. If a dispatched call times out, the correct record is `outcome_unknown`, not a retry.
- **Schema addition:** `messages.turn` (jsonb) stores the ChatTurn returned for a `client_message_id` so a retried send replays it instead of re-running the agent and creating a second proposal. Migration `0001` is generated and applied; anyone with an existing database must run `pnpm --filter api db:migrate`.
- **Concurrent proposals for one order** are handled by *superseding*: creating a proposal cancels any other pending proposal for the same order, so the UI can never show two live confirm buttons. PLAN.md §8.4 allows other readings (reject the new one, return the existing one) — say so if the demo should behave differently.
- Tests need a local PostgreSQL and `pnpm --filter api db:migrate`; `test/setup.ts` fails with that instruction rather than a driver error when `DATABASE_URL` is missing.
