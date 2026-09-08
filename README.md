# ParcelGuard AI

An AI support agent that helps with your orders and respects your boundaries.

Customers ask about synthetic orders in natural language; the model picks tools, the backend enforces ownership and business rules, and every action is recorded with honest evidence.

## Documents — read in this order

| File | Purpose |
|---|---|
| [TASKS.md](TASKS.md) | **Start here.** Prerequisites (accounts, API keys, downloads), deployment architecture, Task 0–11 with owners, parallel lanes for multiple agents, handoff template |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | **Collaborators start here.** Roles (owner runs Vercel tasks; collaborators write code), local setup, PR workflow |
| [PLAN.md](PLAN.md) | Business scope, user journeys, data model, API contract v1, backend/model/Terminal 3 rules, acceptance criteria |
| [Design.md](Design.md) | Design tokens, layout, components, interaction, frontend implementation order |
| `design-reference/` | Visual prototype (`ParcelGuard Workspace.dc.html`, `support.js`) — reference only, not runtime |

## Deployment target

| Part | Where |
|---|---|
| React + Vite frontend | Vercel (static) |
| Fastify backend | Vercel Functions (`api/index.ts`) |
| PostgreSQL | Vercel Marketplace managed database |
| Model | Azure OpenAI |
| Identity / protected action | Terminal 3 SDK (server-side) |

## Quick start (after Task 1)

```bash
pnpm install
vercel env pull apps/api/.env     # or copy the variables from TASKS.md §0.3
pnpm --filter api db:migrate && pnpm --filter api db:seed
pnpm dev                          # web :5173 (proxy /api → :3001), api :3001
```

## Status

Live: **https://parcel-guard-ai.vercel.app**

| Item | State | Verified by |
|---|---|---|
| Frontend F0–F4 | done | browser pass on the deployment, `docs/handoffs/task-3.md`, `task-10.md` |
| PostgreSQL schema | done | 11 tables, migrations + idempotent seed, `task-4.md` |
| Backend core | done | 35 API tests against a real database, `task-5.md` |
| Vercel Preview | deployed | `task-6.md`, `task-9.md` |
| Model (Azure) | **live** | `GET /api/v1/health` → `"model":"live"`; five journeys on Production, `task-7.md` |
| Terminal 3 | **live**, attestation **not verified** | `GET /api/v1/health` → `"terminal3":"live"`; real `did:t3n:…`, `verified:false`, `task-8.md` |

What "Terminal 3: live" means here, precisely: a confirmed address change opens a real Terminal 3 session and stores the platform-assigned agent DID as evidence. It does **not** execute a protected TEE contract, and the TEE attestation is unverified because the testnet trust manifest is malformed today — so `evidence.verified` is `false`, the UI shows "Not verified", and `provider_reference` is `Not available` rather than an invented id. See `docs/handoffs/task-8.md`.

`GET /api/v1/health` reports `unavailable` on a cold function instance until a real call succeeds in it; that is deliberate, not a fault. Do one chat turn before reading it.

Update this table only from verified results (`GET /api/v1/health` and task handoffs in `docs/handoffs/`). Nothing above is evidence of completion.

All orders, customers, and addresses are synthetic.
