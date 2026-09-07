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

## Terminal 3 (researched 2026-09-07 from docs.terminal3.io and github.com/Terminal-3)
- **How to get the key:** self-serve, no approval. Sign in with a work email at https://www.terminal3.io/claim-page ; enter the event campaign code if the organizer gives one (extra credits). The developer key (`T3N_API_KEY`) is **shown once** — copy it immediately. A tenant DID (`did:t3n:…`) and test credits are issued automatically.
- **SDK:** npm `@terminal3/t3n-sdk` (latest on registry: **5.10.0**; the official Circle demo pins `^4.2.0`). Environment: `setEnvironment("testnet")`.
- **Official docs mirrored** (raw `.md` from docs.terminal3.io) in `docs/terminal3/`: quickstart, reference (confirmed SDK methods), agent-auth, register-agent, request-test-tokens, common-errors, ai-coding-assistants. The official Claude Code skill is installed at `.claude/skills/t3n-adk-quickstart/SKILL.md`.
- **Starter repos:** `Terminal-3/adk-getting-start` is empty/inaccessible; the usable reference is `Terminal-3/adk-circle-call-centre-agent-demo` (OpenAI tool-use loop + `T3nClient.executeAndDecode`) and `Terminal-3/z-tenant-flight` (example TEE contract, Rust → wasm32-wasip2).
- **Important scoping facts for Task 8:**
  1. Identity/authentication needs only the SDK (no Rust). A **protected action** (`tenant.contracts.execute`) requires a registered WASM contract compiled with Rust + `wasm32-wasip2`; PLAN.md §10 says not to spend the build block learning that stack — reuse `z-tenant-flight` or the Circle demo contract if a protected call is attempted.
  2. An agent acting for a user needs its **own** DID/key (separate claim) plus an `agent-auth-update` grant — see `docs/terminal3/agent-auth.md`.
  3. The SDK loads a **WASM component**; official docs report bundler (Vite/Next/Webpack) breakage. For Vercel Functions the SDK must stay **external / unbundled** (plain Node `import`), and `/tmp` is the only writable path. This is the Task 8 step 5 compatibility check.
- Support: developer Telegram https://t.me/terminal3developer , devrel@terminal3.io
- Connectivity test: `npx tsx scripts/preflight/terminal3-smoke.ts` → **not yet run** (waiting for the key).
- Deployed `TERMINAL3_MODE=mock` until Task 8 passes.

## Vercel environment variables (names only; scope Preview + Production)
Set by CLI: `DEMO_MODE`, `MODEL_PROVIDER`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_DEPLOYMENT`, `TERMINAL3_MODE`, `SESSION_SECRET` (generated), `APP_ORIGIN` (= `https://parcel-guard-ai.vercel.app`; Task 9 adjusts for Preview URLs).
Still missing: `AZURE_OPENAI_API_KEY` (human), `T3N_API_KEY` (human, when received), `DATABASE_URL` (Marketplace integration).

## Remaining human actions
- [ ] Paste local Postgres password into `apps/api/.env`.
- [ ] Paste Azure API key into `apps/api/.env`; run `node scripts/preflight/azure-smoke.mjs`; paste result summary here.
- [ ] `vercel env add AZURE_OPENAI_API_KEY preview` and `... production` (paste key when prompted).
- [ ] Create Neon database from Vercel Storage tab; confirm `vercel env pull` shows `DATABASE_URL`.
- [ ] Claim Terminal 3 key at https://www.terminal3.io/claim-page (work email; campaign code if given); paste into `apps/api/.env` as `T3N_API_KEY`; run `pnpm add -D -w @terminal3/t3n-sdk tsx && npx tsx scripts/preflight/terminal3-smoke.ts`; paste the `Connected as: did:t3n:…` line here; then `vercel env add T3N_API_KEY preview` / `production`.
- [ ] Confirm organizer permits pre-event building.
