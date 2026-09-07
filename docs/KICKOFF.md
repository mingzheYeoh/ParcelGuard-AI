# Kickoff message for a new collaborator

Send this as-is. Replace `<TASK NUMBER>` and `<TASK NAME>` with the one task you assigned
them (see the "Currently open" table below). Send the two API keys separately via a
one-time-view link — never in this message, never in a chat thread.

---

Hi — you're on **ParcelGuard AI**. Repo: https://github.com/mingzheYeoh/ParcelGuard-AI

You own exactly one task: **Task <TASK NUMBER> — <TASK NAME>**. Don't start another one
without telling me; two people in the same files is the one failure mode this project
can't absorb before the event.

Read `docs/ONBOARDING.md` first — 10-minute setup, and it lists what you can't do
(anything touching Vercel or the deployed database; that's my lane).

You do **not** need the Azure or Terminal 3 keys for Tasks 2, 3, 4 or 5 — the repo
defaults to `MODEL_PROVIDER=mock` and `TERMINAL3_MODE=mock`. I'll send keys only if
your task needs them, in a link that self-destructs on first view. Paste the value
straight into `apps/api/.env` and nowhere else.

Then paste the block below into Claude Code from the repo root:

````text
You are working on ParcelGuard AI, a pnpm monorepo (apps/web, apps/api,
packages/contracts). Tasks 0 and 1 are merged and accepted.

My assignment is Task <TASK NUMBER> in TASKS.md. Do only that task.

Before writing any code:
1. Read README.md, TASKS.md, PLAN.md, and Design.md end to end.
2. Read docs/handoffs/task-0.md and task-1.md — they record what actually exists
   versus what the runbook plans.
3. Read TASKS.md section 4.2 and list the file paths I'm allowed to write to.
   Everything outside that list is read-only for me. If I need a change there, it
   goes into my handoff as a request, not into the file.

Rules that override your defaults:
- Never assume a library's API or "latest" version. Check what's installed in
  node_modules / the lockfile before calling anything.
- packages/contracts is the interface between lanes. If Task 2 is accepted, it's
  frozen — request changes via the handoff instead of editing.
- Mock modes must stay truthful: return mode "unavailable" when a live provider
  isn't configured or fails. Never a canned answer labelled as live.
- Run the exact commands under "Done when" for my task and paste their real output.
  An unrun check is never reported as passed. If one fails, say so and stop.
- Work on branch task-<N>-<slug> off main. Never commit .env, .vercel/, or a key —
  run `git diff --cached | grep -iE "api_key|secret|postgres://"` before each commit.

Finish by writing docs/handoffs/task-<N>.md using the template in TASKS.md section 5:
what you completed, the commands you actually ran with their results, what's blocked,
any contract change requests, and notes for the lane that picks up after you.

Start by reading those files and telling me your plan for Task <TASK NUMBER>,
including the file ownership list from 4.2. Wait for my go-ahead before editing.
````

Open a draft PR early. Vercel comments a Preview URL on it — before Task 6 that only
proves the build compiles, which is still the signal I want to see. Request my review
when the handoff file is written; I merge.

Ping me in the group chat with the task number before you begin so nobody doubles up.

---

## Currently open (as of Tasks 0–1 accepted)

| Task | Name | Lane | Needs a key? |
|---|---|---|---|
| **2** | Shared contracts and fixtures | frontend | no |
| **4** | PostgreSQL schema, migrations, seed | backend | no — local Docker Postgres |

Tasks 2 and 4 are the parallel window W2 and touch no shared files, so they can run at
the same time with two collaborators. Task 3 unblocks when 2 is accepted; Task 5 when
4 is. Tasks 7 (Azure key) and 8 (Terminal 3 key) are the only code lanes needing a
secret, and both wait on Task 5.
