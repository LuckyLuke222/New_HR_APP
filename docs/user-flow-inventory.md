# KushHR User-Flow Inventory

**Single source of truth for what a user can actually do in KushHR**, derived from the real capability surface (every `src/server/actions/*.ts` export + every `src/app/(app)/**` page route) and cross-referenced to the test that covers it. (`src/app/**/route.ts` API handlers are out of scope — they're callbacks, not user-initiated journeys, and are owned by the access-matrix gate.)

This is the *living* inventory. The HRMS comparison (competitor gap analysis) is **parked** — its work-plan lives in `userflow.doc`, a binary Word file tracked at the repo root; open it in Word/Pages to un-park the comparison separately.

## How this stays current

Two mechanisms, one hard and one soft:

1. **Hard — CI gate `tools/check-user-flows.mjs`** (`npm run check:user-flows`, wired into the CI `gate` job). It enforces, bidirectionally:
   - every Server Action / `(app)` page route in code appears in a §1 row (in the **Server Action(s)** or **Entry route** column) or in the `user-flow-checker:exempt` block below — a new capability **cannot merge** without a flow;
   - every flow marked `Covered` / `Partially covered` cites a `Covered by` test (`<spec>.spec.ts › "title"`) that **actually exists** — a renamed/deleted test fails the PR.
   - **Boundary:** the gate proves a test *exists*, never that it *exercises the flow correctly* — that stays human review (same boundary as the access-matrix gate).
2. **Soft — doc-routing trigger** (`.claude/skills/change-workflow/SKILL.md`): a change touching a Server Action or `(app)` route must add/update the flow row in the same change; surfaced again at wrap-up.

## Status legend

- **Covered** — an automated test exercises the success path.
- **Partially covered** — a test touches the surface (e.g. reaches the page / one leg) but not the full flow.
- **Missing** — no automated coverage.
- **Not in v1 scope** — deliberate non-feature (see §2).
- **Needs manual confirmation** — exercised manually / by UAT, no automated pin.

Token convention: `Server Action(s)` cells carry backticked `file.fn` tokens; `Entry route` cells carry backticked route tokens. These are the keys the gate matches against code.

---

## 1. Flow inventory

| Area | Flow | Actor | Entry route | Server Action(s) | Main steps | Expected outcome | Audit evidence | Covered by | Status |
|---|---|---|---|---|---|---|---|---|---|
| Auth | Sign in and reach dashboard | All | `/dashboard` | — | Enter email/password, submit | Authenticated session, dashboard renders | session cookie | `smoke.spec.ts` › "login form signs in via uncontrolled inputs (autofill-compatible)" | Covered |
| Auth | Sign out | All | — | `auth.logout` | Click sign out in chrome | Session cleared, bounce to `/login` | — | — | Needs manual confirmation |
| Auth | Request password reset (self-service) | Employee | — | — | Submit email on `/forgot-password` | Non-enumerating success; reset email if account exists | `auth.password_reset_requested` | `smoke.spec.ts` › "forgot password request shows non-enumerating success" | Covered |
| Auth | Complete password reset from link | Employee | — | — | Open recovery link, set new password | Password updated, redirect to login | — | `admin.spec.ts` › "password reset recovery link updates the user password" | Covered |
| Dashboard | Employee dashboard | Employee | `/dashboard` | — | Land on dashboard | Employee metrics + balances + recent updates | — | `employee.spec.ts` › "employee reaches dashboard with employee metrics" | Covered |
| Dashboard | Manager dashboard | Manager | `/dashboard` | — | Land on dashboard | Manager metrics + team leave panel | — | `manager.spec.ts` › "manager reaches dashboard with manager metrics" | Covered |
| Dashboard | Admin dashboard | Admin | `/dashboard` | — | Land on dashboard | Admin metrics + company-wide panels | — | `admin.spec.ts` › "admin reaches dashboard with admin metrics" | Covered |
| Employees | View People Directory (scoped) | Employee | `/employees` | — | Open directory | Only approved-colleague fields visible | — | `employee.spec.ts` › "employee sees limited searchable People Directory" | Covered |
| Employees | View full directory | Admin | `/employees` | — | Open directory | All employees, filters (role/dept/status) | — | `admin.spec.ts` › "admin sees all employees in directory" | Covered |
| Employees | View employee profile | All | `/employees/[id]` | — | Open a profile | Scoped profile tabs render | — | `admin.spec.ts` › "admin employee profile module tabs are wired" | Covered |
| Employees | View own profile | Employee | `/employees/[id]` | — | Open self profile | Own profile + assigned manager name | — | `employee.spec.ts` › "employee can view own profile" | Covered |
| Employees | Create employee | Admin | `/employees/new` | `employees.createEmployee` | Fill form, submit | Employee + auth user created | `employee.created` | `admin.spec.ts` › "new hire journey creates employee, assigns onboarding, and employee completes task" | Covered |
| Employees | Edit employee / job / terminate | Admin | `/employees/[id]/edit` | `employees.updateEmployee` | Edit fields, save | Profile + records updated; status persists | `employee.updated` | `admin.spec.ts` › "A1 — terminate-save persists Status on edit and profile pages" | Covered |
| Employees | Generate password-reset link for employee | Admin | `/employees/[id]` | `employees.sendEmployeePasswordReset` | Click generate link | Recovery link minted | `auth.password_reset_link_generated` | `admin.spec.ts` › "admin generates employee password reset link" | Covered |
| Departments | Manage departments (create/edit/delete) | Admin | `/departments` | `departments.createDepartment`, `departments.updateDepartment`, `departments.deleteDepartment` | Add / rename / remove a department | Department list mutated | `department.*` | `admin.spec.ts` › "admin reaches departments" | Partially covered |
| Leave | View leave page + own balances | Employee | `/leave` | — | Open leave | Own requests + balances | — | `employee.spec.ts` › "employee leave page shows own balances section" | Covered |
| Leave | View team leave calendar | All | `/leave/calendar` | — | Open calendar | Company-wide approved leave for the month | — | `employee.spec.ts` › "B4/F3 — leave calendar shows company-wide approved leave for the current month" | Covered |
| Leave | Submit leave request | Employee | `/leave/new` | `leave.submitLeaveRequest`, `leave.previewWorkingDays` | Pick type/dates, preview working days, submit | Pending request; balance validated | `leave.submitted` | `employee.spec.ts` › "employee submits leave and self-updates payroll details with audit logs" | Covered |
| Leave | Submit own leave request | Manager | `/leave/new` | `leave.submitLeaveRequest` | Pick type/dates, submit | Pending request to approver | `leave.submitted` | `manager.spec.ts` › "manager submits own leave request" | Covered |
| Leave | Cancel own pending leave | All | `/leave` | `leave.cancelLeaveRequest` | Cancel a pending/approved request | Request cancelled; balance refunded if approved | `leave.cancelled` | `manager.spec.ts` › "manager cancels own pending leave request" | Covered |
| Leave | Approve direct-report leave | Manager | `/leave` | `leave.approveLeaveRequest` | Approve a report's request | Approved; balance decremented | `leave.request_approved` | `manager.spec.ts` › "manager approves direct-report leave and balance is decremented" | Covered |
| Leave | Approve manager's leave | Admin | `/leave` | `leave.approveLeaveRequest` | Approve a manager's request | Approved | `leave.request_approved` | `admin.spec.ts` › "admin approves manager leave request" | Covered |
| Leave | Reject leave with note | Manager | `/leave` | `leave.rejectLeaveRequest` | Reject with approver note | Rejected; note preserved | `leave.request_rejected` | `manager.spec.ts` › "manager rejection preserves approver note" | Covered |
| Leave admin | Open leave admin panel | Admin | `/leave/admin` | — | Open panel | Leave types, balances, holidays | — | `admin.spec.ts` › "admin reaches leave admin panel" | Covered |
| Leave admin | Create / toggle leave type | Admin | `/leave/admin` | `leave.createLeaveType`, `leave.toggleLeaveType` | Add or enable/disable a type | Leave-type catalogue mutated | `leave_type.*` | `admin.spec.ts` › "admin reaches leave admin panel" | Partially covered |
| Leave admin | Set leave balance | Admin | `/leave/admin` | `leave.upsertLeaveBalance` | Pick employee + type + year, save | Balance row upserted | `leave_balance.upserted` | `admin.spec.ts` › "admin balance form is always visible and saves via native leave-type dropdown (C5+C6)" | Covered |
| Leave admin | Roll over balances to next year | Admin | `/leave/admin` | `leave.rolloverLeaveBalances` | Trigger rollover | Next-year balances seeded (idempotent) | `leave_balance.rollover` | `admin.spec.ts` › "admin rollover seeds Local + Sick leave balances for next year and is idempotent" | Covered |
| Leave admin | Create public holiday | Admin | `/leave/admin` | `leave.createPublicHoliday` | Add a holiday inline | Holiday created | `public_holiday.created` | `admin.spec.ts` › "admin creates a public holiday inline" | Covered |
| Leave admin | Edit / toggle public holiday | Admin | `/leave/admin` | `leave.updatePublicHoliday`, `leave.togglePublicHoliday` | Edit row / toggle active | Holiday updated | `public_holiday.*` | `admin.spec.ts` › "B3/F5 — Public Holiday row auto-exits edit mode after successful save" | Partially covered |
| Leave admin | Bulk-upload public holidays | Admin | `/leave/admin` | `leave.bulkUploadPublicHolidays` | Upload CSV | Holidays inserted; duplicates handled | `public_holiday.bulk_uploaded` | `admin.spec.ts` › "admin bulk uploads public holidays from CSV with duplicates" | Covered |
| Documents | View documents | All | `/documents` | — | Open documents | Own (+ scoped) documents listed | — | `employee.spec.ts` › "employee uploads and downloads document with signed URL protections" | Covered |
| Documents | Upload own / scoped document | All | `/documents` | `documents.uploadDocument` | Pick employee + category + file, upload | Document stored | `document.uploaded` | `employee.spec.ts` › "employee uploads and downloads document with signed URL protections" | Covered |
| Documents | Download document via signed URL | All | `/documents` | `documents.getSignedDownloadUrl` | Click download | Short-lived signed URL minted | `document.downloaded` | `employee.spec.ts` › "employee uploads and downloads document with signed URL protections" | Covered |
| Documents | Delete document (two-step) | Admin | `/documents` | `documents.softDeleteDocument` | Click delete, confirm | Document soft-deleted | `document.deleted` | `admin.spec.ts` › "admin delete document requires a two-click inline confirm (B2)" | Covered |
| Payroll | View own payroll | Employee | `/payroll` | — | Open payroll | Own compensation summary | — | `employee.spec.ts` › "employee reaches payroll page" | Covered |
| Payroll | View own + reports' payroll | Manager | `/payroll` | — | Open payroll | Own + direct-report summaries (read-only) | — | `manager.spec.ts` › "manager sees own + direct-report payroll summaries on /payroll" | Covered |
| Payroll | Update compensation | Admin | `/payroll` | `compensation.upsertCompensation` | Edit comp fields, save | Compensation updated | `compensation.updated` | `admin.spec.ts` › "admin compensation edit preserves existing bank account number when left blank" | Covered |
| Payroll | Self-update payroll details | Employee | `/payroll` | `compensation.selfUpdateCompensation` | Edit own bank/tax fields, save | Self-service fields updated | `compensation.self_updated` | `employee.spec.ts` › "employee submits leave and self-updates payroll details with audit logs" | Covered |
| Onboarding | View onboarding | Employee/Manager | `/onboarding` | — | Open onboarding | Assigned tasks / report progress | — | `employee.spec.ts` › "employee reaches onboarding page" | Covered |
| Onboarding | Open onboarding admin panel | Admin | `/onboarding/admin` | — | Open panel | Templates + assignments | — | `admin.spec.ts` › "admin reaches onboarding admin panel" | Covered |
| Onboarding | Manage templates | Admin | `/onboarding/admin` | `onboarding.createTemplate`, `onboarding.toggleTemplate`, `onboarding.addTemplateItem`, `onboarding.deleteTemplateItem` | Create template, add/remove items, toggle | Template catalogue mutated | `onboarding_template.*` | `admin.spec.ts` › "admin reaches onboarding admin panel" | Partially covered |
| Onboarding | Assign template to employee | Admin/Manager | `/onboarding/admin` | `onboarding.assignTemplateToEmployee` | Pick template + employee, assign | Tasks instantiated for employee | `onboarding.assigned` | `admin.spec.ts` › "new hire journey creates employee, assigns onboarding, and employee completes task" | Covered |
| Onboarding | Assign individual task | Admin/Manager | `/onboarding/admin` | `onboarding.addIndividualTask` | Add a one-off task to a report | Task created | `onboarding.task_added` | `admin.spec.ts` › "admin onboarding individual task rejects blank title at the Zod boundary" | Covered |
| Onboarding | Complete a task | Employee | `/onboarding` | `onboarding.completeTask` | Mark task done | Task completed | `onboarding.task_completed` | `admin.spec.ts` › "new hire journey creates employee, assigns onboarding, and employee completes task" | Covered |
| Onboarding | Delete a task | Admin/Manager | `/onboarding/admin` | `onboarding.deleteTask` | Remove a task | Task deleted | `onboarding.task_deleted` | `admin.spec.ts` › "admin reaches onboarding admin panel" | Partially covered |
| Performance | View performance | All | `/performance` | — | Open performance | Goals + reviews for scope | — | `employee.spec.ts` › "employee reaches performance page" | Covered |
| Performance | View reviews surface | Manager | `/performance/reviews` | — | Open reviews | Cycle review list | — | `manager.spec.ts` › "manager reviews a cycle, saves an appraisal draft, then submits it" | Partially covered |
| Performance | Create review cycle | Admin | `/performance` | `performance.createReviewCycle` | Create a cycle | Cycle created | `performance.cycle_created` | `admin.spec.ts` › "admin creates performance cycle and employee goal" | Covered |
| Performance | Edit review cycle | Admin | `/performance` | `performance.updateReviewCycle` | Edit cycle dates/lock | Cycle updated | `performance.cycle_updated` | `admin.spec.ts` › "admin edits review cycle from the cycle list" | Covered |
| Performance | Create / save goal | Admin/Manager | `/performance` | `performance.savePerformanceGoal` | Define a goal for an employee in scope | Goal created/updated | `performance.goal_saved` | `manager.spec.ts` › "manager creates direct-report goal and submits appraisal" | Covered |
| Performance | Reopen goal definition | Manager | `/performance` | `performance.reopenGoalDefinition` | Reopen a submitted goal | Goal editable again | `performance.goal_reopened` | `manager.spec.ts` › "manager submits goal definition then reopens it (B5)" | Covered |
| Performance | Update own goal progress | Employee | `/performance` | `performance.updateOwnGoalProgress` | Update progress on own goal | Progress saved | `performance.goal_progress_updated` | `employee.spec.ts` › "employee updates own goal progress" | Covered |
| Performance | Submit manager appraisal | Manager | `/performance` | `performance.submitManagerReview` | Fill + submit appraisal | Review submitted to employee | `performance.review_submitted` | `manager.spec.ts` › "manager creates direct-report goal and submits appraisal" | Covered |
| Performance | Reopen submitted appraisal | Manager | `/performance` | `performance.reopenManagerReview` | Reopen a not-yet-acknowledged review | Review editable again | `performance.review_reopened` | `manager.spec.ts` › "manager reopens a submitted (not acknowledged) appraisal (B5)" | Covered |
| Performance | Submit self-review | Employee | `/performance` | `performance.submitSelfReview` | Fill + submit self-review | Self-review submitted | `performance.review_self_submitted` | `employee.spec.ts` › "employee submits self-review and acknowledges manager review" | Covered |
| Performance | Acknowledge manager review | Employee | `/performance` | `performance.acknowledgeReview` | Acknowledge the appraisal | Review acknowledged (locked) | `performance.review_acknowledged` | `employee.spec.ts` › "employee submits self-review and acknowledges manager review" | Covered |
| Admin | View audit logs | Admin | `/audit-logs` | — | Open audit logs, filter | Filtered audit ledger | — | `admin.spec.ts` › "admin reaches audit logs" | Covered |
| Admin | Run / export reports | Admin | `/reports` | — | Pick report, run, export CSV | Report generated + exported | `report.generated`, `report.exported` | `reports.spec.ts` › "running the headcount report renders a table and writes report.generated audit" | Covered |
| Admin | Update app settings | Admin | `/settings` | `app-settings.updateAppSettings` | Edit org/leave/branding settings, save | Settings persisted | `app_settings.updated` | `admin.spec.ts` › "admin Settings page renders all three sections and persists changes" | Covered |
| Security | Employee denied audit logs | Employee | `/audit-logs` | — | Navigate to audit logs | Redirect to access-denied + audit | `auth.access_denied` | `employee.spec.ts` › "employee is denied audit logs" | Covered |
| Security | Employee denied create-employee | Employee | `/employees/new` | — | Navigate to create form | Redirect to access-denied | `auth.access_denied` | `employee.spec.ts` › "employee is denied create employee form" | Covered |
| Security | Employee denied departments | Employee | `/departments` | — | Navigate to departments | Redirect to access-denied | `auth.access_denied` | `employee.spec.ts` › "employee is denied departments" | Covered |
| Security | Employee denied leave admin | Employee | `/leave/admin` | — | Navigate to leave admin | Redirect to access-denied | `auth.access_denied` | `employee.spec.ts` › "employee is denied leave admin" | Covered |
| Security | Employee denied onboarding admin | Employee | `/onboarding/admin` | — | Navigate to onboarding admin | Redirect to access-denied | `auth.access_denied` | `employee.spec.ts` › "employee is denied onboarding admin" | Covered |
| Security | Manager denied audit logs | Manager | `/audit-logs` | — | Navigate to audit logs | Redirect to access-denied | `auth.access_denied` | `manager.spec.ts` › "manager is denied audit logs" | Covered |
| Security | Forge upload for another user denied | Employee | `/documents` | `documents.uploadDocument` | Submit crafted form with another's employeeId | Denied (outside scope) | `auth.access_denied` | `access-matrix.spec.ts` › "AM6 — alice forging uploadDocument with bob's employeeId is denied" | Covered |
| Security | Forge signed-URL for another's doc denied | Employee | `/documents` | `documents.getSignedDownloadUrl` | Submit crafted form with another's documentId | Denied; no URL minted | `auth.access_denied` | `access-matrix.spec.ts` › "AM2 — alice forging getSignedDownloadUrl with bob's documentId is denied (no URL minted)" | Covered |
| Security | Forge self-review on another's review denied | Employee | `/performance` | `performance.submitSelfReview` | Submit crafted form with another's reviewId | Denied | `auth.access_denied` | `access-matrix.spec.ts` › "AM8 — alice forging submitSelfReview with bob's reviewId is denied" | Covered |
| Security | Forge acknowledge on another's review denied | Employee | `/performance` | `performance.acknowledgeReview` | Submit crafted form with another's reviewId | Denied | `auth.access_denied` | `access-matrix.spec.ts` › "AM9 — alice forging acknowledgeReview with bob's reviewId is denied" | Covered |
| Security | Forge task-completion for another denied | Employee | `/onboarding` | `onboarding.completeTask` | Submit crafted form with another's taskId | Denied | `auth.access_denied` | `security-rbac-guards.spec.ts` › "step 11 — alice forging completeTask with bob's taskId is denied" | Covered |
| Security | Forge cancel of another's leave denied | Employee | `/leave` | `leave.cancelLeaveRequest` | Submit crafted form with another's requestId | Denied | `auth.access_denied` | `security-rbac-guards.spec.ts` › "step 12 — alice forging cancelLeaveRequest with bob's requestId is denied" | Covered |
| Security | Forge self-update compensation denied | Employee | `/payroll` | `compensation.selfUpdateCompensation` | Submit crafted form with a salary field | Denied (field outside self-service) | `auth.access_denied` | `security-rbac-guards.spec.ts` › "step 14 — alice forging selfUpdateCompensation with salary field is denied" | Covered |
| Security | Forge out-of-scope template assign denied | Manager | `/onboarding/admin` | `onboarding.assignTemplateToEmployee` | Submit crafted form assigning to a non-report | Denied (outside direct reports) | `auth.access_denied` | `security-rbac-guards.spec.ts` › "step 23 — morgan forging assignTemplate to bob (out-of-scope) is denied" | Covered |
| Security | Forge out-of-scope goal transfer denied | Manager | `/performance` | `performance.savePerformanceGoal` | Submit crafted form transferring a report's goal | Denied (goal outside scope) | `auth.access_denied` | `manager.spec.ts` › "manager cannot transfer a direct-report goal to another employee via crafted form" | Covered |
| Security | Forge self-approval of own leave denied | Manager | `/leave` | `leave.approveLeaveRequest` | Submit crafted form approving own request | Denied | `auth.access_denied` | `security-rbac-guards.spec.ts` › "step 25 — morgan forging self-approval of own leave is denied" | Covered |
| Security | Admin self-appraisal denied | Admin | `/performance` | `performance.submitManagerReview` | Submit crafted form appraising self | Denied | `auth.access_denied` | `admin.spec.ts` › "admin cannot self-appraise via crafted form" | Covered |
| Security | Manager reopen acknowledged review denied | Manager | `/performance` | `performance.reopenManagerReview` | Attempt reopen on an acknowledged review | Denied | `auth.access_denied` | `manager.spec.ts` › "manager cannot reopen an acknowledged performance review" | Covered |
| Security | Forge edit another's goal progress denied | Employee | `/performance` | `performance.updateOwnGoalProgress` | Submit crafted form on another's goal | Denied | `auth.access_denied` | `employee.spec.ts` › "employee cannot update another employee goal via crafted form" | Covered |
| Security | Invalid submit writes validation audit | Employee | `/leave/new` | `leave.submitLeaveRequest` | Submit a Zod-invalid request | Rejected; validation audit row | `input.validation_failed` | `security-rbac-guards.spec.ts` › "B3/F3 — zod-fail on submitLeaveRequest writes input.validation_failed" | Covered |
| Security | Approve nonexistent leave writes not-found audit | Manager | `/leave` | `leave.approveLeaveRequest` | Approve a nonexistent requestId | Rejected; not-found audit row | `entity.not_found` | `security-rbac-guards.spec.ts` › "B3/F3 — approveLeaveRequest with nonexistent requestId writes entity.not_found" | Covered |
| Security | Edit nonexistent cycle writes not-found audit | Admin | `/performance` | `performance.updateReviewCycle` | Edit a nonexistent cycleId | Rejected; not-found audit row | `entity.not_found` | `security-rbac-guards.spec.ts` › "B3/F3 — updateReviewCycle with nonexistent cycleId writes entity.not_found" | Covered |

---

## 2. Explicitly out of v1 scope

Mature-HRMS features deliberately **not** built (folded from the `userflow.doc` work-plan). Listed so their absence is a conscious decision, not a gap:

- Full payroll engine (gross-to-net, payslip generation, statutory calc)
- Tax filings / statutory submissions
- Attendance / time-clock hardware integrations
- Shift scheduling / rostering
- Recruitment / applicant-tracking pipeline
- Expense management / reimbursements
- 360° / peer feedback
- Performance calibration cycles

---

<!-- user-flow-checker:exempt
auth.authRedirectUrl — internal helper that builds the password-reset redirect URL; not a user-invoked action.
/access-denied — system redirect destination shown on a denied flow, not a journey entry point (it appears as the "Expected outcome" of every Security row above).
-->
