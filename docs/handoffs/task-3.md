# Task 3 — Frontend F0–F4 with MSW
Agent/role: frontend   Branch: task-3-frontend   Date: 2026-09-08 (UTC)

## Completed

- [x] **F0** `src/lib/api.ts` is the only path to the API. Every response is parsed with the schema from `@parcelguard/contracts`, so a contract drift fails loudly instead of rendering wrong data. No component imports fixtures.
- [x] **F0** MSW handlers (`src/mocks/handlers.ts` + `db.ts`) hold in-memory state with the real semantics: ownership, proposal state machine, `session+key` idempotency with stored-result replay, `client_message_id` replay, version bump on a successful change.
- [x] **F1** AppHeader, three-column grid, OrdersPanel, ChatWelcome, Composer, ActivityPanel per Design.md §5.
- [x] **F2** OrderSummaryCard (timeline, current event highlighted), AddressChangeProposalCard (all eight states of §8.2), ActionResultCard (§8.3), order detail sheet, action detail sheet with collapsible evidence. Confirming invalidates the orders and actions queries.
- [x] **F3** Skeletons, filter-empty with Clear filter, order-load error with Retry, "Checking your request…", live-clock expiry on pending cards, preserved failed user messages with a Retry that reuses the same `client_message_id`, scroll preservation with a "New messages" button, IME-safe Enter, 2000-character counter.
- [x] **F4** `VITE_API_MODE=mock` starts MSW; `live` starts no worker and lets failures surface.
- [x] Accessibility: one accessible button per order row (no nested buttons), `role="log"` on the transcript, `aria-label` on icon-only controls, visible focus rings, sheets with titles/descriptions and focus restoration from the Radix primitive.
- [x] Truthfulness: modes are shown separately and never merged into one "Live" badge; mock evidence reports `source: "mock"`, `verified: false`; a missing reference renders "Not available" with no verified mark; nothing is preloaded, so every screenshot below came from a real interaction.

## Commands actually run (with result)

- `pnpm dlx shadcn@4.21.0 add sheet textarea skeleton alert separator avatar --yes` → 6 files created
- `pnpm --filter web typecheck` → exit 0
- `pnpm --filter web build` → `✓ built in 344ms`, exit 0
- `pnpm dev` (mock) + real Chrome at 1440×900 — the interactions below were performed by hand in the browser
- `VITE_API_MODE=live pnpm dev` → app boots, no MSW, first request fails and the UI shows the retryable setup error. Confirmed no silent fallback to mock data.

### Browser verification (Design.md §13)

Screenshots in `docs/screenshots/frontend/`, all from real interactions:

| File | What it shows |
|---|---|
| `01-desktop-1440-proposal-confirmed.jpg` | Order lookup card + address-change proposal confirmed → green "Address updated", activity shows `ADDRESS_UPDATED` |
| `02-desktop-1440-denials.jpg` | Shipped-order denial (`ORDER_NOT_EDITABLE`) and foreign-order denial (`ORDER_UNAVAILABLE`), both as polished amber cards |
| `03-responsive-390-and-1000.jpg` | 390 px (chat only, Orders/Activity buttons) beside 1000 px (244 px orders + chat, Activity in a sheet) |
| `04-mobile-390-orders-sheet.jpg` | Orders sheet at 390 px, `min(420px,100vw)`, full product names, no horizontal overflow |

Checked in the browser: only ORD-1001 and ORD-1002 appear (ORD-2001 never does); amounts render RM 129.00 / RM 89.00 from minor units; timestamps render in Asia/Kuala_Lumpur; the welcome block disappears after the first message; the composer sends on Enter and newlines on Shift+Enter.

## Not done / blocked

- **The 390 px pass was done in a 390 px-wide iframe, not a 390 px browser window.** `resize_window` reported success but the window stayed at 1536 CSS px (it is maximised), so a true narrow window was not achievable here. Media queries and layout resolve against the iframe viewport, so the breakpoint behaviour shown is real — but touch targets, the mobile keyboard, and safe-area insets were **not** verified on a real device. Someone should repeat this on a phone or an un-maximised window before the demo.
- ~~The end-to-end check with Task 5 has not been run yet.~~ **Done** — see "End-to-end with Task 5" below.
- No automated frontend tests. Vitest is not configured in `apps/web`; `pnpm --filter web test` is still the Task 1 placeholder. The acceptance for this task is browser verification, but a couple of component tests around the proposal-card state table would be cheap insurance later.
- Contrast was not measured with a tool. Colours come from the Design.md §4.2 token block; the amber and emerald tones I added for card states are Tailwind defaults at 700–950 on 50-tinted backgrounds, which are comfortably above 4.5:1, but nobody has run a checker.

### End-to-end with Task 5 (both tasks' "Done when")

Ran on a local merge of `task-3-frontend` and `task-5-api-core`: Fastify on :3001 against local PostgreSQL, `VITE_API_MODE=live pnpm dev` on :5173 through the Vite `/api` proxy.

- `POST /api/v1/demo/session` → 200 with a real signed `pg_session` cookie (`HttpOnly; SameSite=Lax`)
- Orders loaded from PostgreSQL; ORD-2001 absent; Demo-mode badge correctly gone
- "Update delivery address" chip → proposal card → Confirm → green "Address updated", activity shows `ADDRESS_UPDATED`
- Verified in the database afterwards: `ORD-1002.address_ref = addr_alex_office`, `version` 1 → 2, proposal `succeeded`, action evidence `{source: local, verified: false}`, idempotency response stored

**Two integration bugs that only the live run could find** (both fixed):

1. `lib/api.ts` spread `...init` *after* `headers`, so `content-type: application/json` was replaced by the init's own headers object. Fastify parsed no body and answered 422 on a valid message. MSW never noticed because it does not read `content-type`.
2. The backend's mock model did not treat "Send ORD-1002 to my office instead." as an address change — its intent vocabulary lacked `send`, and it required the literal word "address". That is Design.md §5.4's own suggested chip copy, so the demo's happy path failed against the real API while passing against MSW. Fixed on the Task 5 branch.

## Contract change requests

- none. Every endpoint, envelope, enum value, and card variant came from `@parcelguard/contracts` unchanged. Parsing each response against the schema means the mock and the live API are held to the same contract.

## Notes for the next lane

- **Deterministic scenarios** (Design.md §11) are triggered by phrases in a chat message, so any of them can be demonstrated without a dev-only UI: `simulate timeout` → 504, `simulate rate limit` → 429, `simulate outage` → 502, `simulate unknown` → a proposal whose confirmation returns `outcome_unknown`, `simulate failure` → `failed`, `simulate expiry` → a proposal that is already expired (confirm → 410). They exist only in the MSW layer.
- **One Task 1 bug fixed here**: `main.tsx` gated MSW on `import.meta.env.VITE_API_MODE !== 'mock'`, which is true when the variable is unset, while `App.tsx` defaulted to `'mock'`. With no `.env` file the app therefore started in live mode with no server and showed a setup error. Both now read `IS_MOCK` from `src/lib/env.ts`; the default is mock.
- **For Task 10:** the UI derives proposal-card state from the response, not from local optimism — `useWorkspace` keeps a `proposalStatuses` map keyed by `proposal_id` and writes whatever the server returned, including `expired`, `failed`, and `outcome_unknown`. An `outcome_unknown` card deliberately offers no Retry button.
- **Idempotency keys** are generated once per confirmation intent and per user message, and reused on retry (`idempotencyKeys` ref in `useWorkspace`). A retried send is not a second write.
- The mock latency is `VITE_MOCK_LATENCY_MS` (default 450 ms) if a demo needs it faster or slower.
