# Task 0 — Human preflight
Owner: human (with assistant help)   Date: 2026-09-07 (UTC)

## Environment decisions
- Node version: **22.x** (local v22.19.0). `.nvmrc` = `22`, root `package.json` `engines.node` = `22.x` so Vercel uses 22 regardless of the dashboard default (dashboard currently shows 24.x — leave it, engines wins; or set it to 22.x manually for clarity).
- pnpm 11.22.0 · Vercel CLI 59.11.7
- Vercel project: **parcel-guard-ai** (scope `yeoh-ming-zhe-s-projects`), linked via `.vercel/project.json` (git-ignored). Framework preset currently "Other" — Task 6 sets it up through `vercel.json`.
- GitHub: `mingzheYeoh/ParcelGuard-AI`, branch `main`.

## Database
- **Local:** PostgreSQL on `localhost:5432`, database `parcel_guard` already exists (verified in DBeaver, user `postgres`). Local `apps/api/.env` points there — fill in the password.
- **Cloud (Vercel Marketplace):** **NOT YET CREATED.** Human must do: Vercel dashboard → project `parcel-guard-ai` → *Storage* → *Create Database* → *Neon* → accept terms. This injects `DATABASE_URL` into Preview/Production automatically. Task 4 can start on the local DB; Task 9 needs the cloud one.

## Azure OpenAI
- Foundry project `myinvois-project`, resource `myinvois`, deployment **`chat-small`** (model gpt-5.4-mini, version 2026-03-17, Global Standard, status Succeeded).
- Endpoint form for the OpenAI SDK: `https://myinvois.services.ai.azure.com/openai/v1/` (set in local `.env` and Vercel Preview/Production as `AZURE_OPENAI_BASE_URL`).
- API key: **human must paste** into `apps/api/.env` (`AZURE_OPENAI_API_KEY`) and into Vercel (`vercel env add AZURE_OPENAI_API_KEY preview` / `production`).
- Connectivity test: `node scripts/preflight/azure-smoke.mjs` → **not yet run** (waiting for the key). Record its PASS/FAIL output here.
- Note: Foundry's sample uses `DefaultAzureCredential`; we use the API key per PLAN.md §9.3. If `/openai/v1/responses` returns 404 on this project endpoint, fall back to the resource's `https://myinvois.openai.azure.com/openai/v1/` form and record which one worked.

## Terminal 3
- Sandbox API key: **pending** (obtain from the event organizer / ADK signup).
- SDK package + version: **pending** — record after cloning the starter.
- Deployed `TERMINAL3_MODE=mock` until Task 8 passes.

## Vercel environment variables (names only; scope Preview + Production)
Set by CLI: `DEMO_MODE`, `MODEL_PROVIDER`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_DEPLOYMENT`, `TERMINAL3_MODE`, `SESSION_SECRET` (generated), `APP_ORIGIN` (= `https://parcel-guard-ai.vercel.app`; Task 9 adjusts for Preview URLs).
Still missing: `AZURE_OPENAI_API_KEY` (human), `T3N_API_KEY` (human, when received), `DATABASE_URL` (Marketplace integration).

## Remaining human actions
- [ ] Paste local Postgres password into `apps/api/.env`.
- [ ] Paste Azure API key into `apps/api/.env`; run `node scripts/preflight/azure-smoke.mjs`; paste result summary here.
- [ ] `vercel env add AZURE_OPENAI_API_KEY preview` and `... production` (paste key when prompted).
- [ ] Create Neon database from Vercel Storage tab; confirm `vercel env pull` shows `DATABASE_URL`.
- [ ] Obtain Terminal 3 sandbox key + SDK name/version; add `T3N_API_KEY` locally and in Vercel.
- [ ] Confirm organizer permits pre-event building.
