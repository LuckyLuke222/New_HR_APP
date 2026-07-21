# Pre-fork audit - Codex

Date: 2026-06-12
Auditor: Codex
Scope: pre-fork audit of KushHR before moving visibility to a company GitHub org. Grounding docs read: `docs/systems-thinking.md`, `docs/security-model.md`, `docs/rls-policy-map.md`, `docs/follow-ups.md`, `docs/pending-backlog.md`, `CLAUDE.md`, `AGENTS.md`, `PROJECT_CONTEXT.md`, and relevant local Next docs under `node_modules/next/dist/docs/`.

Snapshot note: Claude is concurrently applying fixes. I reviewed the current working tree, gitignored local runtime files, and full git history. Findings below are only items not already captured in `docs/follow-ups.md`, `docs/pending-backlog.md`, or Claude's in-flight `docs/checks/prefork-audit.md`.

| Dimension | Count | Highest severity |
|---|---:|---|
| Secrets / git history | 1 | P0 |
| PII / internal leakage | 0 new | - |
| Licence / attribution | 0 new | - |
| README / setup docs | 1 | P1 |
| Security / authz / RLS | 0 new | - |
| Functionality | 0 new | - |
| Usability / UI-UX | 0 new | - |
| Architecture / code quality | 0 new | - |
| Industry standards | 0 new | - |
| Example-file hygiene | 2 | P2 |

## P0 — Pre-fork blockers

1. `supabase/.temp/linked-project.json:1`, `supabase/.temp/project-ref:1`, `supabase/.temp/pooler-url:1` (history-only, commit `2d326d1`) - secrets/history: the initial commit added Supabase CLI link-state files containing cloud project/org metadata and a pooler URL/username shape. Impact: even though the files are deleted and `supabase/.temp/` is now ignored at `.gitignore:52-53`, forking preserves that metadata in company-visible history. Suggested fix: before forking, either rewrite history to remove `supabase/.temp/*` or explicitly retire/delete the old cloud project and record the risk acceptance; do not paste the actual identifiers into new docs/issues.

## P1 — Should fix soon

1. `README.md:47` and `README.md:55` - README/setup docs: the setup text says the repo's `.env.local` points at the local stack and says `infra/supabase/.env` plus `certs/` must exist, while `.gitignore:40-42` correctly prevents real env files from being tracked. Impact: a fresh colleague clone will not have the runtime files needed to run host dev, Playwright, or the Docker stack, and the README does not give a deterministic bootstrap path. Suggested fix: add explicit first-clone steps: copy examples, run the secret/key rotation/generation command, create or copy the Caddy cert material, and state which file is used by host dev versus Docker.

## P2 — Polish / follow-up

- `.env.example:2` — README/setup docs: the root public URL example still points to `https://your-project-ref.supabase.co`, which conflicts with the now-self-hosted/no-Supabase-cloud deployment story and can steer a new cloner toward cloud setup. Use a self-host placeholder such as `https://kushhr.internal` or `http://localhost:8000`, with a comment for alternate environments. (source: prefork-audit 2026-06-12)
- `infra/supabase/.env.example:77` — secrets/example hygiene: the S3 protocol example values are concrete hex-looking credentials; like the already-known demo JWT/default secret entries, they are not evidence of a real leak but will look like credentials to scanners and reviewers. Replace with obvious placeholders and point to the rotation script. (source: prefork-audit 2026-06-12)

## P3 — Nits

None new after deduplication.

## Strategic (→ pending-backlog.md)

- `README.md:90` - colleague workflow: the current change workflow is heavily Claude/agent oriented, while `docs/pending-backlog.md:141` already captures the need for `SECURITY.md` and `CONTRIBUTING.md`. Keep that backlog item, but make the eventual human-facing contribution doc include the first-clone bootstrap, local-vs-Docker env split, and required gates before a PR.

## Already-known, skipped

- `docs/follow-ups.md:37-45` - Claude's pre-fork audit already captured `authRedirectUrl` host-header defence-in-depth, demo Supabase JWT/default secret scanner noise, README absolute path/internal email cleanup, proxy `next` backslash hardening, missing loading states, and root `not-found`/`global-error` polish.
- `docs/checks/prefork-audit.md:36-41` - Claude's in-flight audit already captured the Next/ws dependency fixes, unauthenticated password-reset audit endpoint rate limit, Caddy security headers, missing CI, and licence marker; current working tree shows several of those fixes are already in progress.
- `docs/pending-backlog.md:135-136` - residual Next/PostCSS advisory and dependency-update cadence are already tracked.
- `docs/pending-backlog.md:141` - org-repo conventions pack (`SECURITY.md`, `CONTRIBUTING.md`, licence confirmation) is already tracked.
- `docs/pending-backlog.md:9-48` and `docs/follow-ups.md:77-83` - off-cloud/on-prem deployment deferrals are already tracked: off-site backups, proxy-only ingress, physical server move, old bind-dir cleanup, and real DNS/CA distribution.
- `docs/pending-backlog.md:101` - last-admin lockout guard is already tracked.
- `docs/pending-backlog.md:54-57` - manual UAT completion, user-flow inventory, final multi-AI review, and AI-SLOP scan are already tracked.
- `docs/pending-backlog.md:108-127` - Resend sandbox, production sender, Google Calendar, Slack, and optional SSO are already tracked as notification/integration work.
- `docs/follow-ups.md:14-20` - email latency/timeout/template/DAL polish already tracked.
- `docs/follow-ups.md:58-64` - self-host Playwright serial-gate and known flakes already tracked.
- `docs/follow-ups.md:85-118` and later UI sections - logged UI/UX and small code-quality nits were not repeated.
