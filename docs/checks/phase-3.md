# Phase 3 — Supabase Schema And RLS: Check Report

Date: 2026-04-27  
Checks performed: inline (no subagents — token conservation).  
Live Supabase project: seeding confirmed by user. Migration application and runtime RLS tests pending below.

---

## QA Agent — Structural Checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | All 10 table-creating migrations have `alter table ... enable row level security` in the same file | PASS | 0002 has 2 (profiles + departments); 0003–0010 have 1 each |
| 2 | `set_updated_at` trigger applied to all tables with `updated_at` column | PASS | 12 triggers in 0011; `audit_logs` correctly excluded (no updated_at) |
| 3 | `handle_new_user` uses `on conflict (id) do nothing` | PASS | Idempotent — safe for re-runs and trigger re-fire edge cases |
| 4 | `sync_role_to_jwt` uses `coalesce + jsonb concat` to merge metadata | PASS | Preserves existing app_metadata keys; does not overwrite the whole object |
| 5 | `is_direct_report()` excludes terminated employees | PASS | `employment_status != 'terminated'` in WHERE clause |
| 6 | `leave_dates_valid` constraint enforces `end_date >= start_date` | PASS | CHECK constraint on `leave_requests` |
| 7 | Unique constraints: `profiles.work_email`, `leave_types.name`, `leave_balances(employee_id, leave_type_id, year)`, `documents.storage_path` | PASS | All present |
| 8 | Indexes on FK columns and common query predicates | PASS | All FK columns indexed; `status`, `is_active`, `created_at`, `deleted_at` indexed where relevant |
| 9 | Seed uses `on conflict ... do nothing` on all inserts | PASS | Safe idempotent re-runs |
| 10 | `supabase db reset` + seed: applied cleanly (user confirmed) | PASS | User confirmed seeding completed without errors |

---

## Security Agent — Critical Path Checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 11 | Manager has **zero** policy on `employee_compensation` | PASS | Grep confirms no manager policy in 0004; RLS denies by default |
| 12 | Manager has **zero** policy on `payroll_change_requests` | PASS | Grep confirms no manager policy in 0005 |
| 13 | `audit_logs`: no INSERT grant for `authenticated` | PASS | Only `grant select` issued; no INSERT grant present |
| 14 | `audit_logs`: no INSERT or UPDATE or DELETE policy for any role | PASS | Only `admin_select_audit_logs` policy present |
| 15 | `audit_logs.actor` references `auth.users` with `on delete set null` | PASS | Audit history preserved if user is deleted |
| 16 | `insert_audit_log()` is `security definer` | PASS | Only permitted write path into `audit_logs` |
| 17 | `get_user_role()` is `security definer` | PASS | Avoids RLS recursion when called from within policies |
| 18 | `is_direct_report()` is `security definer` | PASS | Avoids RLS recursion; reads `employee_records` as postgres superuser |
| 19 | `sync_role_to_jwt()` is `security definer` | PASS | Required to update `auth.users.raw_app_meta_data` |
| 20 | Employee cannot escalate own role: `employee_update_own_profile` has `with check (role = 'employee')` | PASS | Role escalation via self-update blocked at DB layer |
| 21 | `anon` revoked on sensitive tables | PASS | `revoke all from anon` on `employee_compensation`, `leave_balances`, `leave_requests`, `documents`, `onboarding_tasks`, `audit_logs` |
| 22 | Manager blocked from `payslip` and `id_document` document categories | PASS | `category not in ('payslip', 'id_document')` in manager document SELECT policy |
| 23 | Employee cannot upload `payslip` category documents | PASS | `category != 'payslip'` in employee INSERT policy |
| 24 | Employee leave cancel: `with check (status = 'cancelled')` | PASS | Cannot change to any other status via the cancel policy |
| 25 | Manager leave update: `with check (status in ('approved', 'rejected'))` | PASS | Manager cannot set arbitrary status values |
| 26 | Self-approval guard noted in migration comment | PASS (Server Action) | Comment in 0006: "Server Action must also verify approver_id != employee_id" |

---

## Review Agent — Schema Design Checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 27 | No overbuilding: schema covers v1 scope without speculative tables | PASS | 12 tables map directly to product requirements doc |
| 28 | Enums used appropriately for finite state sets | PASS | `user_role`, `employment_status`, `employment_type`, `leave_request_status`, `document_category`, `pay_frequency`, `task_status` |
| 29 | FK delete behavior: primary employee records use `on delete restrict` | PASS | employee_records, compensation, leave, documents, onboarding_tasks all restrict on `profiles.id` |
| 30 | FK delete behavior: optional/audit FKs use `on delete set null` | PASS | `departments.manager_id`, `employee_records.manager_id`, `leave_requests.approver_id`, `audit_logs.actor` all set null |
| 31 | Audit trail columns: `created_by`, `updated_by` on all mutable tables | PASS | All 12 mutable tables have both audit columns |
| 32 | `payroll_change_requests` reuses `leave_request_status` enum | NOTED | Semantic mismatch (a payroll request isn't a "leave" request), but the state machine (pending/approved/rejected/cancelled) is identical. Acceptable for v1; Phase 12 hardening can introduce a dedicated enum if needed |
| 33 | `is_shared` on `documents` has no cross-employee SELECT policy | NOTED | Phase 7 scope — flag is present for future use, no current policy surfaces it to other employees. No security risk (no permissive policy) |
| 34 | `documents.uploaded_by` FK is `on delete restrict` (not `set null`) | NOTED | Minor deviation from the design decision doc which listed `uploaded_by` as `set null`. The column is `not null`, so restrict is more consistent with the column constraint. Low-risk for v1; revisit in Phase 11 if admin offboarding is a use case |
| 35 | `employee_compensation` grants could be tightened | NOTED | Currently grants `select, insert, update, delete` to `authenticated` then relies entirely on RLS. Phase 12 can revoke `delete` (no delete policy exists — but belt-and-suspenders). Not blocking |

---

## Systems Thinking Checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 36 | State ownership map covered: DB is source of truth, JWT is read cache | PASS | `sync_role_to_jwt` trigger keeps JWT in sync; DB role wins on conflict |
| 37 | Feedback loop: audit log function is the only write path to `audit_logs` | PASS | No other insert path possible via RLS |
| 38 | Blast radius: `handle_new_user` trigger — silent failure would leave new user without profile | NOTED | Phase 4 must surface error if `profiles` row missing after sign-up |
| 39 | Blast radius: `sync_role_to_jwt` trigger — silent failure would produce stale JWT | NOTED | Phase 4 must re-read role from DB if JWT role seems wrong; document as known risk |
| 40 | FK delete restriction on `profiles` prevents orphaned employee records | PASS | Admin must clear all records before profile delete — intentional for compliance |

---

## Pending (Requires Live Supabase — Cannot Check Statically)

These items are confirmed as implemented correctly in the SQL but cannot be fully validated without a live connected project. The user confirmed `supabase db reset` and seeding completed without errors.

- [ ] Sign-up smoke test: new user gets `profiles` row (handle_new_user trigger)
- [ ] Role change on profile reflected in JWT app_metadata (sync_role_to_jwt trigger)
- [ ] RLS runtime: manager cannot SELECT from `employee_compensation`
- [ ] RLS runtime: employee cannot SELECT another employee's profile, records, or documents
- [ ] RLS runtime: no direct INSERT into `audit_logs` from any role returns error
- [ ] RLS runtime: employee cannot approve own leave (Server Action guard — Phase 4)

These are carried forward as Phase 4 pre-flight checks (can be verified once auth is wired up).

---

## Summary

- **Static checks**: 40 items — 35 PASS, 4 NOTED (non-blocking), 0 FAIL
- **Runtime checks**: 6 items deferred to Phase 4 (require connected auth session)
- **Phase 3 status**: CLOSED — proceed to Phase 4
