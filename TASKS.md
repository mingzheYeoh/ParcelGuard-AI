# TASKS — ParcelGuard AI delivery runbook (Vercel edition)

> Version 1.0 · Date: 2026-09-07 · Language: English
> Companion documents: PLAN.md (business scope + API contract), Design.md (visual/interaction spec).
> Audience: the human owner and every coding agent working on this repository.
> This runbook is a plan. It is not evidence that any task below has been completed.

Read this file top to bottom before starting any task. Section 0 lists what a **human** must prepare. Sections 3–4 list the numbered tasks, who does them, and how agents run in parallel without colliding.

---

## 0. Prerequisites — prepare these BEFORE agents start

Agents cannot create accounts, accept terms of service, or obtain credits. The human owner does Section 0. Put every secret in the places listed in 0.4; never paste secrets into chat, commits, or `VITE_*` variables.

### 0.1 Accounts

| Account | Used for | What to obtain | Notes |
|---|---|---|---|
| **GitHub** | Source of truth; Vercel imports from it | Repository `ParcelGuard-AI` pushed with a `main` branch | Vercel Preview deployments come from branches/PRs |
| **Vercel** (Hobby is fine) | Hosts the Vite frontend and the Fastify backend as Vercel Functions | Team/personal scope; link the GitHub repo | [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify) · [Functions](https://vercel.com/docs/functions) |
| **Managed PostgreSQL via Vercel Marketplace** (Neon recommended) | Orders, conversations, proposals, actions, idempotency records | `DATABASE_URL` (pooled) and a second branch/database for local dev | Install from the Vercel project's *Storage* tab so the env var is injected automatically. [Marketplace](https://vercel.com/marketplace) · [Storage overview](https://vercel.com/docs/storage) |
| **Azure** (Azure for Students or any subscription with Azure OpenAI) | Intent understanding + tool selection | Resource endpoint, API key, deployment name of a small tool-calling model | Follow PLAN.md §9.2 preflight. Check quota > 0 before the event |
| **Terminal 3** (Agent Dev Kit sandbox) | Agent identity + protected action | Sandbox API key, starter repo access, SDK package name and version | [ADK](https://terminal3.io/products/agent-developer-kit) · [GitHub](https://github.com/Terminal-3). Record real capabilities; do not assume |

### 0.2 Software to install locally

| Tool | Version | Why |
|---|---|---|
| Node.js | 20 LTS or 22 LTS (must match the Vercel project's Node setting) | Frontend + backend runtime |
| pnpm | 9.x | Workspace monorepo |
| Git | any recent | Version control |
| Vercel CLI (`npm i -g vercel`) | latest | `vercel link`, `vercel env pull`, `vercel dev`, `vercel --prod` |
| Docker Desktop **or** a Neon dev branch | optional | Local PostgreSQL if you prefer not to hit the cloud DB during development |
| A Chromium browser | any | Required for browser verification screenshots |

### 0.3 Environment variables (final list)

Server-only variables live in Vercel *Project → Settings → Environment Variables* and in a local `apps/api/.env` (git-ignored). Frontend variables are `VITE_*` and contain **no secrets**.

```dotenv
# ---------- Server only (Vercel Functions + local apps/api/.env) ----------
DATABASE_URL=postgres://...            # injected by the Marketplace integration (use the POOLED URL)
SESSION_SECRET=<32+ random bytes>      # signs the demo session cookie
APP_ORIGIN=https://<project>.vercel.app # allowed Origin for mutations; localhost:5173 in dev
DEMO_MODE=true                          # enables POST /api/v1/demo/session

MODEL_PROVIDER=azure_openai             # or "mock" until Task 7 passes
AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=...

TERMINAL3_MODE=mock                     # mock | live ; switch to live only after Task 8 passes
T3N_API_KEY=...

# ---------- Frontend (apps/web/.env.*) — public, no secrets ----------
VITE_API_MODE=mock                      # mock (MSW) | live
VITE_API_BASE_URL=/api/v1
```

Generate `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 0.4 Where secrets go

| Environment | Location |
|---|---|
| Local | `apps/api/.env` (git-ignored). Pull Vercel values with `vercel env pull apps/api/.env` |
| Vercel Preview | Project env vars scoped to *Preview* |
| Vercel Production | Project env vars scoped to *Production* |

Never commit `.env`. Never add secrets to `vercel.json`. Never expose them through `VITE_*`.

### 0.5 Preflight checklist (human)

- [ ] GitHub repo pushed; Vercel project created and linked to it.
- [ ] Postgres added from the Vercel Marketplace; `DATABASE_URL` visible in project env vars.
- [ ] Azure: subscription active, credit remaining, deployment created, one test request succeeded (PLAN.md §9.2 steps 1–6).
- [ ] Terminal 3: sandbox key received; starter repo cloned; SDK version noted.
- [ ] `vercel env pull` works locally.
- [ ] Organizer confirmed pre-event building is permitted (PLAN.md §2).

---

## 1. Deployment architecture

| Part | Where | Responsibility |
|---|---|---|
| React + Vite frontend | Vercel (static build) | Workspace and chat UI |
| Fastify backend | Vercel Functions (Node runtime) | API, session, policy checks, tool loop, adapters |
| PostgreSQL | Managed via Vercel Marketplace (Neon) | Orders, conversations, proposals, actions, idempotency |
| OpenAI model | Azure OpenAI (stays in Azure) | Intent understanding and tool selection |
| Identity + protected action | Terminal 3 SDK, called from the backend | Actual protected flow where supported |

### 1.1 One Vercel project, same origin

Frontend and API are deployed as **one Vercel project** so the HttpOnly session cookie stays same-origin and no CORS is needed.

```text
/                      → Vite static build (apps/web/dist)
/api/v1/*              → rewritten to the Fastify function (api/index.ts)
```

Root `vercel.json` (target shape; verify against current Vercel docs in Task 6):

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "apps/web/dist",
  "installCommand": "pnpm install --frozen-lockfile",
  "rewrites": [
    { "source": "/api/v1/:path*", "destination": "/api" }
  ],
  "functions": {
    "api/index.ts": { "maxDuration": 60 }
  }
}
```

`maxDuration` must not exceed the plan limit shown in the Vercel dashboard. Model timeout stays at 20 s; the function budget must cover model + Terminal 3 + DB.

### 1.2 Stateless-backend rules (what changes vs. a local server)

Vercel Functions may run several instances and do not share memory or disk. Therefore:

1. **No SQLite, no in-memory repository in deployed mode.** All state goes to PostgreSQL.
2. **REQUEST_IN_PROGRESS (409) and proposal `executing` claims** are conditional `UPDATE ... WHERE status = ...` rows, not process-level locks.
3. **Idempotency records** (`session_id + key → stored response`) are a database table.
4. **No background work after the response.** Everything must finish inside the request.
5. **Migrations run from the developer machine or CI**, never at function cold start.
6. Use a **pooled** connection string and a serverless-friendly driver (Neon serverless driver or `postgres`/`pg` with the pooler URL). Create the pool at module scope so warm instances reuse it.
7. Use `SameSite=Lax; HttpOnly; Secure` cookies in Preview/Production; `Secure` may be off on `localhost`.
8. Local development still runs Fastify with `app.listen(3001)` behind the Vite `/api` proxy; the Vercel function wrapper is only an entry point around the same `buildApp()`.

### 1.3 Repository layout (target)

```text
ParcelGuard-AI/
  README.md  PLAN.md  Design.md  TASKS.md
  vercel.json
  pnpm-workspace.yaml  package.json
  api/
    index.ts                 # Vercel Function entry: wraps apps/api buildApp()
  apps/
    web/                     # React + Vite (Task 3)
    api/
      src/
        app.ts               # buildApp(): registers routes, plugins — no listen()
        server.ts            # local only: buildApp().listen(3001)
        routes/  services/  adapters/  repositories/
      drizzle/               # migrations (Task 4)
  packages/
    contracts/               # Zod schemas + TS types shared by web and api (Task 2)
  design-reference/          # prototype: ParcelGuard Workspace.dc.html, support.js
  docs/
    handoffs/                # task-N.md written by the agent that finished task N
```

---

## 2. Rules for every agent

1. Read README.md, TASKS.md, PLAN.md, and Design.md before editing anything. Inspect installed versions; never assume an API or a "latest" version.
2. Stay inside the **file ownership** of your task (Section 4.2). To change a file owned by another lane, write the request into your handoff file instead of editing it.
3. `packages/contracts` is frozen after Task 2 is accepted. Contract changes require updating PLAN.md §7 in the same commit and notifying the other lanes through the handoff file.
4. Run the check commands listed under **Done when** and report the actual result. Never report an unrun check as passed.
5. Missing cloud credentials block only the task that needs them. Keep mock modes truthful: `mode: "unavailable"` when a live provider is not configured or fails, never a silent canned answer labeled live.
6. Every task ends by writing `docs/handoffs/task-N.md` using the template in Section 5.
7. Commit on a branch named `task-N-<slug>`; open a PR to `main`. Vercel builds a Preview for every PR (from Task 6 onward).
8. Do not touch `design-reference/` except to move the prototype files there in Task 1.

---

## 3. Task list

Legend — **Owner**: `lead`, `frontend`, `backend`, `integration`, `deploy` (agent roles; one person or agent may hold several). **Depends on**: tasks that must be *accepted* first.

### Task 0 — Human preflight
**Owner:** human · **Depends on:** — · **Blocks:** 4 (DATABASE_URL), 7 (Azure), 8 (Terminal 3), 9 (Vercel)

Complete Section 0.5. Record the outcomes (no secrets) in `docs/handoffs/task-0.md`: Node version chosen, Vercel project name, DB provider, Azure deployment alias, Terminal 3 SDK package + version.

---

### Task 1 — Monorepo scaffold
**Owner:** lead · **Depends on:** — · **Blocks:** 2, 3, 4, 5

Do:
1. Create `pnpm-workspace.yaml` (`apps/*`, `packages/*`), root `package.json` with scripts `build`, `dev`, `typecheck`, `lint`, `test` that fan out to workspaces.
2. Scaffold `apps/web` (Vite + React + TS + Tailwind + shadcn/ui + TanStack Query + MSW + Zod), `apps/api` (Fastify + TS + Zod), `packages/contracts` (TS + Zod). Pin versions; commit the lockfile.
3. Move `ParcelGuard Workspace.dc.html` and `support.js` into `design-reference/`.
4. Add `.gitignore` (`node_modules`, `dist`, `.env*`, `.vercel`), `.nvmrc`, `.editorconfig`.
5. Add `apps/web/vite.config.ts` proxy: `/api` → `http://localhost:3001`.
6. Create empty `docs/handoffs/` with a `.gitkeep`.

Done when: `pnpm install && pnpm typecheck && pnpm build` pass from the root; `pnpm dev` starts web (5173) and api (3001) with a placeholder `GET /api/v1/health`.

---

### Task 2 — Shared contracts and fixtures
**Owner:** frontend (or lead) · **Depends on:** 1 · **Blocks:** 3, 5

Do:
1. In `packages/contracts`, implement Zod schemas + inferred types for every object in PLAN.md §6.2 and every endpoint request/response in §7 (envelopes, ChatTurn card union, ProposalResult, Action, IntegrationStatus, error codes).
2. Add `fixtures.ts` with the three orders and two addresses of §6.1 (labels only, no street addresses).
3. Export a typed `apiPaths` map so web and api use the same path strings.

Done when: `pnpm --filter contracts typecheck` passes; a unit test parses each §7 example JSON successfully; `docs/handoffs/task-2.md` declares the contract frozen.

---

### Task 3 — Frontend F0–F4 with MSW
**Owner:** frontend · **Depends on:** 2 · **Blocks:** 10

Do: implement PLAN.md §11 F0–F4 and Design.md §12 Steps 1–7 in `apps/web`. Components import only from `@parcelguard/contracts` and the API client; never from fixtures. MSW handlers hold in-memory demo state and implement every §7 status code as deterministic scenarios.

Done when: Design.md §13 acceptance checklist is verified in a real browser at 1440×900 and 390px; screenshots saved under `docs/screenshots/frontend/`; `VITE_API_MODE=live` boots without MSW and shows honest failures against the placeholder API; `pnpm --filter web typecheck build` pass.

---

### Task 4 — PostgreSQL schema, migrations, seed
**Owner:** backend · **Depends on:** 1, Task 0 (DATABASE_URL) · **Blocks:** 5

Do:
1. Add Drizzle ORM + drizzle-kit to `apps/api`. Choose the driver per Section 1.2 rule 6.
2. Tables: `customers`, `addresses`, `orders` (with `version`), `order_items`, `order_timeline`, `conversations`, `messages` (with `client_message_id` unique per conversation), `proposals` (status enum, `expected_order_version`, `expires_at`), `actions` (evidence JSONB), `idempotency_keys` (`session_id`, `key`, `proposal_id`, `response` JSONB, unique on session+key), `sessions`.
3. Scripts: `db:generate`, `db:migrate`, `db:seed` (seeds §6.1 fixtures idempotently), `db:reset` (dev only).
4. Document how to point `DATABASE_URL` at a local Docker Postgres or a Neon dev branch.

Done when: `pnpm --filter api db:migrate && db:seed` succeed against both the local DB and the Vercel Preview DB; a query confirms only two orders belong to `cus_demo_alex`.

---

### Task 5 — Fastify core on PostgreSQL
**Owner:** backend · **Depends on:** 2, 4 · **Blocks:** 6, 7, 8

Do: implement PLAN.md §7 and §8.1 modules except `agentService` (Task 7) and `terminal3Adapter` (Task 8), which start as `mock`/`unavailable` adapters behind the same interfaces.

1. `buildApp()` in `src/app.ts`; `server.ts` for local listen. No global mutable state besides the DB pool.
2. Session: `POST /demo/session` sets a signed HttpOnly cookie (`SESSION_SECRET`) referencing a `sessions` row bound to `cus_demo_alex`. Check `Origin` against `APP_ORIGIN` on every mutation.
3. policyService: ownership, address ownership, `processing`-only edits, expiry, version.
4. proposalService: state machine with conditional updates (`pending → executing → succeeded|failed|outcome_unknown`), 5-minute expiry, idempotency table semantics of §7.4, `ORDER_CHANGED` on version mismatch.
5. Messages: per-conversation in-flight flag in DB (`REQUEST_IN_PROGRESS`), 100-turn limit, duplicate `client_message_id` handling.
6. auditService: redacted actions; evidence `{source:"local", agent_did:null, provider_reference:null, verified:false}` until Task 8.
7. Error envelope + codes exactly as §7.6. Never leak the existence of ORD-2001.

Done when: integration tests (Vitest + `app.inject()`) cover: owned vs foreign order, shipped-order edit denial, proposal confirm success, duplicate confirm returns stored result, key reuse on another proposal → 409, expired → 410, version mismatch → 409, cross-session action access → 404. The frontend from Task 3 runs end-to-end with `VITE_API_MODE=live` against the local API (model in mock mode).

---

### Task 6 — Vercel Function adapter and project config
**Owner:** deploy · **Depends on:** 5 · **Blocks:** 9

Do:
1. Read the current [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify) docs. Implement `api/index.ts` exactly as documented. If the documented preset does not fit a monorepo, use the request-forwarding form: `await app.ready(); app.server.emit('request', req, res)` around `buildApp()`.
2. Write `vercel.json` per Section 1.1; set `maxDuration` within plan limits.
3. Make sure the function bundle includes `apps/api` and `packages/contracts` (Vercel's file tracing follows relative imports; if tracing fails, add a `tsup` bundle step in `apps/api` and import the bundled file).
4. `vercel dev` runs the whole project locally with the same rewrites (optional check; the Vite proxy remains the primary dev loop).

Done when: `vercel build` succeeds locally; `vercel deploy` produces a Preview URL where `GET /api/v1/health` returns `{api:"ok", model:"mock"|"unavailable", terminal3:"mock"|"unavailable"}` and `POST /api/v1/demo/session` sets a cookie that `GET /api/v1/orders` accepts.

---

### Task 7 — Azure OpenAI agent loop
**Owner:** integration · **Depends on:** 5, Task 0 (Azure) · **Blocks:** 10

Do:
1. Run PLAN.md §9.2 preflight and §9.3 connectivity sample from `apps/api`. Record actual results (redacted) in the handoff.
2. Implement `agentService`: two tools only (§8.2), ≤3 rounds / ≤4 calls, Zod-validated args, customer injected from session, no `customer_id` parameter.
3. Map model failures to `MODEL_TIMEOUT` (504), `MODEL_RATE_LIMITED` (429 + Retry-After), `MODEL_UNAVAILABLE` (502).
4. Journey E: refusal without tool call → `agent_refusal`; backend-rejected tool call → `policy_denied`.
5. `IntegrationStatus.model` reports `live` only after an actual successful call in the current deployment; deployment alias only if allowed to disclose.

Done when: the five user journeys of PLAN.md §3 pass against the local API with `MODEL_PROVIDER=azure_openai`, and the same on the Vercel Preview after Task 9. Token limits and `store:false` set.

---

### Task 8 — Terminal 3 adapter
**Owner:** integration · **Depends on:** 5, Task 0 (Terminal 3) · **Blocks:** 10

Do: follow PLAN.md §10 steps 1–6.
1. Install the official SDK at the version noted in Task 0; run its starter against the sandbox from `apps/api`.
2. Implement `terminal3Adapter` behind the interface from Task 5. Support exactly the protected operation the starter actually provides; document what it is.
3. Wire it into `proposalService` confirm: dispatch after claiming `executing`; keep the operation ID; timeouts → `outcome_unknown`, never blind retry.
4. Fill `evidence` from real responses; `verified:true` only when the SDK returns a verifiable result.
5. **Compatibility check on Vercel**: confirm the SDK works inside a Vercel Function (no native binaries, no long-lived sockets, no filesystem writes outside `/tmp`). If it does not, report the exact failure and keep `TERMINAL3_MODE=mock` in the deployed environment.

Done when: at least one confirm produces provider evidence locally; the Vercel Preview shows `terminal3: live` **or** a documented `unavailable` with the concrete reason in the handoff.

---

### Task 9 — Vercel environments and first Preview
**Owner:** deploy · **Depends on:** 6 (plus 7/8 when available) · **Blocks:** 10

Do:
1. Set every Section 0.3 server variable for *Preview* and *Production* in the Vercel project. Confirm `DATABASE_URL` comes from the Marketplace integration.
2. Run `db:migrate` and `db:seed` against the Preview database from a local shell with `vercel env pull`.
3. Set the project Node version to match `.nvmrc`.
4. Open a PR; verify the automatic Preview deployment builds and the health endpoint reports honest modes.
5. Set `APP_ORIGIN` to the Preview URL (or use `VERCEL_URL` derivation documented in code) so Origin checks pass.

Done when: Preview URL serves the UI, session cookie works, orders list shows two orders, and the handoff lists each env var name (not value) with its scope.

---

### Task 10 — End-to-end verification on Preview
**Owner:** deploy + frontend · **Depends on:** 3, 7, 8, 9

Do: execute PLAN.md §14 "Backend and integrated stages" checklist **on the Preview URL** in a real browser and with `curl`:
1. Journeys A–E of §3.
2. Duplicate confirm with the same and with a different Idempotency-Key.
3. Expired proposal (temporarily lower expiry via env for the test, or wait 5 min).
4. Cross-session access with a second browser profile.
5. Bundle audit: `grep` the built `apps/web/dist` for `AZURE`, `T3N`, `DATABASE_URL` — must be absent.
6. Cold start latency of the function and one full model turn; record numbers.

Done when: every checklist item has a result (pass/fail/blocked with reason) and screenshots are in `docs/screenshots/preview/`. Do not mark the stage complete with unverified items.

---

### Task 11 — Production promotion and demo rehearsal
**Owner:** lead · **Depends on:** 10

Do:
1. Merge to `main` → Production deployment. Re-run Task 10 items 1, 2 and 5 on the Production URL.
2. Run `db:seed` against Production DB (idempotent) so ORD-1002 is back on `Home`.
3. Rehearse PLAN.md §15 two-minute demo twice; note the reset procedure (`db:seed`) between runs.
4. Update README.md status table with the verified modes (`live` / `mock` / `unavailable`) for model and Terminal 3.

Done when: README status table matches `GET /api/v1/health` on Production; demo reset works in under 30 s.

---

## 4. Multi-agent execution

### 4.1 Lanes and order

```text
Task 0 (human) ───────────────────────────────┐
Task 1 (lead) ──► Task 2 (frontend) ──► Task 3 (frontend) ────────────────┐
                        │                                                 │
                        └──► Task 4 (backend) ──► Task 5 (backend) ──► Task 6 (deploy) ──► Task 9 (deploy) ──► Task 10 ──► Task 11
                                                       ├──► Task 7 (integration: Azure) ─────────┘
                                                       └──► Task 8 (integration: Terminal 3) ────┘
```

Parallel windows:

| Window | Agents running at the same time |
|---|---|
| W1 | Task 1 alone (scaffold must land first) |
| W2 | Task 2 (contracts) ∥ Task 4 (DB schema — needs only §6.2, not the contracts package) |
| W3 | Task 3 (frontend) ∥ Task 5 (backend) |
| W4 | Task 6 (deploy) ∥ Task 7 (Azure) ∥ Task 8 (Terminal 3) |
| W5 | Task 9 → Task 10 → Task 11 sequential |

### 4.2 File ownership (write access)

| Path | Owner lane | Others |
|---|---|---|
| `packages/contracts/**` | frontend (Task 2), frozen afterwards | read-only; request changes via handoff |
| `apps/web/**` | frontend | read-only |
| `apps/api/src/routes/**`, `services/policy*`, `services/proposal*`, `repositories/**`, `drizzle/**` | backend | read-only |
| `apps/api/src/services/agentService*`, `adapters/azure*` | integration (Task 7) | read-only |
| `apps/api/src/adapters/terminal3*` | integration (Task 8) | read-only |
| `api/index.ts`, `vercel.json`, `.nvmrc`, root `package.json` scripts | deploy | read-only after Task 1 |
| `PLAN.md`, `Design.md`, `TASKS.md`, `README.md` | lead | propose edits via handoff |
| `docs/handoffs/task-N.md` | the agent doing task N | append-only by others |

Interfaces between lanes are defined by `packages/contracts` (HTTP) and by the adapter interfaces created in Task 5 (`ModelAdapter`, `Terminal3Adapter`). Backend must ship those interfaces with mock implementations so Tasks 7 and 8 can start without waiting for each other.

### 4.3 Conflict protocol

- If a task discovers a contract gap, it writes the proposed change into its handoff under **Contract change requests**, then the lead updates PLAN.md §7 and `packages/contracts` in one commit and pings the affected lanes.
- Never "fix" another lane's code inline. File an issue in the handoff with file path, line, and the observed failure.

---

## 5. Handoff template (`docs/handoffs/task-N.md`)

```markdown
# Task N — <name>
Agent/role: <lane>   Branch: task-N-<slug>   Date: <UTC>

## Completed
- [x] <requirement> — <evidence: command or screenshot path>

## Commands actually run (with result)
- `pnpm --filter api test` → 18 passed
- ...

## Not done / blocked
- <item> — impact: <what breaks> — next action: <who does what>

## Contract change requests
- <none | description>

## Notes for the next lane
- <env var names needed, interface locations, gotchas>
```

---

## 6. Factual boundaries

- Vercel documents Fastify as a supported backend framework and runs it on Vercel Functions; verify the exact entry-file convention against the live docs at implementation time.
- Vercel Functions have an ephemeral, read-only filesystem except `/tmp`; SQLite there is unsuitable for persistence. Managed databases are added through the Vercel Marketplace.
- Function duration limits depend on the Vercel plan; check the dashboard before setting `maxDuration`.
- Terminal 3 SDK compatibility inside Vercel Functions is unverified until Task 8 step 5 is executed.
- Nothing in this file has been executed. Task handoffs are the only completion evidence.
