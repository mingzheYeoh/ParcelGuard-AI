# Onboarding for collaborators

> Applies to anyone joining via GitHub. Read this, then TASKS.md.

## Roles

| Role | Who | Tasks |
|---|---|---|
| **Owner** (Vercel + cloud accounts) | @mingzheYeoh | Task 0, 6, 9, 10, 11 — everything that touches the Vercel project, its env vars, the Marketplace database, and Production |
| **Collaborator** (code only) | GitHub collaborators | Task 2, 3, 4, 5, 7, 8 — all application code, tests, and local verification |

The Vercel project lives in the owner's personal (Hobby) scope, which has no team seats. Collaborators therefore **do not** run `vercel link`, `vercel env`, or `vercel deploy`. Pushing a PR to GitHub triggers an automatic Preview build; the Vercel bot comments the Preview URL and build log on the PR, which is all a collaborator needs to see.

## What you receive from the owner (out of band, never via chat/email in plain text)

- `AZURE_OPENAI_API_KEY` (or claim a second key in Foundry)
- `T3N_API_KEY` — **or** claim your own at https://www.terminal3.io/claim-page (self-serve, free, shown once)
- Nothing else is secret: all other values are in `apps/api/.env.example` and `TASKS.md §0.3`.

## Setup (10 minutes)

```bash
git clone https://github.com/mingzheYeoh/ParcelGuard-AI.git && cd ParcelGuard-AI
nvm use                                  # Node 22 (.nvmrc)
corepack enable && pnpm install --frozen-lockfile

# local PostgreSQL — either an installed server or Docker:
docker run --name parcelguard-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=parcel_guard -p 5432:5432 -d postgres:16

cp apps/api/.env.example apps/api/.env   # then edit:
#   DATABASE_URL=postgres://postgres:pg@localhost:5432/parcel_guard
#   SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   AZURE_OPENAI_BASE_URL=https://myinvois.services.ai.azure.com/openai/v1/
#   AZURE_OPENAI_DEPLOYMENT=chat-small
#   AZURE_OPENAI_API_KEY=<from owner>
#   T3N_API_KEY=<from owner or your own claim>

pnpm typecheck && pnpm build && pnpm dev # web :5173, api :3001
```

Optional preflights: `node scripts/preflight/azure-smoke.mjs`, `npx tsx scripts/preflight/terminal3-smoke.ts`.

## Workflow

1. Pick an unclaimed task from TASKS.md §3 whose dependencies are accepted (check `docs/handoffs/`). Announce it in the team channel to avoid two people on one task.
2. Branch `task-N-<slug>` from `main`. Stay inside the file ownership of TASKS.md §4.2.
3. Open a PR early (draft is fine). The Vercel bot posts a Preview URL — from Task 6 onward it exercises the real function; before that it only proves the build.
4. Finish by writing `docs/handoffs/task-N.md` (template in TASKS.md §5) with commands actually run and their results.
5. Request review from the owner; the owner merges.

## Things collaborators cannot do (ask the owner)

- Change Vercel env vars, Node setting, or `vercel.json` behaviour on the deployed project
- Run migrations/seed against the Preview or Production database
- Promote to Production
- Rotate the Azure or Terminal 3 keys

## Never

- Commit `.env`, `.vercel/`, or any key. `git diff --cached | grep -iE "api_key|secret|postgres://"` before every commit.
- Edit files owned by another lane; put the request in your handoff instead.
- Report an unrun check as passed.
