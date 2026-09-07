# Task 2 — Shared contracts and fixtures
Agent/role: frontend (contracts)   Branch: task-2-contracts-fixtures   Date: 2026-09-07 (UTC)

## Completed
- [x] Zod schemas + inferred TS types for every PLAN.md §6.2 object: `Item`, `TimelineEvent`, `AddressSummary`, `Order`, `Conversation`, `Proposal`, `Action`, `Evidence`, plus enums `orderStatusSchema`, `proposalStatusSchema`, `actionOutcomeSchema`, `actionTypeSchema` — `packages/contracts/src/index.ts`.
- [x] Envelopes verified/extended: `successEnvelopeSchema`, `errorEnvelopeSchema` (now typed against a full `errorCodeSchema` enum covering every §7.6 code plus `DEMO_MODE_DISABLED` — see Contract change requests).
- [x] Every §7 endpoint request/response schema: `demoSessionRequestSchema`/`demoSessionResponseSchema`, `healthResponseSchema`, `bootstrapResponseSchema`, `ordersListResponseSchema`, `orderResponseSchema`, `conversationCreateRequestSchema`/`conversationCreateResponseSchema`, `messageCreateRequestSchema` (1–2000 code-point content check), `chatTurnSchema`, `proposalConfirmRequestSchema`, `proposalCancelRequestSchema`/`proposalCancelResponseSchema`, `actionsListResponseSchema`, `actionResponseSchema`.
- [x] `ChatTurn.cards[]` tagged union via `z.discriminatedUnion('type', [...])`: `order_summary`, `address_change_proposal`, `action_result` — `orderSummaryCardSchema`, `addressChangeProposalCardSchema`, `actionResultCardSchema`, combined as `chatTurnCardSchema`.
- [x] `ProposalResult`, `Action`/`Evidence`, `IntegrationStatus` (`model`/`terminal3` sub-objects per §7.2), `IntegrationMode` — all implemented and exported.
- [x] `fixtures.ts` — `packages/contracts/src/fixtures.ts` — `orderFixtures` (ORD-1001 shipped/cus_demo_alex, ORD-1002 processing/cus_demo_alex, ORD-2001 processing/cus_demo_other) and `addressFixtures` (`addr_alex_home`/Home/Kuala Lumpur, `addr_alex_office`/Office/Kuala Lumpur, plus `addr_other_home` so ORD-2001 has a valid `address_ref` — never exposed to the demo session), each fixture validated against its own schema in the test suite.
- [x] Typed `apiPaths` map — `packages/contracts/src/index.ts` — covering all 11 §7.1 endpoints (`demoSession`, `health`, `bootstrap`, `orders`, `order(id)`, `conversations`, `conversationMessages(id)`, `proposalConfirm(id)`, `proposalCancel(id)`, `actions`, `action(id)`), all built on the existing `API_BASE_PATH`.
- [x] Vitest configured for `packages/contracts` (not previously configured anywhere in the repo — Task 1 left `test` as a placeholder `echo`). Added `vitest@5.0.0` as an exact-pinned devDependency, `vitest.config.ts`, and `test/contract-examples.test.ts` parsing every literal JSON example in PLAN.md §7 (§7.2 IntegrationStatus, §7.3 ChatTurn proposal example + order_summary/action_result card variants, §7.4 ProposalResult confirm example, §7.5 Action/evidence example) plus every §7.6 error code and every §6.1 fixture.
- [x] `docs/handoffs/task-2.md` (this file) declares the contract **frozen** as of commit below, per TASKS.md §2.3 — further changes go through the Contract change requests process (TASKS.md §4.3).

## Commands actually run (with result)
- `pnpm install --frozen-lockfile` → exit 0, `Done in 48.5s using pnpm v11.22.0` (fresh install in this worktree; `node -v` here is `v24.13.0`, not the pinned `22.x` — pnpm printed `[WARN] Unsupported engine` on every command below but did not fail; noted under Not done/blocked)
- `pnpm --filter contracts add -D vitest@5.0.0` → exit 0, `+19` packages added, lockfile updated
- `pnpm --filter contracts typecheck` → `tsc -p tsconfig.json --noEmit`, exit 0, no output (clean)
- `pnpm --filter contracts test` → `vitest run` → `Test Files 1 passed (1)` / `Tests 11 passed (11)`
- `pnpm --filter contracts build` → `tsc -p tsconfig.json`, exit 0; `packages/contracts/dist/{index,fixtures}.{js,d.ts}` produced
- `pnpm --filter web typecheck` → `tsc -p tsconfig.json --noEmit`, exit 0, no output (clean) — `apps/web/src/App.tsx` and `apps/web/src/mocks/handlers.ts` still import `healthResponseSchema`/`API_BASE_PATH`/`HealthResponse` unchanged, no edits needed
- `pnpm --filter api typecheck` → `tsc -p tsconfig.json --noEmit`, exit 0, no output (clean) — `apps/api/src/app.ts` still imports `API_BASE_PATH`/`HealthResponse` unchanged, no edits needed
- `pnpm typecheck` (root, fans out via `pnpm -r typecheck`) → `Scope: 3 of 4 workspace projects`, all three (`contracts`, `api`, `web`) report `Done`, exit 0
- `pnpm build` (root) → `contracts build: Done`, `api build: Done`, `web build: Done` (`vite build` → `✓ 1980 modules transformed`, `dist/index.html 0.58 kB`, `dist/assets/index-D-M3pGFR.css 19.78 kB`, `dist/assets/index-Cly6rBYC.js 340.11 kB`), exit 0
- `git diff --cached | grep -iE "api_key|secret|postgres://"` → no output (nothing matched)

## Not done / blocked
- Node version mismatch in this worktree: `.nvmrc`/`engines.node` pin `22.x`; this environment has `v24.13.0`. pnpm printed `[WARN] Unsupported engine` on every command but every command still exited 0. Impact: none observed for Task 2's own checks. Next action: whoever runs Task 2's checks on a `22.x` runner should re-confirm identical results (expected, since nothing in the added code touches Node-version-sensitive APIs).
- `packages/contracts` `lint` script is still a placeholder `echo` (same as Task 1 left it for `api`/`web`) — no ESLint configured anywhere in the repo yet. Not in Task 2's scope; whichever lane adds ESLint should update all three workspaces together.
- Did not add integration/backend-shaped tests (e.g. exercising `apiPaths` against a running server) — out of scope for Task 2; Task 5 (backend) and Task 3 (frontend) consume `apiPaths`/schemas directly and will exercise them against real requests.

## Contract change requests
- Added `DEMO_MODE_DISABLED` to the error-code enum. PLAN.md §7.1 states `POST /demo/session` returns `404 outside demo mode` but §7.6's error-code table does not name a code for it. `DEMO_MODE_DISABLED` follows the same naming convention as every other §7.6 code. Lead: please fold this into PLAN.md §7.6 in the same commit that accepts this contract, or tell backend (Task 5) to use a different existing code instead (none of the listed ones fit a 404-outside-demo-mode response).
- No other contract changes. `packages/contracts` is otherwise a straightforward implementation of PLAN.md §6.2/§7 as written.

## Notes for the next lane
- **Contract is frozen as of this commit.** Import everything from `@parcelguard/contracts` (`packages/contracts/src/index.ts`, re-exporting `packages/contracts/src/fixtures.ts`). Do not import fixtures directly in `apps/web` components (PLAN.md/TASKS.md: "Components import only from `@parcelguard/contracts` and the API client; never from fixtures" — this rule targets UI *fixtures used as literal demo data*, not MSW handlers or backend seed scripts, which are expected to read `orderFixtures`/`addressFixtures` from this package).
- **`apiPaths`** — use `apiPaths.order(id)`, `apiPaths.conversationMessages(id)`, `apiPaths.proposalConfirm(id)`, `apiPaths.proposalCancel(id)`, `apiPaths.action(id)` for parameterized routes; the rest (`apiPaths.health()`, `.bootstrap()`, `.orders()`, `.conversations()`, `.actions()`, `.demoSession()`) are zero-arg functions returning the static path. All already include `API_BASE_PATH` — do not prefix again.
- **`ChatTurn.cards[]`** is a Zod discriminated union on `type`. To build/narrow a card in TS: `if (card.type === 'address_change_proposal') { ... }` — TypeScript narrows the full shape.
- **`messageCreateRequestSchema`** enforces the 1–2000 Unicode-code-point rule (after trim) at the schema level using `[...value].length` (not `.length`, which counts UTF-16 code units) so surrogate-pair/Chinese-text content is measured correctly per PLAN.md §6.1 ("chat accepts English and Chinese"). Backend (Task 5) should still re-validate server-side — do not trust client-side-only validation for a mutation-adjacent field.
- **Fixture ownership**: `orderOwnership` (`packages/contracts/src/fixtures.ts`) maps each fixture order id to its owning fixture customer id — useful for Task 4 (DB seed) and Task 5 (policyService ownership checks) without re-deriving it.
- **`Conversation` vs `conversationCreateResponseSchema`**: `conversationSchema` (§6.2, includes server-only `customer_id`) is the full internal shape; `POST /conversations` only ever returns `conversationCreateResponseSchema` (`{id, created_at}`) to the browser per §7.1's response column. Use the right one — never send `customer_id` to the client.
- **`orderSchema.currency`** is `z.literal('MYR')` — this project has exactly one currency; do not widen it without a contract-change note.
- Money fields (`total_minor`, `unit_price_minor`) are `z.number().int()` — integer minor units per PLAN.md §6.2. `version` fields are non-negative integers used for optimistic-concurrency checks (§7.4 `ORDER_CHANGED`).
- Timestamps are validated with `z.iso.datetime()` (Zod v4.5.4's built-in ISO 8601 UTC datetime check — confirmed present in the installed `node_modules/.pnpm/zod@4.5.4` build before use; do not assume an older/newer Zod API without re-checking).
- Vitest is now available at `packages/contracts` only (`pnpm --filter contracts test`). Task 5 (backend integration tests, Vitest + `app.inject()`) and Task 3 (any frontend unit tests) will need their own `vitest`/config additions in their own workspaces — this task did not add it repo-wide.

## Branch / commit
- Branch: `task-2-contracts-fixtures`
- Commit hash: recorded after `git commit` below.
