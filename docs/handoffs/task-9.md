# Task 9 — Vercel environments and first Preview
Agent/role: deploy (owner)   Branch: task-9-vercel-env   Date: 2026-09-08 (UTC)

## Completed

- [x] Every TASKS.md §0.3 variable is set for **Preview** and **Production**; inventory below (names and scopes only, never values).
- [x] `DATABASE_URL` comes from the Vercel Marketplace **Neon** integration, not a hand-typed value — it arrives alongside the `PG*` / `POSTGRES_*` set the integration injects.
- [x] `db:migrate` and `db:seed` run against the **Preview** database from a local shell after `vercel env pull --environment preview`.
- [x] Deployment log confirms Node **22.x**, taken from `engines.node`, overriding the project setting: *"Due to `engines: { node: 22.x }` … the Node.js Version defined in your Project Settings ("24.x") will not apply."* No dashboard change needed.
- [x] PR opened, automatic Preview built, health reports honest modes.
- [x] **Origin checks now pass on Preview** — the item this task existed to fix. See below.
- [x] `VITE_API_MODE=live` set for Preview and Production, so the *deployed* UI talks to the real API instead of MSW.
- [x] `TERMINAL3_MODE=live` aligned in Production, now that Task 8 proved the SDK works from a deployed function.

## The fix: allowed origins are derived per deployment

`assertOrigin` compared the browser's `Origin` against a single `APP_ORIGIN`, which is the production URL. Every Preview deployment has its own hostname, so **every mutation from a Preview UI was rejected with 401** — the deployed frontend could not even start a session there. Task 7's Preview run only passed because `curl` sent no `Origin` header.

`config.allowedOrigins()` now derives the set from the hostnames Vercel exposes at runtime (confirmed in the system-environment-variables reference, none include a protocol):

| Variable | What it is |
|---|---|
| `VERCEL_URL` | this deployment's generated domain |
| `VERCEL_BRANCH_URL` | the branch alias — what a PR link actually opens |
| `VERCEL_PROJECT_PRODUCTION_URL` | the production domain, always set even on Preview |

plus the explicit `APP_ORIGIN`. **Exact matches only.** A wildcard like `*.vercel.app` would let any page hosted anywhere on vercel.app forge authenticated requests against this cookie — that is a CSRF hole, not a convenience. A test asserts a lookalike on the same suffix (`parcel-guard-attacker.vercel.app`) is still refused.

## Commands actually run (with result)

- `vercel pull --yes --environment preview` → project settings + Preview env downloaded
- `pnpm exec tsx src/scripts/migrate.ts` (Preview `DATABASE_URL`) → `Migrations complete.`
- `pnpm exec tsx src/scripts/seed.ts` (Preview) → `Seed complete: cus_demo_alex (ORD-1001, ORD-1002), cus_demo_other (1 denial fixture).`
- `pnpm --filter api test` → **34 passed**, exit 0 (one new: origins accepted/refused)
- `pnpm typecheck` → exit 0

### Against the Preview deployment

| Check | Result |
|---|---|
| `POST /demo/session` **with** `Origin: <preview URL>` | `200` — previously `401` |
| `POST /conversations` with the same Origin | `200` |
| `POST /conversations` with `Origin: https://parcel-guard-attacker.vercel.app` | `401` |
| `GET /orders` | `ORD-1001 shipped Home v1`, `ORD-1002 processing Home v1` — exactly two |
| `GET /health` | honest modes |
| Entry bundle | zero `msw` references — the deployed build is genuinely live, not mocked |

### The full chain, driven through the deployed UI in a real browser

Screenshots in `docs/screenshots/preview/`:

- `01-preview-live-workspace.jpg` — Preview URL serves the UI, session cookie works, two orders load from Neon, no "Demo mode" badge (correct: live)
- `02-preview-live-confirm.jpg` — "Update delivery address" → proposal card → **Confirm** → green "Address updated", activity shows `PROPOSAL_CREATED` then `ADDRESS_UPDATED`

Verified afterwards through the API: `ORD-1002 -> Office, version 2`. That single click exercised browser → static build → `/api/v1` rewrite → Vercel Function → Azure OpenAI → policy → Terminal 3 session → Neon write, all in the deployed environment.

## Environment variables (names and scopes; no values)

Set by this project:

| Name | Preview | Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | ✅ | injected by the Neon Marketplace integration (pooled) |
| `SESSION_SECRET` | ✅ | ✅ | signs the session cookie |
| `APP_ORIGIN` | ✅ | ✅ | production URL; other hostnames are derived, not listed here |
| `DEMO_MODE` | ✅ | ✅ | enables `POST /demo/session` |
| `MODEL_PROVIDER` | ✅ | ✅ | `azure_openai` |
| `AZURE_OPENAI_BASE_URL` | ✅ | ✅ | v1 endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | ✅ | ✅ | `chat-small` |
| `AZURE_OPENAI_API_KEY` | ✅ | ✅ | secret |
| `TERMINAL3_MODE` | ✅ | ✅ | `live` in both, as of this task |
| `T3N_API_KEY` | ✅ | ✅ | secret |
| `VITE_API_MODE` | ✅ | ✅ | `live` — build-time, makes the deployed UI skip MSW |

Also injected by the Neon integration and unused by this app: `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`, `NEON_*`, `VITE_NEON_AUTH_URL`. `VITE_NEON_AUTH_URL` is the only one that reaches the browser bundle; it is a Neon Auth endpoint, not a credential.

## Not done / blocked

- **`/health` can honestly say `unavailable` on a cold function instance.** `mode()` reports `live` only after a real call has succeeded *in that instance*, and each cold Vercel instance starts unproven. So opening `/health` or the Demo details panel before any chat turn shows "Not connected", then `live` after. This is the rule TASKS.md Task 7 item 5 asks for, read strictly. **For a demo, do one chat turn before opening Demo details**, or expect to explain it. Loosening it would mean claiming `live` for a configured-but-unproven integration, which is the thing the runbook forbids.
- **Production has not been re-seeded** since these environment changes. The Production database still holds whatever the Task 7 journey runs left (`ORD-1002` moved to Office, version 2). Task 11 re-seeds between demo takes; run `db:seed` against Production before the rehearsal.
- **Preview and Production share one Neon database.** The Marketplace integration injected the same `DATABASE_URL` into both scopes, so a Preview test mutates production data. Fine for a demo, wrong for anything longer-lived: create a Neon branch and point Preview at it if this project outlives the event.
- `vercel dev` still fails on the owner's Windows machine (shells out to `yarn`); unchanged from Task 6 and still optional.

## Contract change requests

- none.

## Notes for the next lane

- **Task 10 (end-to-end verification):** everything it needs is live on Preview now — real API, real model, real Terminal 3, real database, and a UI that is not mocked. Journeys A–E were already exercised against the deployed function in Tasks 7 and 8; Task 10's job is the *browser* pass over Design.md §13 on the Preview URL.
- **Task 11 (production rehearsal):** Production now matches Preview on every variable. Re-seed before the demo. `TERMINAL3_MODE=mock` remains a one-variable rollback if Terminal 3 has an outage — the app keeps working and reports `source: "local"` evidence honestly.
- **If a custom domain is ever added**, add it to `APP_ORIGIN` or the derivation; `VERCEL_PROJECT_PRODUCTION_URL` follows the shortest production custom domain, so it usually handles that on its own.
