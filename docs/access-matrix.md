# Access Matrix — application-layer authorization

**Status: v1 draft (2026-06-18).** Single source of truth for *who can do what* at the **application
boundary** (pages, route handlers, Server Actions, Storage). Complements [`docs/rls-policy-map.md`](rls-policy-map.md),
which is the **database layer** (RLS). The two must agree; §6 lists where to cross-check and the cells
the executable suite still has to prove.

> **Why this exists.** The single highest-trust risk for v1 is a cross-tenant leak — an employee
> seeing another's profile / payroll / leave / documents / performance, a manager seeing outside their
> reporting line, or a non-admin reaching `/audit-logs`. The defences exist (RLS, `requireRole`,
> ownership checks, RLS-gated Storage). This doc enumerates every combination so the gaps are visible,
> and (step 2, now built) is the spec for the executable Playwright regression — see §6.

## Roles & actor relations

- **Roles:** `admin`, `manager`, `employee` (`profiles.role`, synced to the JWT by trigger; DB wins).
- **Actor relation** (caller ↔ target row), the second axis that makes "scoped" cells meaningful:
  - **self** — the row is the caller's own.
  - **direct report** — target's `manager_id` = caller (`getDirectReportIds(user.id)`).
  - **peer / stranger** — same-company but not self and not a direct report.

## Legend

- ✅ **allow** — permitted (full).
- ⛔ **deny** — blocked; for guarded surfaces the denial writes an `auth.access_denied` audit row.
- 🔒 **scoped** — allowed but row-filtered (e.g. manager → direct reports only). The scope is named.
- **Enforcing layer** column names the actual control: `requireRole(...)` (page/action gate), an
  ownership check (`x === user.id` / `getDirectReportIds`), an RLS policy, or the admin-client gate.

---

## 1. Page routes (`src/app/(app)/**`)

Every page calls `requireRole([...], { attemptedResource })` server-side before render; a role outside
the list gets the in-place access-denied UI + an `auth.access_denied` audit row. Content within an
allowed page is further row-scoped by RLS/DAL.

| Route | admin | manager | employee | Enforcing layer |
|---|---|---|---|---|
| `/dashboard` | ✅ | ✅ | ✅ | `requireRole([a,m,e])` `dashboard/page.tsx:36` — widgets row-scoped by RLS |
| `/employees` (list) | ✅ all | 🔒 self+reports | 🔒 directory fields | `requireRole([a,m,e])` `employees/page.tsx:64` + RLS on `profiles`/`employee_records` |
| `/employees/[id]` | ✅ full | 🔒 full for self+reports; **limited peer view** otherwise | 🔒 self full; **limited peer view** of colleagues | `requireRole([a,m,e])` + viewer classification `full` vs `peer` (`getPeerEmployeeView`, 5-field projection: name/dept/manager/work email/phone) — **confirmed 2026-06-18** |
| `/employees/[id]/edit` | ✅ | 🔒 limited | 🔒 self limited | `requireRole([a,m,e])` `…/edit/page.tsx:19`; **writes** gated by `updateEmployee` (admin) — page is viewable but field writes are admin-only |
| `/employees/new` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `employees/new/page.tsx:11` |
| `/departments` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `departments/page.tsx:13` |
| `/audit-logs` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `audit-logs/page.tsx:28` |
| `/settings` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `settings/page.tsx:6` |
| `/reports` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `reports/page.tsx:37` |
| `/leave` | ✅ all | 🔒 self+reports | 🔒 self | `requireRole([a,m,e])` `leave/page.tsx:39` + RLS on `leave_requests` |
| `/leave/new` | ✅ | ✅ | ✅ | `requireRole([a,m,e])` `leave/new/page.tsx:13` |
| `/leave/calendar` | ✅ all | ✅ all | ✅ all | `requireRole([a,m,e])`; `getCompanyApprovedLeave()` is **company-wide for every role** (intended: everyone sees all approved leave) — **confirmed 2026-06-18** |
| `/leave/admin` | ✅ | ⛔ | ⛔ | `requireRole([admin])` `leave/admin/page.tsx:16` |
| `/onboarding` | ✅ | 🔒 reports | 🔒 self | `requireRole([a,m,e])` `onboarding/page.tsx:16` |
| `/onboarding/admin` | ✅ | 🔒 reports | ⛔ | `requireRole([a,m])` `onboarding/admin/page.tsx:11` |
| `/payroll` | ✅ all | 🔒 own + report summaries | 🔒 self | `requireRole([a,m,e])` `payroll/page.tsx:23` + RLS on `employee_compensation` + RPC for manager summaries |
| `/documents` | ✅ all | 🔒 self+reports | 🔒 self | `requireRole([a,m,e])` `documents/page.tsx:25` + RLS on `documents` |
| `/performance` | ✅ | 🔒 reports | 🔒 self | `requireRole([a,m,e])` `performance/page.tsx:40` |
| `/performance/reviews` | ✅ | 🔒 reports | ⛔ | `requireRole([a,m])` `performance/reviews/page.tsx:17` |
| `/access-denied` | ✅ | ✅ | ✅ | none — the denial surface itself |

## 2. Route handlers (`route.ts`)

| Route | admin | manager | employee | anon | Enforcing layer |
|---|---|---|---|---|---|
| `GET /reports/export` | ✅ | ⛔ | ⛔ | ⛔ | `requireRole([admin])` `reports/export/route.ts:23`; **catches `AccessDeniedError` → plain 403** (not wrapped by the (app) error boundary) |
| `POST /api/auth/password-reset-requested` | ✅ | ✅ | ✅ | ✅ (public) | In `PUBLIC_PATHS`; same-origin gate + per-IP rate limit (no role — it's an audit-only abuse-gated endpoint) |

## 3. Server Actions (`src/server/actions/**`)

Role = `requireRole` array at the action head. Scope = ownership/relation check inside. Mutations are
the highest-risk surface — a missing scope check here is a write-side cross-tenant bug.

| Action | Role gate | Scope (relation) | Enforcing layer |
|---|---|---|---|
| `app-settings.updateAppSettings` | admin | — | `requireRole([admin])` :90 |
| `departments.createDepartment` `departments.updateDepartment` `departments.deleteDepartment` | admin | — | `requireRole([admin])` :44/:102/:161 |
| `employees.createEmployee` | admin | — | `requireRole([admin])` :138 |
| `employees.updateEmployee` | admin | all rows | `requireRole([admin])` :389 — **the one write path for profile/role/manager_id** |
| `employees.sendEmployeePasswordReset` | admin | any employee | `requireRole([admin])` :497 |
| `compensation.upsertCompensation` | admin | any row | `requireRole([admin])` :159 |
| `compensation.selfUpdateCompensation` | a/m/e | 🔒 self, non-salary cols | `requireRole([a,m,e])` :315 + RLS column grant (employee can't write salary) |
| `documents.uploadDocument` | a/m/e gate | 🔒 employee **own**; manager **self (any non-payslip)** + **direct reports (`policy`/`other`)**; admin **any** | `requireRole([a,m,e])` :79 + employee≠self :132, non-admin payslip :151, manager → `isSelf` OR (report ∈ `getDirectReportIds` AND `category ∈ MANAGER_UPLOAD_CATEGORIES`) :171. Form offers reactive categories (self → all non-payslip; report → policy/other). Matches the `documents` SELECT RLS (own = any role via 0053; reports = policy/other) so a manager never uploads a doc they can't see |
| `documents.getSignedDownloadUrl` | a/m/e | 🔒 RLS-visible docs only | `requireRole([a,m,e])` :347 — **fetches doc via session client (RLS); only then mints admin-signed URL** → admin client never bypasses visibility |
| `documents.softDeleteDocument` | admin | — | `requireRole([admin])` :418 |
| `leave.submitLeaveRequest` | a/m/e | 🔒 own | `requireRole([a,m,e])` :171 |
| `leave.approveLeaveRequest` | a/m | 🔒 direct reports; **self blocked** | `requireRole([a,m])` :533 + `if (req.employee_id === user.id)` guard :573 — **ties to the open "who approves admin's own leave" gap** |
| `leave.rejectLeaveRequest` | a/m | 🔒 direct reports; **self blocked** | `requireRole([a,m])` :692 + self guard :730 |
| `leave.cancelLeaveRequest` | a/m/e | 🔒 own pending | `requireRole([a,m,e])` :823 |
| `leave.createLeaveType` `leave.toggleLeaveType` `leave.upsertLeaveBalance` `leave.rolloverLeaveBalances` | admin | — | `requireRole([admin])` :1099/:1159/:1239/:1405 |
| `leave.createPublicHoliday` `leave.updatePublicHoliday` `leave.togglePublicHoliday` `leave.bulkUploadPublicHolidays` | admin | — | `requireRole([admin])` :1620/:1705/:1757/:1816 |
| `leave.previewWorkingDays` | a/m/e | — (pure calc) | `requireRole([a,m,e])` :1521 |
| `onboarding.createTemplate` `onboarding.toggleTemplate` `onboarding.addTemplateItem` `onboarding.deleteTemplateItem` | admin | — | `requireRole([admin])` :79/:116/:162/:204 |
| `onboarding.assignTemplateToEmployee` `onboarding.addIndividualTask` | a/m | 🔒 manager→direct reports | `requireRole([a,m])` :240/:372 + `getDirectReportIds(user.id)` :262/:391 |
| `onboarding.completeTask` | employee | 🔒 own (`employee_id` or `assignee_id`) | `requireRole([employee])` :548 + `isOwn` check :567 |
| `onboarding.deleteTask` | admin | — | `requireRole([admin])` :621 |
| `performance.createReviewCycle` `performance.updateReviewCycle` | admin | — | `requireRole([admin])` :124/:220 |
| `performance.savePerformanceGoal` `performance.reopenGoalDefinition` | a/m | 🔒 manager→scope only | `requireRole([a,m])` :380 + `canManageEmployee()` :421 (deny `goal_outside_scope`) — **confirmed 2026-06-18** |
| `performance.updateOwnGoalProgress` | employee | 🔒 own | `requireRole([employee])` :763 |
| `performance.submitManagerReview` `performance.reopenManagerReview` | a/m | 🔒 `manager_id === user.id` | `requireRole([a,m])` :893/:1080 + `manager_id: user.id` :587/:1006 |
| `performance.submitSelfReview` `performance.acknowledgeReview` | employee | 🔒 own | `requireRole([employee])` :1188/:1298 |

> **Checker convention.** Every action in §3 (and every route in §1/§2) is backticked as its exact
> machine identifier — `basename.exportName` for actions, the route path for pages, `METHOD /path` for
> handlers. `tools/check-access-matrix.mjs` (run in CI via `npm run check:access-matrix`) parses these
> tokens and fails the build on any drift in **either** direction: a code item with no matrix row, or a
> matrix row whose code no longer exists. Actions that are deliberately *not* part of the authorization
> surface are exempted below, each with a reason.

<!-- access-matrix-checker:exempt
auth.logout — infra session teardown; no role gate / no authorization surface to document
auth.authRedirectUrl — pure URL helper; no role gate / no authorization surface to document
-->

## 4. Storage — `hr-documents` bucket

- **Bucket is private.** No public read. All access is via `documents.getSignedDownloadUrl`.
- **Authorization is delegated to RLS on the `documents` table.** The action fetches the row with the
  **session client** (RLS-scoped). If RLS returns nothing → "not found or access denied" (uniform, no
  enumeration). Only on a successful RLS read does it use the **admin client** to mint a short-lived
  signed URL. So the service-role client never bypasses visibility — it only signs a path the caller
  already proved they may see (`documents.ts:362-391`).
- **Scope:** employee → own docs; manager → own + direct reports; admin → all (mirrors `documents` RLS).
- **Storage RLS now agrees with the metadata layer** (migration `0054`): `storage.objects` own-file SELECT
  is role-agnostic (`select_own_objects`), mirroring `0053` on `documents` — so a manager/admin who can see
  their own document row can also pass Storage RLS for the file. INSERT stays employee-only (server uploads
  use the service-role admin client). The `manager_select_direct_report_objects` denylist
  (`payslip`/`id_document`/`contract`) stays equal to `MANAGER_UPLOAD_CATEGORIES` (`policy`/`other`).

## 5. Database tables (RLS) — pointer

The full table × role × operation grid lives in [`docs/rls-policy-map.md`](rls-policy-map.md). Summary of
the sensitive ones (must agree with §1/§3 above):

- `profiles` — employee: own + own-manager + directory fields; manager: +direct reports; admin: all.
  UPDATE: employee own non-role only; admin all. INSERT/DELETE blocked (trigger / soft-delete).
- `employee_compensation` — employee: own (full); manager: own base + direct-report **summaries via RPC**
  (not the base table); admin: all. Employee UPDATE limited to non-salary columns by **column grant**.
- `leave_requests` — employee: own; manager: own + direct reports; admin: all. Approve/reject =
  manager on direct reports.
- `documents` — own / +direct reports / all (drives §4 Storage).
- `audit_logs` — admin SELECT only; INSERT via `insert_audit_log()` only; never UPDATE/DELETE.

## 6. Cross-layer consistency & cells to verify (the executable suite — step 2)

**Consistency invariant:** every denied app cell should also be denied at the DB (RLS) — and vice
versa. A DB-allows / app-denies (or the reverse) is a bug. **Step 2 is built** — each spot-check
below now has executable coverage. The gap-only mirror lives in
[`tests/e2e/access-matrix.spec.ts`](../tests/e2e/access-matrix.spec.ts) (the cells the pre-existing
specs did not already cover); the rest are cited inline. Spot-checks and where each is proven:

1. **Peer/stranger reads** — employee A cannot read employee B's `/employees/[id]`, leave, documents,
   compensation, or performance, via UI **and** via forged-UUID direct calls. (Highest-value tests.)
   — `/employees/[id]` peer projection: `employee.spec.ts` (B7). documents SELECT (RLS): `rls.spec.ts`.
   `getSignedDownloadUrl` action-layer forge: **AM2**. `uploadDocument` employee→other: **AM6**.
2. **Manager scope** — a manager sees only direct reports for leave/onboarding/performance/documents;
   a non-report target → deny + `auth.access_denied`. — `assignTemplate`: `security-rbac-guards.spec.ts`
   (step 23); `savePerformanceGoal`: `manager.spec.ts` ("crafted form"); `uploadDocument` manager→non-report: **AM3**.
3. **Manager cannot see bank/tax/national-id** — only summaries via RPC, never the base
   `employee_compensation` row for a report. — `rls.spec.ts` (manager base-table SELECT = own row only;
   RPC return-type excludes bank/tax/national_id).
4. **Non-admin → admin surfaces** — `/audit-logs`, `/settings`, `/reports`, `/reports/export`,
   `/departments`, `/leave/admin`, `/employees/new` all deny manager+employee with an audit row.
   — `security-rbac-guards.spec.ts` (URL-guard loops, both roles).
5. **Self-approval of leave is blocked** (`leave.ts:573/730`) — `security-rbac-guards.spec.ts` (step 25).
   Open product gap: an admin/sole-manager then has *no* approver for their own leave (see pending-backlog
   "Who approves Admin's leave?").
6. **Write-side ownership** — reject acting on another's row. `updateOwnGoalProgress`: `employee.spec.ts`
   ("crafted form"); `completeTask` / `cancelLeaveRequest`: `security-rbac-guards.spec.ts` (steps 11/12);
   `selfUpdateCompensation` salary injection: `security-rbac-guards.spec.ts` (step 14);
   `submitSelfReview`: **AM8**; `acknowledgeReview`: **AM9**.
7. **Every denied cell emits `auth.access_denied`** (or `entity.not_found` for RLS-denied reads) —
   asserted via the audit row, not just the HTTP/UI outcome (`docs/systems-thinking.md` §2). **Step 5**
   turned this from a claim into a verified per-cell ledger: each app-layer deny path was confirmed to
   write its audit row in code, and each proving spot-check now asserts that row. Pure RLS-filtered raw
   reads (no app code runs) have no app audit by design — that is the DB layer's job.

   | Denied cell | Audit `action` (reason) | Asserted in |
   |---|---|---|
   | `getSignedDownloadUrl` forge (AM2) | `entity.not_found` (`missing_or_rls_denied`) | `access-matrix.spec.ts` AM2 |
   | `uploadDocument` employee→other (AM6) | `auth.access_denied` (no `reason` key; scoped by metadata `target_employee_id`) | `access-matrix.spec.ts` AM6 |
   | `uploadDocument` mgr→non-report (AM3) | `auth.access_denied` (`manager_upload_outside_scope`) | `access-matrix.spec.ts` AM3 |
   | `savePerformanceGoal` mgr crafted-form | `auth.access_denied` (`goal_outside_scope`) | `manager.spec.ts` ("crafted form") |
   | `assignTemplate` mgr→non-report | `auth.access_denied` | `security-rbac-guards.spec.ts` (step 23) |
   | non-admin → admin surfaces (URL guards) | `auth.access_denied` | `security-rbac-guards.spec.ts` (both roles) |
   | self-approval of own leave | `auth.access_denied` | `security-rbac-guards.spec.ts` (step 25) |
   | `completeTask` forge | `auth.access_denied` (`employee_complete_other_task`) | `security-rbac-guards.spec.ts` (step 11) |
   | `cancelLeaveRequest` forge | `auth.access_denied` **only when the ownership guard is reached**; RLS short-circuits the "row not found" branch first, which writes **no app audit** (documented observability gap, `security-and-rbac-guards.md`) — UI + DB-unchanged asserted, RLS is the boundary | `security-rbac-guards.spec.ts` (step 12) |
   | `selfUpdateCompensation` salary injection | `auth.access_denied` (`salary_field_in_self_update`) | `security-rbac-guards.spec.ts` (step 14) |
   | `updateOwnGoalProgress` not-owner | `auth.access_denied` | `employee.spec.ts` ("crafted form") |
   | `submitSelfReview` / `acknowledgeReview` not-owner (AM8/AM9) | `auth.access_denied` (`self_review_not_owner` / `acknowledge_not_owner`) | `access-matrix.spec.ts` AM8/AM9 |
   | documents table SELECT, manager base-comp SELECT | — (RLS-filtered raw read; no app audit) | `rls.spec.ts` (DB layer) |

**Verify cells — RESOLVED 2026-06-18** (owner confirmed intent against code):
- `/employees/[id]` — employee/manager see a **limited peer view** of colleagues (5-field projection); full view only for self / manager-of-subject / admin. ✅ code matches.
- `/leave/calendar` — **everyone sees all approved leave** (company-wide). ✅ code matches.
- `performance.savePerformanceGoal` — manager scoped to reports via `canManageEmployee`. ✅ code matches.

### §6.D Intended-vs-current divergences (decisions from 2026-06-18)

- ~~**Manager document upload — DIVERGENCE.**~~ **RESOLVED 2026-06-18:** managers upload **policy/other
  for direct reports only** (`uploadDocument` enforces report ∈ `getDirectReportIds` + `category ∈
  MANAGER_UPLOAD_CATEGORIES`; UI picker = reports via `getManagerUploadEmployeeOptions`; form offers only
  policy/other; manager upload panel hidden when they have no reports). Owner decision (2026-06-18):
  restrict uploads to what managers can see, **not** broaden visibility — keeps the migration-0014
  hardening intact. Smoke caught the original over-broad version (manager uploaded a contract → invisible
  to him; employee saw it).
- ~~**KNOWN GAP — managers cannot see their OWN documents.**~~ **RESOLVED 2026-06-18 (migration 0053):**
  `select_own_documents` is now role-agnostic (`employee_id = auth.uid()`), so every user sees their own
  documents. Manager self-upload restored (any non-payslip category). Strictly self-scoped — no
  cross-tenant change.
- **Admin's own leave approval — known gap, deferred.** Self-approval is blocked (`leave.ts:573/730`)
  and an admin has no approver above them, so an admin's leave request has no valid approver. **Decision:
  introduce a `superadmin` role later** (folds into the pending-backlog "expanded role model"); the
  superadmin approves admin leave. Tracked in pending-backlog ("Who approves Admin's leave?").

## 7. DB↔app cross-check (Step 4)

**Invariant:** every resource × role × operation must resolve the same way at the DB layer
([`rls-policy-map.md`](rls-policy-map.md)) and the application layer (§1–§4 above). The dangerous
direction is **`app-allows / DB-denies`** — an app surface that uses the service-role admin client to
write/read a row the RLS layer would deny. `DB-allows / app-denies` is the *safe* direction (app
stricter than DB; defence in depth) but is still recorded as a latent inconsistency.

**Result (audit 2026-06-19):** no `app-allows / DB-denies` divergence. Every admin-client surface was
checked to produce an outcome the DB layer also intends. Per-table agreement:

| DB table (`rls-policy-map.md`) | App surface (§1–§4) | Cross-check |
|---|---|---|
| `profiles` | `/employees`, `/employees/[id]` (peer RPC), `employees.updateEmployee` | SELECT ✅ · **UPDATE — finding 1 (latent)** |
| `departments` | `/departments`, `departments.*` | ✅ |
| `employee_records` | `/employees`, `/employees/[id]` (`get_peer_employee_profile`) | ✅ |
| `employee_compensation` | `/payroll`, `compensation.upsert/selfUpdate`, report-summary RPC | ✅ · **finding 3 (enforcement note)** |
| `leave_types` | `leave.createLeaveType/toggleLeaveType` | ✅ |
| `leave_balances` | `/leave`, `/leave/admin`, `leave.upsertLeaveBalance/rolloverLeaveBalances` | ✅ |
| `leave_requests` | `/leave`, `leave.submit/approve/reject/cancel` | ✅ |
| `public_holidays` | `leave.create/update/toggle/bulkUploadPublicHolidays` | ✅ |
| `documents` | `/documents`, `documents.upload/getSignedDownloadUrl/softDelete` | SELECT/INSERT/DELETE ✅ · **UPDATE — finding 2 (latent)** |
| `onboarding_templates` | `/onboarding/admin`, `onboarding.*Template*` | ✅ |
| `onboarding_tasks` | `/onboarding`, `onboarding.assignTemplate/addIndividualTask/completeTask/deleteTask` | ✅ |
| `performance_review_cycles` | `performance.create/updateReviewCycle` | ✅ |
| `performance_goals` | `performance.savePerformanceGoal/updateOwnGoalProgress` | ✅ |
| `performance_reviews` | `performance.submitManagerReview/submitSelfReview/acknowledgeReview` | ✅ |
| `audit_logs` | `/audit-logs` (admin), `insert_audit_log()` only | ✅ |
| `app_settings` | `/settings`, `app-settings.updateAppSettings` | ✅ |
| `storage.objects` (`hr-documents`) | §4 Storage, `documents.getSignedDownloadUrl` | ✅ (0054 mirrors 0053) |

Page-level denies that look like divergences but are **not**: `/departments`, `/settings`, `/reports`,
`/leave/admin` are admin-only *management* surfaces; the underlying tables still grant broader SELECT
used in other contexts (e.g. department names in the directory, non-sensitive `app_settings` keys). A
deny on a management page does not contradict a read grant exercised elsewhere.

### Findings

1. **`profiles` UPDATE — latent, safe-direction.** RLS grants `employee` own-non-role UPDATE
   (`rls-policy-map.md` → `profiles`), but the only profile write path is admin-only
   `employees.updateEmployee` (`employees.ts:389/421`) on the **admin client**. No session-client
   employee self-profile write exists, so the RLS grant is currently **unreachable** from the app. App
   stricter than DB ⇒ not exploitable. **Decision: document only** — do not narrow the DB grant (a
   `profiles` RLS migration is a high-blast-radius change for a non-exploitable, unused grant). Revisit
   if employee self-edit of profile is ever built (follow-up).
2. **`documents` UPDATE — latent, safe-direction.** RLS grants `employee` own-non-sensitive UPDATE
   (`rls-policy-map.md` → `documents`), but there is **no `updateDocument` action** (only
   `uploadDocument` / `getSignedDownloadUrl` / `softDeleteDocument`). Same pattern: app stricter ⇒ not
   exploitable. **Decision: document only** (follow-up if document self-edit is built).
3. **`employee_compensation` self-update — enforcement divergence, outcome-equal.** `selfUpdateCompensation`
   (`compensation.ts:306-420`) writes via `createAdminClient()`, which **bypasses** the migration-0049
   column grant. The RLS column grant is therefore *not* the backstop for this path; the app
   `ADMIN_ONLY_FIELDS` reject + hard-coded `eq("employee_id", user.id)` are. The **outcome** (employee →
   own row, non-salary columns only) matches the DB intent, so the layers agree on *what* is allowed
   even though the *enforcement layer* differs. Already documented in code (`compensation.ts:75-85`).
   Not a bug — recorded so a future reviewer does not mistake the admin-client write for an RLS-backed one.

### Automated inventory gate (Step 6)

The allow/deny **semantics** above are a point-in-time audit — a script cannot diff RLS-vs-Server-Action
intent, so the per-table ✅/finding judgements remain a human/AI re-walk (the Findings list). What *is*
now enforced on every PR is **inventory completeness**: `tools/check-cross-check.mjs`
(`npm run check:cross-check`, wired into the `gate` job in `.github/workflows/ci.yml`) bidirectionally
diffs the DB-table inventory of [`rls-policy-map.md`](rls-policy-map.md) (its backticked `## ` headers +
the Storage Buckets row) against the first column of the §7 per-table agreement table. A table governed
by the DB layer but missing from §7 — or a §7 row with no matching DB table — **blocks the PR**
(`storage.objects` is excluded as the implementing-table annotation for the `hr-documents` bucket).

This closes the failure mode that used to live here: a new RLS-governed table added to `rls-policy-map.md`
without a §7 row would silently rot the cross-check with no runtime signal (sensitive reads go through the
admin client, so a divergence never reaches the UI). The gate now forces a §7 row — hence a re-walk of
that table's cross-check — before merge. It does **not** verify the judgements are *correct*; that is
still the audit + the **mandatory 2-AI close gate**. The soft migration→`rls-policy-map.md` tripwire from
Step 3 remains the complementary nudge on the DB-doc side.

## Status / next

- **Step 1** (the matrix) — done. **Step 2** (the executable suite) — **done**: the §6 spot-checks are
  proven across `access-matrix.spec.ts` (the gap-only cells: AM2/AM3/AM6/AM8/AM9, run via the
  `access-matrix` Playwright project) plus the pre-existing `security-rbac-guards.spec.ts`,
  `rls.spec.ts`, `employee.spec.ts`, `manager.spec.ts` — see §6 for the per-cell map. The new suite
  deliberately does **not** re-encode cells already covered. **Step 3** (the drift gate) — **done**:
  `tools/check-access-matrix.mjs` (run in CI via `npm run check:access-matrix`, wired into the
  `gate` job in `.github/workflows/ci.yml`) strictly and bidirectionally diffs the application authz
  surface against this doc — every Server Action (§3), page route (§1), and route handler (§2) must
  have a matching backticked token here, and every token must resolve to real code. A red **blocks
  the PR**. Scope is the **application boundary only**; the DB layer (tables / RLS policies) stays
  owned by `docs/rls-policy-map.md` and the step-4 cross-check, with a soft tripwire that warns when a
  migration changes without an rls-policy-map update. Non-authz infra actions are listed in the
  `access-matrix-checker:exempt` block above §4. **Step 4** (DB↔app cross-check) — **done**: §7 records
  the per-table agreement, the two latent safe-direction grants (`profiles`/`documents` UPDATE), and the
  `selfUpdateCompensation` admin-client enforcement note; no `app-allows / DB-denies` divergence found.
  **Step 5** (per-cell negative-path audit assertions) — **done**: §6.7 is now a verified per-cell ledger
  (each deny path confirmed to write its audit row in code, each proving spot-check asserts it); the one
  gap — the §6.2 `savePerformanceGoal` manager crafted-form deny in `manager.spec.ts` — now asserts the
  `auth.access_denied` / `goal_outside_scope` row. Test + doc only; no app deny path needed an audit row
  added. **Step 6** (automate the §7 cross-check as a run-on-every-PR gate) — **done**:
  `tools/check-cross-check.mjs` (`npm run check:cross-check`, wired into the `gate` job in
  `.github/workflows/ci.yml`) bidirectionally diffs the DB-table inventory of `rls-policy-map.md`
  against the §7 per-table agreement table — a divergence blocks the PR. Scope is **inventory
  completeness only** (a table can't be added on one side without the other); the allow/deny judgements
  themselves stay the human/AI audit. See §7 "Automated inventory gate". **Remaining:** the **mandatory
  close gate** — independent review by **two AI systems at max capacity** before this item is marked done
  (per pending-backlog §1).
- Source of guard data: `requireRole` inventory across `src/app/(app)/**` and `src/server/actions/**`,
  cross-referenced to `docs/rls-policy-map.md` (DB) and `docs/security-model.md` (rules).
