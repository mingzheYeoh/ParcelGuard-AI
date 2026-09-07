# Task 4 — PostgreSQL schema, migrations, seed
Agent/role: backend   Branch: task-4-db-schema   Date: 2026-09-07 (UTC)

## Completed
- [x] Added Drizzle ORM + drizzle-kit to `apps/api`, driver chosen per TASKS.md §1.2 rule 6 — evidence: `apps/api/package.json` (`drizzle-orm@0.45.2`, `drizzle-kit@0.31.10` devDependency, `postgres@3.4.9` runtime driver, `dotenv@17.4.2` devDependency, all pinned exact versions, no `^`/`~`). Chose `postgres` (postgres.js) over `pg`/Neon serverless driver because the immediate dev target is plain local Postgres, not Neon yet (per task-0.md); `postgres.js` also works unmodified against a Neon pooled URL later, so no driver swap is needed at Task 9/Vercel time — confirmed the exact API shape (`drizzle(sql, {schema})`, `drizzle-orm/postgres-js/migrator` `migrate(db, {migrationsFolder})`) by reading the installed package's `.d.ts` files rather than assuming, since drizzle-kit's config API changed shape across versions (`dialect` is mandatory in 0.31.x, not `driver`).
- [x] All 11 tables from TASKS.md Task 4 + PLAN.md §6.2/§6.3/§7.4/§7.5 — `apps/api/src/db/schema.ts`: `customers`, `addresses`, `orders` (with `version` for optimistic concurrency / `ORDER_CHANGED`), `order_items`, `order_timeline`, `conversations` (+ `request_in_progress` flag for §7 in-flight tracking), `messages` (`client_message_id` unique per `conversation_id` via a composite unique constraint), `proposals` (`proposal_status` enum, `expected_order_version`, `expires_at`), `actions` (`evidence` JSONB, `action_outcome`/`action_type` enums), `idempotency_keys` (`session_id`, `key`, `proposal_id`, `response` JSONB, unique on `(session_id, key)`), `sessions`. Money stored as `integer` minor units; all timestamps `timestamptz`. IDs are the human-readable business identifiers (`ORD-1001`, `cus_demo_alex`, etc.) used across the API contract, not generated UUIDs.
- [x] DB connection module `apps/api/src/db/index.ts` — `postgres()` client and `drizzle()` instance created once at module scope (TASKS.md §1.2 rule 6: pooled connection string, reused across warm invocations). Throws a clear error if `DATABASE_URL` is unset instead of silently connecting to nothing.
- [x] Scripts in `apps/api/package.json`: `db:generate` (`drizzle-kit generate`), `db:migrate` (`tsx src/scripts/migrate.ts`, own single `max:1` connection, closes it after), `db:seed` (`tsx src/scripts/seed.ts`, idempotent upserts), `db:reset` (dev-only: drops+recreates the `public` schema, refuses if `NODE_ENV=production`, then re-runs migrate+seed).
- [x] `db:seed` idempotently seeds PLAN.md §6.1 fixtures — `apps/api/src/scripts/seed.ts`: `cus_demo_alex` (ORD-1001 shipped/Wireless Keyboard, ORD-1002 processing/Laptop Stand, both `addr_alex_home`), `cus_demo_other` (ORD-2001 processing/USB-C Hub, `addr_other_home`), addresses `addr_alex_home`/`addr_alex_office`/`addr_other_home`. Customers/addresses/orders are upserted (`onConflictDoUpdate`) by fixed id; each order's items/timeline are deleted+reinserted so re-seeding after a demo address-change (Task 11) resets state back to the fixture (e.g. ORD-1002 back on Home).
- [x] Migration generated and reviewed — `apps/api/drizzle/0000_colossal_wind_dancer.sql` (5 enum types, 11 tables, all FKs with appropriate `ON DELETE CASCADE`/`no action`, 2 unique constraints). Generation ran cleanly against the schema (no live DB needed for `drizzle-kit generate`).
- [x] `apps/api/.env.example` already documented `DATABASE_URL` (added in Task 1); no changes needed there. Documented the local-Postgres-vs-Docker-vs-Neon reality below.

## Commands actually run (with result)
- `pnpm add drizzle-orm@0.45.2 postgres@3.4.9` (dependencies) → exit 0
- `pnpm add -D drizzle-kit@0.31.10 dotenv` (then pinned `dotenv` to exact `17.4.2` in package.json) → exit 0
- `pnpm --filter contracts build` → exit 0 (needed so `apps/api` typecheck resolves `@parcelguard/contracts`, a pre-existing Task 1 build-order requirement, not a Task 4 change)
- `pnpm --filter api typecheck` → `tsc -p tsconfig.json --noEmit` exit 0
- `pnpm --filter api build` → `tsc -p tsconfig.json` exit 0
- `pnpm --filter api exec drizzle-kit generate` → `11 tables ... [✓] Your SQL migration file ➜ drizzle\0000_colossal_wind_dancer.sql` exit 0
- `pnpm --filter api db:migrate` (against `DATABASE_URL=postgres://postgres:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/parcel_guard` in local `.env`) → **FAILED**: `DrizzleQueryError ... cause: AggregateError [ECONNREFUSED]` on `CREATE SCHEMA IF NOT EXISTS "drizzle"`.
- `Test-NetConnection -ComputerName localhost -Port 5432` (PowerShell) → `TcpTestSucceeded: False`.
- `Get-Service | Where-Object { $_.Name -like "*postgres*" }`, `Get-Process | Where-Object { $_.ProcessName -like "*postgres*" }`, `Test-Path "C:\Program Files\PostgreSQL"` → all empty/False. No PostgreSQL server process, service, or install directory exists on this machine.
- `git diff --cached | grep -iE "api_key|secret|postgres://"` (run before committing, see below) → no matches (nothing staged has real secrets or a live `postgres://` URL).

## Not done / blocked
- **`pnpm --filter api db:migrate && pnpm --filter api db:seed` have not been run successfully against a real database.** Impact: schema/migration/seed *logic* is implemented and typechecked, and `drizzle-kit generate` (which needs the schema but not a live connection) succeeded, but there is no first-hand evidence of a query confirming "only two orders belong to `cus_demo_alex`" — the acceptance criterion is unmet as written.
  - Root cause: this task ran in a git worktree on a Windows machine that has **no PostgreSQL server installed at all** (`Get-Service`, `Get-Process`, and `C:\Program Files\PostgreSQL` all confirm absence; `Test-NetConnection localhost:5432` fails). This does not match docs/handoffs/task-0.md, which was written from a different machine (task-0.md: "PostgreSQL on `localhost:5432`, database `parcel_guard` already exists ... verified in DBeaver"). The two environments are not the same host.
  - Next action for a human with access to that machine (or any reachable Postgres 14+):
    1. Confirm/install PostgreSQL locally (or point at a reachable instance) and create database `parcel_guard`.
    2. In `apps/api/.env`, set `DATABASE_URL=postgres://postgres:<real_password>@localhost:5432/parcel_guard` (a placeholder with `REPLACE_WITH_LOCAL_PASSWORD` is currently in that git-ignored file from this task's attempt).
    3. Run `pnpm --filter api db:migrate` — applies `apps/api/drizzle/0000_colossal_wind_dancer.sql` (already generated and reviewed, no `db:generate` step needed unless the schema changes again).
    4. Run `pnpm --filter api db:seed`.
    5. Verify with `SELECT id FROM orders WHERE customer_id = 'cus_demo_alex';` → expect exactly `ORD-1001`, `ORD-1002` (two rows); `ORD-2001` belongs to `cus_demo_other` and must not appear.
  - Everything up to the connection attempt is verified: schema compiles, migration SQL is syntactically reviewed and matches PLAN.md object shapes, seed script logic was code-reviewed for idempotency (upsert by fixed id + wholesale item/timeline replace).
- Cloud DB (Vercel Marketplace / Neon) per task-0.md is also **not yet created** ("NOT YET CREATED... Human must do: Vercel dashboard → Storage → Create Database → Neon"). Task 9 owns running migrate/seed against that DB once it exists; nothing in Task 4 depends on it.

## Contract change requests
- none. No `packages/contracts` changes were needed — Task 4 is DB-schema-only and the table shapes already match PLAN.md §6.2/§6.3/§7.4/§7.5 as written.

## Notes for the next lane
- **DB connection module**: `apps/api/src/db/index.ts` exports `sql` (the pooled `postgres.js` client) and `db` (the Drizzle instance), both created once at module scope. Task 5 should `import { db } from '../db/index.js'` in repositories — do not call `postgres(...)`/`drizzle(...)` again elsewhere, and do not create it lazily per-request.
- **Schema location**: `apps/api/src/db/schema.ts` exports every table and enum (`orderStatusEnum`, `proposalStatusEnum`, `actionOutcomeEnum`, `actionTypeEnum`, `messageRoleEnum`) plus the 11 `pgTable` definitions, all camelCase JS properties mapped to snake_case columns.
- **IDs are strings, not UUIDs/serials**: every table's `id` is `text` and the app (repositories, Task 5) is responsible for generating readable ids (e.g. `conv_...`, `prop_...`, `act_...`, `msg_...`) — there is no `gen_random_uuid()` default. `orders`/`customers`/`addresses` ids are the fixed business ids from PLAN.md §6.1 and the API contract.
- **Version field**: `orders.version` starts at `1` and must be incremented by Task 5's `proposalService` on every successful address change (used for the §7.4 `ORDER_CHANGED` optimistic-concurrency check). Nothing currently increments it — that's Task 5 scope.
- **Idempotency table**: unique constraint is on `(session_id, key)` per PLAN.md §7.4 ("Uniqueness is session + key"), not on `key` alone. `response` is nullable JSONB — write it once the confirm request settles (pending confirms should have `response = null`).
- **Local Postgres setup (this task's environment reality)**: docs/handoffs/task-0.md documents a machine where PostgreSQL was already running natively (not Docker) at `localhost:5432`, db `parcel_guard`, user `postgres`. That machine is **not** the machine this task ran on (no Postgres process/service found here — see Not done/blocked above). Two supported local setups going forward:
  1. **Native local Postgres** (what task-0.md assumes): install PostgreSQL 14+, `createdb parcel_guard`, set `DATABASE_URL=postgres://postgres:<password>@localhost:5432/parcel_guard` in `apps/api/.env`.
  2. **Docker Postgres** (TASKS.md §0.2 lists Docker Desktop as an alternative): `docker run --name parcelguard-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=parcel_guard -p 5432:5432 -d postgres:16`, then `DATABASE_URL=postgres://postgres:postgres@localhost:5432/parcel_guard`.
  3. **Neon dev branch** (cloud, no local install): create a project at neon.tech (or reuse the Vercel Marketplace Neon integration once task-0's pending item is done), copy its pooled connection string into `DATABASE_URL`. `postgres.js` works unmodified against Neon's pooler.
  In all three cases: `pnpm --filter api db:migrate && pnpm --filter api db:seed`, then verify with the query in Not done/blocked above.
- **`db:reset` is destructive** (`DROP SCHEMA public CASCADE`) and refuses to run if `NODE_ENV=production`; it is meant for local iteration only, never point it at the Vercel Preview/Production `DATABASE_URL`.
- Task 5 (backend core) should build `repositories/**` on top of `db`/`schema` as-is; no schema changes are anticipated for Task 5's known scope (sessions, policy, proposals, idempotency), but flag any gap in that task's own handoff rather than editing `apps/api/src/db/**` (owned by Task 4/backend generally, but avoid churn — coordinate via handoff if a column is missing).

## Owner verification (2026-09-07, post-review)

The blocker above was environmental, not a defect. On the owner's machine PostgreSQL **18** is installed and running (`postgresql-x64-18`, `Test-NetConnection localhost:5432` → `TcpTestSucceeded: True`), so the acceptance criterion was run first-hand before merge:

- `pnpm --filter api db:migrate` → `Running migrations from ./drizzle ... Migrations complete.` exit 0
- `pnpm --filter api db:seed` → exit 0; run twice in a row, second run also exit 0 (idempotency confirmed)
- `information_schema.tables` → **11 tables**: actions, addresses, conversations, customers, idempotency_keys, messages, order_items, order_timeline, orders, proposals, sessions
- `SELECT id FROM orders WHERE customer_id='cus_demo_alex'` → exactly `ORD-1001`, `ORD-1002`; `ORD-2001` belongs to `cus_demo_other` — acceptance criterion met
- `pnpm install --frozen-lockfile` (CI=1), `pnpm typecheck`, `pnpm build`, `pnpm test` (11 contract tests) → all exit 0 after merging Task 2

### Change made during review

`apps/api/src/scripts/seed.ts` now imports `orderFixtures`, `addressFixtures` and `orderOwnership` from `@parcelguard/contracts` instead of restating them. Task 2 and Task 4 were written in parallel and their copies had already drifted — the DB seeded `"Order placed"` timeline labels at 2026-09-02/09-03 while contracts (and therefore the frontend's MSW handlers) used `"Order confirmed"` at 09-03/09-05. Task 10 compares mock against live, so that drift would have surfaced as a phantom bug. Ownership and display names stay in the seed: they are server-only facts contracts deliberately does not expose (PLAN.md §6.2).

### Notes for Task 5 (backend lane)

- `actions.reason_code` is nullable in the schema, but `actionSchema.reason_code` in contracts is a required string. Always write a reason code, or coalesce on read — otherwise a null row produces a response the frontend's schema rejects. Left as-is to avoid regenerating the migration; tighten it if Task 5 finds a null path.
- `apps/api/src/db/index.ts` creates the client at **module scope** and throws when `DATABASE_URL` is missing. Importing it from `app.ts` unconditionally would take down `GET /health`, which PLAN.md §7.1 says can be public and TASKS.md §2 rule 5 says must report honest modes. Import it lazily, or keep health independent of the DB module.
- `DATABASE_POOL_MAX` (optional, default 5) is read by that module and is now documented in `apps/api/.env.example`; it is not part of the TASKS.md §0.3 list.
