# KushHR Project Context

This note captures the research baseline for building KushHR: a lean, single-company HRMS inspired by BambooHR and HiBob/Bob. Treat it as product and security guidance for the project.

## Product Scope

Build a focused single-company HRMS MVP, not a full enterprise HR suite.

- Employee system of record: personal profile, job details, department, manager, location, employment status, start/end dates, and compensation metadata.
- Employee self-service: update limited personal details, view documents, request time off, see balances, and recover account access through the forgot-password flow.
- Employee performance self-service: view assigned goals, record progress notes, update progress percentage, mark goals complete, add self-review comments, and acknowledge completed appraisals.
- Manager workflows: approve time off, view direct reports, see team absence calendar, and complete onboarding tasks.
- Manager performance workflows: set and update direct-report goals, complete simple appraisals, and discuss next steps.
- Admin workspace: employee directory, departments, manager assignment, first-login/password-reset support, onboarding checklists, performance review cycles, document management, reports, settings, audit logs, leave administration, and payroll fields.
- Payroll readiness: admins manage payroll fields and approve payroll/bank detail change requests. Avoid building a full payroll calculation engine in the MVP.
- Reporting: headcount, starters/leavers, leave usage, incomplete profiles, payroll changes, upcoming birthdays/anniversaries, and onboarding progress.
- Onboarding: reusable task templates assigned to admins, managers, IT/finance, and employees.
- Performance appraisal: lightweight goals and manager appraisals with a 1-5 score. Defer 360 feedback, calibration, and compensation decisions.

## Roles And Permissions

Use three roles in v1: `admin`, `manager`, and `employee`.

### Admin

Admins can:

- Manage all employees.
- Manage departments.
- Assign managers.
- View and edit payroll fields.
- Manage leave types and balances.
- Approve or reject leave.
- Upload and view documents.
- Assign onboarding tasks.
- Manage performance review cycles and view all goals/appraisals.
- View audit logs.
- Manage app settings.

### Manager

Managers can:

- View direct reports.
- Approve or reject direct-report leave requests.
- Assign onboarding tasks to direct reports.
- Set goals and complete appraisals for direct reports.
- View limited employee profile data for direct reports.

Managers cannot:

- View bank details.
- View tax or national ID fields.
- Edit payroll fields.
- Access employees outside their reporting line.

### Employee

Employees can:

- View their own profile.
- Edit limited personal details.
- View their own leave balances.
- Request leave.
- Upload their own documents.
- View documents shared with them.
- Complete onboarding tasks.
- View own goals and appraisal history.
- Add self-review comments and acknowledge completed appraisals.
- View their own payroll summary.

Employees cannot:

- Edit salary or payroll fields directly.
- Approve their own leave.
- View other employees' private data.
- Edit manager scores or appraise themselves.

## Payroll And Leave V1 Rules

- Employees submit payroll or bank detail change requests.
- Admin approves and applies payroll/bank changes.
- Managers do not see salary, bank, tax, or national ID details in v1.
- Leave balances are manually managed in v1.
- Payslips are uploaded as documents with category `payslip`.

## Core Modules

- Authentication.
- RBAC.
- Employee directory.
- Department and manager hierarchy.
- Leave management.
- Documents.
- Onboarding tasks.
- Performance goals and appraisals.
- Payroll fields.
- Payroll change requests.
- Audit logs.
- Notifications — transactional email (Resend). Auth emails via GoTrue SMTP (slice 1) + app-originated email for 6 high-signal events via `src/server/email.ts` (slice 2). In-flight integrations workstream; Slack + Google Calendar pending, production sender IT-blocked (see `pending-backlog.md` §4).
- Admin dashboard.
- Manager dashboard.
- Employee dashboard.

## UX Direction

The app should feel like a quiet operating console for recurring HR work.

- First screen after login should be the working dashboard, not a landing page.
- Use a restrained left navigation: Dashboard, Employees, Departments, Leave, Documents, Onboarding, Performance, Payroll, Settings, Audit Logs.
- Prioritize dense but readable tables, filters, status badges, approval queues, and clear empty states.
- Employee profiles should use tabs such as Overview, Job, Compensation, Documents, Leave, and Audit.
- Payroll should show readiness, warnings, changed fields, export history, and approval state.
- Leave should include request flow, balance view, approval queue, and a "who's out" calendar.
- Performance should include goal tracking, employee goal-progress updates, row-level goal editing for managers/admins, active review cycles, manager appraisal, employee acknowledgement, and clear 1-5 scoring.
- UI visibility must follow role permissions. Do not rely on hidden UI as the only access control.
- Include loading states, empty states, error states, access-denied screens, and responsive layouts.
- Use shadcn/ui-style tables, forms, dialogs, dropdown menus, tabs, cards, badges, toasts, and confirmation dialogs.

Core pages:

- `/login`
- `/dashboard`
- `/employees`
- `/employees/[id]`
- `/departments`
- `/leave`
- `/leave/admin`
- `/leave/calendar`
- `/leave/new`
- `/leave/requests`
- `/documents`
- `/onboarding`
- `/performance`
- `/performance/reviews`
- `/payroll`
- `/payroll/change-requests`
- `/settings`
- `/audit-logs`

Dashboards:

- Admin: headcount, pending leave, onboarding progress, recent audit events, team leave calendar.
- Manager: direct reports, pending approvals, team leave calendar.
- Employee: own leave balance, tasks, documents, active goals, payroll summary, team leave calendar.

The team leave calendar appears on all three dashboards as a capped 7-day list, with a link into `/leave/calendar` (cross-role month-grid view). All four surfaces read from the same security-definer RPC `get_company_approved_leave` so visibility scope is uniform regardless of role.

## Security Baseline

Supabase (Auth, Postgres + RLS, Storage) is the backend. Core rules:

- Deny by default. RLS on every table — the database-level authorization layer.
- Never expose service-role keys to browser code.
- Cookie-based auth via `@supabase/ssr`; validate user server-side on every protected operation.
- Server Actions and Route Handlers are public endpoints: authenticate → authorize from DB → Zod validate → mutate.
- Private Storage buckets for all HR/payroll documents; signed URLs for downloads.
- Append-only audit logs for sensitive events. Authorization failures are logged.
- OWASP Top 10 2025 baseline — primary risk: Broken Access Control.

Full detail: `docs/security-model.md`.

## Data And Privacy

- Collect only data needed for HR, payroll readiness, compliance, and operations.
- Sensitive fields (compensation, bank, tax, national ID) separated into narrow tables.
- Performance scores and feedback are private HR data; scope them like employee records, not public directory fields.
- Track who changed what and when.
- Retain payroll and employment-tax records per IRS guidance (4+ years after Q4 filing).
- Retention-aware document categories.

## Testing Expectations

Permission boundaries require automated tests:

- Employee cannot view another employee's private data.
- Manager accesses direct reports only; blocked from bank, tax, national ID, and salary fields.
- Admin accesses all company data; sensitive updates are still audited.
- Employee cannot approve own leave or edit payroll fields.
- Manager cannot appraise employees outside their direct-report scope.
- Employee cannot edit manager-submitted performance scores.
- Unauthorized route/API/storage access fails.

Independent review trail:

- Claude Code cloud `/ultrareview` used review-only PR #1, comparing `ultrareview-full-codebase` against orphan `ultrareview-empty-base` so the whole codebase appeared in the diff.
- The merged ultrareview findings are recorded in `docs/ultrareview-findings.md`; all 13 confirmed findings are fixed as of 2026-04-29/30 with regression coverage and remote migrations `0021`, `0022`, and `0023` applied.
- PR #1 remains a temporary review artifact only. Do not merge it; close it after final sign-off if it is still open.
- Manual human-flow UAT is currently in progress using `docs/checks/phase-13.md`.
- Playwright E2E runs can leave persistent remote fixtures that clutter manual review. On 2026-05-06, generated journey employees, leave fixtures, performance fixtures, documents/storage objects, and onboarding tasks were cleaned. Use `npm run cleanup:e2e-data:dry-run` before manual review after future E2E runs, and only run `npm run cleanup:e2e-data` after confirming the dry-run output targets Playwright artifacts only.
- Manual-review remediation started one issue at a time on 2026-05-06. First fix: migration `0024_manager_active_cycle_visibility.sql` allows managers to see active empty review cycles so they can create the first direct-report goal/appraisal for an admin-created cycle; direct RLS and manager workflow regressions pass.
- Second manual-review fix on 2026-05-06: employee profile Documents, Leave, and Audit tabs now read real role-scoped module data instead of stale placeholder copy; targeted admin browser regression passes.
- Employee goal-progress gap fixed on 2026-05-06 with remote migration `0025_employee_goal_progress.sql`. Employees can now update own goal progress, add a progress note, and mark goals complete through an audited employee-only action; forged cross-employee updates are denied and audited.
- First-login/password-reset gap fixed on 2026-05-06. Admins can generate an audited recovery link from an employee profile, the login page links to `/forgot-password`, and `/reset-password` supports setting a new password after a recovery link.
- Public forgot-password recovery emails were hardened on 2026-05-11 after manual review hit `AuthPKCECodeVerifierMissingError` from a PKCE email link opened without its stored verifier. `/forgot-password` now sends recovery requests through a plain Supabase JS implicit-flow client, so the emailed reset link no longer depends on stored PKCE verifier state; `/reset-password` uses its existing access/refresh-token branch to establish the recovery session. (Codex, Session 79)
- Password-reset completion now clears the local recovery session and redirects to `/login?message=password-updated`, so users explicitly sign in with the new password after updating it. (Codex, Session 80)
- Leave approval feedback gap fixed on 2026-05-06. Leave approval still relies on the database trigger as the atomic balance owner, but managers now see specific missing-balance or insufficient-balance messages instead of the generic approval failure.
- Leave balance context gap fixed on 2026-05-06. Applicants see available balances and selected type/year context on `/leave/new`; approvers see balance context and requested days before approving pending requests.
- Role/job-title clarity gap fixed on 2026-05-06. Admin employee forms now explain that Role controls permissions and Job title is HR profile text, so manager/admin access is intentionally aligned with title data during manual review.
- Searchable-select remediation started on 2026-05-06. Employee create/edit Department and Manager fields support search-as-you-type labels, and the employee Server Action resolves typed labels to UUIDs so progressive form submission remains safe. (Codex, Session 44)
- Searchable-select remediation continued on 2026-05-06 with performance Employee and Review-cycle selectors. A shared `src/components/ui/searchable-select.tsx` component now backs both employee admin and performance forms; `savePerformanceGoal` and `submitManagerReview` resolve typed labels server-side, scoped to assignable employees and non-closed cycles. Form contract and `canManageEmployee` guard unchanged. (Claude, Session 45)
- Searchable-select remediation continued on 2026-05-07 with `/leave/admin` leave balance Employee and Leave-type selectors. The shared `SearchableSelectField` now backs the balance form; `upsertLeaveBalance` resolves typed employee labels against all employees and typed leave-type labels against active leave types before the unchanged UUID schema. `leave_balances` remains the state owner and the admin-only mutation guard remains the boundary. (Codex, Session 47)
- Searchable-select remediation continued on 2026-05-07 with `/documents` admin upload Employee selector. Admin uploads now use the shared searchable component and `uploadDocument` resolves typed employee labels against all employees before the unchanged UUID schema; employee self-upload remains a hidden signed-in-user UUID. `documents` metadata plus Storage remain the state owners and existing authorization guards remain the boundary. (Codex, Session 48)
- Searchable-select remediation continued on 2026-05-07 with `/payroll` admin employee picker. The page now uses the shared searchable component and resolves typed `employeeIdSearch` labels against all employees before loading compensation; `CompensationForm` still posts the selected employee UUID. `employee_compensation` remains the state owner and `upsertCompensation` remains the mutation boundary. (Codex, Session 49)
- Searchable-select remediation completed on 2026-05-07 with `/onboarding/admin` assignment Employee and Template selectors. Assignment forms use the shared searchable component; onboarding actions resolve typed employee labels against the same role-scoped assignable list shown in the form and resolve template labels against active templates with tasks. `onboarding_tasks` remains the state owner and manager direct-report guards remain the boundary. (Codex, Session 50)
- Round 3 document upload policy fixed on 2026-05-08. Uploads are capped at 10 MiB and validated before Storage by category: contracts PDF/DOC/DOCX, ID documents PDF/JPG/PNG, payslips PDF only, policies PDF only, other PDF/DOC/DOCX/JPG/PNG/TXT. Migration `0029_document_upload_policy.sql` aligns the private `hr-documents` bucket MIME union and size limit; remote migrations are aligned through `0029`. (Codex, Session 70)
- Round 3 performance summary-card navigability fixed on 2026-05-08. `/performance` summary cards now link to their matching list anchors (`#performance-goals`, `#review-cycles`, `#performance-reviews`); adjacent module sweep found no separate unlinked KPI tiles beyond the already-linked main dashboard MetricCards. (Codex, Session 71)
- Round 3 review-cycle row editing fixed on 2026-05-08. Admins can edit cycle title/status/window from `/performance?cycleId=<id>#cycle-form`; `updateReviewCycle` remains admin-only and audits cycle updates/activations/closures with previous/new status. (Codex, Session 72)
- Round 3 long-form compaction fixed on 2026-05-08. A shared native `CollapsibleSection` now keeps long create/update forms closed until intentionally opened. `/performance` shows cards, review cycles, and goals before closed cycle/goal forms; query-selected cycle/goal edits open the relevant form. `/documents` upload, `/onboarding/admin` assignment/templates, and `/leave/admin` add/update forms use the same pattern without changing state owners, Server Actions, schema, RLS, triggers, or audit contracts. (Codex, Session 73)
- Round 3 Supabase recovery-link bug fixed on 2026-05-08. `/reset-password` now verifies recovery sessions from `code`, `token_hash&type=recovery`, or access/refresh-token URL shapes before enabling password updates. Admin-generated employee reset links now use the app-owned token-hash URL instead of a raw Supabase `/verify` URL. A targeted regression creates a temporary Auth user, resets the password through the page, and signs in with the new password. (Codex, Session 74)
- Round 3 urgent Local Leave justification fixed on 2026-05-08. `/leave/new` now exposes a Local Leave-only urgent checkbox with a required bounded reason; `leave_requests` stores `is_urgent_local_leave` and `urgent_leave_reason`; approvers see the urgent marker/reason in the pending row; `leave.submitted` audit metadata records the flag and reason presence without duplicating the full reason. Balance ownership remains with `leave_balances` and the existing approval trigger. (Codex, Session 75)
- Round 3 employee dashboard recent updates fixed on 2026-05-08. Employee dashboards now show a read-only "Recent updates" panel derived from existing owner tables: decided leave requests, completed onboarding tasks, manager-submitted reviews awaiting acknowledgement, and recent documents. Rows link to the owning module and no new status state is introduced. (Codex, Session 76)

## Key References

- `docs/security-model.md` — full security rules and OWASP mapping
- `docs/database-design.md` — tables, enums, migrations, triggers
- `docs/rls-policy-map.md` — RLS policy per table per role
- `docs/systems-thinking.md` — state ownership, feedback, and blast-radius rules
- `docs/phase-plan.md` — full build plan (Phases 0–12)
- `docs/playwright-suite.md` — Playwright project structure, forge-helper contract, placement rule of thumb for new tests
