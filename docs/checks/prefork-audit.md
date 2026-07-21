# Pre-fork audit — KushHR → company GitHub org

Date: 2026-06-12 · Auditor: Claude (Fable 5), whole-codebase pass per `/goal` prompt.

> **Status (Session 171, actioned 2026-06-12):** P1-1 (Next→16.2.9), P1-2 (`ws` audit fix), P1-4 (Caddy security headers), P1-6 (LICENSE + `package.json` license field) DONE — pre-smoke gate green (`tsc` clean; eslint only pre-existing debt; no source touched) **and manual smoke passed (login + `/dashboard` accessible on the rebuilt stack)**, confirming the Next bump at runtime. Two trivial P2s also DONE: `README.md` personal-path + heading/code-fence fix (+ residual-risk version → 16.2.9), and `infra/supabase/.env.example` `SECRET_KEY_BASE` → placeholder. P3 tail + remaining P2s merged into `docs/follow-ups.md`; the 2 strategic items merged into `docs/pending-backlog.md` (§5, §6).
>
> **Status (Session 174, actioned 2026-06-16):** P1-3 (password-reset-requested same-origin gate + per-IP rate limit, `src/lib/rate-limit.ts` + route), P1-5 (CI workflow `.github/workflows/ci.yml` — `tsc` + `eslint` on PR/push) DONE. P3 nits DONE: `safeNext` backslash variant (`proxy.ts` + the parallel `login-form.tsx` guard the audit missed) + extended smoke test; `reports`/`settings` `loading.tsx`; root `not-found.tsx` + `global-error.tsx`. P2 email/path scrub DONE (handover.md work-email → `<resend-owner-email>`, home paths → `~`; `.claude/settings.json` paths relativized; `git grep` for the work email now clean). **Decided:** demo `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs left as-is (self-host stack keys re-signed by `rotate-secrets.mjs`; placeholdering breaks copy-without-rotate). **Still open:** P2 `authRedirectUrl` host-header defence-in-depth (deferred — see `docs/follow-ups.md`).

> **Status (Session 176, actioned 2026-06-17):** P2 `authRedirectUrl` host-header defence-in-depth DONE — optional `APP_URL` server env (`src/lib/env.ts`); `authRedirectUrl` prefers it (headers ignored when set), falls back to headers when unset; documented in `.env.example` + `LOCAL_SETUP.md` + `README.md`.

Scope: Pass A (fork blockers: secrets / PII / licence / setup) + Pass B (security, functionality, usability, architecture, industry standards). All 66 commits of history scanned for Pass A. Findings deduped against `docs/follow-ups.md` and `docs/pending-backlog.md` (see "Already known — skipped" at the bottom).

## Summary

| Dimension | Findings | Highest severity |
|---|---|---|
| Secrets (files + full history) | 0 leaks; 1 hygiene note | P2 |
| PII / internal leakage | 2 | P2 |
| Licence / repo metadata | 1 | P1 |
| README / setup docs | 1 | P2 |
| Security (app surface) | 3 | P1 |
| Dependency vulns | 2 | P1 |
| Industry standards (CI, headers) | 2 | P1 |
| Functionality | 0 new (known items stand) | — |
| Usability / UI-UX | 2 | P3 |

**Verdict: no P0 — the repo is safe to fork as-is.** History is clean: no real keys/tokens/JWTs in any commit; `.env*` with real values are gitignored and were never committed (only the two `.env.example` files ever entered history); no Supabase cloud project refs anywhere; no tracked certs (`*.crt/key/pem` ignored), no `Screenshots/`, no `backups/`; seed identities are all fake `@kushhr.dev`. The P1s below are "fix in the first week on the company org," not fork blockers.

---

## P0 — Pre-fork blockers

None.

Evidence trail for the clean verdict:
- History scans (all 66 commits): JWT pattern (`eyJ…\.eyJ…`), Resend keys (`re_…`), `xoxb-`, `AKIA…`, `sk-…`, `BEGIN PRIVATE KEY`, hardcoded password assignments → only upstream Supabase docker test-script dummies (`test-password-123456` etc.) and the public demo JWTs in `infra/supabase/.env.example` (issuer `supabase-demo` — Supabase's published defaults, not secrets).
- `git log --diff-filter=A` over all history: only `.env.example` + `infra/supabase/.env.example` were ever committed; the real `.env.local` / `infra/supabase/.env` never entered git.
- Root `.env.example` is placeholder-only (`RESEND_API_KEY=` blank).
- No `*.supabase.co` project ref in tracked files or history.

## P1 — Should fix soon (first week on the company org)

1. **`next@16.2.4` carries ~13 known advisories (high), fixed in 16.2.9** — `package.json:13`, security/deps. `npm audit` lists middleware/**proxy bypass** (GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f), RSC **cache poisoning** (GHSA-wfc6-r584-vfw7, GHSA-vfv6-92ff-j949), XSS, and DoS advisories against the installed version. The proxy-bypass class matters here because `src/proxy.ts` is the unauthenticated→`/login` redirect layer (mitigated: every `(app)` page independently calls `requireRole`, and the stack is LAN-only behind Caddy — but patch anyway). Fix: bump the exact pin to `next@16.2.9` (same minor; the tracked "PostCSS advisory" item is separate and remains unfixable without a forced downgrade — this is NOT that item). Verify with the standard gate afterwards.
2. **`ws` 8.x moderate (uninitialized memory disclosure, GHSA-58qx-3vcg-4xpx)** — prod dep via `@supabase/supabase-js` realtime; deps. Fix available via plain `npm audit fix` (non-breaking).
3. **`/api/auth/password-reset-requested` is an unauthenticated, unrate-limited write into `audit_logs`** — `src/app/api/auth/password-reset-requested/route.ts:17`, security. Anyone who can reach the origin can POST arbitrary `email` strings in a loop; each call does a service-role insert (`insertAuditLog`) into the admin observability surface — log-flooding can drown real signals (the 100-row display cap in `/audit-logs` makes burying recent events cheap). PII exposure is already mitigated (only the domain is stored). Fix: same-origin/`sec-fetch-site` check + a naive in-memory rate limit (per-IP token bucket is plenty at 15–20 users); optionally fold into the existing "active aggregation tier for forge-probe detection" follow-up.
4. **No security headers from either layer** — `next.config.ts` (no `headers()`) and `infra/supabase/Caddyfile` (no `header` block); standards. Missing: HSTS, `X-Frame-Options`/`frame-ancestors` (clickjacking on an HR/payroll app), `X-Content-Type-Options: nosniff`, `Referrer-Policy`. Fix: one `header` block in the Caddyfile (single front door — cleaner than per-app `headers()`); CSP can be a later, careful pass.
5. **No CI on the repo** — no `.github/workflows/`; standards. The pre-smoke gate (`tsc --noEmit` + eslint) and the Playwright suite run only by local convention; on a company org, colleagues can push past them silently. Fix: minimal workflow running `tsc --noEmit` + `npx eslint .` on PR (Playwright needs the self-host stack, so keep it manual/nightly initially). Hooks for the already-planned CI items (AI-SLOP scan, access-matrix check — both in `pending-backlog.md`) can attach to this pipeline later.
6. **No licence / repo-legal marker** — repo root (no `LICENSE`), `package.json` (no `license` field); licence dimension. `"private": true` is set, but on a company org the ownership/usage terms should be explicit. Fix: add the company's standard proprietary-internal notice (or `"license": "UNLICENSED"` + a one-line `LICENSE` stating internal use), per company convention — confirm with IT/legal which marker the org uses.

## P2 — Polish / follow-up

Formatted for direct paste into `docs/follow-ups.md` if accepted:

- `src/server/actions/auth.ts:17-23` — `authRedirectUrl` builds the password-reset `redirectTo` from request headers (`origin`/`x-forwarded-proto`/`host`), a textbook host-header-poisoning surface for reset links (consumed at `employees.ts:527`). Currently mitigated upstream — GoTrue only honours allowlisted redirect URLs (`SITE_URL`/`ADDITIONAL_REDIRECT_URLS` = the FQDN) — so defence-in-depth only: derive from a configured app-URL env instead of request headers. (source: prefork-audit 2026-06-12)
- `infra/supabase/.env.example:62` — `SECRET_KEY_BASE` ships the upstream Supabase default as a real-looking 64-char value (same class: the demo `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs at :35-36). Public knowns, not leaks — but company-org secret scanners will flag them on every push. Replace with obvious placeholders (`your-secret-key-base`) and note that `rotate-secrets.mjs` generates the real ones. (source: prefork-audit 2026-06-12)
- `README.md:171` — quick-start contains an absolute personal path (`cd /Users/<user>/Documents/KushHR`) and the two Playwright/port-kill sections have leading-space `##` headings that won't render as headings on GitHub. Replace path with `cd <repo>`; fix heading indentation. First-impression item for colleague-cloners. (source: prefork-audit 2026-06-12)
- `handover.md` (multiple) + `.claude/settings.json:4-5` — committed project log and settings carry the author's work email (`<author-work-email>`) and absolute home paths. Low risk on an internal org (it's the author's own company identity) — decide consciously: keep (it's an internal log) or scrub before fork; the settings.json awk permissions are machine-specific and silently dead for any other clone regardless. (source: prefork-audit 2026-06-12)

## P3 — Nits

- `src/lib/supabase/proxy.ts:60` — `safeNext` open-redirect guard checks `startsWith("/")` + `!startsWith("//")` but not the backslash variant (`/\evil.com`), which some browsers normalize to a protocol-relative URL. Add `&& !rawNext.startsWith("/\\")`. (source: prefork-audit 2026-06-12)
- `src/app/(app)/reports/` + `src/app/(app)/settings/` — only two `(app)` sections without a `loading.tsx` (the other nine have one); reports especially can be query-heavy. Add for consistency. (source: prefork-audit 2026-06-12)
- `src/app/` — no root `not-found.tsx` / `global-error.tsx`; unknown routes get the framework-default 404 instead of app chrome. Cosmetic for an internal tool. (source: prefork-audit 2026-06-12)

## Strategic (→ pending-backlog.md)

- **Dependency-update cadence for the company org** — enable Dependabot/Renovate (or a monthly manual `npm audit` ritual) once forked; this audit caught two fixable advisories that accumulated silently because nothing watches `package-lock.json`. Pairs with the P1 CI item — audit in CI makes it self-enforcing. (The existing §5 watch-list item covers only the one PostCSS advisory, not the general cadence.)
- **Org-repo conventions pack** — `SECURITY.md` (who to report internal vulns to), `CONTRIBUTING.md` (the Change Workflow exists in `CLAUDE.md` but is agent-oriented; colleagues need the human version: plan-mode norms, gate commands, UAT docs). Small, do at fork time.

## Coverage note (honest scope)

Pass A was exhaustive (full history, all tracked files). Pass B was targeted sweeps with evidence, not a line-by-line review: Server Action authz inventory (all 9 action files: every export guarded except the intentionally public `auth.ts` pair), per-page `requireRole` check (19/19 protected pages guarded; `access-denied` intentionally open), admin-client caller sweep (all callers are known DAL/action/audit/email boundaries), proxy/session-refresh architecture, route handlers (2: reports/export guarded; password-reset-requested → P1-3), deps, CI, headers, error/loading surfaces. Deep functional review of individual flows is already covered by the 9 completed UAT flows + the standing access-matrix backlog item — re-walking those here would have duplicated known coverage.

## Already known — skipped (dedup verification list)

Confirmed present in `docs/follow-ups.md` (F) or `docs/pending-backlog.md` (B) and therefore NOT re-reported above:

- Next/PostCSS **moderate** advisory + forced-downgrade refusal (README "Current Residual Risk", B §5) — distinct from P1-1, which is the *high* Next advisories fixed in-range by 16.2.9.
- Inline `await sendEmail` latency / `after()` fix; Resend `fetch` timeout (`AbortSignal.timeout`); email subject `escapeHtml` consistency; resolver-vs-DAL pattern; outer-catch comment (F 2026-06-12).
- Reset-password form mapping every `updateUser` error to the generic "latest link" copy (F 2026-06-11).
- Access-matrix doc + executable permission-boundary suite, incl. the two-AI review gate (B §1) — the systemic answer to "every role × resource combination."
- AI-SLOP-Detector full-codebase scan + CI wiring (B §1).
- Off-site backup destination unwired; proxy-only ingress (drop published `:8000`/`:3100`); physical on-prem move; old `volumes/db/data` bind dir removal (F Session 165).
- Audit-log pagination 100-row cap; forge-probe active aggregation tier; quick-filter UTC edge; resource-string convention drift; `ZodLikeError` type (F).
- "Who approves Admin's leave" policy gap; admin leave-balance seeding; last-admin lockout guard; expanded role model; per-user notification prefs; retry/queue (B §4).
- All logged UI/UX NIT families (focus-visible rings, touch targets, `border border` dupes, SearchableSelectField Firefox/typo-blur, payroll Load misalignment, silent-success sweep, sidebar paint race, etc.) (F).
- TOCTOU on `reopenGoalDefinition`; no-op reopen `success: true`; `manager_id` bootstrap semantics; `maybeSingle` discarded error (F).
- Playwright isolation races / latency flakes (`employee:636`, `manager:956`, `admin:248`), self-host `--workers=1` gate, leave-overlap seeding rules (F).
- Demo seed credentials (`TestPass123!`, `@kushhr.dev` personas) documented across README/UAT docs — intentional, seed-only, no real-stack validity.
- Subjective dev-mode click latency; 15–20-user load check deferred to cutover (F/B §0).
- Migration-0049 column-grant + header-comment items (F 2026-06-02).
