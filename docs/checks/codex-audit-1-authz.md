# KushHR authz/RLS/data-exposure audit - run 1

Scope: independent read-only audit of every exported Server Action under `src/server/actions/` and both Route Handlers under `src/app/**/route.ts`, focused on authorization, object-level access, service-role bypasses, RLS/app agreement, and payroll/manager-visible data.

I read `AGENTS.md` first and checked the local modified Next.js docs under `node_modules/next/dist/docs/`, especially Server Functions/Actions and Route Handlers. Relevant local Next guidance: Server Actions are directly POST-reachable and must do their own auth/authz; page-level auth is not sufficient.

## 1. Executive summary

The model is close, but I would not call it sound for real HR/payroll data until the performance service-role issue below is fixed. Most actions authenticate through `requireRole()` and most employee-object checks use trusted DB state, but the performance module has a high-risk pattern: manager-submitted form fields are accepted, only the employee is scoped, and then service-role writes bypass the RLS layer that would otherwise hide closed/draft cycles.

Top risks:

1. BLOCKER: managers can direct-POST performance goal/review writes into closed or draft cycles for their direct reports because the server checks employee scope but not cycle status/visibility before service-role writes.
2. NEEDS-FIX: several service-role lookups return different errors for nonexistent vs out-of-scope onboarding/performance IDs, creating row-existence oracles outside RLS.
3. NEEDS-FIX: manager salary visibility is internally contradictory: one security rule says managers cannot see salary/payroll fields, while the RPC, DAL, and `/payroll` page intentionally expose direct-report salary summaries.
4. NEEDS-FIX: the performance RLS docs say manager/admin writes exist, but the actual DB grants are select-only and all writes happen through service-role actions. That is acceptable only if the actions exactly reimplement every DB policy; finding 1 shows they do not.
5. NIT/UNVERIFIED: the access matrix says manager reviews are scoped by `manager_id === user.id`, but code and RLS scope by current direct-report relationship. This may be intended manager-transfer behavior, but the policy artifact is not aligned.

Coverage notes: I enumerated 44 exported Server Actions and 2 Route Handlers:
`auth.logout`, `auth.authRedirectUrl`, all department/employee/compensation/document/leave/onboarding/performance/app-settings actions, `GET /reports/export`, and `POST /api/auth/password-reset-requested`.

## 2. Findings

### BLOCKER - Performance actions let managers write into closed/draft cycles through service-role bypass

`src/server/actions/performance.ts:390` / `src/server/actions/performance.ts:421` / `src/server/actions/performance.ts:429` / `src/server/actions/performance.ts:439` / `src/server/actions/performance.ts:553` / `src/server/actions/performance.ts:569` / `src/server/actions/performance.ts:903` / `src/server/actions/performance.ts:933` / `src/server/actions/performance.ts:941` / `src/server/actions/performance.ts:951` / `src/server/actions/performance.ts:994` / `src/server/actions/performance.ts:1001` / `src/server/actions/performance.ts:1426` / `src/server/actions/performance.ts:1441` / `src/server/actions/performance.ts:1496`

Defect: `savePerformanceGoal()` and `submitManagerReview()` scope the employee with `canManageEmployee()`, then call `assertCycleNotDeadlineLocked()`, then write through `createAdminClient()`. The cycle ID itself is accepted from the hidden selected value in `resolveCycleId()` without checking that the manager can see the cycle or that the cycle is active/editable. The deadline helper selects only `submission_deadline, submission_lock_enabled`; it does not select or reject `status = 'closed'` or `status = 'draft'`.

Why this violates the intended model: `docs/database-design.md:179` says closing a cycle prevents new manager submissions unless reopened by admin. `docs/rls-policy-map.md:222` and `docs/rls-policy-map.md:231` say managers see active cycles plus linked direct-report cycles, with closed cycles readable only when related. The DB reinforces this: `supabase/migrations/0024_manager_active_cycle_visibility.sql:8` grants manager SELECT only for active cycles, while the original performance migration grants only SELECT to authenticated on cycles/goals/reviews (`supabase/migrations/0018_performance_appraisals.sql:58`, `supabase/migrations/0018_performance_appraisals.sql:87`, `supabase/migrations/0018_performance_appraisals.sql:136`), so the service-role action is the effective write policy.

Exploit scenario: Morgan is a manager of Alice. Morgan obtains a UUID for an admin-only draft cycle or a closed cycle, for example from an old email, screenshot, log, browser history, or a previously linked review. Morgan direct-posts `submitManagerReview` with `employeeId=Alice`, `cycleId=<closed-or-draft-cycle>`, `score=5`, and manager feedback. The server passes `canManageEmployee()` because Alice is Morgan's direct report, passes the deadline check if the deadline lock is off or absent, then `createAdminClient()` upserts `performance_reviews` for that cycle. The same pattern lets Morgan insert or move goals into that cycle via `savePerformanceGoal()`.

Fix: add a server-side cycle authorization helper and call it before every authored write/reopen using a cycle ID. For manager paths, require `status = 'active'` and manager-visible cycle scope before insert/update; for admin paths, define whether draft writes are allowed but closed writes should still require an explicit reopen/admin-correction path. Make the update branch verify both the existing row's cycle and the target cycle. Consider a DB trigger/check for "no new manager-authored goal/review content when cycle is closed" because all current performance writes bypass RLS.

Confidence: High. The code path is explicit and no runtime-only condition appears to reject closed/draft cycle IDs.

### NEEDS-FIX - Service-role existence oracles leak out-of-scope onboarding/performance row IDs

`src/server/actions/onboarding.ts:557` / `src/server/actions/onboarding.ts:565` / `src/server/actions/onboarding.ts:567` / `src/server/actions/onboarding.ts:576` / `src/server/actions/performance.ts:442` / `src/server/actions/performance.ts:449` / `src/server/actions/performance.ts:458` / `src/server/actions/performance.ts:662` / `src/server/actions/performance.ts:669` / `src/server/actions/performance.ts:679` / `src/server/actions/performance.ts:1095` / `src/server/actions/performance.ts:1102` / `src/server/actions/performance.ts:1112`

Defect: some actions fetch arbitrary UUIDs with the service-role client before applying row ownership/scope, then return distinguishable errors for "missing" vs "exists but not yours." `completeTask()` returns "Task not found." for absent IDs and "You can only complete your own tasks." for valid out-of-scope IDs. `savePerformanceGoal()`/`reopenGoalDefinition()` and `reopenManagerReview()` have the same shape for goal/review IDs.

Exploit scenario: Alice has a leaked or guessed onboarding task UUID candidate. Posting it to `completeTask()` gives Alice "You can only complete your own tasks." if the UUID belongs to Bob, but "Task not found." if it is nonexistent. That confirms existence of Bob's HR onboarding task outside RLS. A manager can similarly distinguish real out-of-scope performance goal/review IDs from nonexistent IDs through the goal/review reopen paths.

Fix: do the first row lookup through the session client/RLS, or include the ownership/scope predicate in the admin query and return one uniform "not found or access denied" message for both cases. Keep audit detail server-side, but do not expose the distinction to callers.

Confidence: High for the oracle behavior. Impact is information disclosure, not direct mutation, because later updates still include ownership/scope guards.

### NEEDS-FIX - Manager salary visibility policy is internally contradictory

`docs/security-model.md:34` / `docs/security-model.md:54` / `docs/security-model.md:58` / `supabase/migrations/0050_manager_compensation_summary_rpc.sql:21` / `supabase/migrations/0050_manager_compensation_summary_rpc.sql:25` / `src/server/dal/compensation.ts:106` / `src/server/dal/compensation.ts:116` / `src/server/dal/compensation.ts:147` / `src/app/(app)/payroll/page.tsx:65` / `src/app/(app)/payroll/page.tsx:73` / `src/app/(app)/payroll/page.tsx:87` / `src/app/(app)/payroll/page.tsx:117`

Defect: the role rule says managers "Cannot see bank, tax, national ID, salary, or payroll fields." Later in the same document and in migration 0050, the intended manager RPC returns direct-report salary amount, currency, pay frequency, and effective date. The `/payroll` manager view calls `getManagerVisibleCompensation()` and renders direct-report salary in the table.

Exploit scenario: Morgan visits `/payroll` as a manager and sees Alice's direct-report salary summary. If `docs/security-model.md:34` is the intended least-privilege rule, this is a real compensation leak. If migration 0050 is intended, then the top-level role rule is stale and future reviewers/tests are being given contradictory acceptance criteria.

Fix: make one policy authoritative. Either remove salary/effective-date fields from `get_direct_report_compensation_summaries()` and the manager payroll page, or update the role rule to explicitly allow manager direct-report compensation summaries while continuing to block bank/tax/national ID/passport/notes.

Confidence: High that the contradiction and exposure exist; Medium on defect severity because the later RPC documentation may be the intended product decision.

### NIT - Access matrix says manager reviews are scoped by manager_id, but app/RLS use current direct-report scope

`docs/access-matrix.md:99` / `src/server/actions/performance.ts:952` / `src/server/actions/performance.ts:994` / `src/server/actions/performance.ts:1006` / `src/server/actions/performance.ts:1095` / `src/server/actions/performance.ts:1112` / `docs/rls-policy-map.md:257`

Defect: the matrix says `performance.submitManagerReview` and `performance.reopenManagerReview` are scoped by `manager_id === user.id`. The submit action finds existing reviews by `employee_id + cycle_id` and updates by `id`, without checking the existing row's `manager_id`. The reopen action checks only whether the review employee is in the current manager's direct-report scope. RLS docs also describe direct-report manager fields, not `manager_id`.

Exploit scenario: Alice moves from Old Manager to Morgan. Alice has an existing review row with `manager_id = Old Manager`. Morgan can update/reopen that row if Alice is now Morgan's direct report, even though `manager_id !== Morgan`. That may be the desired transfer behavior, but it contradicts the matrix's object-level rule.

Fix: decide the real rule. If historical manager ownership matters, load/check `manager_id` before update/reopen and decide how admins transfer review ownership. If current manager ownership is intended, update `access-matrix.md` and tests to say direct-report scope, not `manager_id === user.id`.

Confidence: Medium. The code/doc mismatch is proven; whether it is a product defect needs policy confirmation.

## 3. Service-role-key usage inventory

Verdict legend: OK = justified by role/scope and no client-visible bypass found; FINDING = covered above; WATCH = safe today but depends on caller discipline or conflicting policy.

| Call site | Purpose and reachability | Verdict |
|---|---|---|
| `src/lib/supabase/admin.ts:6` | Central service-role client factory using `SUPABASE_SERVICE_ROLE_KEY`; `server-only`. | OK as a boundary; all callers bypass RLS. |
| `src/server/audit.ts:18` | Insert audit rows, including public password-reset audit and access-denied logs. | OK; append-style audit boundary. |
| `src/server/email.ts:36`, `src/server/email.ts:52`, `src/server/email.ts:72` | Resolve recipient emails/admins/manager recipient for notifications. | OK; returns minimal recipient DTOs and is not directly client-exposed. |
| `src/server/actions/app-settings.ts:115` | `updateAppSettings`, admin-only. | OK. |
| `src/server/dal/app-settings.ts:60`, `src/server/dal/app-settings.ts:76` | Server-side settings/timezone reads. | OK. |
| `src/server/actions/employees.ts:141`, `src/server/actions/employees.ts:166`, `src/server/actions/employees.ts:392`, `src/server/actions/employees.ts:511`, `src/server/actions/employees.ts:528`, `src/server/actions/employees.ts:825` | Admin-only employee creation/profile updates/password reset/auth cleanup. | OK for authz; note not audited here for transactional consistency. |
| `src/server/actions/compensation.ts:194`, `src/server/actions/compensation.ts:196` | `upsertCompensation`, admin-only, includes auth user existence check. | OK. |
| `src/server/actions/compensation.ts:371` | `selfUpdateCompensation`, service-role update of caller's own row after blocking admin-only fields. | OK for current code; RLS column grant is bypassed, so app guards are the backstop. |
| `src/server/dal/compensation.ts:49`, `src/server/dal/compensation.ts:79` | Admin-client compensation detail/summary helpers. | WATCH; safe at current call sites, but manager salary policy conflict is finding 3. |
| `src/server/actions/documents.ts:94` | Upload storage object and metadata after role/category/direct-report guards. | OK. |
| `src/server/actions/documents.ts:401` | Mint signed download URL only after session-client/RLS document lookup. | OK; good pattern. |
| `src/server/actions/documents.ts:450` | Admin-only soft delete/storage cleanup. | OK. |
| `src/server/actions/leave.ts:116`, `src/server/actions/leave.ts:220`, `src/server/actions/leave.ts:961`, `src/server/actions/leave.ts:1015` | Leave overlap/type/balance/holiday prechecks tied to caller/request. | OK; no cross-employee mutation bypass found. |
| `src/server/actions/leave.ts:1121`, `src/server/actions/leave.ts:1176`, `src/server/actions/leave.ts:1242`, `src/server/actions/leave.ts:1408`, `src/server/actions/leave.ts:1531`, `src/server/actions/leave.ts:1643`, `src/server/actions/leave.ts:1726`, `src/server/actions/leave.ts:1768`, `src/server/actions/leave.ts:1839` | Admin leave types, balances, rollover, working-day preview, public holidays. | OK; admin-only or pure calculation/read path. |
| `src/server/actions/onboarding.ts:88`, `src/server/actions/onboarding.ts:121`, `src/server/actions/onboarding.ts:172`, `src/server/actions/onboarding.ts:209` | Admin-only template CRUD. | OK. |
| `src/server/actions/onboarding.ts:274` | Template item load during assign after manager target employee is scoped. | OK. |
| `src/server/actions/onboarding.ts:557` | Employee task completion pre-load by arbitrary task ID. | FINDING: existence oracle before ownership check. |
| `src/server/actions/onboarding.ts:626` | Admin-only delete task. | OK. |
| `src/server/dal/onboarding.ts:59`, `src/server/dal/onboarding.ts:111`, `src/server/dal/onboarding.ts:128`, `src/server/dal/onboarding.ts:150`, `src/server/dal/onboarding.ts:194`, `src/server/dal/onboarding.ts:243`, `src/server/dal/onboarding.ts:288` | Onboarding reads, progress, assignable employees, direct-report IDs. | WATCH; safe at current callers because scope is applied by caller or helper, but service-role DALs require discipline. |
| `src/server/actions/performance.ts:161`, `src/server/actions/performance.ts:260` | Admin-only cycle create/update. | OK. |
| `src/server/actions/performance.ts:439` | Goal create/update for admin/manager after employee scope. | FINDING: target cycle status/visibility missing; also goal ID oracle. |
| `src/server/actions/performance.ts:662` | Reopen goal after service-role load. | FINDING: goal ID oracle; deadline checked, cycle status not checked. |
| `src/server/actions/performance.ts:788` | Employee own goal progress update after service-role load and uniform owner denial. | OK for IDOR; no separate closed-cycle conclusion in this audit. |
| `src/server/actions/performance.ts:951` | Manager/admin review upsert after employee scope. | FINDING: target cycle status/visibility missing. |
| `src/server/actions/performance.ts:1095` | Reopen manager review after service-role load. | FINDING: review ID oracle; matrix manager_id mismatch is NIT. |
| `src/server/actions/performance.ts:1215`, `src/server/actions/performance.ts:1317` | Employee self-review/acknowledge after owner checks. | OK; missing/non-owner use uniform caller-facing denial. |
| `src/server/actions/performance.ts:1438`, `src/server/actions/performance.ts:1503` | Deadline/cycle resolution helpers. | FINDING support: deadline helper omits cycle status; selected hidden cycle ID bypasses search filter. |
| `src/server/dal/performance.ts:208`, `src/server/dal/performance.ts:253` | Hydrate profile/cycle names for rows already obtained through RLS-visible queries. | OK. |
| `src/server/dal/employees.ts:414`, `src/server/dal/employees.ts:552` | Manager upload options from direct-report IDs; admin dashboard attention data. | OK at current callers. |

Route handlers:

| Handler | Authz verdict |
|---|---|
| `src/app/(app)/reports/export/route.ts:20` | Admin-only via `requireRole(["admin"])`, catches `AccessDeniedError` to return 403, then exports the same report DTO columns as the page (`src/app/(app)/reports/export/route.ts:23`, `src/app/(app)/reports/export/route.ts:58`, `src/app/(app)/reports/export/route.ts:80`). OK. |
| `src/app/api/auth/password-reset-requested/route.ts:14` | Public by design; same-origin and rate-limited before audit insert (`src/app/api/auth/password-reset-requested/route.ts:15`, `src/app/api/auth/password-reset-requested/route.ts:21`, `src/app/api/auth/password-reset-requested/route.ts:39`). OK for authz/data exposure; no user existence is logged or returned. |

## 4. RLS vs application disagreement table

| Area | DB/RLS grants | App behavior | Disagreement and risk |
|---|---|---|---|
| `performance_review_cycles` | Authenticated gets SELECT only in migration 0018; manager active-cycle SELECT policy only grants `status = 'active'` (`supabase/migrations/0018_performance_appraisals.sql:58`, `supabase/migrations/0024_manager_active_cycle_visibility.sql:8`). | Manager actions can post a hidden `cycleId` directly; `resolveCycleId()` returns selected value without visibility/status check (`src/server/actions/performance.ts:1496`). | App is looser than DB for writes because service-role bypasses cycle visibility. Real hole: finding 1. |
| `performance_goals` | RLS docs say manager INSERT direct reports and UPDATE direct-report goals (`docs/rls-policy-map.md:240`, `docs/rls-policy-map.md:241`), but migration grants only SELECT to authenticated (`supabase/migrations/0018_performance_appraisals.sql:87`). | `savePerformanceGoal()` writes via service-role after app checks (`src/server/actions/performance.ts:439`). | Docs imply DB write policies that do not exist. App writes are the policy; missing cycle checks become security bugs. |
| `performance_reviews` | RLS docs say manager INSERT direct reports and UPDATE direct-report manager fields (`docs/rls-policy-map.md:257`, `docs/rls-policy-map.md:258`), but migration grants only SELECT to authenticated (`supabase/migrations/0018_performance_appraisals.sql:136`). | `submitManagerReview()` and reopen/self/ack paths write via service-role (`src/server/actions/performance.ts:951`, `src/server/actions/performance.ts:1095`, `src/server/actions/performance.ts:1215`, `src/server/actions/performance.ts:1317`). | Same service-role-only drift. Direct-report employee scope is mostly reimplemented; cycle status and manager_id matrix semantics are not. |
| `employee_compensation` manager visibility | Security model role rule says managers cannot see salary/payroll fields (`docs/security-model.md:34`), but migration 0050 RPC returns salary amount/currency/pay frequency/effective date (`supabase/migrations/0050_manager_compensation_summary_rpc.sql:21`). | Manager `/payroll` renders direct-report salary summaries (`src/app/(app)/payroll/page.tsx:87`, `src/app/(app)/payroll/page.tsx:117`). | Policy conflict. Real exposure if line 34 is intended; otherwise stale top-level security rule. |
| `performance_reviews.manager_id` | Access matrix says manager scope is `manager_id === user.id` (`docs/access-matrix.md:99`); RLS map says direct-report reviews (`docs/rls-policy-map.md:257`). | Code scopes review edits/reopens by employee direct-report relationship, not existing row manager_id (`src/server/actions/performance.ts:952`, `src/server/actions/performance.ts:1112`). | Policy disagreement. UNVERIFIED product decision: current manager vs original manager ownership. |

I did not re-report already documented safe-direction profile/document RLS drift or the already documented compensation self-update enforcement divergence from `docs/access-matrix.md:254` through `docs/access-matrix.md:270`; I found no new evidence that those are currently exploitable.

## 5. What I could not verify

- I did not run mutating Server Action POSTs, migrations, Docker, installs, or DB writes per the read-only constraint. The exploit scenarios are static traces, not live reproduced mutations.
- I could not confirm actual production data states, such as whether closed/draft performance cycle UUIDs are exposed through emails, audit logs, old pages, browser history, or screenshots. The server-side defect does not require public enumeration, but exploitability is easier if IDs leak.
- I could not determine the intended product rule for manager compensation summaries because the security model contradicts itself.
- I could not determine whether a newly assigned manager is supposed to edit/reopen a review row whose `manager_id` points to a previous manager.
- I did not inspect generated Server Action action IDs or wire payloads at runtime. Local Next docs establish that Server Actions are direct POST-reachable; reproducing the exact request envelope would require runtime interaction, which this run forbids.
