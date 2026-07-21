# Phase 13 Checks — AI-Built App Risk Audit

Date: 2026-04-29
Status: **PASS WITH RESIDUAL EXTERNAL WATCH** — audit remediation items are complete; the remaining item is the upstream Next/PostCSS advisory.
For focused 20–40 minute rotation scripts, see docs/uat-flows/. This section remains the exhaustive reference for pre-pilot full passes.

---

## Automated Evidence

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 22 routes |
| `npx playwright test --reporter=list --workers=1` | PASS — 50/50 |
| `npm audit --audit-level=moderate` | Residual — PostCSS advisory through Next; forced fix downgrades Next to 9.3.3 and must not be applied |

---

## Remediation Evidence

| Item | Result |
|---|---|
| Playwright browser auth | Resolved — setup signs in through Supabase Auth and writes deterministic storage states |
| Business-flow coverage | Added new-hire onboarding and manager leave approval scenarios |
| Missing leave balance on approval | Resolved — migration `0020_leave_approval_missing_balance_error.sql` blocks approval if no matching balance row exists |
| Denied-action audit logs | Resolved — added `auth.access_denied` logs for sensitive denied branches |
| Unused form dependencies | Resolved — removed `react-hook-form` and `@hookform/resolvers` from dependency metadata |
| PostCSS advisory | Tracked — no compatible safe fix available via `npm audit fix` |

---

## Independent Cloud Review

| Item | Result |
|---|---|
| Claude Code `/ultrareview` setup | Created review-only GitHub PR #1 with `base: ultrareview-empty-base` and `compare: ultrareview-full-codebase` |
| Review shape | Full codebase appears as the PR diff against an intentionally empty orphan branch |
| Merge policy | Do not merge PR #1; close it after recording/actioning review findings |
| Invocation | Run from `ultrareview-full-codebase` with `/ultrareview ultrareview-empty-base` |

---

## Manual Review Environment Cleanup

Date: 2026-05-06

The manual review environment was cleaned after Playwright E2E runs left test artifacts visible in the employee directory, leave-type picker, leave balances, documents, onboarding, and performance data.

| Item | Result |
|---|---|
| Root cause | Playwright scenarios created persistent records such as `Journey Employee ...`, `Admin Approves Manager Leave ...`, `Insufficient Balance Leave ...`, and related performance/onboarding/document fixtures |
| Cleanup utility | Added `scripts/cleanup-playwright-artifacts.mjs` with dry-run default and explicit `--execute` deletion mode |
| npm helpers | Added `npm run cleanup:e2e-data:dry-run` and `npm run cleanup:e2e-data` |
| Deleted test artifacts | 23 journey profile/Auth users, 90 Playwright leave types, 90 related leave requests, 34 related leave balances, 165 performance cycles, 109 performance goals, 105 performance reviews, 54 documents plus Storage objects, and 50 onboarding tasks |
| Cleanup coverage update | On 2026-05-06, the utility was extended to also remove Playwright leave requests created against seeded leave types by note prefixes such as `Leave audit note` and `Manager approval note`; final dry run returned 0 targeted artifacts |
| Preserved records | Seed users, real app seed data, and `audit_logs` history were intentionally preserved |
| Verification | Post-cleanup dry run returned 0 targeted artifacts; `.env.local` remained present |

Run `npm run cleanup:e2e-data:dry-run` after future E2E runs before manual review. Only run `npm run cleanup:e2e-data` after confirming the dry-run output targets Playwright artifacts only.

---

## Manual Runtime Test Script

Use this for human UAT after the automated suite is green. Record browser, date, user, and pass/fail evidence for each step.

### Preflight

| Step | Expected result |
|---|---|
| Sign in as `admin@kushhr.dev` | Admin dashboard loads |
| Sign in as `manager@kushhr.dev` | Manager dashboard loads with direct-report metrics |
| Sign in as `alice@kushhr.dev` | Employee dashboard loads with own metrics only |
| Open `/audit-logs` as manager and employee | Both are redirected to Access denied |

### Admin Flow

| Step | Expected result |
|---|---|
| Create a new employee with role Employee, Engineering department, and Morgan Manager as manager | Employee appears in directory; audit log records `employee.created` |
| Open the new employee profile | Job, department, manager, and work email match the submitted data |
| Add or update compensation for the employee | Admin sees full compensation fields; audit log records `compensation.updated` |
| Upload a contract or policy document for the employee | Document appears in list; audit log records `document.uploaded` |
| Create a performance cycle | Cycle appears on Performance page; audit log records performance cycle action |

### Manager Flow

| Step | Expected result |
|---|---|
| View People as manager | Direct report is visible; non-report private data is not exposed |
| Assign an onboarding task to a direct report | Task appears for employee; audit log records onboarding assignment |
| Try to access Payroll or Audit Logs | Access denied |
| Approve a pending direct-report leave request | Request leaves pending queue; audit log records `leave.approved`; balance decreases |
| Create a goal and submit an appraisal score 1-5 for a direct report | Review appears with score and feedback; audit log records manager review submission |

### Employee Flow

| Step | Expected result |
|---|---|
| View own profile | Employee can see own profile only |
| Complete assigned onboarding task | Task status becomes completed; audit log records completion |
| Submit leave request | Request appears as pending; audit log records `leave.submitted` |
| Upload an allowed own document | Document appears; signed download works; raw Storage URL remains denied |
| Submit payroll change request | Request appears in own queue; audit log records `change_request.submitted` |
| Submit self-review and acknowledge manager review | Status updates correctly; score cannot be edited by employee |

### Negative Checks

| Step | Expected result |
|---|---|
| Employee tries `/employees/new`, `/departments`, `/leave/admin`, `/onboarding/admin` | Access denied |
| Employee tries to upload a payslip | Action is blocked and `auth.access_denied` is logged |
| Manager tries to upload a document | Action is blocked and `auth.access_denied` is logged |
| Admin or manager tries to submit a payroll change request | Action is blocked and `auth.access_denied` is logged |
| Approve leave for a request with no matching balance row | Approval fails visibly; request remains pending |

---

## Residual Watch Item

`npm audit --audit-level=moderate` still reports the PostCSS advisory through `next@16.2.4`. The suggested `npm audit fix --force` would install `next@9.3.3`, which is an unacceptable downgrade. Re-check after the next compatible Next.js/PostCSS release.



## Manual Review Findings

### Bugs
- **Performance cycle visibility blocks manager appraisal flow — FIXED 2026-05-06.** Admin-created review cycles were not visible to managers until the cycle already had a goal or review linked to one of their direct reports. This created a catch-22 where a manager could not select a new active cycle to create the first goal/appraisal. Fixed with migration `0024_manager_active_cycle_visibility.sql`, which allows managers to select active review cycles before goals/reviews exist. Regression coverage now verifies direct RLS visibility and the manager goal/appraisal workflow without pre-seeding a goal.
- **Employee profile tabs show stale placeholder copy — FIXED 2026-05-06.** The Documents, Leave, and Audit tabs displayed "This section will be wired when the documents module comes online," even though the documents, leave, and audit modules now exist. Employee profile tabs now show role-scoped document, leave, and audit summaries backed by the real module data, with a regression test covering all three tabs.

### UX Friction
- **New employee first login is unclear — FIXED 2026-05-06.** Admin-created employees still receive a random unshared Auth password, but the employee profile now has an admin-only "Generate password reset" action. It generates a Supabase recovery link for the employee, shows it only in the current admin session for secure sharing, and records `auth.password_reset_link_generated` in `audit_logs`. The create-employee success message and helper copy now direct admins to generate this link before first login.
- **No forgot-password path is visible — FIXED 2026-05-06.** The login page now links to `/forgot-password`, where users can request a normal recovery email. `/reset-password` provides the page used after a recovery link to set a new password.
- **Role/job-title mismatch is confusing — FIXED 2026-05-06.** `role` still controls system permissions, while `job_title` remains HR profile text. Admin create/edit forms now show guidance beside both fields: Manager/Admin roles grant access, job title does not grant access by itself, and the two should be intentionally aligned for review clarity.
- **Leave request form does not show balance context — FIXED 2026-05-06.** `/leave/new` now loads the signed-in user's visible leave balances for the current and next year, shows available balances before selection, and shows the selected leave type/year balance with requested days once dates are entered. If no matching balance exists for the selected year/type, the form warns the user to contact HR before submitting.
- **Leave approval failure is not actionable enough — FIXED 2026-05-06.** Managers now see specific setup/balance failures before the approval update is attempted. Missing balance rows show messages such as "No 2026 Annual Leave balance exists for this employee," while insufficient balances show available versus requested days. The existing database trigger remains the state owner for atomic balance decrement; the Server Action now mirrors trigger failure codes into actionable UI feedback and regression coverage verifies both missing-balance and insufficient-balance cases.
- **Searchable selects are needed — FIXED 2026-05-07 (Codex started, Claude continued).** Employee create/edit forms now support searchable Department and Manager fields, with server-side label resolution so typed values still submit the correct UUIDs even before client hydration (Codex, Session 44). Performance Employee and Review-cycle selectors are now searchable in `GoalForm` and `ManagerReviewForm`, sharing a single `SearchableSelectField` UI component, and `savePerformanceGoal`/`submitManagerReview` resolve typed labels server-side scoped to assignable employees and non-closed cycles (Claude, Session 45). `/leave/admin` leave balance Employee and Leave-type selectors now use the shared searchable component, with `upsertLeaveBalance` resolving typed employee labels against all employees and typed leave-type labels against active leave types before the unchanged Zod schema runs (Codex, Session 47). `/documents` admin upload Employee selector now uses the shared searchable component, with `uploadDocument` resolving typed employee labels against all employees before the unchanged schema runs; employee self-upload still posts the signed-in user's hidden UUID (Codex, Session 48). `/payroll` admin employee picker now uses the shared searchable component, and the page resolves typed labels against all employees before loading the compensation form while preserving the compensation form's hidden UUID contract (Codex, Session 49). Onboarding assignment Employee and Template selectors now use the shared searchable component, with role-scoped employee label resolution and active-template label resolution before the unchanged schemas run (Codex, Session 50).
- **Dashboard cards should be navigable where meaningful — FIXED 2026-05-07.** Dashboard `MetricCard` now accepts an optional `href` and renders as a `next/link` with hover/focus styling and a composed `aria-label`. Admin cards link to `/employees`, `/leave?status=pending`, `/onboarding/admin`, and `/performance`; manager cards link to `/employees`, `/leave?status=pending`, `/leave?status=approved`, and `/performance`; employee cards link to `/leave`, `/onboarding`, `/performance`, and `/payroll`. The "Recent audit events" panel already exposed a "View all" link to `/audit-logs` (admin-only). All target routes are role-gated by `requireRole`, so the change is UI-only — no schema/RLS/trigger changes — and any role-mismatched navigation still falls back to the existing `/access-denied` flow with `auth.access_denied` audit logging. Existing dashboard E2E assertions still pass.
- **Leave "who's out" view needs drill-down — FIXED 2026-05-06.** Each entry in `/leave`'s "Out this week" panel is now a link to the matching row in the requests table below (`#leave-request-<id>` anchor). The targeted row uses Tailwind's `target:` variant for a brief highlight so the reviewer can see which leave was selected. Items whose request is filtered out of the current view stay rendered as plain rows so the panel still reflects the week.
- **Task completion needs a comment field — FIXED 2026-05-06.** Migration `0026_onboarding_task_completion_note.sql` adds a length-bounded `completion_note` column to `onboarding_tasks`. The "Mark complete" form on `/onboarding` now exposes an optional textarea; `completeTask` validates it (≤ 1200 chars), persists it on the same update, and records `has_completion_note` in the audit metadata for `onboarding.task_completed`. Completed tasks now display the note alongside the completion timestamp.
- **Important pending tasks should appear on dashboards — FIXED 2026-05-07.** The manager dashboard now has an "Action items" panel that lists up to 5 pending direct-report leave requests (each row links to `/leave?status=pending#leave-request-<id>`). The employee dashboard has an "Action items" panel that lists up to 5 of the signed-in user's pending onboarding tasks, sorted by due date with `null` due dates last (each row links to `/onboarding`). Lists are produced by the existing dashboard DAL: `getLeaveRequests({ status: "pending" })` (RLS-scoped, then filtered to direct-report ids) and `getMyTasks(employeeId)`. Empty states render when nothing is pending, and dashboard E2E coverage now asserts the panel is visible for both manager and employee.
- **Employee goal update flow is missing — FIXED 2026-05-06.** Employees could view assigned goals but could not add goal-level progress comments, update progress percentage, or mark goals complete. Migration `0025_employee_goal_progress.sql` adds employee progress-note fields to `performance_goals`; employees now get scoped progress forms for their own goals, can save a progress note, and can mark a goal complete through an employee-only audited Server Action. Regression coverage verifies Alice can update her own goal and cannot craft an update against another employee's goal.
- **Manager goal update UI is not discoverable — FIXED 2026-05-06.** Managers technically could update goals from the separate "Set or update goal" form, but the goals table was read-only and selecting an existing goal did not prefill employee, cycle, title, status, progress, or description. Goals in scope now include a row-level Edit action that opens the selected goal in the form, pre-populates the fields, locks employee reassignment during edit, and saves through the existing audited `performance_goals` update action. Targeted manager E2E coverage verifies the visible edit path and the crafted-transfer guard.

### Missing Feedback
- **Create-cycle success does not make the next action obvious — FIXED 2026-05-07.** `ReviewCycleForm` now shows a "Next steps" panel after a successful creation with three jump links: "Set a goal for this cycle" (`#goal-form`), "Open the review queue" (`/performance/reviews`), and "View all cycles" (`#review-cycles`). When the cycle is created in `Draft` status the panel additionally calls out that managers cannot use it until it is set `Active` from the Review cycles list. The Review cycles panel now has an `id="review-cycles"` anchor so the success-state link works without rerouting. UI-only change — no schema/RLS/trigger or Server Action signature changes; existing `admin creates performance cycle and employee goal` E2E still passes.
- **Leave setup gaps are discovered too late — FIXED 2026-05-06.** The employee request form now warns when no matching balance exists before submission, and the manager/admin approval queue shows each pending request's relevant balance context and requested days before approval.
- **Manager dashboard pending item is incomplete in notes.** Manual note currently says "On the manager dashboard, the pending ..." and needs clarification during continued UAT.

### Manual Review — Round 2 Findings (2026-05-07)
- **Test artifacts leaked into manual review (e.g. `Admin Search Balance Type ...` appearing in the manager leave-type dropdown) — FIXED 2026-05-07.** The Session 47 cleanup script (`scripts/cleanup-playwright-artifacts.mjs`) was missing prefix coverage for several Playwright tests added in later sessions. Extended the prefix lists to cover: leave types (`Admin Search Balance Type`); performance cycles (`Manager Edit Goal Cycle`); performance goals (`Manager Editable Goal`); documents (`Admin Search Upload Doc`); onboarding tasks (`Admin Search Template Task`); leave-request notes (`Manager leave for admin approval`, `Manager own leave submit/cancel note`, `Manager direct RLS own leave`, `Reject note employee request`/`should persist`, `Insufficient/Missing balance approval note`, `Cross-year approval note`). Added net-new cleanup for `onboarding_templates` + `onboarding_template_items` (`Admin Search Onboarding Template`), with cascade deletion of any `onboarding_tasks` linked by `template_id` and the template-item rows. Re-ran `npm run cleanup:e2e-data` and verified the dry-run now reports 0 across all categories. Going forward, every new Playwright test that inserts a row should add its prefix to this script in the same commit.

- **Generic "Employee account could not be created" message hid the cause — FIXED 2026-05-07.** Manual review hit a duplicate-email failure that surfaced only as a generic toast; per `docs/systems-thinking.md`'s feedback rule, every Server Action must produce a visible failure signal. The auth-create branch of `createEmployee` now: (a) writes `employee.create_failed` to `audit_logs` with `stage: "auth"` and the underlying `error_code` / `error_message` / `error_status` in metadata; (b) detects duplicate-email errors specifically and returns "An account with this email already exists." both as the top-level message and as a field-level error under Work email; (c) appends a hint pointing reviewers to the audit log entry when the cause is not duplicate-email. The two existing `create_failed` paths (profile and employee_record) now also include `error_code` / `error_message` in their metadata. The `seedDefaultLeaveBalances` helper added in Session 58 now writes `employee.default_leave_seed_failed` to the audit log on failure, so the post-creation auto-seed is also non-silent. The Next.js server console (`next dev` cmd prompt) continues to carry the full underlying error via `console.error` for live debugging — the audit log is the persistent, admin-visible record.

### Permission / Security Questions
- **Payroll summary exposure on dashboard should be reviewed — FIXED 2026-05-07.** The salary amount has been removed from the employee dashboard's Payroll summary metric card. The card is preserved as a navigation entry to `/payroll` (where the user must intentionally land to see the amount), shows `Open` (or `—` if no compensation row exists) as the value, and the note now reads "<pay frequency> · open payroll to view amount". This eliminates shoulder-surfing exposure on the dashboard while keeping the entry point obvious. State ownership unchanged: `employee_compensation` remains the owner; `getOwnCompensationSummary` minimal-field DTO is unchanged. The unused `formatCurrency` import was removed from the dashboard page.

### Product Gaps
- **Compensation currency should be a dropdown — FIXED 2026-05-07.** `CompensationForm` now renders Currency as a `<select>` with `MUR` (default), `AED`, and `USD` options. `upsertCompensation`'s Zod schema replaces the loose 3-letter string with `z.enum(["MUR", "AED", "USD"])` after trim/upcase, so anything outside the v1 set is rejected at the action boundary. Existing `admin compensation edit preserves existing bank account number when left blank` E2E still passes (the seeded USD record round-trips through the new dropdown unchanged).
- **Compensation bank name should use a Mauritius bank-name dropdown — FIXED 2026-05-07.** Added `src/lib/mauritius-banks.ts` with the v1 list of locally licensed banks (ABC Banking, Absa, AfrAsia, Bank of Baroda, Bank One, BCP, Habib, HSBC, Investec, MauBank, MCB, SBI, SBM, Silver Bank, Standard Bank, Standard Chartered). `CompensationForm` Bank name is now a `<select>` populated strictly from this list. `upsertCompensation` adds a `.refine` that accepts only an empty string or a value from the list, so anything else is rejected at the action boundary. The `Seed Bank` value used by `admin compensation edit preserves existing bank account number when left blank` was updated to `MauBank` so the regression still passes. (No legacy-value passthrough: when an existing record carries a non-listed bank name, the dropdown opens unselected so the admin must explicitly re-pick from the canonical list before saving.)
- **Compensation/profile data should include passport number and nationality fields — FIXED 2026-05-07.** Migration `0027_compensation_passport_nationality.sql` adds nullable `passport_number` and `nationality` columns to `employee_compensation`. RLS policies are unchanged: admin-only mutations and admin-only reads of sensitive columns; the employee salary summary projection deliberately does not include either field, so passport and nationality remain HR/admin-only. `CompensationRow` and the admin upsert payload now carry both fields; `upsertCompensation` validates `passportNumber` (≤64) and `nationality` (≤80) at the action boundary; `CompensationForm` renders the new inputs alongside Tax ID and National ID.
- **Leave policy localized + taxonomy simplified — FIXED 2026-05-07.** Migration `0028_localize_leave_taxonomy.sql` (applied to remote) renames `Annual Leave` → `Local Leave` (preserves all FK relationships in `leave_balances` and `leave_requests`), refreshes the description to "Paid local/annual leave: 22 days/year (includes 3 urgent days)", refreshes Sick Leave's description to "Paid sick leave: 15 days/year.", and deactivates `Unpaid Leave` (`is_active = false`) so it disappears from active forms while historical rows remain. `createEmployee` now seeds default current-year `leave_balances` for the new hire — 22 Local Leave + 15 Sick Leave — via an idempotent upsert on `(employee_id, leave_type_id, year)`. The seed file (`supabase/seed.sql`) was updated to insert Local Leave/Sick Leave at 22/15 and to leave Unpaid Leave inactive. Existing tests that referenced "Annual Leave" were renamed to "Local Leave" and continue to pass.
- Email or Slack notification support should be considered for onboarding, leave, document, payroll-change, and performance-review events.


### Manual Review — Round 3 Findings (2026-05-07)

Captured from a second manual UAT pass. Each item is logged as **OPEN** until fixed; this section will be updated in place as remediation lands (mirroring the Round 1 / Round 2 pattern above).

#### Bugs

- **Employee dashboard leave balance metric collapses Local + Sick — FIXED 2026-05-08.** The single summed "Leave balance" metric card has been replaced by one `MetricCard` per leave-balance row returned by `getMyLeaveBalances` for the signed-in employee. Cards are labeled `<Leave type> balance` (e.g. "Local Leave balance", "Sick Leave balance"), value is the per-type day count, and the note shows `Days remaining (<year>)`. When no balances are assigned yet, a single fallback card is rendered with value `—` and the note "No balances assigned yet". State ownership unchanged: `leave_balances` remains the owner; this is a presentation-only change on `EmployeeDashboard`. The corresponding `tests/e2e/employee.spec.ts` assertions were updated to look for the per-type cards instead of the previous summed total — both targeted tests still pass.

- **Password reset deep link returns "Verify requires a verification type" / PKCE verifier missing — FIXED 2026-05-11.** `/reset-password` now explicitly establishes a Supabase recovery session from the current URL before allowing password updates. It handles `code` via `exchangeCodeForSession`, `token_hash` via `verifyOtp({ type: "recovery" })`, and `access_token`/`refresh_token` via `setSession`, then cleans the token-bearing URL after verification. Admin-generated employee reset links now use the app-owned `/reset-password?token_hash=<hash>&type=recovery` URL instead of exposing the Supabase `/verify` action URL, eliminating the missing-verification-type failure path. The admin link field now wraps the full URL in a read-only textarea and provides a Copy button that copies the exact full generated URL; `/reset-password` also detects partial admin links such as `token_hash=dad19` and shows "Reset link is incomplete. Copy the full latest reset link and try again." Manual review then found that a normally signed-in employee could open `/reset-password` with no token and update their password; that is now blocked because the page requires a recovery parameter from the URL before enabling the update form, so an ordinary app session is not treated as a reset session. Manual review also reproduced `AuthPKCECodeVerifierMissingError` for public forgot-password email links. The public `/forgot-password` request now uses a plain Supabase JS client with `flowType: "implicit"` instead of the `@supabase/ssr` browser client, so the recovery request sends `code_challenge: null` / `code_challenge_method: null` and Supabase emails an access/refresh-token recovery link that the reset page's existing `setSession` branch can verify without stored PKCE verifier state. After a successful password update, `/reset-password` now signs out the local recovery session and redirects to `/login?message=password-updated`, so users explicitly sign in with the new password instead of being surprised by an active recovery session. The public `/forgot-password` UI no longer uses a native `<form>` submit path; it uses an uncontrolled email input plus a `type="button"` action, so a click before React hydration cannot reload the same page, clear the typed email, and leave the reviewer thinking the first request was ignored. Accepted reset requests still write `auth.password_reset_requested` through `/api/auth/password-reset-requested`; invalid demo/non-deliverable emails and rate limits surface specific visible UI messages. Regression coverage creates a temporary Auth user, verifies a recovery token on `/reset-password`, updates the password, asserts the redirect and login success message, proves the new password can sign in, asserts the public forgot-password request does not send a real PKCE challenge, asserts the pre-hydration forgot-password page cannot native-submit to itself, asserts the admin Copy button copies a long `token_hash` URL with `type=recovery`, asserts incomplete links keep Update password disabled, and asserts a signed-in employee cannot update a password from `/reset-password` without a recovery link. The reset page also caches in-flight recovery verification by token to avoid consuming one-time recovery tokens twice under React dev Strict Mode.

- **Generic "Employee account could not be created" still reproducible — FIXED 2026-05-08.** Session 59 had only the duplicate-email branch surface a specific UI message; every other failure (non-duplicate auth errors, profile DB error, employee_record DB error) fell into a static "Employee account could not be created. See audit log…" toast that hid the actual reason. Session 66 re-shaped `describeAuthError` (`src/server/actions/employees.ts`) into a typed reason map: `email_exists` / `user_already_exists` → "An account with this email already exists." (workEmail field error); `email_address_invalid` / `invalid_email` → "The work email address is not valid for sign-up." (workEmail field error); `weak_password` → password-policy hint; `signup_disabled` / `email_provider_disabled` → Supabase Auth config hints; `over_email_send_rate_limit` → rate-limit hint. Unknown auth codes now fall through to a last-resort message that quotes `code <X> — HTTP <status> — <message>` so the admin sees the actual API response in the toast without opening audit logs. The substring fallbacks for older Supabase variants (`already been registered`, `already exists`, …) still apply and now also set the workEmail field hint. The DB-stage failure branches (profile update, employee_record insert) now include the Postgres error code in the toast (e.g. "(db code 23505)") and still write the full code/message to `audit_logs` metadata. New toast format is `Could not create employee: <reason>`. Audit log shape unchanged: every failure branch still writes `employee.create_failed` with `stage` and the underlying `error_code`/`error_message`/`error_status` so the persistent record is the source of truth. Regression in `tests/e2e/admin.spec.ts` now asserts both the prefixed toast and the field-level workEmail error.

#### UX Friction

- **Form input is wiped on failure — FIXED 2026-05-08.** All v1 create/edit/submit forms now round-trip user input on Server Action failure. Action-state shapes for `employees`, `compensation`, `leave`, `documents`, `performance`, and `onboarding` carry a typed `values` field (e.g. `SubmittedEmployeeValues`, `SubmittedCompensationValues`, `SubmittedLeaveValues`, `SubmittedDocumentValues`, `SubmittedPerformanceValues`, `SubmittedOnboardingValues`); every failure branch in those actions populates `values` from a per-module `*SubmittedValues(formData)` helper; every uncontrolled input now reads `state.values?.X` first, then falls back to existing-record defaults (e.g. `c?.bankName`, `goal.progress`, `review.selfReview`), then to a static default (e.g. `+230 `, `Mauritius`, current year). Sensitive inputs are intentionally NOT round-tripped: `bankAccountNumber` is a `type="password"` field and the helper deliberately omits it; the document upload `file` input is a browser-controlled `<input type="file">` and round-tripping a `File` object is impossible — the user is told the title/category survived but the file must be re-selected. New regression: `tests/e2e/admin.spec.ts` "admin employee form preserves submitted values when create fails on duplicate email" submits an employee form with `admin@kushhr.dev` (existing seed user), asserts the duplicate-email field error renders, and asserts Full name / Work email / Job title / Start date / Work location all retained their typed values. Form pages affected: `/employees/new`, `/employees/[id]/edit`, employee self-service, `/payroll`, `/payroll/change-requests` (submit + reject), `/leave/new`, `/leave` decision rows, `/leave/admin` (leave types + balances), `/documents`, `/performance` (cycle + goal + review + self-review + employee progress), `/onboarding/admin` (template create + item add + assign template + assign individual), `/onboarding` (task complete with note).
- **Default work location should be Mauritius — FIXED 2026-05-08.** The Work location `<Field>` on `EmployeeFormShell` now uses `defaultValue={employee?.workLocation ?? "Mauritius"}` so new hires pre-fill to Mauritius while existing employee records keep their saved value on edit. Helper line: "Defaults to Mauritius for new hires. Change if the role is based elsewhere." No schema/Zod change — `workLocation` remains a nullable string with a 120-char cap.
- **Phone field has no country prefix — FIXED 2026-05-08.** The Phone input on the admin employee create/edit form and on the employee self-service "Personal details" form now defaults to `+230 ` (Mauritius) when no phone is currently saved, and shows a helper line: "Defaults to +230 (Mauritius). Replace the prefix if entering another country code." Existing values are preserved unchanged on edit. The shared `Field` component was extended to accept a `description` prop wired to `aria-describedby` (with the existing error message taking precedence). No schema change: `phone` remains a nullable string with a 40-char cap and the existing `emptyToNull` preprocess. Phone is the only place we currently capture a number; if any future feature adds another phone input it should reuse the `Field description` pattern.
- **Performance dashboard cards are not clickable — FIXED 2026-05-08.** `/performance` summary cards are now `next/link` anchors with the same hover/focus affordance pattern used by the main dashboard `MetricCard`: Active goals links to `#performance-goals`, Visible cycles links to `#review-cycles`, and Submitted reviews links to `#performance-reviews`. The corresponding list panels now have stable anchors. A sweep of the likely adjacent pages found no standalone unlinked KPI summary tiles in `/leave/admin`, `/onboarding/admin`, or `/payroll/change-requests`; the main dashboard cards were already linked in Session 51. UI-only change — no DAL, schema, RLS, trigger, or mutation changes. Targeted admin smoke asserts the three performance card hrefs.
- **Review cycle list rows are read-only — FIXED 2026-05-08.** Admins now get a row-level Edit action in the Review cycles list. The link opens `/performance?cycleId=<id>#cycle-form`, switches the existing cycle form into edit mode, pre-fills title/status/start/end/due dates/description, and saves through an admin-only `updateReviewCycle` Server Action. Status changes write audit events: `performance.cycle_activated` when activating, `performance.cycle_closed` when closing, otherwise `performance.cycle_updated`; metadata includes previous and new status. The goal form's cycle selector now posts `goalCycleId` internally so the cycle edit form can use `cycleId` without contract collisions. Targeted admin regression edits a cycle from the list to Closed and verifies the DB row plus audit log; targeted manager goal/appraisal regression still passes against the renamed goal-cycle form field. No schema/RLS/trigger changes.
- **Performance page is too long; forms are open by default — FIXED 2026-05-08.** Added a shared native `<details>`-based `CollapsibleSection` and changed `/performance` so admins and managers first see cards → review cycles → goals, with "Create/Edit review cycle" and "Set/update/Edit goal" collapsed unless a selected `cycleId` or `goalId` is being edited. The requested adjacent sweep was applied too: `/documents` upload is collapsed by default, `/onboarding/admin` assignment and template panels are collapsed by default, and `/leave/admin` keeps the leave-type/balance lists visible while collapsing the add/update forms. UI-only change — no Server Action, schema, RLS, trigger, or audit-log contract changed. Targeted admin/manager/employee browser regressions were updated to intentionally open the relevant section before filling the form.
- **No remark field for the 3 urgent local-leave days — FIXED 2026-05-08.** Local Leave requests can now be flagged as urgent in `/leave/new`; when the checkbox is selected, the form requires a bounded urgent reason at the HTML and Server Action boundaries and persists `is_urgent_local_leave` + `urgent_leave_reason` on `leave_requests`. The allowance/balance state owner is unchanged: `leave_balances` still owns the 22-day Local Leave balance and the existing approval trigger still owns deduction. Approvers see an "Urgent Local Leave" marker plus the employee's reason directly on the pending request row before approval. `leave.submitted` audit metadata records the urgent flag and whether a reason was present without copying the full reason into `audit_logs`. Regression coverage verifies the required reason UI, persisted urgent request context, manager-row visibility, approval, and balance decrement.
- **No status messaging on the employee dashboard — FIXED 2026-05-08.** The employee dashboard now includes a read-only "Recent updates" panel derived from existing state owners: decided `leave_requests` from the last 30 days, completed `onboarding_tasks`, `performance_reviews` in `manager_submitted` awaiting acknowledgement, and recent `documents`. Each row links back to the owning module (`/leave`, `/onboarding`, `/performance`, or `/documents`) and is sorted by event timestamp, so employees get a dashboard-level feedback loop without duplicating status state. Regression coverage seeds a leave approval, completed onboarding task, and manager-submitted review for Alice and verifies all three appear in the dashboard panel alongside the existing employee dashboard metric checks.

#### Validation Gaps

- **Mandatory-field enforcement is uneven — FIXED 2026-05-08.** Compensation is the policy reference: `salaryAmount`, `salaryCurrency`, `payFrequency`, `effectiveDate`, `taxId`, `nationalId` are required at both the HTML5 boundary (`required` attribute) and the Zod boundary (each field uses `.min(1, "<friendly>")` or a preprocess that maps blank to `undefined` so the user sees the right field-level message — not a generic type error). `bankName`, `bankAccountHolder`, `bankAccountNumber`, `passportNumber`, `nationality`, `notes` remain optional. The `safeParse` call now passes raw FormData values for required fields (instead of collapsing blank to `undefined`). The upsert payload writes `d.salaryAmount`/`d.payFrequency`/`d.taxId`/`d.nationalId`/`d.effectiveDate` directly. Field-level error displays were added under Pay frequency, Effective date, Tax ID, National ID. Regression: `admin compensation rejects blank required fields at the Zod boundary` seeds a complete row on Alice (separate from the manager row used by the bank-account-preservation test, so the two specs can run in parallel), clears Tax ID + National ID, disables HTML5 `required` via `page.evaluate`, and asserts both server-side messages render.

  Session 68 extended the same pattern to two more forms:
  - **Employee form**: `jobTitle` is now required at the Zod boundary (`.min(1, "Job title is required.")`) — every v1 employee record must carry an HR-visible job title; department and manager remain optional pending org structure. `displayName`, `workEmail` (admin create only), `jobTitle`, `startDate` now carry `required` HTML attributes plus min/max length attrs that match the Zod rule. The own-profile form's `displayName` also got `required` and length attrs. Existing tests already filled Job title so no regression broke; the new-hire-journey and search-employee specs now use `page.locator('select[name="role"]').selectOption(...)` instead of `selectOptionByText(page, "Role", ...)` because the latter collides with the Work-location helper text that mentions "role".
  - **Document upload form**: `category` `<select>`, `title` text input (with `minLength={2}`/`maxLength={160}` to match Zod), and `file` input now carry `required`. Schema and Server Action were already strict; this closes the HTML5/Zod consistency gap.

  Session 69 completed the remaining audit:
  - **Performance forms**: `ReviewCycleForm`, `GoalForm`, `EmployeeGoalProgressForm`, `ManagerReviewForm`, and `SelfReviewForm` now carry matching HTML `required`, `min`/`max`, and `maxLength` attributes for required and bounded fields. `savePerformanceGoal` now requires a review cycle at the action boundary (v1 goals belong to a cycle), and blank progress/score values are preprocessed to `undefined` so Zod returns friendly field errors such as "Progress is required." / "Select a score." instead of silently coercing `""` to `0`.
  - **Onboarding forms**: template create, template-item add, template assignment, individual task assignment, and task completion note controls now carry the same required/max-length attributes as their Zod schemas. UUID validation for employee/template/task ids now normalizes missing values through a friendly `requiredUuid` helper before regex validation.
  - **Leave forms**: `/leave/new` now uses normal browser validation for leave type and dates; leave balance upsert now rejects blank balance/year at the Zod boundary instead of coercing blanks to `0`, shows field-level errors for both fields, and uses friendly "Select an employee/leave type" messages when searchable selects are empty.
  - **Regressions**: `tests/e2e/admin.spec.ts` now includes Zod-boundary checks for blank performance goal cycle/progress, blank leave balance/year, and blank onboarding individual-task title by disabling HTML `required` in the browser before submit. Targeted run passed alongside the existing compensation required-field test.

#### Product / Policy Questions

- **Allowed document upload file types — FIXED 2026-05-08.** The v1 document upload policy is documented in `docs/security-model.md`: `contract` accepts PDF/DOC/DOCX, `id_document` accepts PDF/JPG/PNG, `payslip` accepts PDF only, `policy` accepts PDF only, and `other` accepts PDF/DOC/DOCX/JPG/PNG/TXT; every category is capped at 10 MiB. `src/lib/document-upload-policy.ts` is the shared source for the UI accept list, category labels, MIME/extension rules, max-size constant, and Storage MIME union. `uploadDocument` now validates size, MIME type, and filename extension before writing to Storage, so a non-conforming file is rejected before any Storage object or metadata row is created. Migration `0029_document_upload_policy.sql` updates the private `hr-documents` bucket to 10 MiB and the global MIME union; remote Supabase is aligned through `0029`. The document upload form now shows category-aware accepted types and max size. Existing policy-upload E2E fixtures were changed from `.txt` to `.pdf`, and a new admin regression proves `policy` + `.txt` is rejected server-side with no metadata row inserted.



## Comprehensive Manual User Flow Scenarios (2026-05-09)

Use these scenarios for the next full human-flow review after the environment cleanup dry run reports 0 targeted Playwright artifacts. The aim is to exercise the product as a real HR workspace, not just click every page. Record tester, browser, date/time, role, pass/fail, screenshots where useful, and any unexpected data shown to the wrong role.

### Review Setup

| Item | Scenario | Expected result / evidence |
|---|---|---|
| Clean data | Run `npm run cleanup:e2e-data:dry-run` before starting | All Playwright artifact categories show 0. Keep seed users and real seed data only. |
| Seed accounts | Confirm `admin@kushhr.dev`, `manager@kushhr.dev`, `alice@kushhr.dev`, and `bob@kushhr.dev` can sign in | Each lands on the correct role dashboard; no login loop. |
| Browser coverage | Run one full pass on desktop for dashboards, forms, tables, and long pages | Navigation remains usable; text does not overlap; forms stay readable. Mobile/tablet deferred. |
| Audit baseline | As admin, open `/audit-logs` and note the latest timestamp before testing | Later business actions should create newer audit rows. |

### Authentication And Account Recovery

| Actor | Scenario | Steps | Expected result / evidence |
|---|---|---|---|
| Any user | Normal sign-in and sign-out | Sign in, navigate to a module, sign out, use Back button | Signed-out session cannot access protected page; redirected to login. |
| Any user | Forgot password request | Open `/login`, follow forgot-password link, submit known email | Page returns a safe success message without exposing account existence details. |
| Admin | Generate employee reset link | Open an employee profile as admin, generate password reset link | Link appears only in current admin session; audit log records `auth.password_reset_link_generated`. |
| Employee | Recovery link sets password | Use a valid reset link, set a new password, sign in with it | Reset page verifies link before enabling update; new password works. |
| Any user | Invalid reset link | Open `/reset-password` with no/invalid token | Friendly error appears; no password update is possible. |

### Admin End-To-End HR Setup

| Area | Scenario | Steps | Expected result / evidence |
|---|---|---|---|
| Dashboard | Admin dashboard overview | Open `/dashboard`; click all metric cards and operational report links if present | Cards route to relevant filtered pages; admin-only data remains visible only to admin. |
| People | Create employee | Create a new employee with unique work email, job title, department, manager, role, start date, and Mauritius work location | Employee appears in People Directory/profile; `employee.created` audit row exists; form success explains next login/reset step. |
| People | Duplicate email failure | Try creating another employee using an existing work email | Specific duplicate-email message appears; submitted form values remain; `employee.create_failed` audit row exists. |
| People | Edit employee profile/job data | Update job title, department, manager, employment type/status, phone, or work location | Changes persist on People profile and directory; no unrelated fields are wiped; audit row records update. |
| Departments | Manage department | Create or edit a department, then assign it to an employee | Department appears in searchable selectors and employee profile. |
| First login | New employee onboarding to login | Generate reset link for created employee, set password, sign in as that employee | Employee lands on employee dashboard with only own/safe data. |
| Compensation | Create/update compensation | Open `/payroll`, select employee, enter salary, currency, pay frequency, tax ID, national ID, bank fields, passport/nationality as applicable | Admin can see/edit sensitive fields; `compensation.updated` audit row exists. |
| Compensation | Required-field validation | Clear required payroll fields, bypassing or using browser validation as practical | Friendly field errors appear; no partial compensation update. |
| Payroll changes | Approve employee payroll change request | Have employee submit change request; admin approves it | Request status changes; applied compensation data matches request if applicable; audit records approval. |
| Payroll changes | Reject employee payroll change request | Have employee submit request; admin rejects with note | Rejection note is visible to requester; audit records rejection. |
| Leave admin | Create/update leave type | Add a temporary leave type or edit description/default days of an existing non-critical type | Type appears correctly in admin list and active selectors when active. |
| Leave admin | Set leave balance | Search employee and leave type, set current-year balance | Balance appears on employee leave page/dashboard; blank/invalid balance is rejected. |
| Documents | Upload employee document | Upload allowed contract/policy/ID file for an employee | Document appears in list/profile; signed download works; audit records upload. |
| Documents | Reject disallowed file | Try category/file mismatch, e.g. policy + `.txt` | Upload fails before Storage metadata row is created; friendly error appears. |
| Onboarding | Create template and items | Create onboarding template with several ordered items | Template and items appear in admin panel; empty/invalid titles are rejected. |
| Onboarding | Assign template | Assign template to employee | Employee sees tasks; admin sees progress update. |
| Performance | Create review cycle | Create draft cycle, then activate it | Cycle appears in list; manager can use active cycle; audit records status change. |
| Performance | Create/update goal | Assign goal to employee, edit it from the goals table | Goal fields persist; progress/status changes are visible; audit records goal action. |
| Performance | Submit appraisal as admin | Submit score and written feedback for employee | Review status moves to manager-submitted; employee can view but not edit manager score. |
| Audit | Review audit trail | Filter/scan `/audit-logs` after admin actions | Sensitive mutations and access denials have readable audit entries. |

### Manager Direct-Report Workflows

| Area | Scenario | Steps | Expected result / evidence |
|---|---|---|---|
| Dashboard | Manager dashboard overview | Open `/dashboard`; click pending approvals/action items/team leave rows | Rows link to relevant leave/profile/module pages without exposing out-of-scope employees. |
| People | View direct-report profile | Open Alice from People Directory or dashboard link | Manager sees limited direct-report profile, documents/leave/performance summaries as allowed. |
| People | Out-of-scope employee guard | Try to open Bob's profile or private data if Bob is not a direct report | Access denied or no private data; `auth.access_denied` audit row for forbidden action where applicable. |
| Leave | Manager submits own leave | Submit a leave request as manager | Own request appears pending; manager cannot approve/reject it. |
| Leave | Cancel own pending leave | Cancel manager's own pending request | Request becomes cancelled; audit records cancellation. |
| Leave | Approve direct-report leave | Employee submits Local Leave; manager views pending row, balance context, urgent reason if flagged, and approves | Request leaves pending queue; balance decreases atomically; `leave.approved` audit row exists. |
| Leave | Reject direct-report leave | Employee submits request; manager rejects with approver note | Employee sees rejected status/note; `leave.rejected` audit row exists. |
| Leave | Missing/insufficient balance | Attempt to approve request with no balance or too-low balance | Approval fails visibly; request remains pending; balance unchanged. |
| Leave | Team calendar drill-down | Click a team leave/calendar item | Lands on the correct request row or filtered leave view; unrelated employees are not shown. |
| Onboarding | Assign task to direct report | Assign individual task or template to Alice | Alice sees task; manager cannot assign to Bob/out-of-scope employee. |
| Performance | Create direct-report goal | Create goal for Alice in active cycle | Goal appears for Alice; manager cannot create/transfer goal for Bob/out-of-scope employee. |
| Performance | Edit direct-report goal | Use row Edit action to update status/progress/description | Existing goal pre-fills; update persists; employee reassignment stays locked or guarded. |
| Performance | Submit appraisal | Submit score 1-5 plus strengths/improvements/next steps for Alice | Review moves to manager-submitted; Alice sees acknowledgement task/update. |
| Restricted pages | Payroll, audit logs, leave admin | Try `/payroll`, `/audit-logs`, `/leave/admin` | Access denied; no salary/bank/tax/national ID data appears. |

### Employee Self-Service Workflows

| Area | Scenario | Steps | Expected result / evidence |
|---|---|---|---|
| Dashboard | Employee dashboard overview | Open `/dashboard`; inspect metrics, action items, recent updates, leave/document panels | Only employee-owned data appears; payroll card no longer exposes salary amount on dashboard. |
| Profile | View and edit own profile | Open own employee profile/settings area; update allowed personal fields such as phone | Allowed fields persist; role/job/payroll fields are not employee-editable. |
| Colleagues | People Directory visibility | Open `/employees` as employee | Confirm whether employee can see colleague directory; if blocked, record as product decision/gap for employee colleague directory. |
| Leave | View balances | Open `/leave`; inspect Local Leave/Sick Leave balances and current year label | Balances match admin setup; year label uses current year automatically. |
| Leave | Submit normal leave | Choose leave type, date range, optional note, submit | Request appears pending; `leave.submitted` audit row exists. |
| Leave | Submit urgent Local Leave | Choose Local Leave, flag urgent, enter reason, submit | Urgent reason is required; pending row shows urgent marker/reason to approver. |
| Leave | Cancel own pending leave | Cancel a pending own request | Status changes to cancelled; audit records cancellation. |
| Leave | Recent update after decision | Manager approves/rejects request; employee returns to dashboard | Recent updates panel shows decision and links to leave. |
| Documents | Upload own allowed document | Upload allowed document category | Document appears; signed download works; raw Storage URL is denied. |
| Documents | Block payslip upload | Try to upload a payslip as employee | Action is blocked; `auth.access_denied` audit row exists. |
| Onboarding | Complete task with note | Open assigned task, add completion note, mark complete | Task moves to completed; note/timestamp visible; audit records completion. |
| Payroll | View own payroll summary | Open `/payroll` | Employee sees own read-only summary only; sensitive edit controls are absent. |
| Payroll | Submit payroll change request | Submit bank/payroll detail change request | Request appears in employee queue; admin can approve/reject; audit records submission. |
| Performance | View goals | Open `/performance` | Own goals/reviews only; active goals visible. |
| Performance | Update goal progress | Add progress note, update percent, optionally mark complete | Progress persists; employee cannot update another employee's goal. |
| Performance | Submit self-review | Enter self-review for draft/self-reviewable cycle | Self-review persists; audit records submission. |
| Performance | Acknowledge manager review | Acknowledge manager-submitted review | Review status moves to acknowledged; score/manager feedback remain non-editable. |

### Cross-Role Security And Data-Leak Checks

| Scenario | Steps | Expected result / evidence |
|---|---|---|
| Employee route denial | As employee, try `/employees/new`, `/departments`, `/leave/admin`, `/onboarding/admin`, `/audit-logs` | Access denied; no protected page flashes meaningful data. |
| Manager route denial | As manager, try `/payroll`, `/audit-logs`, admin-only setup routes | Access denied; no sensitive payroll data visible. |
| Direct URL object access | Copy a URL to another employee's profile/document/review if visible as admin; open as employee/manager out of scope | Denied or redacted according to role. |
| Raw Storage URL denial | Copy Storage raw object URL from network/devtools; open as employee/other user | 400/401/403/404; signed URL remains short-lived. |
| Form tampering | In browser devtools, alter hidden employee/request IDs on leave, onboarding, payroll, or performance forms | Server rejects out-of-scope mutation; audit logs `auth.access_denied` where branch is sensitive. |
| Self-approval/self-appraisal | Try to approve own leave or submit appraisal for self where not allowed | Blocked with visible message; state unchanged. |
| Sensitive field exposure | Browse all manager/employee pages looking for salary, bank, tax ID, national ID, passport | Only admin payroll/compensation surfaces show sensitive fields. |
| Audit visibility | Try `/audit-logs` as manager/employee | Access denied; admin can still see audit log. |

### Workflow Edge Cases

| Area | Scenario | Expected result / evidence |
|---|---|---|
| Leave year rollover | On/after a new calendar year, dashboard and leave page labels use the current year automatically | Existing code reads `new Date().getFullYear()` for display/query; balance replenishment is not automatic in v1 and should be a backlog item unless HR manually creates next-year balances. |
| Multi-year leave | Submit or seed leave spanning Dec-Jan and approve with balances in both years | Deducts from each year's matching balance; fails visibly if either year is missing/insufficient. |
| Inactive leave type | Deactivate a leave type with historical requests | New requests cannot use inactive type; historical rows still display. |
| Large/invalid document | Try over-10 MiB file or wrong MIME/extension | Rejected before Storage write; no orphaned metadata. |
| Searchable selects | Type partial names in employee, manager, department, leave-type, template, and cycle selectors | Correct option resolves on submit; invalid typed text yields friendly field error. |
| Form failure preservation | Submit invalid/duplicate data on long forms | Non-sensitive values remain after failure; file inputs and password/bank-account fields are intentionally not preserved. |
| Empty states | Use seed accounts with no pending tasks/documents/goals where possible | Empty states explain what will appear without showing broken UI. |
| Mobile layout | Repeat dashboard, leave request, document upload, performance goal, and payroll change request on mobile width | Navigation, tables, and form controls remain usable; no overlapping text. |

### Evidence Checklist

| Evidence | Capture |
|---|---|
| Role dashboards | Screenshot each role dashboard after setup. |
| Created employee | Employee profile URL and audit log row. |
| Leave decision | Pending row before decision, result after decision, balance after deduction. |
| Payroll change | Request before/after admin decision; compensation row if applied. |
| Document security | Signed download success and raw URL failure status. |
| Performance review | Manager-submitted review, employee acknowledgement, audit row. |
| Access denied | Screenshot of at least one manager denial and one employee denial. |
| Cleanup | Final `npm run cleanup:e2e-data:dry-run` output after testing. |

### Triage Template For Findings

Use this shape when adding new manual findings below:

```md
- **Short finding title — OPEN.** Role: <admin|manager|employee>. Page/flow: `<route>`.
  Steps: ...
  Expected: ...
  Actual: ...
  Severity: <blocker|high|medium|low>.
  State owner / feedback note: ...
```

###Manual Review findings: 8may26 - fixing started on 12may26 for admin flow
-On the admin first page, the second dashboard "Operational Report" , the cards are not clickable.  Can they be made clickable, and lead to relevant pages?
-On the manager dashboard, is it necessary to show the "Manager Boundaries", please let's see where else we can document this, without the user seeing it.
-On the manager dashboard, in the team leave calendar, an employee is not clickable.  Can we make them clickable, wherever an employee name appears, as far as possible, so the manager can just click on the name and get to their details?
-When i go to Leave section, logged in as manager, I click on a name, e.g. Alice Employee, below, it displays everything, with status all statuses, no filter on date.  So the filters should be there, but when i click alice employee, it should show All statuses, a default date range (perhaps last two months or any other), which already applied when i click the employee in "out this week". Right now the behaviour is that it displays everything, even morgan manager, when i click on Alice employye.  Does this make sense?
-Remove the Payroll Summary card from the employee dashboard.  The employee needs to manually go to the payroll section to view payroll information.
-Should the employee have an "Employee" section?  It can have it, but the employee should be able to see the profiles (limited) of all other employees here, right?  What do you think?  I remember on BobHR, I could view other employee profiles, just simple infomration on them.  So for an employee, perhaps the Employees tab should contain the database of colleagues, which should be searchable
-In the leave section: It says: "Your 2026 balances".  What if we get to 2027, would it change automatically?  Can you verify it, if this is configured correctly to change next year, and replenish the balances?
-For any cards on the dashboards, do a small research how to best display it, and propose recommendations, right now, it looks good, but the numbers in the card look left aligned.  Do a research and tell me.
-When logged in as admin, what is the settings tab.  Right now, i see Settings: Role, policy, company, and security settings will be added behind owner/admin permissions.  What should be on this page.
-Now, lower, on the left side, there is a letter like "N", when i do actions, it changes to "Rendering" temporarily.  What can it show instead of "Rendering", in terms of better UX?
-Also, when I click on the "N", I see "Route", "Bundler", Route Info and Preferences.  What are these things?  Should user or admin be seeing it?  Do a research if necessary to find out.  When I click on Preferences, It shows, Theme.  If i go to dark mode, the app itself does not go into dark mode, but only the "N" window.  I also see Position, Size, Hide dev tools, Disable dev tools.  What are these used for?  Would they be here in production?
-Please Change "Employees" to something else.  From what I remember, the term "People" is now used.  Do a research please.
-When logged in as manager, on the onboarding tab, I see a progress of task overview, which is good.  I want to be able to click on the row, to go to the task, is that possible?  Below it, under "all tasks", it should be collapsable.
-In ther Performance tab, as a manager, If i want to do an appraisal, how do i select the employee.  When I click on review queue, i have to search for the employee.  Perhaps a better user experience would be, for the manager, when he gets on the performance dashboard, he can click on the review cycle, to see a list of employees where he has to appraise. ONce he clicks on an employee, the appraisal form is shown, along with the goals, and self appraisal of the employee, on which the manager can comment and add rating.  This can be something that is side by side, like it was in bob, and there are controls which allow the manager to submit the appraisal, "or save to submit later", and then the employee sees his rating.  Employee should also self appraise on the same fields as manager is doing the appraisal.  Please do a good research on this... and implement the best way forward.
- When i log in as Alice, i see the manager is not set.  But when i log in as morgan manager, I see that the manager of alice@kushhr.dev is the manager.  What is happening here?
- Using the back button after sign in and sign out does not work.  But i can see like a link in the browser, e.g. http://localhost:3000/login?next=%2Faudit-logs. and nothing happens, it stays on the login page.  Is this standard behaviour, please check and make appropriate changes if required.
- So when i clicked back, and tried to login again, i have browser saved users and passwords.  I find myself unable to select the saved users to login, as it appears and then disappears when i click on a saved user.  This happens when the url was http://localhost:3000/dashboard, but when i went on http://localhost:3000 , it translated to http://localhost:3000/login?next=%2F, and tried logging in using saved users, it worked.
- (Solved separately, as this is important to continue the manual review process) When resetting password via forgot password, i got the email.  When i clicked on the link in the email, i got the following error: Console AuthPKCECodeVerifierMissingError
PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.  Also, on the set new password page, there is this in red at the bottom: Reset link could not be verified. Use the latest reset link and try again. and the update password button does not work
- When adding employee as admin, does it make sense to prefill the manager, with the deparment manager, but it still can be overridden by another manager name?  Or should it be when selecting a deparment, it should already prefill the manager, but the employee's manager, can also be a senior team member, so it should allow for this change.  please evaluate and let me know what you think of this change.
- On the admin employees view, can you add more fields to the list, e.g. i don't see The employee level, whether he is employee, admin or manager?
- See screenshot Screenshot 2026-05-12 at 12.34.19 in the folder test-results/uat-screenshots, see how the ui Load is not aligned with the employee field?  Can you check this at other places?
- Can you make the mouse become a pointing hand finger, when it hovers over clickable items?  this is standard right?
- Logged in as admin and editing payroll: account holder field can remain blank, which should not be the case.  Can we make it mandatory, as are other fields like TaxID etc..?
- When saving, for example, for compensation, i need to go back up the page to see if it was successfully saved.  Can you make it more intuitive, and make things appear near the save button?  That is the standard right?  Find other places where this can be done.
- For payroll change requests, I see that there is a button "View requests" for the employee.  To make a change request, i need to click "view requests"?  Does this make sense.  It should be something else right?  
- For the Admin, in the dashboard, where is the small messages that highlight pending tasks?  didn't we implement this previously, or was it for employee or manager only?  I requested payroll change, and I can't find the request anywhere as admin or as manager.  What the hell?  This is basic stuff, things should connect to each other.  An event happens, it should trigger something else right?  After approving or rejecting, how will the employee know what happened?  Shouldn't it appear as a message or something in the dashboard? 
- In terms of UX, check where the user has to scroll sideways, e.g. as an admin trying to approve a change request, i have to scroll right.  Can this be made better, this is not great UX!
- As an admin, to manage leave types, it is found at the bottom of the page, but shouldn't appear above?  And if I add a leave type, where do I configure the year's balance? or every year's balance? This is missing!
- As an admin, to set or update balance, this is found again at the very bottom, which shouldn't be the case.  See screenshot Screenshot 2026-05-12 at 13.52.33.png in test-results, uat-screenshots.  There is a misalignment here, which is not good.  Also, for this case, the Leave type should necessarily be a dropdown, so that can select it.

### Manual Review findings: 8may26 — Triage (Claude, 2026-05-12)

Claude has taken over from Codex for this manual review remediation pass. The PKCE password-reset blocker recorded above is already closed across Sessions 74–83 (forgot-password implicit flow, recovery-session verification, post-update sign-out + redirect, full-link copy, incomplete-link feedback, signed-in guard) and is not re-triaged here.

The remaining 8may26 items are grouped by type → severity, following `docs/systems-thinking.md` (state owner, feedback signal, blast radius). Items inside each group are sequenced to minimise rework. Each item is logged as **OPEN** until fixed; this section will be updated in place as remediation lands (mirroring the Round 1 / Round 2 / Round 3 pattern above).

#### Group A — Bugs / Broken connections (do first)

- **A1. (Batch 3) Payroll change requests not visible to admin/manager dashboards after submission — FIXED 2026-05-12 (Claude, Session 89).** `getAdminDashboardData()` now fetches pending `payroll_change_requests` (via the existing admin DAL `getChangeRequests({ status: "pending" })`) and surfaces them in a unified "Action items" panel on the admin dashboard alongside pending leave requests, sorted by `created_at` desc, top 5. Manager dashboard does NOT include payroll change rows because payroll is admin-owned (Phase 8). Recent payroll-change decisions also appear in the new "Recent updates" panel (admin only). Employee acknowledgement of decisions is unchanged — employees see decided change requests on `/payroll/change-requests` and the existing employee Recent updates feed already covers their decided leaves/reviews. State owner unchanged: `payroll_change_requests`. Regression in `tests/e2e/admin.spec.ts`: "admin dashboard surfaces a pending payroll change request as an action item" seeds a pending change request for Alice via service-role and asserts the dashboard renders a matching action-item link.
- **A2. (Batch 4) Employee self-view of own profile shows manager as blank, while manager's view of the same employee shows the manager populated — FIXED 2026-05-12 (Claude, Session 90).** Root cause: `profiles` RLS for employees (`employee_select_own_profile`) only allowed reading their own row, so `hydrateEmployeeRows` in `src/server/dal/employees.ts` could not join the manager's profile via the RLS-scoped client → `managerName` collapsed to null. Admin/manager viewers were unaffected because their RLS already covered the relevant rows. Fix: migration `0031_employee_select_own_manager_profile.sql` adds a SECURITY DEFINER helper `public.is_own_manager(uuid)` and a new SELECT policy `employee_select_own_manager_profile` on `public.profiles` that grants an employee read access to the single profile row whose id equals their `employee_records.manager_id` (only while the employee is not terminated). Scope is minimal: SELECT only, DAL code unchanged. Regression test `tests/e2e/employee.spec.ts` → `employee self-view surfaces the assigned manager's name`. Applied to remote via `supabase db push --linked --include-all`.
- **A3. (Batch 1) Post sign-out back-button + `/login?next=%2F<route>` does not redirect to the original route after sign-in — FIXED 2026-05-12 (Claude, Session 84).** Root cause: `src/lib/supabase/proxy.ts` unconditionally redirected authenticated users hitting `/login` to `/dashboard`, ignoring `?next=`. The login form already honored `next` on submit, but bfcache/back-button arrivals at `/login?next=/X` while already authenticated were bounced to `/dashboard`. Proxy now reads `?next=`, validates it (same-origin relative, must start with `/` and not `//`), and redirects to that path; falls back to `/dashboard` when `next` is missing or unsafe. Regression in `tests/e2e/smoke.spec.ts`: "authenticated user visiting `/login?next=/X` is redirected to X, not /dashboard" exercises three paths (`/audit-logs`, `/employees`, default `/dashboard`).
- **A4. (Batch 1) Browser saved-credentials autofill is unselectable at `/dashboard` URL but works at `/` — FIXED 2026-05-12 (Claude, Session 84).** Root cause: `src/app/(auth)/login/login-form.tsx` used controlled inputs (`useState("")` + `value=`/`onChange=`) for Email and Password. Chrome's password-manager autofill writes the DOM value directly without dispatching React's synthetic events, so the next render writes `""` back over the autofilled value; the apparent "disappears when clicked" behaviour was the value being wiped immediately after the autofill suggestion was selected. Same anti-pattern Session 81 fixed for `/forgot-password`. Switched both inputs to uncontrolled (`name="email"`/`name="password"` with `defaultValue=""`); submit reads from `FormData`. Empty-input guard added so blank submits still produce a friendly inline error. Regression in `tests/e2e/smoke.spec.ts`: "login form signs in via uncontrolled inputs (autofill-compatible)" simulates a value-setter-only autofill (no input events) and asserts sign-in still succeeds.
- **A5. (Batch 2) Payroll: bank "Account holder" field can remain blank — FIXED 2026-05-12 (Claude, Session 88).** `bankAccountHolder` is now required at both boundaries. Zod schema in `src/server/actions/compensation.ts` switched from `z.string().trim().max(120).optional().or(z.literal(""))` to `z.string().trim().min(1, "Account holder is required.").max(120, …)`. The Server Action's FormData parse for `bankAccountHolder` was changed from `formData.get(...) || undefined` (the old optional pattern) to `formData.get(...)` (raw value) so a blank submit produces the friendly field-level message instead of a generic Zod "required" type error. The form input got `required` + `maxLength={120}` HTML5 attrs and a field-error display under the input. Regression in `tests/e2e/admin.spec.ts`: "admin compensation rejects blank Account holder at the Zod boundary" seeds Bob with a complete row, clears the holder, disables HTML5 `required` via `page.evaluate`, and asserts the server-side message renders.
- **A6. (Batch 3) Admin and manager dashboards lack the Action items + Recent updates panels the employee dashboard already has — FIXED 2026-05-12 (Claude, Session 89).** Both dashboards now render both panels via a unified `DashboardActionItem` / `DashboardRecentUpdate` data shape in `src/server/dal/dashboard.ts`. The previous narrower `EmployeeRecentUpdate` type is retained as a backwards-compatible alias. New helpers: `buildAdminActionItems`, `buildAdminRecentUpdates`, `buildManagerActionItems`, `buildManagerRecentUpdates`. Feed sources: **Admin Action items** = pending payroll change requests (A1) + pending leave requests (any scope); **Admin Recent updates** = recent (30d) decided leave + reviewed payroll change decisions; **Manager Action items** = pending direct-report leave + pending direct-report performance reviews (self-reviewed awaiting manager submit); **Manager Recent updates** = recent (30d) decided direct-report leave + completed direct-report onboarding tasks + acknowledged direct-report appraisals. The old standalone `<Panel title="Manager boundaries">` and the now-superseded `PendingApprovalsList` component were removed. A unified `ActionItemList` + `RecentUpdateList` UI is shared across admin/manager/employee dashboards. Regression in `tests/e2e/admin.spec.ts:43` + `tests/e2e/manager.spec.ts:44` asserts both panel headings render.

  Implementation note: each panel reads from existing state owners only (no schema, no RLS, no trigger, no audit-log contract change). Audit-log evidence remains the source of truth for compliance; these panels are derived feeds for in-flow feedback. Role: admin, manager. Page/flow: `/dashboard`. Current state: `EmployeeDashboard` has both panels; `ManagerDashboard` has Action items (pending leave approvals) but no Recent updates; `AdminDashboard` has neither. This means an admin who approves/rejects a payroll change request, leave, performance review, etc. has no dashboard-level signal that something happened, and a manager has no "latest events" view of their direct-report activity. Feedback loop gap per `systems-thinking.md` §2 — same family as A1 (payroll change requests not surfacing). Decided pairing: implement A1 as one of the data feeds into the new A6 panels so both land together in Batch 3. Source feeds to consider (read-only, RLS-scoped DAL projections): pending payroll change requests, pending leave approvals (admin already has admin scope; manager scope already exists), pending appraisals to submit/acknowledge, recent decided leave requests, recent payroll change decisions, recent acknowledged appraisals, recent onboarding completions. State owners unchanged — each panel reads from existing tables; no new state. Severity: medium.

#### Group B — Security / Data-exposure UX

- **B1. (Batch 2) Remove Payroll Summary card from the employee dashboard entirely — FIXED 2026-05-12 (Claude, Session 88).** The Payroll-summary `MetricCard` was deleted from `EmployeeDashboard` in `src/app/(app)/dashboard/page.tsx` along with the associated `hasCompensation` / `payrollValue` / `payrollNote` derivations. Employees must now reach `/payroll` via the nav. Supersedes the Session 54 "Open" mask. The "Payroll" navigation Panel below the metric grid (read-only, no compensation values) is retained as a contextual nav affordance. `tests/e2e/employee.spec.ts:16` regression updated: "Payroll summary" card is now asserted **hidden** in the Key metrics grid.
- **B2. (Batch 2) Hide "Manager Boundaries" UI copy on the manager dashboard; move content to docs — FIXED 2026-05-12 (Claude, Session 88).** The `<Panel title="Manager boundaries">` block in `ManagerDashboard` (`src/app/(app)/dashboard/page.tsx`) was removed. Content was already documented at `docs/security-model.md:31` ("Manager — direct reports only … cannot see bank, tax, national ID, salary, or payroll fields") — the dashboard now relies on RLS + Server Action guards as the actual enforcement boundary, and the docs as the readable reference. No test depended on the removed copy.

#### Group C — UX consistency (cross-cutting, do as a single sweep)

- **C1. (Batch 8) Pointer cursor on clickable items — FIXED 2026-05-12 (Claude, Session 94).** Added a single global rule in `src/app/globals.css`: `button:not(:disabled), [role="button"]:not([aria-disabled="true"]), summary, a[href] { cursor: pointer }` plus a `cursor: not-allowed` rule for the disabled cases. Tailwind v4 ships with `cursor: default` on buttons; this restores the affordance everywhere without touching individual components.
- **C2. (Batch 8) Save feedback should appear near the Save button, not only at the top of the page — FIXED 2026-05-12 (Claude, Session 94).** Inline message added next to the Save/Submit button on: `compensation-form`, `document-upload-form`, `assign-tasks-form` (both forms), `template-panel` (both forms — the inline message was already after the "Add task" button; now covers success too), `performance-forms` (`CycleForm`, `GoalForm`, `ManagerReviewForm`, `EmployeeAcknowledgmentForm` via new `InlineSaveStatus` helper). Existing top-of-form banner is kept as a secondary anchor. `employee-form` already had `ActionMessage` next to its Save button — no change needed. `leave-balance-admin-panel`'s message already renders inline below the Save row (Batch 6). The duplication caused strict-mode collisions on many `getByText(...)` assertions; tests updated to `.first()` where applicable (10 sites across `admin.spec.ts`, `manager.spec.ts`, `employee.spec.ts`).
- **C3. (Batch 8) Sideways scrolling required on admin "Approve change request" table — FIXED 2026-05-12 (Claude, Session 94).** `src/components/payroll/change-request-queue.tsx` rewritten from a wide `<table>` (six columns including Actions with Approve/Reject form + rejection-reason input) to a vertical list of cards. Each card stacks metadata (Employee, Type, Status badge, date, notes) on the left and the action group on the right; on narrow viewports the action column wraps below. Primary actions are visible without horizontal scroll. No data-model change.
- **C4. (Batch 7) UI alignment issue — FIXED 2026-05-12 (Claude, Session 93).** `/payroll` employee picker: the `Load` button sat at the top of the row (aligned with the SearchableSelectField's label, not its input). Switched the flex container to `items-start` and offset the button by `mt-[1.625rem]` so it lines up with the input row while keeping the field's hint below.
- **C5. (Batch 6) Leave admin page layout — "Manage leave types" and "Set/update balance" sections appear at the bottom of `/leave/admin` but should be near the top; also fix the alignment issue — FIXED 2026-05-12 (Claude, Session 92).** Both admin panels now render the form inline at the top of the panel (above the lists), no longer wrapped in `<details>`. Balance form grid switched from `[1fr_1fr_80px_80px_auto]` (cramped) to `sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_120px_auto]` with consistent labelled fields per column.
- **C6. (Batch 6) Leave-balance form: "Leave type" must be a proper dropdown (not a free-text searchable) — FIXED 2026-05-12 (Claude, Session 92).** Replaced `SearchableSelectField` for `leaveTypeId` in `LeaveBalanceAdminPanel` with a native `<select>`. The action-side `resolveBalanceLeaveTypeId` fallback that previously accepted free-text via `leaveTypeIdSearch` still works for legacy submissions but is no longer reachable from the form.
- **C7. (Batch 8) Admin employees list — add more visible fields, including role/level (Employee / Manager / Admin) — FIXED 2026-05-12 (Claude, Session 94).** Added a `Role` column between Manager and Status in `src/app/(app)/employees/page.tsx`. Value comes from the existing `employee.role` projection on `EmployeeDirectoryRow`; rendered with `capitalize` so the enum values display as Employee / Manager / Admin.
- **C8. (Batch 8) Payroll change requests entry point copy — FIXED 2026-05-12 (Claude, Session 94).** Employee `/payroll` CTA renamed from "View requests" to "Submit a change request". Existing description "Request updates to your bank details, tax ID, or salary." already framed the action correctly; the button copy now matches.

#### Group D — UX Friction (navigation/clickability/redesigns)

- **D1. (Batch 9) Rename "Employees" → "People" — FIXED 2026-05-12 (Codex, Session 95).** Root cause: the main user-facing directory surface still used "Employees" as the primary product label, which felt narrower and more administrative than the intended HRMS language. Fixed by changing navigation and directory/profile surface copy to People/People Directory/People profile while preserving precise "Employee" terminology where it carries HR/legal meaning (Employee role, Employment status, employee selectors, employee records, employee validation/errors). Routes intentionally remain `/employees` to keep links, audit metadata, tests, and existing bookmarks stable. Regression coverage now asserts the People nav label and People Directory heading on admin/manager directory flows.
- **D2. (Batch 10) Employee should see a colleague directory (read-only, limited fields, searchable) — FIXED 2026-05-12 (Codex, Session 96).** Root cause: `/employees` was role-allowed for employees, but the underlying `profiles`/`employee_records` RLS only exposed the signed-in employee's own rows (plus their manager profile from Session 90), so employees could not see a BobHR-style colleague directory. User approved a limited DB surface and chose to omit phone until the model has a distinct `work_phone` field. Migration `0033_people_directory.sql` adds SECURITY DEFINER RPC `get_people_directory()` for authenticated users only, returning active people with exactly `id`, display name, job title, department name, and work email. It does **not** broaden base-table RLS and does not expose manager id/name, role, employment status/type, dates, work location, documents, or payroll fields. `getPeopleDirectory()` in `src/server/dal/employees.ts` consumes the RPC, and employee viewers of People Directory now get a limited searchable table while admin/manager viewers keep the existing richer scoped directory. Regression coverage: employee browser test verifies Bob is visible, the directory is searchable, and private columns are absent; direct RPC test asserts the returned column set exactly matches the approved projection.
- **D3. (Batch 11) Make employee names clickable wherever they appear (manager dashboard "Team leave" calendar, leave lists, onboarding tables, performance lists, etc.) — FIXED 2026-05-12 (Codex, Session 97).** Employee names are now linked only on surfaces where the viewer already has profile scope: manager/admin leave request rows link to `/employees/<id>`, onboarding task rows link to the employee profile, performance goal and review rows link to the employee profile, and dashboard Team leave names link into the filtered leave view. Employee-view colleague-directory names remain plain text because D2 intentionally exposes a limited directory projection, not full colleague profile access.
- **D4. (Batch 11) Manager `/leave` — clicking an employee name from "Out this week" must auto-filter the request table below to that employee with all statuses and a sensible default date range (e.g. last 2 months) — FIXED 2026-05-12 (Codex, Session 97).** `/leave` now accepts `employeeId` as a query filter and preserves it through the filter form. "Out this week" entries link to `/leave?status=all&employeeId=<id>&from=<two-months-ago>&to=<week-end>#leave-request-<id>`, so managers land on the selected employee's requests across all statuses in a bounded date range instead of the unfiltered table.
- **D5. (Batch 11) Admin "Operational Report" cards on the admin dashboard should be clickable — FIXED 2026-05-12 (Codex, Session 97).** `ReportItem` now renders as a focusable `next/link` card with hover/focus affordance. Starters and incomplete profiles link to `/employees`, leavers link to `/employees?status=terminated`, and approved leave days links to `/leave?status=approved`.
- **D6. (Batch 11) Manager onboarding tab — task-overview rows should be clickable to the task, and "All tasks" should be collapsible by default — FIXED 2026-05-12 (Codex, Session 97).** Manager/admin Onboarding now wraps "All tasks" in the existing `CollapsibleSection` closed by default (employee "Your tasks" remains open). `getOnboardingProgress` includes the first task id per employee; progress employee names link to the matching task row, open the collapsed section client-side, and target-highlight the row. Task rows also expose stable `#onboarding-task-<id>` anchors.
- **D7. (Batch 12) Performance appraisal flow redesign (manager) — FIXED 2026-05-12 (Codex, Session 98).** Root cause: the manager appraisal path lived primarily on `/performance/reviews` as a selector-heavy form, so managers had to search for an employee rather than start from the active cycle and direct-report queue. The current schema already supports a non-submitted review row via `status = 'draft' | 'self_reviewed'`, nullable score/manager feedback, and `submitted_at`; no migration was needed. `/performance` now has a manager appraisal section: managers click a review cycle, see direct reports and review status, click a person, and land in a side-by-side workspace with employee self-review + linked cycle goals on the left and manager rating/feedback on the right. `submitManagerReview` now supports `intent=draft` to save partial manager notes without setting `submitted_at` or exposing the rating to the employee, plus the existing submit path to move the review to `manager_submitted`. Employee review rendering now hides manager score/feedback until submitted or acknowledged. Regression coverage verifies the cycle → direct report → workspace flow, draft audit/state, final submit audit/state, and employee draft-visibility guard.

#### Group E — Product / Policy Research (decide before coding)

- **E1. (Batch 7) Manager prefill on employee create — FIXED 2026-05-12 (Claude, Session 93).** `DepartmentOption` in `src/server/dal/employees.ts` now carries `managerId` (read from `departments.manager_id`). `SearchableSelectField` got an optional `onValueChange` callback that fires on input change / blur-match / sr-only-select change. `EmployeeFormShell` tracks `prefilledManagerId` in client state and re-keys the manager `SearchableSelectField` whenever the department changes, so its internal state resets to the new dept's manager. Admin can still override (the manager field is unchanged after the prefill drops in). Initial defaults respect the existing precedence: submitted form values > existing employee record > dept default. Hint text on the Manager field explains the prefill. Regression test in `tests/e2e/admin.spec.ts` → `admin create-employee form prefills manager from selected department (E1)`.
- **E2. (Batch 6) Leave year rollover policy — FIXED 2026-05-12 (Claude, Session 92).** Two complementary mechanisms:
  - **Admin rollover button** at the top of `/leave/admin` (`src/components/leave/leave-rollover-button.tsx`). New server action `rolloverLeaveBalances` in `src/server/actions/leave.ts` enumerates active employees × {Local Leave, Sick Leave} and upserts next-year `leave_balances` rows with `ignoreDuplicates: true` on `(employee_id, leave_type_id, year)`. Reads day counts from `app_settings` via `getAppSettingsAsAdmin` (E3). Custom leave types are NOT auto-rolled (decision: admins seed those manually). Writes a single `leave.balances_rolled_over` audit event with `metadata.{ year, created_count, skipped_count }`. Idempotent — re-clicking reports the skipped count and does not reset existing balances.
  - **Per-request auto-seed** in `submitLeaveRequest`: the action now rejects any request whose `startYear`/`endYear` exceed `currentYear + 1` with a friendly Zod-style error on `endDate` ("Leave can only be requested up to <next year>…"). For in-range future years, missing balance rows are seeded — Local/Sick auto-seeded from `app_settings`, custom types rejected with `No balance set for <type> in <year>. Ask admin to set one first.` The existing approval-time deduction trigger continues to do the actual decrement, so deduction semantics are unchanged.
  Decision (declined): per-leave-type `default_days` column on `leave_types`. Kept settings-driven Local/Sick only for v1 per user choice. Regression tests in `tests/e2e/admin.spec.ts` ("admin rollover seeds Local + Sick leave balances for next year and is idempotent") and `tests/e2e/employee.spec.ts` ("employee can request next-year Local Leave; balance is auto-seeded" + "year is more than one ahead").
- **E3. (Batch 5) Admin "Settings" tab content — FIXED 2026-05-12 (Claude, Session 91).** Migration `0032_app_settings.sql` replaces the unused 0010 key-value `app_settings` table with a typed singleton (`singleton boolean primary key check (singleton = true)`) carrying: company info (name, address, logo URL); leave policy defaults (`local_leave_default_days`, `sick_leave_default_days` — both with 0..365 CHECK constraints); working week (`text[]`), `timezone` (IANA), `currency` (ISO 4217). Single row is seeded by the migration with sensible defaults (22 / 15 / Mon–Fri / Indian/Mauritius / MUR). RLS is admin-only SELECT + UPDATE (no INSERT/DELETE — row is pinned by the singleton constraint). New DAL `src/server/dal/app-settings.ts` exports `getAppSettings` (RLS-scoped) and `getAppSettingsAsAdmin` (service-role, used by `createEmployee`'s default-balance seeder so the policy can be tuned from `/settings` without a code change). New server action `src/server/actions/app-settings.ts` validates input with Zod, writes via service-role, and emits a single `app_settings.updated` audit event with a `{ diff }` metadata payload. New `src/components/settings/settings-form.tsx` renders the three sections; `src/app/(app)/settings/page.tsx` is now functional. `createEmployee`'s `DEFAULT_LEAVE_POLICY` constant is renamed to `FALLBACK_LEAVE_POLICY` and is used only if `app_settings` is unreachable. The E2 year-rollover action (Batch 6) will read from the same table. Regression in `tests/e2e/admin.spec.ts`: "admin Settings page renders all three sections and persists changes" + "admin Settings rejects invalid logo URL and 3-letter currency at the Zod boundary". Applied to remote via `supabase db push --linked --include-all`.
- **E4. (Batch 13) Dashboard card visual design — FIXED 2026-05-12 (Codex, Session 99).** Root cause: dashboard KPI cards used a consistent component, but the hero values were left-aligned with the label/note and did not act as a clear visual anchor. Research note recorded in `docs/research/dashboard-card-dev-overlay-note.md`: keep the grid compact, make primary values dominant, keep labels/notes subordinate, and avoid decorative card churn. The shared dashboard `MetricCard` now uses a stable minimum height, centered 4xl primary value, centered supporting note, and `tabular-nums` for steadier numeric scanning. Existing card links and hover/focus behavior are preserved.

#### Group F — Next.js dev overlay ("N" indicator)

All sub-items are a single root cause: the Next.js dev tools overlay is visible locally and is not user-facing in production. Resolve as one investigation/sweep at the end of this round.

- **F1. (Batch 13) Tame and document the Next.js dev overlay — FIXED 2026-05-12 (Codex, Session 99).** Root cause: the lower-corner `N`, `Rendering` badge, Route/Bundler/Route Info/Preferences panel, and Position/Size/Hide/Disable controls are Next.js development diagnostics, not KushHR product UI. Local Next 16 docs confirm `devIndicators` controls the on-screen development indicator and that runtime error overlays appear only under `next dev`, not production. `next.config.ts` now sets `devIndicators: false` for a quieter local reviewer experience while preserving build/runtime error surfacing. `docs/research/dashboard-card-dev-overlay-note.md` explains that the overlay theme preference only themes the overlay, not the app. Verification: `npm run build` passed and produced the production route table; a brief `next start` launched successfully, but localhost curl from the sandbox could not connect back to the listening process, so the production absence claim rests on Next's local docs plus successful production build rather than a browser screenshot.

#### Proposed execution order

`A1 + A6 → A2 → A3 → A4 → A5 → B1 → B2 → E1 → E2 → E3 (decide) → C1..C8 (consistency sweep) → D1 → D2 → D3 → D4 → D5 → D6 → E4 (research) → D7 (largest) → F1 (final sweep).` A1 and A6 land together in Batch 3 because A1 is one of the data feeds A6 wires up.

Rationale: correctness bugs and broken feedback loops first (Group A; A1 is the highest because an event happens with no signal — the rule in `docs/systems-thinking.md` §2); exposure removals next (B); product/policy questions decided before the UI items they shape (E1/E2/E3 before D2/D6); the cross-cutting UX consistency sweep (C) before the navigation/clickability changes so we don't re-style components twice; the pervasive rename (D1) before clickable/linked items on the same surface; the appraisal redesign (D7) last in Group D because it is the largest single piece of work; dev-overlay cleanup (F1) as a single end-of-round sweep.

---

## shadcn/ui adoption (post-Batch 13)

After the 8may26 remediation queue closed, we began standardizing the UI primitive layer on shadcn/ui. This is an **incremental** migration, not a rewrite, and runs on top of the existing Tailwind v4 + Next 16 + React 19 + Supabase stack.

### Hard constraints carried into the migration

These come from prior phase decisions; violating them re-opens fixed findings.

- **No `react-hook-form` / `@hookform/resolvers`.** Phase 13 explicitly removed them. Native `<form action={...}>` + `useActionState` + the `state.values` round-trip pattern (Sessions 65–69) remains the form contract. Do **not** add shadcn's `Form` component.
- **No Server Action / Zod / audit log / RLS / DAL / schema changes** as a side effect of UI work. Action signatures, return shapes (`{ success, message, fieldErrors, values }`), audit event names, RLS policies, migrations — all untouched.
- **Preserve `state.values` round-trip + the exclusions:** `bankAccountNumber` (password input) and document `file` inputs are intentionally not round-tripped.
- **Light mode only.** The auto-flip `@media (prefers-color-scheme: dark)` block has been removed from `globals.css`.
- **C1 cursor rule preserved verbatim** in `globals.css` (Batch 8).
- **Mauritius-specific defaults stay** (`+230` phone, MUR/AED/USD currency, Mauritius bank dropdown, Mauritius work-location default, Local Leave / Sick Leave 22/15 day policy).
- **Playwright selectors are part of the contract.** When a shadcn primitive replaces a native control (most commonly `<select>` → Radix combobox), update the relevant spec in the same change. The Leave admin "Leave type" field (C6) is the documented exception where a proper dropdown was desired.

### Session 100 — proof of concept (Claude, 2026-05-12) — FIXED

- **Initialized shadcn/ui**: slate base color, new-york style, `cssVariables: true`, alias `@/*`, `iconLibrary: lucide`. `components.json` already matched these choices from earlier scaffolding.
- **Rewrote `src/app/globals.css`** with the canonical shadcn slate v4 token set (oklch), wrapped in `@theme inline`. Dropped the `@media (prefers-color-scheme: dark)` auto-flip. Set `--font-sans: Arial, Helvetica, sans-serif` so Arial body font is preserved through the migration. C1 cursor rules kept verbatim at the bottom.
- **Added** `button`, `input`, `label`, `card`, `table`, `dialog`, `select`, `alert`, `badge`, `textarea`, `separator`, `tabs`, and `sonner` (stock shadcn replacement for the deprecated `toast`). `button.tsx` overwritten with stock shadcn (Path A — accept theme drift now so every later page is consistent).
- **Extracted `Field`** from three file-local copies (`employees/employee-form.tsx`, `settings/settings-form.tsx`, `departments/department-forms.tsx`) into `src/components/ui/field.tsx`. Public API matches the richest prior variant (`{ name, label, error?, description? } & InputHTMLAttributes`). Internals use shadcn `Label` + `Input`. Settings page's `inputClass` prop is gone — Settings Fields now share the uppercase muted label style with employees/departments.
- **Extracted `MetricCard`** from `dashboard/page.tsx` and `performance/page.tsx` into `src/components/ui/metric-card.tsx`. Unifies the dashboard variant (label / value / optional note / optional href) with the performance variant. Performance metric cards now use the larger `min-h-32` layout matching dashboards.
- **Migrated `/forgot-password` and `/reset-password`** to shadcn primitives (`Card`, `CardContent`, `CardFooter`, `Label`, `Input`, `Button`, `Alert`/`AlertDescription`). All recovery-session logic (Sessions 74, 79, 80, 81, 83) preserved verbatim. All Playwright selectors preserved.
- **Verification:** `tsc --noEmit` clean. `npm run lint` clean (two pre-existing `_prev`/`_formData` warnings in `leave.ts` unrelated). `npm run build` PASS (24 routes). `npx playwright test` PASS **110/110**.

### Next session — proposed sequencing

In rough order of value × risk:

1. **`/login`** — same auth-page treatment as the two pages migrated in Session 100. Tiny risk; finishes the unauthenticated surface.
2. **Three role dashboards** (`src/app/(app)/dashboard/page.tsx`) — heavy use of `Card` for the action-items / recent-updates panels, `Badge` for status pills. `MetricCard` already extracted in Session 100.
3. **Four big forms** — employee create/edit, compensation, settings, performance (cycle + goal + manager review). Highest-density UI surfaces. Each is one commit. `SearchableSelectField`'s internals can stay; only the surrounding labels/inputs need replacing.
4. **List / queue pages** — employees directory, leave list, change-requests queue (already a card layout post-Batch 8 C3), audit logs.
5. **Stragglers** — documents, onboarding, payroll employee picker, leave admin panels.

Recommended follow-up that didn't fit Session 100: extract `TextField` / `SelectField` / `TextArea` from `src/components/performance/performance-forms.tsx` (and the inline `SelectField` in `employees/employee-form.tsx`) into shared shadcn-backed primitives. Removes the last big pocket of inline UI primitives and avoids duplicating the same work inside item (3).

### Session 101 — `/login` (Claude, 2026-05-13) — FIXED

- `src/app/(auth)/login/page.tsx` + `login-form.tsx` re-skinned with shadcn `Card` / `CardContent` / `Label` / `Input` / `Alert` / `Button`. Suspense fallback shell also rewrapped in `Card`.
- **Inputs intentionally remain uncontrolled** (`name=` + `defaultValue=""`, no `value`/`onChange`) so Chrome's password-manager autofill — which writes the DOM value without dispatching React events — is not wiped on the next render. Inline comment in the form keeps that constraint visible. (Session 84.)
- Page shell switched from `bg-slate-50` to `bg-muted/40`.
- **Selectors preserved verbatim**: `getByRole("heading", { name: "Sign in" })`, `getByLabel("Email")`, `getByLabel("Password")`, `getByRole("link", { name: "Forgot password?" })`, `getByRole("button", { name: "Sign in" })`, `input[name="email|password"]` direct DOM queries from the autofill smoke test, and the "Password updated. Sign in with your new password." success string from `?message=password-updated`.
- **Verification:** `tsc --noEmit` clean. `npx playwright test tests/e2e/smoke.spec.ts` PASS 11/11.

### Session 102 — three role dashboards (Claude, 2026-05-13) — FIXED

All three role views (admin / manager / employee) live in `src/app/(app)/dashboard/page.tsx`. Migrated as a single commit.

- `<section>` element wrapping each `Panel` retained (tests use `page.locator("section").filter({ hasText: ... })`), and `<h2>` heading retained inside each panel (tests use `getByRole("heading", { name: ..., exact: true })`). Stock shadcn `Card` renders `<div>` and `CardTitle` renders `<div>` — both would break those selectors. Card token classes (`rounded-xl border bg-card text-card-foreground shadow`) applied to the existing `<section>` instead.
- `DashboardShell` errors block migrated to shadcn `Alert` + `AlertDescription` (same `role="alert"`, same text content, same `getByText` selectors).
- Token sweep across all panels, lists, empty states, and report items.
- Accent icon colours (amber / teal / emerald / indigo for `RecentUpdateIcon` and `ActionItemIcon`) retained as semantic row-kind discriminators.
- All heading texts and metric labels preserved verbatim ("Headcount", "Pending leave", "Onboarding progress", "Performance reviews", "Direct reports", "Pending approvals", "Team out this week", "Open reviews", "Local Leave balance", "Sick Leave balance", "Open tasks", "Active goals", "Action items", "Recent updates", "Operational report", "Team leave calendar", "Leave balances", "Recent documents", "Payroll").
- **Verification:** `tsc --noEmit` clean. `npx playwright test -g "dashboard"` PASS 11/11.

### Session 103 — four big forms (Claude, 2026-05-13) — FIXED

Highest-density UI surfaces in the app. Done as four sequential commits, one per file.

- `src/components/employees/employee-form.tsx`, `src/components/payroll/compensation-form.tsx`, `src/components/settings/settings-form.tsx`, `src/components/performance/performance-forms.tsx`.
- Native `<input>` / `<textarea>` replaced with shadcn `Input` / `Textarea` everywhere except the controlled cross-field-validating leave / urgent-leave / dates / goal / cycle inputs that need a controlled `value`/`onChange` pattern.
- Native `<select>` kept everywhere (Playwright `select[name="..."]` + `selectOption(...)` contract + C6 leave-type rule), styled with a shared `SELECT_CLASS` mirroring shadcn `Input` (`flex h-9 ... border border-input bg-transparent ... focus-visible:ring-1 focus-visible:ring-ring`).
- Top-of-form messages on compensation + Settings moved to shadcn `Alert`.
- Compensation `bankAccountNumber` stays a native `<input type="password">` (Session 65 round-trip exclusion).
- Performance forms' Next-steps panel re-themed from `border-teal-200 bg-teal-50 text-teal-900` to `border-primary/30 bg-primary/5 text-foreground`.
- Pre-session-100 follow-up extracted `TextField` / `TextArea` / `SelectField` (and the inline `SelectField` in `employee-form.tsx`) into `src/components/ui/{text-field,text-area,select-field}.tsx`. Every primitive now has **exactly one definition** in `src/components/ui/`.
- **Verification:** `tsc --noEmit` clean. Targeted suites: 9/9 employee, 14/14 compensation, 6/6 Settings, 20/20 performance.

### Session 104 — list / queue pages (Claude, 2026-05-13) — FIXED

Four sequential commits: employees directory + People directory tables, leave list + `/leave/new` + decision/cancel sub-forms, payroll change-requests page + form + queue, audit logs.

- All filter forms moved to shadcn `Input` / `Label` / `Button`; native `<select>` retained with token classes; error blocks → shadcn `Alert`.
- Three `StatusBadge` components (employees, leave, change-requests) plus the audit-action pill converted to shadcn `Badge` with semantic accent shades retained (emerald = approved/active, amber = inactive/pending/urgent, destructive = rejected, muted = cancelled/terminated).
- Leave-request form's controlled `value`/`onChange` cross-field validation pattern preserved verbatim. Approve/Reject inline buttons kept semantic emerald/destructive colours — the colour *is* the meaning of the action, not a generic primary/outline pair.
- **Selectors preserved**: `section[aria-label='Your leave balances']`, "Approver note" label, "Approve" / "Reject" / "Cancel request" / "Apply" / "Submit request" button names, "Actor filter ignored because it is not a valid UUID." literal, all heading texts.
- **Verification:** targeted suites 9/9 employees, 33/33 leave, 5/5 change requests, 9/9 audit.

### Session 105 — stragglers + chrome sweep — MIGRATION COMPLETE (Claude, 2026-05-13) — FIXED

Final batch closing the migration.

- **Stragglers (queued)**: documents stack (`documents/page.tsx`, `document-upload-form.tsx`, `document-download-button.tsx`, `soft-delete-document-form.tsx`); onboarding stack (`onboarding/page.tsx`, `onboarding/admin/page.tsx`, `task-list.tsx`, `template-panel.tsx`, `progress-table.tsx`, `assign-tasks-form.tsx`); payroll picker (`payroll/page.tsx`); leave admin panels (`leave/admin/page.tsx`, `leave-balance-admin-panel.tsx`, `leave-type-admin-panel.tsx`, `leave-rollover-button.tsx`).
- **Chrome leftovers**: `(app)/layout.tsx`, `app-navigation.tsx`, `kush-logo.tsx`, `access-denied/page.tsx`, `error.tsx`, every `loading.tsx` skeleton (dashboard / leave / leave admin / onboarding / onboarding admin / audit logs / documents / employees / employees [id] / payroll / payroll change-requests / performance / performance reviews / departments).
- **Secondary pages previously only partially touched**: `departments/page.tsx` + `department-forms.tsx`, `employees/new/page.tsx`, `employees/[id]/page.tsx`, `employees/[id]/edit/page.tsx`, `performance/page.tsx`, `performance/reviews/page.tsx`, `settings/page.tsx` shell, `performance-lists.tsx`, `password-reset-button.tsx`.
- **End state**: `grep -rE "slate-|teal-|bg-white" src/app/(app) src/components | grep -v "ui/"` returns **zero hits**.
- **Verification:** `tsc --noEmit` clean. `npm run lint` clean (two pre-existing unrelated warnings in `leave.ts`). Targeted suites 6/6 documents, 12/12 onboarding, 11/11 payroll, 7/7 leave admin, 13/13 secondary pages sweep.

### Migration close

| Surface | Status |
|---|---|
| Unauthenticated (`/login`, `/forgot-password`, `/reset-password`) | ✅ Sessions 100, 101 |
| Three role dashboards | ✅ Session 102 |
| Four big forms (employee, compensation, settings, performance) | ✅ Session 103 |
| List / queue pages (employees, leave, change-requests, audit logs) | ✅ Session 104 |
| Stragglers + chrome + secondary pages | ✅ Session 105 |

Hard constraints upheld across every session: no `react-hook-form`, no shadcn `Form`, native `<form action={...}>` + `useActionState` + `state.values` round-trip throughout; native `<select>` everywhere (Playwright contract + C6); `bankAccountNumber` (password input) and document `file` input intentionally not round-tripped (Session 65 exclusion); light mode only (the `prefers-color-scheme` auto-flip is gone); C1 cursor rule preserved verbatim; Mauritius-specific defaults intact (+230 phone, MUR/AED/USD, Mauritius bank list, Mauritius work-location, 22/15 Local/Sick policy). Recommended next step: final full Playwright run as the migration's verification boundary, then resume the Remaining-Before-Final-Sign-Off list (manual UAT pass, user-flow inventory, multi-AI final review).
