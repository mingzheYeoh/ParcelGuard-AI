# ParcelGuard AI

An AI support agent that helps with your orders and respects your boundaries.

Customers ask about synthetic orders in natural language; the model picks tools, the backend enforces ownership and business rules, and every action is recorded with honest evidence.

## Documents — read in this order

| File | Purpose |
|---|---|
| [TASKS.md](TASKS.md) | **Start here.** Prerequisites (accounts, API keys, downloads), deployment architecture, Task 0–11 with owners, parallel lanes for multiple agents, handoff template |
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

| Item | State |
|---|---|
| Frontend F0–F4 | not started |
| PostgreSQL schema | not started |
| Backend core | not started |
| Vercel Preview | not deployed |
| Model (Azure) | mock |
| Terminal 3 | mock |

Update this table only from verified results (`GET /api/v1/health` and task handoffs in `docs/handoffs/`). Nothing above is evidence of completion.

All orders, customers, and addresses are synthetic.
