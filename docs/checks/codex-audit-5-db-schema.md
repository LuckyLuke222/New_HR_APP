# KushHR DB schema / RLS audit - run 3

Scope: read-only audit of `supabase/migrations/` in order, checked against
`docs/security-model.md`, `docs/rls-policy-map.md`, `docs/access-matrix.md`,
`docs/database-design.md`, and `docs/systems-thinking.md`. I also read the
prior audit logs named in the prompt and did not re-report their resolved
leave-trigger / UAT items as the same bug. Package metadata verifies this repo is
currently on Next `16.2.9`, React `19.2.4`, and Supabase JS `2.104.1`
(`package.json:25-37`).

## 1. Exec summary

The data layer is close on row-visibility coverage: every current `public`
application table has RLS enabled, and the private document storage policies are
present. It is not fully sound yet. The strongest problems are integrity gaps
where the database allows states the app assumes cannot exist: an admin/session
insert can land an already-approved leave request without the balance trigger
ever firing, and the manager compensation-summary RPC grants salary summaries to
any authenticated user named in `employee_records.manager_id`, even if their
profile role is only `employee`.

There is also meaningful doc/schema drift. Several write operations described in
`docs/rls-policy-map.md` are actually denied by missing grants/policies and
implemented only by service-role Server Actions. That may be an intentional app
architecture choice, but the DB policy map currently overstates what the RLS
layer enforces.

## 2. Ranked findings

### BLOCKER - Approved leave can be inserted without balance deduction

Evidence:
- `supabase/migrations/0006_leave.sql:99` grants `select, insert, update` on
  `leave_requests` to authenticated sessions.
- `supabase/migrations/0006_leave.sql:107-110` gives admins `for all` RLS on
  `leave_requests`, with no `status = 'pending'` insert restriction.
- `supabase/migrations/0042_leave_working_days_and_refund.sql:90-93` handles
  approval only as a status transition, and the trigger is declared `before
  update`, not insert, at `supabase/migrations/0042_leave_working_days_and_refund.sql:161-164`.
- The company calendar RPC publishes rows where `status = 'approved'`
  (`supabase/migrations/0045_company_leave_calendar.sql:42-45`).

Scenario:
An authenticated admin, raw Supabase client, or future service-role path inserts:
`employee_id = Alice`, `leave_type_id = Local Leave`, `start_date = 2026-08-03`,
`end_date = 2026-08-07`, `status = 'approved'`. RLS allows the insert, but
`trg_leave_balance_on_approval` never runs because no update occurred. The row is
now visible as approved leave, while `leave_balances.balance` is unchanged and
`leave_requests.deducted_days` remains null. This violates the state rule that
approval and balance decrement are atomic (`docs/systems-thinking.md:22`,
`docs/systems-thinking.md:35`). This is distinct from the already-fixed
missing/insufficient-balance approval-update bugs.

Fix:
Disallow direct inserts into terminal/decision states. The narrow fix is to split
admin insert from admin update and require `with check (status = 'pending')` for
all session inserts. The stronger fix is a `BEFORE INSERT OR UPDATE` trigger that
rejects or processes initial `status = 'approved'` rows through the same balance
deduction path, plus CHECKs such as `status = 'approved' -> approver_id IS NOT
NULL AND approved_at IS NOT NULL`.

### NEEDS-FIX - Compensation summary RPC does not require the caller to be a manager

Evidence:
- `employee_records.manager_id` is only an FK to `profiles`, not a role-checked
  relationship (`supabase/migrations/0003_employee_records.sql:12`).
- The app validates selected managers as `admin` or `manager`
  (`src/server/actions/employees.ts:796-801`), but the database has no equivalent
  invariant.
- `get_direct_report_compensation_summaries()` returns salary fields
  (`supabase/migrations/0051_manager_compensation_summary_include_no_comp_rows.sql:27-33`)
  and scopes only by `er.manager_id = auth.uid()` plus non-terminated status
  (`supabase/migrations/0051_manager_compensation_summary_include_no_comp_rows.sql:37-39`).
- Execute was granted to every authenticated user
  (`supabase/migrations/0050_manager_compensation_summary_rpc.sql:51-52`).

Scenario:
If a data import, manual SQL fix, or future bug sets Bob's
`employee_records.manager_id` to Alice while Alice's `profiles.role` remains
`employee`, Alice can call `rpc("get_direct_report_compensation_summaries")`
directly and receive Bob's salary amount, currency, pay frequency, and effective
date. The app currently tries to prevent that bad state, but the RPC is a
security-definer DB boundary and should not depend on app-only role hygiene.

Fix:
Add `public.get_user_role() = 'manager'` to the RPC predicate. Consider a DB
trigger on `employee_records`/`profiles` that rejects `manager_id` values whose
profile role is not `manager` or `admin`, or automatically clears subordinate
`manager_id` rows when a manager is demoted.

### NEEDS-FIX - Core payroll and leave numeric invariants are app-only

Evidence:
- `employee_compensation.salary_amount` is nullable `numeric(14, 2)`,
  `salary_currency` is free `text`, and `pay_frequency` is nullable
  (`supabase/migrations/0004_employee_compensation.sql:11-13`).
- The app enforces salary `0..9_999_999`, currency `MUR|AED|USD`, and required
  pay frequency in Zod (`src/server/actions/compensation.ts:101-118`), not in
  Postgres.
- `leave_balances.balance` is `numeric(6,2) not null default 0` and `year` is an
  unconstrained integer (`supabase/migrations/0006_leave.sql:40-41`).
- The admin balance action enforces balance `0..365` and year `2020..2100`
  (`src/server/actions/leave.ts:1204-1219`), but the table has no CHECK.

Scenario:
An authenticated admin session can use the public Supabase API to upsert
`employee_compensation.salary_amount = -1000` and `salary_currency = 'DOGE'`, or
set a leave balance to `-5`. RLS permits admin writes (`admin_all_compensation`,
`admin_all_leave_balances`), and the DB accepts the values. Payroll and manager
summary views can then render impossible compensation values; leave dashboards
can show negative balances, and otherwise valid leave submissions fail because
the stored balance is already below zero. This is not the old "approval trigger
can make a balance negative" finding; the approval trigger now guards its own
deduction path, but direct writes remain unconstrained.

Fix:
Add `CHECK` constraints at the owning tables: salary non-negative and bounded,
currency constrained to the supported set or to an ISO-4217 pattern, leave
balance non-negative and bounded, and year bounded. If existing rows may violate
the new rules, add `NOT VALID`, clean/backfill, then `VALIDATE CONSTRAINT`.

### NIT - RLS policy map overstates DB-enforced write/read behavior

Evidence:
- `docs/rls-policy-map.md:211-214` says employees/managers can update
  `onboarding_tasks`, but migration `0017` revokes the table UPDATE grant and
  drops both update policies (`supabase/migrations/0017_onboarding_task_update_hardening.sql:5-8`).
- `docs/rls-policy-map.md:240-242` and `docs/rls-policy-map.md:257-259` describe
  manager/admin INSERT/UPDATE on performance goals/reviews, but the migration
  grants only SELECT on those tables (`supabase/migrations/0018_performance_appraisals.sql:87`,
  `supabase/migrations/0018_performance_appraisals.sql:136`).
- `docs/rls-policy-map.md:291-294` says employees/managers can SELECT
  non-sensitive `app_settings` and admins can INSERT/DELETE, but the replacement
  singleton is admin SELECT/UPDATE only (`supabase/migrations/0032_app_settings.sql:46-57`).
- `docs/rls-policy-map.md:159-162` says non-admins read active public holidays,
  but the actual policy allows every authenticated user to SELECT all rows,
  including inactive rows (`supabase/migrations/0040_public_holidays.sql:51-53`).

Scenario:
A future developer follows the DB policy map and changes `completeTask()` or an
employee settings read to use a session-scoped client, expecting RLS to allow the
documented operation. The DB denies the update/read, returning zero rows or a
permission error, so the app behavior silently diverges. The opposite direction
is also dangerous: performance writes are service-role-only, so any missing app
guard has no DB write policy behind it.

Fix:
Either update `docs/rls-policy-map.md` to say these operations are intentionally
service-role/app-layer only, or add the missing RLS policies and column grants.
For public holidays, add `is_active = true OR public.get_user_role() = 'admin'`
if the documented active-only rule is still intended.

### NIT - Destructive table replacement lacks a preflight/archive guard

Evidence:
- Migration `0032` says the old key-value `app_settings` table was empty by
  design (`supabase/migrations/0032_app_settings.sql:13-16`), then executes
  `drop table if exists public.app_settings cascade`
  (`supabase/migrations/0032_app_settings.sql:18`).

Scenario:
Any staging/production environment that had inserted operational settings into
the 0010 key-value table before applying 0032 would lose them irreversibly. I did
not find app code that used the old table, so this is a migration-safety issue,
not a current runtime exploit.

Fix:
For destructive replacements, add a preflight `DO` block that raises if rows
exist, or copy old rows into an archive table before dropping. Leave the comment
as a design claim only after the migration proves it.

## 3. RLS coverage table

Legend: OK = current policy/grant matches the intended outcome; DENY = denied by
missing grant and/or no policy; DRIFT = mismatch or notable reliance on app/service
role behavior.

| Table / surface | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | OK: admin all, own row, manager direct reports, employee own manager (`0002`, `0003`, `0031`) | DRIFT/DENY: `admin_all_profiles` exists but no authenticated INSERT grant; auth trigger/service role create rows | OK: own non-role fields by column grant; admin via policy/service role | DENY: no grant/policy |
| `departments` | OK: all authenticated | OK: admin policy | OK: admin policy | OK: admin policy |
| `employee_records` | OK: admin, own, manager direct reports | OK: admin policy | OK: admin policy | OK: admin policy |
| `employee_compensation` | OK/DRIFT: admin + own row; manager base-table report SELECT removed in favor of RPC | OK: admin policy | OK with caveat: admin + own non-salary column grants | OK: admin policy |
| `payroll_change_requests` | Dropped in `0048`; retired workflow | Dropped | Dropped | Dropped |
| `leave_types` | OK: active to all, inactive to admin | OK: admin policy | OK: admin policy | OK: admin policy |
| `leave_balances` | OK: admin, own, manager direct reports | OK: admin policy | OK: admin policy; missing balance CHECK | OK: admin policy |
| `leave_requests` | OK: admin, own, manager own/direct reports | DRIFT: employee/manager own pending; admin can insert any status, including approved | OK: admin, manager decisions, own cancel; trigger handles approval/refund updates | DENY: no grant/policy |
| `public_holidays` | DRIFT: all authenticated rows, not active-only | OK: admin policy | OK: admin policy | OK: admin policy |
| `documents` | OK: admin all, own role-agnostic, manager policy/other for reports | OK: admin or employee own non-payslip | DRIFT: admin only; docs mention employee latent update but no policy found | DENY for app roles except admin policy; soft-delete via admin action |
| `onboarding_templates` | OK: active to all, all to admin | OK: admin policy | OK: admin policy | OK: admin policy |
| `onboarding_template_items` | OK: items for active templates, all to admin | OK: admin policy | DENY: no update grant/policy | OK: admin policy |
| `onboarding_tasks` | OK: admin, employee own, manager reports | OK: admin + manager direct reports | DRIFT/DENY: update grant and employee/manager policies dropped in `0017`; service-role actions own writes | DENY by grant; admin delete is service-role action |
| `performance_review_cycles` | OK: admin, active manager cycles, cycles linked to own/report goals/reviews | DRIFT/DENY: no session insert; service-role actions | DRIFT/DENY: no session update; service-role actions | DENY |
| `performance_goals` | OK: admin, own, manager reports | DRIFT/DENY: no session insert; service-role actions | DRIFT/DENY: no session update; service-role actions | DENY |
| `performance_reviews` | OK: admin, own, manager reports | DRIFT/DENY: no session insert; service-role actions | DRIFT/DENY: no session update; service-role actions | DENY |
| `audit_logs` | OK: admin only | OK by design for app roles: no authenticated insert; service-role table insert after `0014` | DENY: append-only | DENY: append-only |
| `app_settings` | DRIFT: admin only; docs still describe non-sensitive reads | DENY: singleton seeded by migration | OK: admin only | DENY: singleton retained |
| `storage.objects` / `hr-documents` | OK: admin all, own role-agnostic, manager report non-sensitive | OK: employee own folder + admin policy; server uploads use service role | OK: admin policy only | OK: admin policy only |

## 4. Could-not-verify

- I did not run migrations, Docker, Supabase, Playwright, `psql`, or any DB writes.
  Findings are static traces over migration/app code, not live repros.
- I could not confirm whether production currently has misassigned
  `employee_records.manager_id`, negative balances, invalid compensation rows, or
  pre-0032 `app_settings` rows. The scenarios describe states the schema permits.
- I inferred final grants/policies from migration order; I did not dump a live
  schema to confirm ownership/default-privilege side effects.
- I did not re-audit every service-role Server Action in this run. Prior
  authz/audit findings about performance service-role writes, audit fail-open,
  and role-change partial commits remain separate from this schema-focused pass.
