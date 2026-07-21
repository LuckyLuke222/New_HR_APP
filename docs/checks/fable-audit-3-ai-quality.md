# Fable Audit — Run 3: AI-Authorship Failure Modes + Maintainability

> **Authorship (verified from session transcripts):** all findings below authored by **Fable 5** on 2026-07-10 — run as a `general-purpose` agent, cleanly on Fable 5 (119 / 119 Fable turns, including the report write). Later passes append findings tagged `[Model · date]`.
> Provenance: `[Fable5 · date]` = Fable 5 · `[Opus · date]` = Opus · untagged = original pass above.

Date: 2026-07-10 · Auditor: independent adversarial pass (read-only)
Scope: systemic AI-authoring tells + maintainability across `src/`, `tests/e2e/`, `supabase/migrations/`, verified against `docs/systems-thinking.md`, `docs/access-matrix.md`, and `node_modules/next/dist/docs/`.
Independence: the parallel reviewer's `codex-audit-*` files and `audit-summary.pdf` were NOT read. Prior audits (`docs/ai-built-app-risk-audit.md`, `docs/ultrareview-findings.md`, `docs/checks/phase-13.md`) were skimmed only to avoid re-reporting; all findings below are new relative to those.

---

## 1. Executive summary

Overall posture: **better than typical AI-built codebases, but carrying a distinctive AI-authorship debt profile.** The security spine (requireRole → Zod → scope check → audit log → revalidate) is real and applied broadly; error boundaries, env layering (`env.ts` vs `env.public.ts`), and the Playwright suite are substantive, not decorative. Next.js 16 usage is correct against the bundled docs (`proxy.ts` convention, `unstable_retry` error prop, `error.digest` forwarding) — **no hallucinated framework APIs found.** Zero `any` in `src/`.

The debt is systemic rather than per-line:

1. **The entire Supabase layer is untyped.** `src/types/database.ts` is a one-line stub (`export type Database = Record<string, never>;`) that nothing imports, and no client is instantiated with a `Database` generic. The compensating mechanism is ~310 `as string`/`as X | null` casts across `src/server/` — the compiler verifies none of the column names or shapes that those casts assert.
2. **The same logic exists in 3–5 divergent copies** (working-days math ×5, searchable-select resolvers ×5, `fetchProfileNames` ×4, `unique` ×4). Several copies have already drifted, and one fix (select-back before audit-logging, UAT R1) landed in one twin and not the others.
3. **One admin-facing setting is a decoy** (`working_days` is saved, validated, rendered — and never read by any working-days computation), and one exported Server Action is dead (`previewWorkingDays`, ~80 lines, zero callers, with a comment claiming a caller exists).
4. **Test suite is genuinely strong on RLS/forge coverage but has one systemic hole:** 42 of 44 `expectAudit` calls omit the `since` bound the helper itself warns about, so audit assertions can pass on stale rows from earlier runs.

Nothing found rises to "insecure by construction." The single BLOCKER is a silent data-correctness gap in leave accounting configuration.

---

## 2. AI-authorship pattern summary (fix the class, not the case)

### P1 — Decoy type layer: untyped DB access hidden behind a stub

- `src/types/database.ts:1` — the whole file is `export type Database = Record<string, never>;`. Nothing imports it; `createServerClient`/`createClient` in `src/lib/supabase/server.ts:11`, `src/lib/supabase/admin.ts:9`, `src/lib/supabase/client.ts:8` are all instantiated without a schema generic.
- Consequence: ~310 unchecked casts on query results — `src/server/dal/leave.ts` (62), `src/server/dal/dashboard.ts` (59), `src/server/dal/performance.ts` (44), `src/server/dal/onboarding.ts` (33), `src/server/actions/leave.ts` (24). A renamed column or changed nullability compiles clean and fails at runtime as `undefined as string`.
- Fix the class: generate types (`supabase gen types typescript`) into `database.ts` and pass `Database` to the three client factories; the casts then become deletable instead of load-bearing. (This also removes the false confidence the stub file projects — it *looks* like generated types exist.)

### P2 — Copy-paste twins that diverged

**Working-days walk — five copies, one owner of truth:**
- `src/server/actions/leave.ts:1028-1045` (`workingDaysInRange`) + `leave.ts:1047-1074` (`calculateWorkingDays`)
- `src/server/actions/leave.ts:1551-1594` — `previewWorkingDays` re-implements the same walk inline instead of calling `calculateWorkingDays` (and is dead, see P4)
- `src/app/(app)/leave/page.tsx:514-532` (`workingDaysInRange`, third TS copy) + a private `formatDays` twin at :534
- `src/components/leave/leave-request-form.tsx:105-127` (client-side inline copy)
- `supabase/migrations/0042_leave_working_days_and_refund.sql:44-68` (SQL `working_days()`, the authoritative one used by the balance trigger)
The in-file comment (`leave.ts:1009-1012`) admits "they can drift, so any change to one MUST be made in lockstep" — with five copies, lockstep is a prayer, not a mechanism. All five hardcode Sat/Sun (see Finding B1).

**Searchable-select resolver family — five near-identical helpers, three behaviors:**
- `src/server/actions/leave.ts:1317-1377` (`resolveBalanceEmployeeId` / `resolveBalanceLeaveTypeId`), `src/server/actions/documents.ts:306-348` (`resolveUploadEmployeeId`), `src/server/actions/employees.ts:592-652` (`resolveDepartmentId` / `resolveManagerId`), `src/server/actions/performance.ts:1469-1520`, `src/server/actions/onboarding.ts:474-523`.
- Divergence 1 (behavioral): leave/documents fall back to `exact ?? partial` where `partial` requires the *label* to contain the search — so an admin who searches by an email that matched via `work_email.ilike` but whose profile has a `display_name` gets `null` → "Invalid employee." The employees.ts twins fall back to `exact ?? data[0]` and succeed on the same input.
- Divergence 2 (error path): on query error, `resolveManagerId` returns `selectedValue` (`employees.ts:645` — a `FormDataEntryValue | null` that is known at that point to be empty/File), the others return `null`.
- `profileLabel` itself is duplicated verbatim in `leave.ts:1379-1384` and `documents.ts:350-355`.

**DAL micro-helpers:** `fetchProfileNames` ×4 (`dal/leave.ts:409`, `dal/onboarding.ts:299`, `dal/dashboard.ts:712`, `dal/audit-logs.ts:70` — differing in client type and fallback string), `unique`/`uniqueStrings` ×4, `toDate` ×2, `emptyToNull` ×4 (leave/performance/onboarding/departments/employees actions), `requiredUuid` ×3.

**Fix landed in one twin only:** `cancelLeaveRequest` select-backs the UPDATE before audit-logging because RLS no-ops previously produced misleading audit rows (`leave.ts:874-901`, root cause UAT R1). The same class of bug is still live in `deleteTask` / `deleteTemplateItem` (Finding N6).

### P3 — Convention inconsistency across files that should match

- **Validation-failure audit logging exists in 4 of 9 action files.** `safeParse` failures call `logValidationFailed` in leave (10/11), performance (10/9), documents (4/3), compensation (3/2) — and never in employees (0/3), onboarding (0/5), departments (0/3), app-settings (0/1). Same framework, same author-of-record, opposite observability.
- **Error-log labels:** leave/documents/employees log precise contexts (`"leave.approve failed"`, `"employees.create profile failed"`); performance.ts logs the same string `"performance action failed"` **11 times** and onboarding.ts `"onboarding action failed"` **8 times** — when one fires in production you cannot tell which of ~10 actions failed without a stack trace the console line doesn't include.
- **UUID validation:** `postgresUuid` (14 uses, exists specifically because seeded IDs are not RFC-4122 — see `src/lib/validation/postgres-uuid.ts`) vs `z.string().uuid()` (10 uses, e.g. `leave.ts:522`, `documents.ts:367,438`, `departments.ts:35`) vs **no validation at all** with raw casts: `onboarding.ts:118,206,623` (`formData.get(...) as string | null` passed straight into `.eq("id", ...)`).
- **Client selection for the same table:** `submitLeaveRequest` reads `leave_types` twice in one request — once via admin client (`leave.ts:221-225`) and once via session client (`leave.ts:308-313`) for the same row. `createEmployee` writes `profiles` via admin but `employee_records` via session client (`employees.ts:204,239`). `getMyTasks` uses the admin client for a self-scoped read (`dal/onboarding.ts:111-117`) where every equivalent "my X" DAL read uses the session client + RLS.
- **Dynamic import used once for no reason:** `documents.ts:378` — `const { createClient } = await import("@/lib/supabase/server");` while every other function in the same file uses static imports.
- **Shared TextArea abstraction with one adopter:** `src/components/ui/text-area.tsx` (label+error wrapper, "extracted for reuse") is imported only by `performance-forms.tsx`; four other forms (settings, compensation, task-list, leave-request) import raw `ui/textarea` and hand-roll their own label/error rows.

### P4 — Dead / orphan code and confident-but-wrong comments

- `previewWorkingDays` + `WorkingDaysPreview` (`src/server/actions/leave.ts:1508-1595`, ~85 lines): **zero callers anywhere in `src/`.** Its header comment says "Exposed to leave-request-form so the user sees…" — the form does its own client-side preview (`leave-request-form.tsx:95-128`). A dead exported Server Action is also live attack surface: it is POST-able by any authenticated user (it does gate with `requireRole`, so exposure is low, but it's an unmonitored endpoint).
- `src/components/ui/dialog.tsx` and `src/components/ui/separator.tsx`: zero importers → `@radix-ui/react-dialog` and `@radix-ui/react-separator` are unused dependencies (package.json:19,22).
- `isAdminRole` / `isManagerOrAbove` (`src/server/authz/roles.ts:7-13`): zero callers.
- `getOwnCompensationForSelfEdit` (`dal/compensation.ts:66-70`): pure alias of `getCompensation` — a one-caller indirection whose only content is a comment.
- Comment/code disagreements: `compensation.ts:96-98` says bank fields are "optional pending hire-source data" while the schema right below makes `bankAccountHolder` `.min(1)` required (:129-133); `src/lib/format.ts` has the `displayPhone` doc-comment orphaned above `formatDateCompact` (a later edit inserted code between comment and function).

### P5 — Feature that exists only in the settings UI (state with no consumer)

- `app_settings.working_days` is validated (`app-settings.ts:52-55`), saved, diffed into the audit log, and rendered as checkboxes (`settings-form.tsx:144-155`) — and **no computation reads it**. All five working-days copies (P2) hardcode `dow in (0,6)`. See Finding B1.

### P6 — Audit rows that don't prove the thing happened

- Write-then-log without checking rows affected: `deleteTask` (`onboarding.ts:626-639`) and `deleteTemplateItem` (:209-222) log `onboarding.task_deleted` / `template_item_deleted` even when the DELETE matched zero rows. The codebase already knows this is a bug class — `cancelLeaveRequest` fixed it with `.select("id").maybeSingle()` (`leave.ts:874-901`) — the fix was not swept to the twins.
- Test-side: `expectAudit` (`tests/e2e/helpers.ts:144-158`) documents that `since` exists "to avoid a false positive where a prior run's row satisfies the assertion" — and **42 of 44 call sites omit it** (only `reports.spec.ts:65,165` pass it). The no-entityId calls (`expectAudit("leave.submitted")` employee.spec.ts:694, `expectAudit("compensation.updated")` admin.spec.ts:367, `("onboarding.tasks_assigned")` :629, `("leave_balance.updated")` :685, `("app_settings.updated")` :1440, `("leave.balances_rolled_over")` :1517, `("holiday.bulk_uploaded")` :2592, `("auth.access_denied")` employee.spec.ts:415) assert only that such a row has *ever* existed in the shared dev DB — they pass even if this run's audit write silently broke.

---

## 3. Ranked findings

### BLOCKER

**B1 — `working_days` setting is a decoy: leave deductions ignore the configured working week.**
- Where: setting written at `src/server/actions/app-settings.ts:124` and edited at `src/components/settings/settings-form.tsx:144-155`; every consumer of working-days math hardcodes Sat+Sun — `src/server/actions/leave.ts:1038` (`dow !== 0 && dow !== 6`), `src/app/(app)/leave/page.tsx:519-521`, `src/components/leave/leave-request-form.tsx:110-112`, `supabase/migrations/0042_leave_working_days_and_refund.sql:55` (`extract(dow from d) in (0, 6)`).
- Failure scenario: admin sets working days to Mon–Sat in /settings (validated, saved, audit-logged — every signal says it worked). An employee requests Fri→Sat leave. The submit gate, the client preview, the balance-context panel, and the approval trigger all count **1** working day; the correct deduction under the configured week is **2**. `leave_balances` is now systematically wrong for every request touching a Saturday, with no error anywhere.
- Why it ranks BLOCKER: silent corruption of the leave ledger (the system's money-adjacent number) driven by an admin control that appears functional. Also a direct `systems-thinking.md` §1 violation: state (the working week) with a writer but no reader is worse than a derived copy — it's a *pretend owner*.
- Fix: either (a) thread `app_settings.working_days` into `working_days()` (SQL) and the TS mirrors — one change in five places, which is exactly why P2 must be fixed first — or (b) remove the checkboxes from /settings and document Mon–Fri as fixed. (a) or (b), but not the current lie.

### NEEDS-FIX

**N1 — Leave submit auto-seeds next-year balances before validation, and rollover's `ignoreDuplicates` freezes them at the wrong value.**
- Where: seed at `src/server/actions/leave.ts:248-275` (runs before urgent-flag, working-days, balance-gate, and overlap checks); rollover at `leave.ts:1463-1469` (`ignoreDuplicates: true`).
- Failure scenario: in July, an employee *attempts* a December→January request that then fails the overlap check — the failed submission has already upserted a next-year Local Leave row at today's default (22). In November the admin raises the default to 24 in /settings. Year-end rollover skips the pre-seeded row ("already present"), so this one employee enters the new year with 22 while everyone else gets 24 — traceable to a leave request that was never even created. Side effect on a validation-failure path + first-writer-wins default = quiet per-employee drift.
- Fix: move the seed after all validation, and/or make the seed rows distinguishable (e.g. `adjustment_reason = 'auto-seed'`) so rollover can overwrite auto-seeded, never-adjusted rows.

**N2 — Onboarding tasks assigned to a manager/admin are invisible and uncompletable (workflow dead-end).**
- Where: admin's assignable set is *all* profiles (`dal/onboarding.ts:245-261`); but `/onboarding` shows a manager only their reports' tasks — never their own (`src/app/(app)/onboarding/page.tsx:24-31` routes manager to `getAllTasks(reportIds)`, not `getMyTasks`); and `completeTask` is `requireRole(["employee"])` (`onboarding.ts:548`), so even if reached, a manager completing their own task gets access-denied + a spurious `auth.access_denied` audit row.
- Failure scenario: admin onboards a newly hired *manager* by assigning the standard template. The tasks exist, count toward the admin's "Onboarding" dashboard totals (`dal/dashboard.ts:155-157` counts all tasks), and can never be seen or completed by their owner. The completion report shows the new manager permanently "In progress."
- Note: `docs/access-matrix.md:94` documents completeTask as employee-only, so the guard matches its spec — the inconsistency is that the *assignment* surface has no matching restriction. Fix either side, coherently.

**N3 — PostgREST `.or()` filter built by string interpolation of user input (injection primitive + breakage on legal names).**
- Where: `src/server/actions/leave.ts:1332`, `src/server/actions/employees.ts:639`, `src/server/actions/documents.ts:333` — `.or(\`display_name.ilike.%${search}%,work_email.ilike.%${search}%\`)`.
- Failure scenario (today, correctness): admin searches `Doe, Jane` in the balance form — the comma splits the `or` expression, PostgREST parses `%Doe` and ` Jane%` as separate malformed conditions → request errors or matches the wrong person; parentheses in a search (`Jane (HR)`) likewise corrupt the filter grammar. Failure scenario (latent, security): the same interpolation pattern copied into a non-admin action (this codebase's twins multiply, see P2) becomes user-controlled filter injection against the *admin* client, which bypasses RLS. All three current sites are reachable only by admins, hence NEEDS-FIX rather than BLOCKER.
- Fix: replace with two `.ilike()` calls combined via `.or()` with escaped values, or pre-escape `,()` — and grep-gate the pattern in CI.
- (Related, safe-but-same-shape: `.or(\`employee_id.eq.${id}\`)` at `dal/dashboard.ts:512`, `dal/onboarding.ts:115`, `onboarding.ts:593` interpolate trusted session UUIDs — fine today, but the pattern teaches the next session the wrong habit.)

**N4 — Bootstrapped `performance_reviews.manager_id` never corrected → acknowledgment email misroutes.**
- Where: goal creation bootstraps a review with `manager_id: user.id` (`performance.ts:585-592`) — for an admin-created goal that's the admin; `submitManagerReview`'s update path deliberately never touches `manager_id` (`performance.ts:994-1000`, per ultrareview #6 fix); `acknowledgeReview` emails `review.manager_id` (`performance.ts:1357-1374`).
- Failure scenario: admin creates a goal for Alice (bootstraps review, `manager_id = admin`). Alice's actual manager Morgan later drafts and submits the appraisal (update path — `manager_id` stays admin). Alice acknowledges → the "review acknowledged" notification goes to the admin; Morgan, who wrote it, hears nothing. The row also permanently misattributes the review to the wrong manager in any future reporting.
- Fix: on submit-intent update, set `manager_id = user.id` (it is already scope-checked by `canManageEmployee`), or record the submitter in a separate column.

**N5 — Admin dashboard "leave usage" counts calendar days while the ledger and reports count working days.**
- Where: `dal/dashboard.ts:225-228` sums `inclusiveDays(start,end)` (:886-891 — raw calendar span, weekends and holidays included); the reports module for the same concept sums the trigger-owned `deducted_days` (`dal/reports.ts:393-402`), and balances decrement working days.
- Failure scenario: company approves one Mon→Sun week off (5 working days deducted). Dashboard "Leave usage (30d)" says 7; /reports leave-usage says 5. Admin reconciling the two numbers concludes one of them is broken. `systems-thinking.md` §1: `deducted_days` is the owned number; the dashboard recomputes a different one.
- Fix: sum `deducted_days` (with the doc'd calendar-days fallback for legacy null rows) in the dashboard card too.

**N6 — Hard-delete actions skip validation and write audit rows for no-ops.**
- Where: `deleteTask` (`onboarding.ts:617-644`), `deleteTemplateItem` (:200-226), `toggleTemplate` (:112-119): `formData.get(...) as string | null` (a `File` passes this cast), no Zod, no `logValidationFailed`, DELETE with no `.select()` check, unconditional `onboarding.task_deleted` audit row.
- Failure scenario: a stale admin tab replays deleteTask for an already-deleted id → DELETE matches 0 rows, user sees "Task deleted.", audit log records a deletion that did not happen — the exact misleading-audit failure UAT R1 already fixed in `cancelLeaveRequest`. Secondly, a malformed non-UUID id reaches Postgres and returns `22P02`, surfacing "An unexpected error occurred" with no validation audit trail.
- Fix: postgresUuid-validate, `.select("id").maybeSingle()` before logging, mirror the cancel-leave pattern.

**N7 — `expectAudit` without `since`: audit assertions that can't fail.**
- Where: `tests/e2e/helpers.ts:144-158`; 42/44 call sites (see P6 for the list).
- Failure scenario: `insertAuditLog` regresses to a silent no-op (it already swallows errors — `src/server/audit.ts:27-29`). Every `expectAudit("X")` without `entityId` still passes against rows from last week's runs; the suite is green while the compliance trail is dead. The helper's own comment documents the trap.
- Fix: capture `since = new Date().toISOString()` before the action in each test (pattern already proven in `reports.spec.ts:65,165`), or make `since` required.

**N8 — Search-resolver twins give different answers to the same input (P2 divergence made concrete).**
- Where: `documents.ts:342-347` / `leave.ts:1341-1346` (`exact ?? partial` on *label*) vs `employees.ts:648-651` (`exact ?? data[0]`).
- Failure scenario: profile has `display_name: "John Doe"`, `work_email: "jdoe@x.mu"`. Admin types `jdoe@x.mu` in the document-upload employee search → DB matches via `work_email.ilike`, but the label "John Doe" contains neither, `partial` misses → `null` → "Invalid employee." The identical search in the employee-form manager picker succeeds. Same UI affordance, opposite outcomes.
- Fix: one shared resolver (also fixes N3 and the `resolveManagerId` error path returning `selectedValue`, `employees.ts:645`).

### NIT

**T1** — `src/app/(app)/reports/page.tsx` uses `meta!` / `result!` 15+ times (:85-295). One `if (!meta || !result) notFound()` narrow at the top deletes all of them. (~15 lines simpler, and the `reportMeta(...)!` at `dal/reports.ts:123` too.)

**T2** — Manager dashboard "Appraisal acknowledged" items are dated/filtered by `submitted_at`, not `acknowledged_at` (`dal/dashboard.ts:402-412`, rendered :840-848). A review submitted 40 days ago and acknowledged today never appears in "last 30 days," and when it does appear it sorts under the wrong date.

**T3** — `upsertCompensation` payload sets neither `created_by` nor `updated_by` (`compensation.ts:226-241`), while `selfUpdateCompensation` sets `updated_by` (:414) and every other write path sets both. Admin-written compensation rows carry no in-row provenance (the audit log is the only trace).

**T4** — `ui/textarea.tsx` vs `ui/text-area.tsx`: two near-same-named modules; the labeled wrapper has 1 adopter, 4 forms hand-roll labels around the raw one (P3). Merge or rename.

**T5** — `SubmittedLeaveValues` is a single 17-field bag shared by 8 different forms (`leave.ts:36-60`), and `leaveSubmittedValues(formData)` is echoed even from decision/cancel forms that render none of it (e.g. :547, :569). Per-form value types would document which fields each form actually round-trips.

**T6** — Defensive re-filter of impossible states: `dal/dashboard.ts:542-544` re-checks `balance.employeeId === employeeId` on rows already scoped by RLS to the caller; `getEmployeeDashboardData` would render another user's balances only if RLS itself were broken — in which case a silent filter is the worst response.

**T7** — `formatDays`'s `.replace(/\.0$/, "")` branch (`leave.ts:1084`, twin at `leave/page.tsx`) is unreachable for the 0.5-step values it receives; `Number.isInteger` already routed integers away.

**T8** — Squashed one-line error handling (`if (error) { console.error(...); return {...}; }` on one line, 11× in performance.ts e.g. :179, :503, :575; 8× in onboarding.ts) defeats both readability and useful line-level stack traces; also carries the generic-label problem (P3).

**T9** — `assignTemplateToEmployee` sets `created_at: now` explicitly (`onboarding.ts:284,297`) — the only insert in the codebase that overrides the DB default; its twin `addIndividualTask` doesn't. Remove.

**T10** — `src/lib/format.ts`: `displayPhone`'s comment paragraph is stranded above `formatDateCompact` (orphaned by a later insertion). Cosmetic, but it's the P4 tell in miniature.

### Simpler-rewrite ledger (AI slop, with deltas)

| Site | Now | Simpler | Δ |
|---|---|---|---|
| `previewWorkingDays` (`leave.ts:1508-1595`) | dead duplicate action | delete | −88 lines |
| working-days walk ×4 TS copies | 4 impls | 1 shared `lib/working-days.ts` used by action, page, form (form gets holidays as prop already) | −60 lines |
| resolver family ×5 (`resolve*Id`) | 5 impls, 3 behaviors | 1 generic `resolveSearchSelection(fetch, formData, name)` | −120 lines |
| `fetchProfileNames` ×4 / `unique` ×4 / `emptyToNull` ×4 | 12 private copies | 3 exports in `dal/shared.ts` | −70 lines |
| `reports/page.tsx` `meta!`×15 | non-null assertions | early narrow | −15 assertions |
| `getOwnCompensationForSelfEdit` | alias fn | inline call + comment at call site | −6 lines |

---

## 4. Dead code / unused dependencies

| Item | Location | Evidence |
|---|---|---|
| `previewWorkingDays`, `WorkingDaysPreview` | `src/server/actions/leave.ts:1508-1595` | zero references outside defining file (grep, whole `src/`) |
| `dialog.tsx` UI component | `src/components/ui/dialog.tsx` | zero importers |
| `separator.tsx` UI component | `src/components/ui/separator.tsx` | zero importers |
| `@radix-ui/react-dialog` | `package.json:19` | only importer is dead `dialog.tsx` |
| `@radix-ui/react-separator` | `package.json:22` | only importer is dead `separator.tsx` |
| `isAdminRole`, `isManagerOrAbove` | `src/server/authz/roles.ts:7-13` | zero callers |
| `Database` type stub | `src/types/database.ts:1` | zero importers; misleads readers into thinking generated types exist |
| `getOwnCompensationForSelfEdit` | `src/server/dal/compensation.ts:66-70` | alias, 1 caller — inline it |
| `EmployeeOption` exported twice | `dal/employees.ts:153-156` and `dal/onboarding.ts:48-51` | duplicate type, both imported in different files — consolidate |

All other package.json dependencies verified in use (`server-only` via side-effect imports; `clsx`/`tailwind-merge` via `cn`; `sonner`, `next-themes`, `recharts`, `@radix-ui/react-tabs` each have live importers).

---

## 5. Could not verify (and what confirmation needs)

1. **Runtime impact of N3's malformed-filter behavior** — I traced the PostgREST `or` grammar break statically; confirming whether a comma-containing search errors (400) or mis-matches requires hitting a live PostgREST. Either outcome is a defect; only the message differs. UNVERIFIED as to which.
2. **Whether any RLS policy compensates for B1** — I checked migration 0042's `working_days()` and its callers; I did not replay migrations against a live DB to rule out a later `CREATE OR REPLACE` outside `supabase/migrations/`. `grep -rn "working_days" supabase/migrations` shows no reader of `app_settings.working_days`; a live `\df+ working_days` would close this.
3. **Email delivery path in production** — code implements only Resend (`src/server/email.ts:16`, `src/lib/email-env.ts`); project memory says the deployed server uses Gmail SMTP for *auth* email (GoTrue). If `RESEND_API_KEY` is unset in prod, every app notification lands as `email.skipped` audit rows by design. Whether that's the intended prod state needs an ops check of the deployed env, not code.
4. **`AccessDeniedError` digest survival across future Next upgrades** — `helpers.ts:16-19` depends on documented-adjacent behavior (`error.digest` forwarding is in `error.md:113`, and the code cites the exact internal file). Correct on 16.2.9; flagged as an upgrade-time re-verify, not a defect.
5. **Half-day + holiday edge in `requestYearSegments`** (`leave/page.tsx:495-511`): the `segments.length === 0` guard applies 0.5 only to the first year; half-day is schema-constrained to single-day so this looks unreachable-safe, but I could not construct a violating row without a live DB. UNVERIFIED, low risk.

---

## Positive evidence (kept short, for balance)

- No hallucinated Next.js APIs: `proxy.ts` matches `01-getting-started/16-proxy.md`; `unstable_retry` matches `error.md:27-70`; root `global-error.tsx` correctly owns `<html>/<body>`.
- Zero `any` in `src/`; only 26 non-null assertions (15 concentrated in one file, T1).
- `src/server/email.ts` is a genuinely well-designed never-throws boundary with audit-visible outcomes.
- `tests/e2e/forge.ts` (network-layer Server Action forgery) and `rls.spec.ts` assert real security properties against a real DB — including audit-log immutability for admins (`rls.spec.ts:195-217`).
- The rate limiter (`src/lib/rate-limit.ts`) documents its state ownership and scale limits honestly per `systems-thinking.md`.
