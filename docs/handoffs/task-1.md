# Task 1 — Monorepo scaffold
Agent/role: lead   Branch: task-1-scaffold   Date: 2026-09-07 (UTC)

## Completed
- [x] pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) with root `package.json` scripts `build`, `dev`, `typecheck`, `lint`, `test` fanning out via `pnpm -r` — evidence: `pnpm typecheck` / `pnpm build` output below (3 of 4 projects run; root has no own script).
- [x] `apps/web` scaffolded: Vite 8.2.2 + React 19.2.8 + TypeScript 7.0.2 + Tailwind 4.3.3 (`@tailwindcss/vite`) + shadcn/ui (CLI 4.21.0, new-york, `radix-ui` 1.6.7, `cn` 0.2.5) + TanStack Query 5.102.8 + MSW 2.15.0 + Zod 4.5.4 — evidence: `apps/web/package.json`, `apps/web/src/components/ui/{button,card,badge}.tsx`, `apps/web/public/mockServiceWorker.js`.
- [x] Design.md §4.2 token block installed in `apps/web/src/styles/index.css` (light theme, teal accent, Inter stack) so Task 3 starts from the specified theme.
- [x] `apps/api` scaffolded: Fastify 5.12.3 + Zod 4.5.4 + tsx 4.23.13. `buildApp()` lives in `apps/api/src/app.ts` and does **not** call `listen()`; `apps/api/src/server.ts` is the local-only entry that listens on port 3001 (`PORT` override).
- [x] Placeholder `GET /api/v1/health` returns `{"data":{"api":"ok","model":"unavailable","terminal3":"unavailable"},"request_id":"req_..."}` — honest modes, no adapters configured yet.
- [x] `packages/contracts` created (TS + Zod) with `API_BASE_PATH`, `IntegrationMode`, `HealthResponse`, success/error envelope helpers. Full §6.2/§7 surface is deliberately left to Task 2.
- [x] Prototype moved with history: `git mv "ParcelGuard Workspace.dc.html" design-reference/`, `git mv support.js design-reference/`. Files were **not** edited (`git status` shows `R` renames only).
- [x] `.gitignore` (`node_modules`, `dist`, `.env*` with `!.env.example`, `.vercel`, logs, `*.tsbuildinfo`), `.nvmrc` (`20`), `.editorconfig`.
- [x] Vite proxy `/api` → `http://localhost:3001` in `apps/web/vite.config.ts` (port 5173, `strictPort`).
- [x] `docs/handoffs/.gitkeep` created; `apps/api/src/{routes,services,adapters,repositories}/.gitkeep` placeholders for Task 5.
- [x] Versions pinned to the exact installed versions (no `^`/`~` in any workspace `package.json`); `pnpm-lock.yaml` committed.
- [x] `.env.example` files for `apps/api` (server-only names) and `apps/web` (`VITE_*` only). No secrets committed.

## Commands actually run (with result)
- `node -v` → `v22.19.0`; `pnpm -v` → `11.22.0`
- `git mv "ParcelGuard Workspace.dc.html" design-reference/` and `git mv support.js design-reference/` → `git status --short` shows two `R` (rename) entries, no content changes
- `pnpm install --frozen-lockfile` → `Scope: all 4 workspace projects / Already up to date / Done in 365ms`
- `pnpm typecheck` → `packages/contracts: Done`, `apps/api: Done`, `apps/web: Done` (exit 0)
- `pnpm build` → contracts `tsc` Done, api `tsc` Done, web `vite build` `✓ 1979 modules transformed` → `dist/index.html 0.56 kB`, `dist/assets/index-D-M3pGFR.css 19.78 kB`, `dist/assets/index-BfPeiXO7.js 330.47 kB` (exit 0)
- `pnpm dev` → `apps/api dev: Server listening at http://127.0.0.1:3001`, `apps/web dev: VITE v8.2.2 ready … Local: http://localhost:5173/`
- `curl http://127.0.0.1:3001/api/v1/health` → `200` `{"data":{"api":"ok","model":"unavailable","terminal3":"unavailable"},"request_id":"req_mtr1aly8_1"}`
- `curl http://localhost:5173/api/v1/health` (through the Vite proxy) → same JSON body, proving `/api` → `:3001` forwarding
- `curl -o /dev/null -w %{http_code} http://localhost:5173/` → `200`; `.../mockServiceWorker.js` → `200`
- `pnpm exec msw init ./public --save` → worker script copied, `msw.workerDirectory` recorded in `apps/web/package.json`
- `pnpm dlx shadcn@4.21.0 add button card badge --yes` → created `src/components/ui/{button,card,badge}.tsx`

## Not done / blocked
- Browser rendering of the scaffold page was **not** visually verified (no browser automation used in this task); only HTTP status codes and the JSON payloads above were checked. Impact: none for Task 1 acceptance (`install`/`typecheck`/`build`/`dev` all verified), but the first real browser verification is owed by Task 3 (Design.md §13). Next action: frontend lane captures screenshots during Task 3.
- `lint` scripts are placeholder `echo` commands in all three workspaces (no ESLint configured). Impact: `pnpm lint` passes trivially and proves nothing. Next action: whoever needs linting (frontend lane, Task 3) adds ESLint + typescript-eslint and replaces the placeholders; root script already fans out.
- `test` scripts are placeholder `echo` commands. Vitest is added by Task 2 (contracts tests) and Task 5 (api integration tests).
- `vercel.json` and `api/index.ts` intentionally not created — they are Task 6 (deploy lane) per TASKS.md §4.2.

## Contract change requests
- none. `packages/contracts` currently exposes only `API_BASE_PATH`, `integrationModeSchema`, `healthResponseSchema`, `successEnvelopeSchema`, `errorEnvelopeSchema`. Task 2 owns and may freely restructure this file; it is not frozen yet.

## Notes for the next lane
- **Workspace package names are short** (`web`, `api`, `contracts`) so the TASKS.md commands work literally: `pnpm --filter contracts typecheck`, `pnpm --filter api db:migrate`, `pnpm --filter web build`.
- **Import specifier stays scoped**: `apps/web` and `apps/api` depend on `"@parcelguard/contracts": "workspace:contracts@*"` (pnpm workspace alias). Import from `@parcelguard/contracts`; the symlink `node_modules/@parcelguard/contracts → packages/contracts` exists in both apps.
- `contracts` resolves through `dist/`, so run `pnpm --filter contracts build` after editing it (root `pnpm dev` does this automatically before starting the apps; `contracts` also has a `dev` watch script).
- **Node version note:** `.nvmrc` is `22`, reconciled in Task 0 to match the Node **v22.19.0** this scaffold was installed and verified on, and `engines.node: "22.x"` in the root `package.json`. Vercel honors `engines` over the dashboard setting — the Preview build log confirms it overrides the project's `24.x`.
- **pnpm 11 note:** the `pnpm` field in `package.json` is ignored; settings live in `pnpm-workspace.yaml`. Build-script approval uses pnpm 11's **`allowBuilds`** map (`esbuild: true`, `msw: true`) — **not** pnpm 10's `onlyBuiltDependencies` list, which still parses (`pnpm config get` even returns it) but approves nothing, so installs die with `ERR_PNPM_IGNORED_BUILDS`. Regenerate with `pnpm approve-builds --all`. See Post-merge corrections below.
- **TypeScript 7.0.2** is installed (the new compiler). It removed `baseUrl`; `apps/web/tsconfig.json` uses `paths: { "@/*": ["./src/*"] }` without `baseUrl`. Do not re-add `baseUrl`.
- **shadcn/ui 4.x convention:** generated components import `{ cn } from "cn"` (official `cn` package) and primitives from the unified `radix-ui` package. `@/lib/utils` re-exports `cn` for application code. Keep one primitive family (Design.md §1) — do not add `@radix-ui/react-*` singles.
- API surface: `buildApp(options?)` in `apps/api/src/app.ts` returns a `FastifyInstance` with no listener; Task 5 registers real plugins/routes there and Task 6 wraps the same function in `api/index.ts`.
- Env var names are listed in `apps/api/.env.example` and `apps/web/.env.example`; real values never enter the repo (`.gitignore` allows only `.env.example`).
- Frontend defaults in code: `VITE_API_MODE` defaults to `mock`, `VITE_API_BASE_URL` defaults to `/api/v1`, so no `.env` file is required to run `pnpm dev`.

## Post-merge corrections (2026-09-07, owner)

Two defects surfaced only on Vercel, after this handoff was first written. Both are fixed on `main` (PR #1, merge `af8afb2`).

1. **`ERR_PNPM_IGNORED_BUILDS` — install failed on every Preview.** `pnpm-workspace.yaml` used pnpm 10's `onlyBuiltDependencies` list. pnpm 11 replaced it with the `allowBuilds` map; the old key parses but approves nothing, so `esbuild` and `msw` postinstall scripts were skipped and `pnpm install` exited 1 before any build ran. Local installs passed because the scripts had already run into an existing `node_modules` — only a clean clone reproduces it. Fixed in `c3f8c82`.
   - Reproduced: fresh clone + `CI=1 pnpm install --frozen-lockfile` → exit 1, identical message to the Vercel log.
   - After fix: same command → exit 0; `pnpm typecheck` → exit 0; `pnpm build` → exit 0.
2. **`No Output Directory named "public" found`.** Vercel infers install and build correctly from the root `package.json` but cannot guess the workspace output path. Added a minimal root `vercel.json` declaring `outputDirectory: apps/web/dist` only — `42ed7be`. The `/api/v1` rewrite and `functions.maxDuration` remain Task 6's to add.

Deployment evidence after both fixes:

- Preview `parcel-guard-7b0kduga8` → `● Ready`, `Build Completed in /vercel/output [11s]`.
- Production `parcel-guard-8cacdzycw` → `● Ready`; `curl https://parcel-guard-ai.vercel.app` → `HTTP 200`, serves `<title>ParcelGuard AI — Support workspace</title>`.

**Open item for Task 9 (deploy lane):** Preview deployments are behind Vercel Deployment Protection — a raw deployment URL returns `302` to `vercel.com/sso-api`. GitHub collaborators are not team members on this Hobby scope, so they cannot open the Preview links the Vercel bot posts on their PRs, which `docs/ONBOARDING.md` assumes they can. The production alias is unaffected (`200`). Owner must set *Project → Settings → Deployment Protection → Vercel Authentication* to Disabled or Production-only.
