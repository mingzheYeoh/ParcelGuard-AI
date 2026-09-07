# Task 6 — Vercel Function adapter and project config
Agent/role: deploy (owner)   Branch: task-6-vercel-function   Date: 2026-09-08 (UTC)

## Completed

- [x] Read the current [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify) docs (last updated 2026-08-10). Zero-config entrypoint detection expects the Fastify app to *be* the project and to call `listen()`. This project also ships a static Vite build, so the documented preset does not fit and the request-forwarding form from TASKS.md Task 6 item 1 is used instead: `await app.ready()` then `app.server.emit('request', req, res)`, with no `listen()` on the platform side.
- [x] `api/index.ts` wraps the same `buildApp()` that `apps/api/src/server.ts` uses locally, so dev and deployment share one code path (TASKS.md §1.2 rule 8). The instance is built once at module scope, so a warm instance reuses one Fastify instance and one database pool.
- [x] `vercel.json` per §1.1: `buildCommand`, `installCommand`, `outputDirectory: apps/web/dist`, the `/api/v1/:path*` → `/api` rewrite, and `maxDuration: 60`.
- [x] Function tracing includes `apps/api/dist`, `packages/contracts/dist` and `node_modules` — no `tsup` bundling step was needed (TASKS.md Task 6 item 3 fallback not used).

`maxDuration` is 60 s. The current limits page says Hobby allows **300 s default and maximum** with fluid compute, so 60 is well inside the plan; it is chosen to cover the 20 s model timeout plus Terminal 3 and the database, not because the plan forces it.

## Commands actually run (with result)

- `vercel pull --yes --environment preview` → project settings + preview env downloaded
- `vercel build` → `"status": "ok"`, exit 0. Bundle: `runtime nodejs22.x`, `maxDuration 60`, and the traced tree contains `apps/api/dist/*.js`, `packages/contracts/dist/*.js`, `node_modules/.pnpm/*`
- `pnpm exec tsx src/scripts/migrate.ts` and `seed.ts` against the **Neon** `DATABASE_URL` → `Migrations complete.` / `Seed complete: cus_demo_alex (ORD-1001, ORD-1002), cus_demo_other (1 denial fixture)`, both exit 0
- Production deployment `parcel-guard-pd9a61fmx` → `● Ready` in 22 s

Endpoint checks against the deployed function (public production alias):

| Check | Result |
|---|---|
| `GET /api/v1/health` | `{"api":"ok","model":"mock","terminal3":"mock"}` — honest modes, no secrets |
| `POST /api/v1/demo/session` | `200`, `Set-Cookie: pg_session=…; Path=/; HttpOnly; Secure; SameSite=Lax` |
| `GET /api/v1/orders` with that cookie | `200`, ORD-1001 + ORD-1002 from Neon |
| `GET /api/v1/orders` without a cookie | `401 SESSION_REQUIRED` |
| `GET /api/v1/orders/ORD-2001` with a valid cookie | `404` |
| `GET /` | `200`, the static Vite build |

That covers the Task 6 "Done when" and, incidentally, the first real proof that the §1.1 single-project topology works: same origin, one cookie, no CORS.

## Not done / blocked

- **`vercel dev` was not used.** It fails on this Windows machine before starting — it shells out to `yarn`, which is not installed. TASKS.md marks that check optional; the Vite `/api` proxy remains the dev loop. Worth retrying on a machine with yarn or on WSL if someone wants it.
- **The endpoint checks were run against Production, not a Preview URL, as the task text asks.** Preview deployments sit behind Vercel Deployment Protection: a raw preview URL answers `302` to `vercel.com/sso-api`, so an unauthenticated `curl` can never reach the function. Disabling that is an account security setting and stays the owner's decision (see the open item below). The production alias is public, runs the identical build, and was deployed from the same commit, so the behaviour verified is the same.
- **The local `vercel build` output would not run on this machine.** Its `node_modules` contains the pnpm virtual store but not the symlinks that make resolution work, so a harness against the local bundle fails with `Cannot find package 'fastify'`. Vercel's Linux builders preserve those symlinks — proven by the deployed function working. Do not treat the local `.vercel/output` as runnable on Windows; it is only useful for inspecting what got traced.
- Azure and Terminal 3 remain in mock mode. `/health` reports `model: mock, terminal3: mock`, which is truthful — Tasks 7 and 8 flip those.

## Contract change requests

- none.

## Notes for the next lane

- **Two module-system traps, both already paid for.** The repository root has no `"type": "module"`, so Vercel compiles `api/index.ts` to **CommonJS**. A static `import { buildApp } from '../apps/api/dist/app.js'` therefore became a `require()` of an ESM package whose dependencies publish only an `import` condition. The entry now uses a **dynamic** `import()`, which works from CommonJS and resolves with ESM conditions. Renaming the file to `.mts` was tried first and rejected by the platform: *"The pattern `api/index.mts` defined in `functions` doesn't match any Serverless Functions inside the `api` directory."* Do not "simplify" that dynamic import back to a static one.
- **Import `apps/api/dist`, never `src`.** The api workspace compiles with NodeNext and emits `.js` specifiers on relative imports; the function bundler resolves those only against real `.js` files. `pnpm build` emits dist before functions are bundled.
- **Task 9 (owner):** the Neon database now has the schema and the seed applied, and every environment variable in TASKS.md §0.3 is present in the Vercel project for Production and Preview. `docs/handoffs/task-0.md` still says the Marketplace database was "NOT YET CREATED" — that line is out of date; a correction note is appended there.
- **Still open for the owner:** *Project → Settings → Deployment Protection → Vercel Authentication* → Disabled (or Production only). Until then a collaborator cannot open the Preview URL the Vercel bot posts on their own PR, which is the workflow `docs/ONBOARDING.md` promises them, and nobody can `curl` a Preview.
- **Task 10:** the deployed API is live at `https://parcel-guard-ai.vercel.app/api/v1/*`. The frontend on that origin still runs in mock mode; flipping `VITE_API_MODE` to `live` for the deployed build is a Task 9 environment decision, not a code change.
