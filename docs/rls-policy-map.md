# RLS Policy Map

This document is the planning source of truth for Supabase Row Level Security policies in KushHR. Update it as migrations are written. Every table must have RLS enabled and explicit policies; no table may use a permissive default.

> **DB layer.** This map is the **database** layer. Its **application**-layer counterpart is [`docs/access-matrix.md`](access-matrix.md) (pages, route handlers, Server Actions, Storage × role × actor-relation). The two must agree — a DB-allows / app-denies (or vice-versa) is a bug.
>
> **Gated inventory.** Every `` ## `table` `` header (and the Storage Buckets row) **in this file** must have a matching row in [`access-matrix.md`](access-matrix.md) §7 — `npm run check:cross-check` (CI `gate` job) blocks any PR where this file's table set and §7's diverge. So adding/removing a table here without the matching §7 edit fails CI. **Caveat:** the gate compares the two *docs*, not the docs against the live schema — a migration that adds a table but skips updating this file is **not** hard-blocked here; that case is only nudged by the soft migration→rls-policy-map tripwire in `check-access-matrix.mjs` (a warning). The gate enforces doc-inventory completeness only; the per-table allow/deny judgement is the §7 audit.

Policy shorthand used below:

- `own` — `auth.uid() = <owner column>`
- `direct_report` — `<employee column>` is in `(select employee_id from employee_records where manager_id = auth.uid())`
- `jwt_role` — `(auth.jwt() ->> 'role')::user_role`
- `admin` — `jwt_role = 'admin'`
- `manager` — `jwt_role = 'manager'`
- `employee_role` — `jwt_role = 'employee'`

---

## `profiles`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own row only + own manager profile; limited active-colleague fields via `get_people_directory()` | direct reports + own | all rows |
| INSERT    | blocked (handle_new_user trigger only) | blocked | allowed |
| UPDATE    | own non-role fields only | blocked | all rows |
| DELETE    | blocked | blocked | blocked (soft-delete via status) |

Notes:

- Role field on own profile is not user-updatable; admin-only UPDATE on `role` column.
- **App-layer note (latent grant):** the `employee` own-non-role UPDATE grant has **no session-client
  write path** in the app — the only profile write is admin-only `employees.updateEmployee` on the admin
  client. The grant is therefore currently unreachable from the app (app stricter than DB; safe
  direction). See [`access-matrix.md`](access-matrix.md) §7 finding 1.
- Manager SELECT on direct reports is scoped via `employee_records.manager_id`.
- Employees do not get broad colleague `profiles` SELECT. The employee People
  Directory uses the security-definer RPC `get_people_directory()`, which returns
  only `id`, display name, job title, department name, and work email for active
  people.
- B7 peer view (migration 0037): when an employee opens
  `/employees/{peer-id}` for a colleague they neither manage nor are managed
  by, the page calls `get_peer_employee_profile(uuid)` and renders display
  name, department, manager (linked), work email, and work phone. The RPC's
  SELECT list is hard-coded in SQL, so a careless DAL change cannot widen the
  projection.

---

## `departments`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | all (directory is visible) | all | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

---

## `employee_records`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own row; limited active-colleague fields via `get_people_directory()` | own + direct reports | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

Notes:

- Direct-report check: `manager_id = auth.uid()` on the `employee_records` row being accessed.
- Manager cannot update job details, salary, department assignment, or employment status for direct reports in v1.
- Employees do not get broad colleague `employee_records` SELECT. The People
  Directory projection filters to active records and does not expose manager id,
  employment status/type, dates, or work location.
- B7 peer view (migration 0037): `get_peer_employee_profile(uuid)` joins
  `employee_records` for `department_id` + `manager_id` only. Employment
  status/type, start/end dates, job title, and work location are not in the
  projection.

---

## `employee_compensation`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own row (full) | own row only on base table; direct-report summaries via RPC | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | own non-salary cols only (column grant) | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

Notes (migrations 0049 + 0050, 2026-06-02):

- Employee can read + update their own row. Update is **column-grant restricted** to
  `bank_name, bank_account_holder, bank_account_number, tax_id, national_id,
  passport_number, nationality`. Salary, currency, pay frequency, effective date,
  and notes are physically unwritable on the session-client.
- Manager has **no base-table SELECT path to direct-report rows.** The
  `manager_select_direct_report_compensation` policy was removed in migration 0050.
  Manager scope is enforced exclusively by the SECURITY DEFINER RPC
  `public.get_direct_report_compensation_summaries()`, which returns
  `(employee_id, employee_name, salary_amount, salary_currency, pay_frequency, effective_date)` —
  sensitive columns (bank, tax, national_id, passport) are not in the return type and cannot leak.
  The role-agnostic `employee_select_own_compensation` policy still gives the manager
  access to their own row (because manager is an employee too).
- Admin reads + writes via service-role; bypasses RLS by design.
- The previous `payroll_change_requests` mediation layer has been retired (table dropped
  in migration 0048). Employees now self-edit their non-salary fields directly.

---

## `leave_types`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | all active | all active | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

---

## `leave_balances`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own balances | direct reports | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

---

## `leave_requests`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own requests | own requests + direct reports | all |
| INSERT    | own requests | own requests | allowed |
| UPDATE    | cancel own pending | cancel own pending + approve/reject direct reports | all |
| DELETE    | blocked | blocked | blocked (cancelled status instead) |

Notes:

- Employee cannot approve their own leave request regardless of role check.
- Manager self-service is limited to submitting and cancelling their own pending requests.
- Manager approval/rejection is limited to direct-report rows; Server Actions also block self-approval and self-rejection.
- **EXCLUDE constraint `leave_requests_no_overlap` (migration 0035)** — non-RLS data-integrity guard. Rejects two rows for the same `employee_id` with overlapping `daterange(start_date, end_date, '[]')` when both have `status IN ('pending','approved')`. Action layer pre-checks the same condition and translates SQLSTATE 23P01 to a user-facing overlap message.
- **BEFORE UPDATE triggers `handle_leave_approval` + `handle_leave_refund` (migration 0042)** — security-definer; populate/refund `leave_requests.deducted_days` and write to `leave_balances`. Approval trigger writes the working-days total at status transition to `approved`; refund trigger fires on approved→cancelled and refunds the frozen `deducted_days` per-year (with calendar-days legacy fallback for pre-0042 rows). Neither bypasses RLS on `leave_balances` reads — they UPDATE balances directly via the security-definer context, mirroring the pre-0042 trigger pattern.
- **RPC `get_company_approved_leave(p_from date, p_to date)` (migration 0045)** — `security definer stable`, `search_path = public`, executable by `authenticated` only. Returns a fixed projection (`id`, `employee_id`, `employee_name`, `leave_type_id`, `leave_type_name`, `start_date`, `end_date`, `is_half_day`) for rows where `status = 'approved'` and `[start_date, end_date]` overlaps `[p_from, p_to]`. Powers `/leave/calendar`'s month grid **and** the `Team leave calendar` panel on all three role dashboards (admin/manager/employee) — single source of truth, no RLS divergence. Does not expose `employee_note`, `urgent_leave_reason`, `approver_note`, `deducted_days`, or approver identity. Note: the manager dashboard's panel scope widened from "own + direct reports" (the older `getWhoIsOut` reader) to "company-wide" when it was switched to this RPC; intentional per Session 148 product decision. `/leave/page.tsx`'s "Out this week" panel still uses `getWhoIsOut` and remains RLS-scoped.

---

## `public_holidays`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | all active | all active | all (incl. inactive) |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

Notes:

- Authenticated reads are needed so leave-request form preview can show "Excluded: 1 public holiday (<name>)".
- Soft-delete is preferred via `is_active = false` (preserves audit history); hard delete is allowed but not exposed in the admin UI in v1.
- Unique partial index `(date, country_code, name) where is_active` is the only DB-side dedup guard; bulk upload also pre-checks and skips duplicates so the operation stays additive-only.
- Server Actions: `createPublicHoliday`, `updatePublicHoliday`, `togglePublicHoliday`, `bulkUploadPublicHolidays` — all `requireRole(["admin"])`.

---

## `documents`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own docs (+ shared) | **own docs** + direct reports (policy/other only) | all |
| INSERT    | own docs | blocked | allowed |
| UPDATE    | own non-sensitive fields | blocked | all |
| DELETE    | blocked | blocked | allowed |

Notes:

- **Own-document visibility is role-agnostic** (migration 0053): `select_own_documents` = `employee_id = auth.uid()` for any authenticated role, so managers/admins see their own documents (previously gated to `role = 'employee'`). Strictly self-scoped — no cross-tenant exposure.
- Managers see direct reports' documents in **policy/other only** (migration 0014 hides `contract`/`id_document`/`payslip`). Manager upload mirrors this (own = any non-payslip; report = policy/other), enforced in `uploadDocument`.
- `payslip` category is admin-upload only; employee can view but not upload their own payslips.
- Storage RLS on `storage.objects` mirrors the metadata table policy: own-file SELECT is role-agnostic (migration 0054 `select_own_objects` = `bucket_id='hr-documents' AND (storage.foldername(name))[1] = auth.uid()::text`), matching 0053 on `documents`. Manager direct-report file SELECT (`manager_select_direct_report_objects`) excludes `payslip`/`id_document`/`contract`, mirroring 0014. INSERT stays employee-only (server uploads use the service-role admin client).
- Signed URLs for sensitive downloads; do not serve raw Storage URLs.
- **App-layer note (latent grant):** the `employee` own-non-sensitive UPDATE grant has **no app write
  path** — there is no `updateDocument` action (only upload / signed-download / soft-delete). The grant
  is currently unreachable from the app (app stricter than DB; safe direction). See
  [`access-matrix.md`](access-matrix.md) §7 finding 2.

---

## `onboarding_templates`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | all active | all active | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

---

## `onboarding_tasks`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own tasks | direct reports | all |
| INSERT    | blocked | direct reports | allowed |
| UPDATE    | own task status (complete/incomplete) | direct reports | all |
| DELETE    | blocked | blocked | allowed |

---

## `performance_review_cycles`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | active cycles linked to own reviews/goals | all active cycles + cycles linked to direct-report reviews/goals | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | blocked (close/archive instead) |

Notes:

- Review cycles are HR-controlled setup data. Managers should not create official cycles in v1.
- Managers can see active cycles before goals/reviews exist so they can create the first direct-report goal or appraisal for an admin-created cycle.
- Closed cycles remain readable for employees/managers only when they have a related review or goal.

---

## `performance_goals`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own goals | direct-report goals | all |
| INSERT    | blocked | direct reports | allowed |
| UPDATE    | own progress/note/complete via Server Action only | direct-report goals | allowed |
| DELETE    | blocked | blocked | blocked (cancel status instead) |

Notes:

- Manager write scope is direct reports only and excludes terminated employees through `is_direct_report()`.
- Employees cannot create goals or edit manager-owned title, description, due date, cycle, or cancellation state.
- Employee self-updates are limited to own progress percentage, completion status, `employee_progress_note`, and `employee_progress_updated_at` through the audited `updateOwnGoalProgress` Server Action. Direct table mutation remains blocked.

---

## `performance_reviews`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | own reviews | direct-report reviews | all |
| INSERT    | blocked | direct reports | allowed |
| UPDATE    | own self-review/acknowledgement fields only | direct-report manager fields | allowed |
| DELETE    | blocked | blocked | blocked (preserve review history) |

Notes:

- `score` must be an integer from 1 to 5 and can be set only by the manager/admin path.
- Employees may add a self-review comment before manager submission and acknowledge after manager submission.
- Managers cannot submit or update reviews for employees outside their direct-report scope.
- Reviews must not include salary, bank, tax, or national ID data.

---

## `audit_logs`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | **blocked** | **blocked** | all |
| INSERT    | blocked (function only) | blocked (function only) | blocked (function only) |
| UPDATE    | blocked | blocked | blocked (append-only) |
| DELETE    | blocked | blocked | blocked (append-only) |

Notes:

- All inserts go through `insert_audit_log()` called with `security definer`. No role may insert directly.
- Append-only: no UPDATE or DELETE policy for any role including admin.
- If employees later need to see their own activity, add a scoped SELECT policy at that point.

---

## `app_settings`

| Operation | Employee | Manager | Admin |
|-----------|----------|---------|-------|
| SELECT    | non-sensitive keys | non-sensitive keys | all |
| INSERT    | blocked | blocked | allowed |
| UPDATE    | blocked | blocked | allowed |
| DELETE    | blocked | blocked | allowed |

Notes:

- Sensitive or system-internal settings should use a category or prefix to exclude them from employee/manager SELECT.

---

## Storage Buckets

| Bucket | Access |
|--------|--------|
| `hr-documents` | Private. RLS on `storage.objects` mirrors the `documents` table policy. Downloads via signed URLs generated server-side. |

No public buckets. Storage policies are written in the Phase 7 (Documents and Storage) migration.

---

## Direct-Report Scope Definition

Manager direct-report access is always defined as:

```sql
exists (
  select 1 from public.employee_records er
  where er.employee_id = <target_user_id>
    and er.manager_id = auth.uid()
    and er.employment_status != 'terminated'
)
```

Using `employment_status != 'terminated'` prevents managers from accidentally retaining access to historical reports who have left. If a terminated employee's records must be visible for handover, that access should be explicit and time-limited.

---

## Policy Testing Requirements

Before Phase 3 is closed:

- [ ] Employee A cannot SELECT employee B's profile, records, compensation, payroll requests, or documents.
- [ ] Manager can SELECT direct-report profile, records, leave, and tasks.
- [ ] Manager has zero base-table SELECT on `employee_compensation` for direct-report rows. Manager scope is RPC-only (`get_direct_report_compensation_summaries`, migration 0050) and the RPC return type excludes bank/tax/national-id/passport. `payroll_change_requests` is dropped (migration 0048). Payslip documents remain inaccessible to managers.
- [ ] Employee cannot approve their own leave request.
- [ ] Manager can create/update goals and submit reviews only for direct reports.
- [ ] Employee can view own reviews and acknowledge submitted reviews, but cannot change manager score or manager feedback.
- [ ] Admin can SELECT and mutate all non-append-only tables.
- [ ] No role can INSERT directly into `audit_logs`.
- [ ] No role can UPDATE or DELETE `audit_logs` rows.
- [ ] Terminated employee's records are excluded from manager direct-report scope.
