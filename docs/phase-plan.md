# KushHR Phase Plan

## Phase 0 — Research And Project Context

Goal: establish product scope, security baseline, privacy rules, and documentation rhythm before any code is written.

Deliverables:

- `PROJECT_CONTEXT.md` with product scope, UX direction, security baseline, privacy/data rules, testing expectations, and references.
- `handover.md` and research notes.
- Supabase migration conventions placeholder.
- Agent check files or reports for research, QA, review, UI/UX, and security.

Exit checks:

- Research Agent confirms scope and security guidance.
- QA Agent, Review Agent, UI/UX Agent, and Security Agent record pass/fail notes.

**Status: Complete.**

---

## Phase 1 — Research, Prior Project Review, And Architecture Plan

Goal: align documentation before building anything.

Deliverables:

- Research lessons learned.
- Security best practices.
- HRMS best practices.
- Architecture plan.
- Data model plan.
- Security model plan.
- Updated phase plan.
- Updated handover.

Exit checks:

- QA Agent confirms required docs exist.
- QA Agent confirms assumptions are listed.
- QA Agent confirms project risks are listed.
- Review Agent confirms scope is MVP-sized.
- Review Agent identifies overbuilt items.
- Security Agent confirms RLS-first architecture.
- Security Agent confirms sensitive data model separation.

Stop after this phase and summarize. Do not build features.

**Status: Complete (planning docs exist; agent check runs were deferred to session alignment).**

---

## Phase 2 — Scaffold App

Goal: create a running Next.js/Supabase app shell with all tooling in place and no premature feature complexity.

Install:

- Tailwind CSS.
- shadcn/ui conventions and compatible primitive packages (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`).
- Supabase client packages (`@supabase/supabase-js`, `@supabase/ssr`).
- Zod.
- React Hook Form and `@hookform/resolvers`.
- Testing tools (Playwright).
- Lint and typecheck tooling (ESLint, TypeScript).

Set up:

- App layout (`src/app/layout.tsx`).
- Route groups: `(app)` for authenticated pages, `(auth)` for login/signup.
- `.env.example` with public placeholders and backend-only key placeholders clearly marked.
- Supabase browser and server client utilities (`src/lib/supabase/`).
- Base dashboard shell.
- Desktop and mobile navigation.
- Protected route structure (redirect to login when unauthenticated).

Deliver:

- Running app shell (`npm run dev` succeeds).
- `README.md` with commands, environment setup, and security notes.
- `.env.example`.
- Updated `handover.md`.

Exit checks:

- QA Agent: app starts, lint passes, typecheck passes.
- UI/UX Agent: layout is usable, navigation is clear.
- Review Agent: no premature feature complexity.

Stop after this phase and summarize. Do not implement auth, database, or feature logic.

**Status: Complete. All install, setup, and delivery items were completed in Session 2 (Phase 0 scaffold pass). Agent checks passed with noted residual risk (PostCSS advisory through next@16.2.4).**

---

## Phase 3 — Supabase Schema And RLS

**Status: Complete. Static checks passed; runtime checks requiring authenticated sessions are carried forward.**

Goal: create all core migrations, RLS policies, triggers, and seed data before any auth or feature UI is built.

Implement:

- Enums: `user_role`, `employment_status`, `employment_type`, `leave_request_status`, `document_category`, `pay_frequency`, `task_status`.
- Core tables (see `docs/database-design.md` for field detail): `profiles`, `departments`, `employee_records`, `employee_compensation`, `leave_types`, `leave_balances`, `leave_requests`, `documents`, `onboarding_templates`, `onboarding_tasks`, `audit_logs`, `app_settings`. (`payroll_change_requests` retired in migration 0048.)
- Foreign-key relationships between all tables.
- Indexes on every column referenced by an RLS policy or common query filter.
- `set_updated_at()` shared trigger function applied to all tables with `updated_at`.
- `insert_audit_log()` Postgres helper function (called explicitly from Server Actions, not via table triggers).
- `handle_new_user()` trigger on `auth.users` that creates a `profiles` row with default role `employee` on first sign-up.
- RLS enabled on every table in the same migration that creates it.
- Explicit RLS policies per table per role — see `docs/rls-policy-map.md`.
- Role mirrored into Supabase `app_metadata` via trigger so RLS policies can use `(auth.jwt() ->> 'role')::user_role` instead of joining `profiles` on every query.

Deliver:

- Numbered migration files under `supabase/migrations/`.
- `supabase/seed.sql` with demo users, departments, and one row per role (not a migration file — seeds are dev-only data, not schema).
- `docs/rls-policy-map.md` (planning doc listing intended policy per table per role, updated as migrations are written).
- Updated `handover.md`.

Exit checks:

- QA Agent: migrations apply cleanly with `supabase db reset`, seed data loads, no constraint violations.
- QA Agent: sign-up smoke test passes after all migrations — confirms `handle_new_user` trigger created the `profiles` row.
- QA Agent: role change on a profile row is reflected in JWT `app_metadata` — confirms `sync_role_to_jwt` trigger is working.
- Security Agent: RLS enabled on every table, policies tested by role, manager direct-report restriction tested, no table with `is_rls_enabled = false`.
- Review Agent: schema normalized enough but not overbuilt — no gold-plating, no premature multi-tenancy columns.
- Systems Thinking: state ownership decision for `profiles` FK delete behavior (`on delete restrict` vs `on delete cascade`) documented in `docs/database-design.md` and enforced by constraint.
- Systems Thinking: `departments` FK on `employee_records` uses `on delete restrict` — confirmed.
- Systems Thinking: `insert_audit_log()` function signature is stable and documented; any future change requires updating all call sites.

Security review required.

Stop after this phase and summarize. Do not build auth UI or feature pages.

---

## Phase 4 — Auth And RBAC

**Status: Complete.** Authenticated Playwright fixtures now pass for admin, manager, and employee. Historical hosted Auth preflight issues were resolved during Phase 12 hardening; remaining checks are direct-query RLS/trigger hardening items, not Auth blockers.

Goal: implement secure login, session handling, role-aware routing, and server-side authorization checks.

Implement:

- Login page with Supabase email/password auth.
- Logout action.
- Cookie-based session handling via `@supabase/ssr` and Next 16 `proxy.ts` (already scaffolded).
- Protected routes: redirect unauthenticated users to `/login` at the middleware/proxy layer.
- Server-side role checks in Server Components and Server Actions using role from `profiles` (not only from JWT claims).
- Role-aware navigation: show or hide nav items based on role (UI convenience only — not the auth boundary).
- Access-denied page (`/access-denied`) for authenticated users who reach a route they cannot access.
- Role-based dashboard shells: Admin, Manager, and Employee see different dashboard layouts. Dashboard data cards are placeholder/empty at this phase; real data populates in later phases.

Deliver:

- Working login/logout flow.
- Role-based dashboard shells (placeholder data).
- Access-denied page.
- Server-side `getSessionUser()` and `requireRole()` helpers.
- Updated `handover.md`.

Exit checks:

- QA Agent: login and logout work, protected routes redirect unauthenticated users, role redirects land on the correct dashboard.
- Security Agent: server-side auth checks present in every protected route and action, no service-role key exposure, no client-only authorization.
- Review Agent: no feature data wired prematurely, no role logic only in the client.
- Systems Thinking (feedback): access-denied events write an `auth.access_denied` audit log entry — confirm with a test that hits a forbidden route and checks `audit_logs`.
- Systems Thinking (state): `getSessionUser()` reads role from `profiles` in DB, not exclusively from JWT — confirmed in implementation.

Security review required.

Stop after this phase and summarize.

---

## Phase 5 — Employee Directory

**Status: Active. First read-only slice is implemented; mutation forms and audit-log writes remain.**

Goal: build the HR system of record — employee list, detail pages, create/edit, departments, and manager assignment.

Implement:

- Employee list page (`/employees`) with search and filter.
- Employee detail page (`/employees/[id]`) with tabs: Overview, Job, Documents (placeholder), Leave (placeholder), Audit (placeholder).
- Create employee form (admin only).
- Edit employee form (admin only for job/status fields; employee for own limited personal fields).
- Department list and management (`/departments`) — admin only for create/edit/delete.
- Manager assignment on employee records (admin only).
- Audit-log writes for employee creation, profile updates, and manager/department changes.

Role behavior:

- Admin sees all employees and can create, edit, and manage departments.
- Manager sees direct reports only (list and detail).
- Employee sees own profile only.

Deliver:

- Employee CRUD pages and forms.
- Department management page.
- Updated `handover.md`.

Exit checks:

- QA Agent: CRUD operations work for admin, role visibility tests pass (manager sees only direct reports, employee sees only self), department create/edit/delete works.
- UI/UX Agent: employee list table with filters, detail tabs, forms with validation errors and empty states are clear.
- Security Agent: RLS and server-side role checks verified, employee cannot access another employee's detail, manager cannot access outside their reporting line.

Stop and summarize.

---

## Phase 6 — Leave Management

Goal: support leave requests, approvals, balance tracking, and team visibility.

Implement:

- Leave types (admin-managed).
- Leave balances (manually managed by admin in v1 — no accrual automation).
- Leave request form for employees (`/leave`).
- Approve and reject flow for managers (direct reports) and admins (anyone).
- Request status tracking: `pending`, `approved`, `rejected`, `cancelled`.
- Leave request list with filters by status and date.
- "Who's out" calendar view (team absence visibility for managers and admins).
- Audit-log writes for leave approval and rejection.

Rules:

- Employees request leave; cannot approve their own request.
- Managers approve or reject direct reports only.
- Admins approve or reject anyone.
- Leave balances are manually managed by admins in v1.

Deliver:

- Leave module (`/leave`, `/leave/requests`).
- Updated `handover.md`.

Exit checks:

- QA Agent: request, approve, and reject flows work, employee cannot approve own leave, invalid date range is caught, balance display is correct.
- UI/UX Agent: request form and approval workflow are clear, status badges and empty states present.
- Security Agent: employee cannot approve own leave, manager cannot approve leave outside their reporting line, RLS verified.

Stop and summarize.

---

## Phase 7 — Documents

Goal: secure HR document storage, upload, categorised access, and signed URL downloads.

Implement:

- Private Supabase Storage bucket (`hr-documents` — never public).
- Document upload flow (employee for own docs, admin for anyone).
- Document categories: `contract`, `id_document`, `payslip`, `policy`, `other`.
- Document visibility rules per category and role (see `docs/rls-policy-map.md`).
- Signed URL download and view flow — no raw Storage URLs served to the client.
- Document access audit-log writes (upload and download events).
- Storage RLS on `storage.objects` mirrors the `documents` metadata table policy.

Rules:

- Employees upload and view own documents and documents shared with them.
- Admins upload for anyone and view all.
- Managers cannot view sensitive document categories (`payslip`, `id_document`, `contract`) unless explicitly shared.
- Payslips are uploaded by admins only; employees can view their own payslips.

Deliver:

- Document module (`/documents`).
- Storage bucket and `storage.objects` RLS policies.
- Updated `handover.md`.

Exit checks:

- QA Agent: upload, download, and category access tests pass, cross-employee access is blocked.
- Security Agent: bucket is private, signed URLs are short-lived and server-generated, no public files, manager cannot access payslips or ID documents.
- UI/UX Agent: upload flow with progress and error states is clear, document list with category filter and empty states present.

Stop and summarize.

---

## Phase 8 — Payroll Fields And Change Requests

Goal: expose compensation data to admins, give employees a read-only payroll summary, and provide a change-request workflow — without building a payroll engine.

Implement:

- Compensation fields UI (admin-only edit): salary amount, salary currency, pay frequency, bank name, bank account holder, masked bank account number display, tax/national ID, employment type, effective salary date, compensation notes.
- Employee payroll summary page (own data, read-only): salary, pay frequency, employment type — no bank or tax fields shown to employee directly.
- Employee payroll change request form: employee submits a request to change bank details, tax ID, or other sensitive fields.
- Admin approve/reject change request flow with audit log.
- Masking: bank account number displayed masked (show last 4 digits only) in all non-admin contexts.
- Audit-log writes for compensation updates and change request approval/rejection.

Rules:

- Admin can view and edit all compensation fields.
- Employee can view own payroll summary (salary and pay frequency only, not bank or tax fields directly).
- Employee submits change requests for sensitive field updates; cannot edit fields directly.
- Manager cannot view salary, bank account, tax/national ID fields — zero access to `employee_compensation`.

Deliver:

- Payroll module (`/payroll`, `/payroll/change-requests`).
- Change request workflow.
- Updated `handover.md`.

Exit checks:

- QA Agent: admin edit works, employee request flow works, manager is blocked from payroll and compensation pages.
- Security Agent: `employee_compensation` RLS blocks manager access, audit logs created for compensation changes and change request decisions, bank account masking works in all views.
- UI/UX Agent: sensitive data display is minimal and intentional, change request form and approval queue are clear.

Stop and summarize.

---

## Phase 9 — Onboarding

Goal: let admins and managers assign tasks to new employees and track completion.

Implement:

- Onboarding templates (admin-managed reusable task lists).
- Assign tasks to employees from a template or individually (admin for anyone, manager for direct reports).
- Employee task completion flow.
- Onboarding progress dashboard widget (admin and manager).

Rules:

- Admin can assign tasks to any employee.
- Manager can assign tasks to direct reports only.
- Employee can view and complete own assigned tasks.

Deliver:

- Onboarding module (`/onboarding`).
- Updated `handover.md`.

Exit checks:

- QA Agent: task assignment and completion tests pass, admin can assign to anyone, manager cannot assign outside reporting line.
- UI/UX Agent: task checklist is clear, progress indicators and empty states present.
- Security Agent: assignment restrictions verified server-side and via RLS, employee cannot access other employees' tasks.

Stop and summarize.

---

## Phase 10 — Audit Logs And Dashboards

Goal: wire up real dashboard metrics for each role and give admins a readable audit log viewer.

Implement:

- Admin dashboard: headcount, pending leave count, onboarding progress summary, recent audit events.
- Manager dashboard: direct report count, pending approvals, team "who's out" this week.
- Employee dashboard: own leave balance summary, pending tasks, recent documents, own payroll summary link.
- Audit log viewer (`/audit-logs`, admin only): filterable by actor, action, entity, and date range.
- Basic reporting within dashboards: headcount trend, starters/leavers count, leave usage summary, incomplete profile count — no separate reports pages needed.

Deliver:

- Admin, Manager, and Employee dashboards with live data.
- Audit logs page.
- Updated `handover.md`.

Exit checks:

- QA Agent: dashboard metrics are accurate, role-specific dashboards show correct data, audit log filters work.
- UI/UX Agent: dashboards are readable and scannable, audit log table is usable with filters and empty states.
- Security Agent: audit log page is admin-only, audit_logs rows cannot be edited or deleted by any role.
- Review Agent: no N+1 queries, no performance anti-patterns introduced.

Stop and summarize.

---

## Phase 11 — Performance Appraisals

Goal: add a simple manager-led performance appraisal module without building a full talent suite.

Implement:

- Performance review cycles (`draft`, `active`, `closed`) created by admins.
- Employee goals with title, description, due date, status, and progress percentage.
- Manager goal creation/update for direct reports.
- Admin goal creation/update for any employee.
- Employee view of own goals and appraisal history.
- Optional employee self-review comment before manager submission.
- Manager appraisal form for direct reports with:
  - Required score from 1 to 5.
  - Strengths.
  - Improvement areas.
  - Next steps.
- Employee acknowledgement after manager submission.
- Admin overview of all goals/reviews.
- Dashboard widgets:
  - Manager: open reviews and direct-report goal status.
  - Employee: active goals and latest review status.
  - Admin: review completion summary.
- Audit-log writes for goal changes, review submission, self-review, acknowledgement, and access-denied events.

Rules:

- Managers can appraise direct reports only.
- Employees can view only their own goals/reviews.
- Employees can add self-review comments and acknowledgements, but cannot edit manager score or manager feedback.
- Score is an integer from 1 to 5.
- Performance data does not update compensation automatically.
- No 360 feedback, peer review, calibration grid, AI summary, or automated reminder engine in v1.

Deliver:

- Migrations for performance enums/tables/RLS.
- Performance module (`/performance`, `/performance/reviews`).
- Navigation entry for Performance.
- Updated dashboards.
- Updated `handover.md`.

Exit checks:

- QA Agent: admin can create a cycle, manager can set goals and submit a review for a direct report, employee can self-comment/acknowledge, score validation catches values outside 1-5.
- Security Agent: manager cannot access or appraise non-direct reports, employee cannot edit manager score/feedback, performance tables have RLS enabled, no compensation fields are stored in appraisal tables.
- UI/UX Agent: goal list, review queue, appraisal form, score selector, empty states, and status badges are clear.
- Review Agent: implementation stays MVP-sized and does not introduce 360 feedback, calibration, or compensation automation.

Stop and summarize.

---

## Phase 12 — Hardening

Goal: full review pass — security, QA, accessibility, and documentation — before the app is considered shippable.

Perform:

- RLS policy tests: verify every table's policies pass the test checklist in `docs/rls-policy-map.md`, including performance tables.
- Route protection tests: every protected route redirects unauthenticated users and returns 403 for wrong role.
- Server Action authorization checks: every action validates session and role server-side.
- Zod validation checks: every mutation boundary has schema validation.
- File access tests: signed URLs work, raw Storage paths are blocked, bucket is private.
- Dependency audit: `npm audit --audit-level=moderate`, resolve or document residuals.
- Environment variable review: no secrets in client code, `.env.example` matches actual requirements.
- Error handling review: no stack traces or sensitive data in API responses or UI error messages.
- Accessibility pass: keyboard navigation, focus management, ARIA labels on interactive elements.
- Responsive UI pass: layout usable on mobile and tablet viewports.
- Loading, empty, and error states present throughout.

Deliver:

- `docs/security-review.md` — findings and resolutions.
- `docs/qa-report.md` — test coverage summary and known gaps.
- `docs/final-handover.md` — complete project state, known limitations, and recommended next steps.
- Updated `README.md`.
- Updated `handover.md`.

Exit checks: all items above checked off. Stop and summarize final state.

---

## Phase 13 — AI-Built App Risk Audit

Goal: review KushHR against researched AI-built/vibe-coded application risks before production or external UAT.

Source documents:

- `deep-research-report.md` — full research report.
- `deep-research-report-summary.md` — audit source file.
- `docs/ai-built-app-risk-audit.md` — current evidence report and finding list.

Perform:

- Fix or confirm Playwright browser authentication.
- Restore the full authenticated E2E suite to green.
- Make leave-balance decrement failures visible when an approved request has no matching balance row.
- Standardize `auth.access_denied` audit logging for sensitive denied business actions.
- Remove or justify unused form dependencies.
- Continue tracking the external Next/PostCSS advisory.
- Prepare manual Admin/Manager/Employee scenario testing.
- Run independent Claude Code cloud `/ultrareview` by comparing the full-codebase snapshot branch against an intentionally empty orphan base branch.

Exit checks:

- Full Playwright suite passes or any remaining failure is explained with evidence.
- Audit report updated from **GO WITH CONDITIONS** to either **GO** or a narrowed conditions list.
- High and medium evidence-backed findings are fixed, deferred with rationale, or converted into manual test items.
- Manual human flow review plan is ready.
- Independent cloud review findings are recorded, actioned, or explicitly deferred before the temporary review-only PR is closed.

Stop and summarize.

---

## Post-Phase-13 Product Backlog

These items are not blockers for the Phase 13 manual-review close-out unless the user explicitly promotes one into the current review scope.

- Admin reporting module: research common HRMS reporting patterns from publicly available product/reporting references, then design and implement standard KushHR admin reports across daily, monthly, and yearly views. Candidate reports include leave usage and absence trends, employees onboarded, starters/leavers, headcount, incomplete profiles, payroll-change activity, document upload activity, onboarding task completion, and performance-review completion. Reports must read from existing source-of-truth tables, preserve admin-only access where appropriate, and include empty/error states.
- UI polish / premium interface pass: after manual UAT and flow acceptance, refine visual design, spacing, hierarchy, dashboard/card presentation, navigation, and form ergonomics into a more premium HR operations interface without weakening accessibility or role/security boundaries.
- Expanded role model: add roles such as Director, CEO, and senior employees with reporting lines. Treat this as a systems-level access-control phase covering `profiles.role`, JWT role sync, RLS policies, server action authorization, navigation, dashboard visibility, reporting lines, and audit coverage.
- User manual / operating guide: optional final-stage documentation for admins, managers, and employees after workflows and UI terminology are stable.

---

## Final Step — Reusable Skills From Project Learnings

After KushHR reaches its accepted final state, extract reusable engineering and product lessons into team skills/checklists/global guidance for future projects.

Capture:

- Auth and password-reset lessons, including Supabase PKCE/implicit recovery flows, email rate limits, admin-generated reset links, incomplete-link UX, and post-reset session handling.
- Systems-thinking lessons: state ownership, feedback loops, blast-radius checks, RLS boundaries, role expansion, and audit coverage.
- Manual UAT lessons: how bugs were found, how scenarios were structured, and which flows most often exposed hidden issues.
- Form and validation lessons: preserving non-sensitive inputs, avoiding silent failures, adding field-level feedback, and treating browser validation as helpful but not sufficient.
- UI lessons from the final polished interface: dashboard/card patterns, long-form collapsing, navigation labels, density, empty/error states, and role-aware surfaces.

Deliver these learnings as reusable skills, templates, or checklists that can be incorporated into future projects and global team environments so similar mistakes are caught earlier.
