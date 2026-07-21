# KushHR

KushHR is a lean, single-company HRMS that runs fully off-cloud on a self-hosted Supabase stack.

**Tech stack**

- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **UI / styling:** Tailwind CSS v4, shadcn/ui conventions (Radix UI primitives), Lucide icons, Sonner toasts, next-themes, Recharts
- **Backend:** Next.js Server Actions + Route Handlers
- **Database:** PostgreSQL 17 (self-hosted Supabase) with Row Level Security
- **Auth & storage:** Supabase Auth + Supabase Storage
- **Validation:** Zod
- **Testing:** Playwright (E2E)
- **Infra / deployment:** Self-hosted Supabase stack via Docker Compose (Caddy/nginx reverse proxy)

All v1 MVP modules are implemented and verified: auth/RBAC, employee directory, departments, leave, documents, payroll change requests, onboarding, performance appraisals, role-specific dashboards, and audit logs. Phase 13 automated remediation and `/ultrareview` remediation are complete; manual human-flow UAT is in progress using `docs/checks/phase-13.md`. See `docs/final-handover.md`, `docs/ultrareview-findings.md`, and `docs/checks/phase-13.md` for current state and known limitations.

## Quick start

KushHR runs **fully off-cloud** on a self-hosted Supabase stack. The primary way to run it is the Docker stack — see [Run the self-hosted stack (Docker)](#run-the-self-hosted-stack-docker) below. Once it's up — and after the one-time database init (apply migrations + seed; see [Run the self-hosted stack (Docker)](#run-the-self-hosted-stack-docker)) — open `https://kushhr.internal` (or `http://localhost:3100`) and log in with a seeded account (e.g. `admin@kushhr.dev` / `TestPass123!`).

To iterate on the app without rebuilding the container, you can run the Next.js dev server on the host against the same local stack:

```bash
# 1. Install dependencies (once, or after pulling new changes)
npm install

# 2. The repo ships a local-pointing `.env.local` (NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000)
#    targeting the running self-host stack. No cloud credentials required.

# 3. Start the dev server (port 3100)
npm run dev
```

Then open `http://localhost:3100`. The dev server runs on **3100** (`-p 3100`), leaving 3000 free for other local projects.




## Commands

```bash
npm run dev
npm run lint
npm run build
npm run test:e2e
npm audit --audit-level=moderate
```

Playwright uses Chromium. If the browser binary is missing, run:

```bash
npx playwright install chromium
```

## Environment

The repo's `.env.local` points at the **local self-hosted stack** (`NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000`) and carries the self-host anon + service-role keys. It is consumed only by host `npm run dev` and the Playwright suite — the Docker app container reads `infra/supabase/.env` instead. The previous cloud configuration is archived (gitignored) as `.env.local.cloud-retired`; KushHR no longer connects to any cloud Supabase project.

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are used by browser-safe Supabase clients. `SUPABASE_SERVICE_ROLE_KEY` is backend-only and must never be imported by client code.

## Run the self-hosted stack (Docker)

The full off-cloud stack — Supabase services + the Next.js app + a Caddy front door — runs from `infra/supabase/` via two layered compose files (`docker-compose.yml` is the Supabase base; `docker-compose.app.yml` adds the `web` and `caddy` services). All commands run from the `infra/supabase/` directory.

> The bare `docker compose …` commands below auto-load **both** files because `infra/supabase/.env` sets `COMPOSE_FILE=docker-compose.yml:docker-compose.app.yml` (shape documented in `.env.example`). No `-f` flags needed. Run from `infra/supabase/` so Compose reads that `.env`.

Requires the gitignored runtime config to be present in `infra/supabase/`: `.env` (secrets, consumed via compose interpolation) and `certs/` (Caddy's internal CA). The app container reads its secrets from `infra/supabase/.env`, **not** from the root `.env.local`.

**Auth emails** (password reset, invite, email-change) route through **Resend SMTP** — GoTrue reads `SMTP_HOST=smtp.resend.com` / `SMTP_USER=resend` / `SMTP_PASS=<Resend API key>` from `infra/supabase/.env` (the key lives only there; `.env.example` documents the shape). On the sandbox sender `onboarding@resend.dev`, Resend delivers only to the Resend account-owner's address until a domain is verified. After editing the SMTP block, recreate the auth service: `docker compose up -d auth`.

**Reset/invite link origin** — the admin-triggered password-reset/invite link is built from the optional `APP_URL` env var (server-only). Set it to the public FQDN (e.g. `https://hr.example.com`) in production self-host so links never derive from request headers (host-header-poisoning defence; GoTrue's redirect allowlist is the upstream mitigation). Unset → falls back to the request host (fine for local dev).

**Bring the stack up** (builds the app image, waits for health):

```bash
cd infra/supabase
docker compose up -d --build --wait
```

The app is then served behind Caddy at `https://kushhr.internal` (and directly on `http://localhost:3100`). Studio is on `http://localhost:8000`.

**Initialize the database — first boot only.** A fresh clone starts with an empty DB volume: `docker compose up` brings up Supabase's services but does **not** apply KushHR's schema or demo accounts. Apply the migrations and seed once, **from the repo root**:

```bash
npm run db:bootstrap
```

This applies all schema migrations (in order) plus the demo seed to the running `supabase-db` container, then prints the demo accounts it created. It's **fresh-only and safe to run twice**: if the schema already exists it prints `already initialized — skipping` and does nothing; if the stack isn't up it aborts cleanly. (Under the hood it runs `psql` as `supabase_admin` — the self-host superuser — because some migrations create indexes on `auth.users`, which the non-superuser `postgres` role cannot.)

This is needed only once per fresh DB volume — the data persists across `down`/`up` (see the `-v` warning below). Seeded logins (**all password `TestPass123!`**): `admin@kushhr.dev` (Admin), `manager@kushhr.dev` (Manager), `alice@kushhr.dev` / `bob@kushhr.dev` (Employees). Until this step runs, login returns "invalid email and password."

**Applying *new* migrations to a DB that already has data** (e.g. a deployed server after a `git pull`) is a different job — `db:bootstrap` no-ops on a populated DB. Use `npm run db:migrate` instead: it tracks applied migrations in a ledger and applies only the pending ones, each in its own transaction. See `docs/server-deploy.md` §6 (incl. the one-time `--backfill` for a pre-ledger DB).

**Bring the stack down** (stops containers, **keeps all data**):

```bash
cd infra/supabase
docker compose down
```

> ⚠️ **Never add `-v` to `down` unless you intend to wipe everything.** The `-v` flag deletes the named volumes (`supabase_db-data`, `supabase_storage-data`) that hold the migrated database and storage blobs. A plain `down` is always safe — the data lives in Docker volumes keyed on the `supabase` project name, so it survives restarts and even moving between git worktrees.

**Status, logs, and rebuilds:**

```bash
# Container health
docker compose ps

# Follow the app logs
docker compose logs -f web

# Rebuild the app after a code change (same up command — --build picks up changes)
docker compose up -d --build --wait web
```

## Working with Claude (change workflow)

Every code change in this repo follows the same loop. This is enforced by `CLAUDE.md` and the project's slash commands.

```
[session start] /user-resume
[Shift+Tab → Plan mode]
"Plan: <your ask>"
[review plan → approve or refine]
[Claude executes + updates immediate docs as part of the change]
[manual smoke in a browser]           (if recommended — run before the agents)
/user-qa                              (if recommended)
/user-review                          (if recommended)
/user-uiux                            (if recommended)
npx playwright test ... -g "<scope>"  (if Claude recommended a targeted command)
[end of session] "wrap up"
```

### One-word nudges if Claude slips

| If missing from Claude's response | Type |
|---|---|
| Systems Thinking section in the plan | `systems thinking?` |
| Post-change recommendation block | `post-change?` |
| Manual smoke steps when browser-behaviour-sensitive | `manual smoke?` |
| Docs updated section | `docs?` |
| Session log at end of session | `wrap up` |

### What happens at each step

0. **Session start: `/user-resume`.** Loads minimum context — last `handover.md` entry, `docs/current-phase.md`, and the one operational doc the handover's "Next" line points to (a UAT flow, a check doc, etc.). Produces a 3-line status (last session / current phase / active work) and asks what the focus is. Does **not** load `pending-backlog.md`, `MainProjectSteps.md`, or `PROJECT_CONTEXT.md` unless asked — those are roadmap-level and waste tokens at start.

1. **Plan mode first.** Every non-trivial change starts in plan mode. Plans MUST include a Systems Thinking section answering: where state lives, where failure feedback lives, and what breaks if this is removed (see `docs/systems-thinking.md`).
2. **Approve.** Use ExitPlanMode to accept, or push back with refinements.
3. **Execute.** Claude implements the change and updates immediate docs automatically: `docs/pending-backlog.md`, `docs/database-design.md`, `docs/rls-policy-map.md`, `docs/security-model.md`, `docs/systems-thinking.md`, `learning.md`, and `docs/uat-flows/*` as relevant.
4. **Post-change recommendation block.** Claude ends each executed response with a block recommending which of `/user-qa`, `/user-review`, `/user-uiux`, **Playwright**, and **Manual smoke** to run, plus a `Docs updated` section showing what was touched and what is deferred. The Playwright line carries a tier and quotes the **exact command** Claude would run if it were allowed to. Claude never runs Playwright itself; the project rule is that the user runs it.
   - **Skip** — pure docs / comments / no-op.
   - **Recommend (targeted)** — `npx playwright test <spec> -g "<scope>"` for new pins added this turn or flows with indirect coverage.
   - **Strongly recommend (targeted)** — same shape, but the changed code is already covered by an existing pin and regression risk is concrete.
   - **Recommend full suite + security review** — escalation for high-blast-radius changes: high-risk components (`handle_new_user`, `sync_role_to_jwt`, `insert_audit_log()`, `storage.objects` RLS, FK on `profiles`), audit-logging infrastructure, RLS across multiple tables, auth helpers, remote-applied migrations, or refactors spanning >5 files. Command pair quoted: `npx playwright test --reporter=line` plus `/security-review`. Preconditions: kill any local dev server on :3100 and run `npm run cleanup:e2e-data` first.
   - **Manual smoke** — 2–4 numbered browser steps with expected results. **Strongly recommend** when the change is browser-behaviour-sensitive (auth redirects, cookies, prerender/prefetch, URL-bar UX, hydration timing) or is the fix for a manually-reported UAT finding — cite which browsers. **Recommend** for any user-visible UI change. **Skip** for backend-only / migrations not yet wired / doc-only edits. Run this **before** the agents so visible regressions surface immediately.
5. **Run the recommended slash commands and the proposed Playwright command.** The slash commands default to "what Claude changed in this session" — no arguments needed. Copy the Playwright command verbatim from Claude's recommendation block; targeted runs respect the "no full suites mid-change" rule. Full suites happen at the `recommend full suite + security review` tier or at phase boundaries.
6. **Wrap up.** At session end, say `"wrap up"`. This invokes the `wrap-up` skill (`.claude/skills/wrap-up/SKILL.md`): Claude produces a **Cross-Session Doc Evaluation** block stating whether `docs/pending-backlog.md`, `MainProjectSteps.md`, and `PROJECT_CONTEXT.md` need updating (and why not, if not), applies any required updates, then appends to `handover.md` with a load-bearing **Next** pointer for the next session. If a phase boundary was crossed, `MainProjectSteps.md` and `docs/current-phase.md` are updated too. Stating the *reason* for non-update is mandatory — it catches the silent-skip failure mode.



### Agents available

All agent contracts live in `.claude/agents/` — each file is self-contained (frontmatter trigger + prompt body).

- **systems-thinking** — pre-planning gate, answers the three questions.
- **security** — security-sensitive review.
- **qa** — post-change correctness review (lint, types, targeted tests, checklist).
- **review** — post-change architecture / quality / scope review.
- **uiux** — post-change visual / accessibility walk.

Trigger via the `/user-qa`, `/user-review`, `/user-uiux` slash commands (which spawn the corresponding sub-agent with the right scope). `systems-thinking` and `security` are spawned by name via the Task tool when their trigger conditions apply.

Full workflow rules: `CLAUDE.md` → "Change Workflow" section. End-of-session wrap-up: `.claude/skills/wrap-up/SKILL.md`.

## Security Rules

- Enable Supabase RLS on every table.
- Treat RLS as the database authorization layer.
- Use `@supabase/ssr` and cookie-based auth.
- Treat Server Actions and Route Handlers as public endpoints.
- Validate inputs with Zod inside server handlers.
- Use private Supabase Storage buckets for sensitive HR/payroll documents.
- Keep service-role keys out of browser code.

More detail lives in `PROJECT_CONTEXT.md`, `AGENTS.md`, `docs/product-requirements.md`, `docs/security-model.md`, and `docs/systems-thinking.md`.

## Current Residual Risk

`npm audit` reports a moderate PostCSS advisory through `next@16.2.9`'s nested dependency. `npm audit fix` cannot remediate it, and `npm audit fix --force` proposes downgrading Next to `9.3.3`, which is not acceptable. Track this against the current Next.js release and revisit when an upstream-compatible fix is available.

## Run Playwright test suites

Run from the repo root:

```bash
lsof -ti:3100 | xargs kill 2>/dev/null   # free the dev port if held
npm run cleanup:e2e-data
PLAYWRIGHT_BASE_URL=https://kushhr.internal npx playwright test --workers=1
```

## Force kill everything on port 3100

```bash
lsof -ti:3100 | xargs kill -9
```
