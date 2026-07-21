# Database Design

KushHR uses Supabase Postgres with RLS enabled on every application table. See `docs/rls-policy-map.md` for the full policy-per-table-per-role breakdown.

## Migration File Structure

Numbered files under `supabase/migrations/`. Each file creates one logical group plus its RLS and indexes, so schema and authorization are always in sync.

| File | Contents |
|------|----------|
| `0001_enums.sql` | All custom enum types |
| `0002_profiles_departments.sql` | `profiles`, `departments`, RLS, indexes |
| `0003_employee_records.sql` | `employee_records`, RLS, indexes |
| `0004_employee_compensation.sql` | `employee_compensation`, RLS, indexes |
| `0005_payroll_change_requests.sql` | `payroll_change_requests`, RLS, indexes — **dropped in 0048** |
| `0006_leave.sql` | `leave_types`, `leave_balances`, `leave_requests`, RLS, indexes |
| `0007_documents.sql` | `documents`, RLS, indexes |
| `0008_onboarding.sql` | `onboarding_templates`, `onboarding_tasks`, RLS, indexes |
| `0009_audit_logs.sql` | `audit_logs`, RLS (admin-read, append-only) |
| `0010_app_settings.sql` | `app_settings`, RLS |
| `0011_triggers.sql` | `set_updated_at()`, `handle_new_user()` on `auth.users` |
| `0012_audit_helper.sql` | `insert_audit_log()` security-definer function |
| `0013_role_sync.sql` | Role mirror trigger → `app_metadata` for JWT claims |
| `0014_phase5_security_hardening.sql` | Audit, compensation, profile grant, and document policy hardening |
| `0015_storage_documents.sql` | Private `hr-documents` bucket and Storage RLS |
| `0016_onboarding_template_items.sql` | Template item support for onboarding templates |
| `0017_onboarding_task_update_hardening.sql` | Tightens direct updates to onboarding tasks |
| `0018_performance_appraisals.sql` | Performance goals, review cycles, reviews, RLS, indexes |
| `0027_compensation_passport_nationality.sql` | Adds `passport_number` and `nationality` to `employee_compensation` (admin-only via existing RLS) |
| `0028_localize_leave_taxonomy.sql` | Renames `Annual Leave` → `Local Leave`; refreshes Sick Leave description; deactivates `Unpaid Leave` (rows preserved) |
| `0029_document_upload_policy.sql` | Tightens `hr-documents` bucket max object size to 10 MiB and aligns its MIME allowlist with the category upload policy |
| `0030_urgent_local_leave_fields.sql` | Adds urgent Local Leave flag/reason fields to `leave_requests` with a bounded reason check |
| `0033_people_directory.sql` | Adds `get_people_directory()` security-definer RPC for the employee-visible People Directory projection |
| `0034_leave_balance_adjustment_provenance.sql` | Adds `adjustment_reason` / `adjusted_at` / `adjusted_by` to `leave_balances` to record manual admin overrides |
| `0035_leave_overlap_constraint.sql` | Adds EXCLUDE USING gist constraint on `leave_requests` (per-employee, partial on `status IN ('pending','approved')`) to reject overlapping date ranges. Defense in depth for B1/F1. |
| `0037_peer_employee_profile.sql` | Adds `get_peer_employee_profile(uuid)` security-definer RPC returning a 5-field projection (display_name, work_email, phone, department_name, manager_id+manager_name) used by the B7 peer-view code path on `/employees/[id]` for active employees only. |
| `0040_public_holidays.sql` | `public_holidays` table (date, name, country_code, is_active, is_tentative). Admin-only writes; authenticated reads. Unique partial index `(date, country_code, name) where is_active` lets two distinct holidays share a calendar date (e.g. 2026-02-01 Mauritius). |
| `0041_seed_mauritius_public_holidays.sql` | Seeds 30 Mauritius public holidays across 2026 + 2027. Eid dates marked `is_tentative = true` pending moon-sighting confirmation. |
| `0042_leave_working_days_and_refund.sql` | Adds `leave_requests.is_half_day` (single-day only via check constraint) and `leave_requests.deducted_days numeric(6,2)` (frozen at approval). New `working_days(date, date, text)` SQL function excludes Sat+Sun and active `public_holidays`. Replaces `handle_leave_approval()` (now BEFORE UPDATE so it can write `new.deducted_days`) to use working-days math + write the frozen total. Adds `handle_leave_refund()` BEFORE UPDATE trigger that refunds `deducted_days` per-year on approved→cancelled, with a calendar-days fallback for legacy rows whose `deducted_days IS NULL`. |

Seed data lives in `supabase/seed.sql`, not in a migration. The Supabase CLI runs it separately via `supabase db reset`.

## Enums

| Enum | Values |
|------|--------|
| `user_role` | `admin`, `manager`, `employee` |
| `employment_status` | `active`, `inactive`, `terminated` |
| `employment_type` | `full_time`, `part_time`, `contractor`, `intern` |
| `leave_request_status` | `pending`, `approved`, `rejected`, `cancelled` |
| `document_category` | `contract`, `id_document`, `payslip`, `policy`, `other` |
| `pay_frequency` | `monthly`, `weekly`, `hourly` |
| `task_status` | `pending`, `completed` |
| `performance_goal_status` | `not_started`, `in_progress`, `completed`, `cancelled` |
| `performance_cycle_status` | `draft`, `active`, `closed` |
| `performance_review_status` | `draft`, `self_reviewed`, `manager_submitted`, `acknowledged` |

## Common Fields

Apply to all tables where appropriate:

```sql
id           uuid primary key default gen_random_uuid()
created_at   timestamptz not null default now()
updated_at   timestamptz not null default now()
created_by   uuid references auth.users
updated_by   uuid references auth.users
```

## Tables

### `profiles`
Identity-adjacent row linked to `auth.users`. Created automatically by `handle_new_user` trigger on sign-up.

Fields: user id, role (`user_role`), display name, work email, basic contact fields, active/inactive state.

Sensitive-data note: no bank, tax, national ID, salary, or payroll fields here.

Employee colleague directory note: employees still do not get broad `profiles`
SELECT. The People Directory uses `get_people_directory()` to expose only active
colleagues' `id`, display name, job title, department name, and work email.

Peer profile note (B7, migration 0037): when an employee opens
`/employees/{peer-id}` for a colleague they neither manage nor are managed by,
the page falls back to `get_peer_employee_profile(uuid)` and renders a strict
5-field peer view: display_name, department, manager (linked), work_email,
work_phone. All other profile facts (role, employment status, timeline,
documents, leave, audit) stay hidden. Admin / manager-of-subject / self
viewers continue through the existing RLS-scoped DAL.

### `departments`
Fields: name, optional parent department, optional manager profile reference.

### `employee_records`
Employment details and manager relationship.

Fields: employee profile reference, department reference, manager profile reference, job title, employment status, employment type, start/end dates, work location.

FK rules: `department_id` uses `on delete restrict` (must reassign employees before department delete). `profile_id` FK delete behavior must be decided before Phase 3 ships — document in this file.

Employee colleague directory note: employees still do not get broad
`employee_records` SELECT. The People Directory projection filters to active
records and does not expose manager id, employment status/type, dates, or work
location.

Admin row note (migration `0047`, 2026-06-01): admin profiles also get an
`employee_records` row (Administrator job title, null department, null
manager) so every employment-rooted aggregate — dashboard headcount,
`/employees` directory, People Directory RPC — includes the admin user.
`getEmployeesNeedingAttention` skips role=admin so admin doesn't surface as
missing-manager/missing-department. The admin-dashboard "Unrouted pending
leave" + "Action items" panels filter admin's own leave back out at the read
layer (`getAdminDashboardData`) because admin has no upline by design.

### `employee_compensation`
Compensation record. Access reshaped in migrations 0049 + 0050 (2026-06-02):

- **Admin**: full read/write via service-role.
- **Employee**: read own row (full), update own row restricted by column grant
  to `bank_name, bank_account_holder, bank_account_number, tax_id, national_id,
  passport_number, nationality`. Salary, currency, pay frequency, effective
  date, and notes are admin-only writes (physically unwritable on the
  session-client).
- **Manager**: NO base-table SELECT for direct-report rows. Manager scope on
  direct reports is enforced exclusively by SECURITY DEFINER RPC
  `public.get_direct_report_compensation_summaries()` (migration 0050), which
  returns only `(employee_id, employee_name, salary_amount, salary_currency,
  pay_frequency, effective_date)`. Bank, tax, national-id, passport, and notes
  are not in the return type and cannot leak to a manager session. Manager can
  still read their own row via the role-agnostic `employee_select_own_compensation`
  policy.

Fields: employee reference, salary amount, salary currency, pay frequency, bank name, bank account holder, bank account number (store masked or encrypted), tax ID, national ID, passport number, nationality, effective date, compensation notes.

### `payroll_change_requests` *(dropped in migration 0048)*
Historical employee-submitted change-request table. Retired 2026-06-02 in favour
of direct employee self-service (see `employee_compensation` above). Past
`change_request.*` audit_logs rows remain queryable — `audit_logs.entity_id` is
not FK-linked so dropping the table does not orphan the audit trail.

### `leave_types`
Admin-managed leave categories. Fields: name, description, active flag.

### `leave_balances`
Manually managed in v1. Fields: employee reference, leave type reference, balance amount, period/year.

### `leave_requests`
Fields: employee reference, leave type reference, start/end dates, status (`leave_request_status`), approver reference, decision timestamp, employee/approver comments, urgent Local Leave flag, urgent Local Leave reason, `is_half_day` boolean (migration 0042 — single-day only via check constraint; 0.5 day deducted), `deducted_days numeric(6,2)` (migration 0042 — frozen at approval; cancel-of-approved refunds this exact value, legacy rows pre-0042 fall back to calendar-days math).

### `public_holidays`
Admin-managed list of dates excluded from leave-day counting. Fields: `date`, `name`, `country_code` (default `'MU'`), `is_active`, `is_tentative` (for lunar holidays awaiting gazette confirmation). Read by `working_days()` SQL function during leave approval + by the request-form preview. Unique partial index `(date, country_code, name) where is_active` allows two distinct holidays on the same calendar date (e.g. Mauritius 2026-02-01: Abolition of Slavery + Thaipoosam Cavadee).

Urgent Local Leave is request context only: `leave_requests.is_urgent_local_leave` + `urgent_leave_reason` preserve the employee's justification for approvers. `leave_balances` remains the single owner of allowance/balance amounts, including the 22-day Local Leave allowance that contains the 3 urgent days.

**Overlap constraint (migration 0035).** `leave_requests_no_overlap` is an EXCLUDE USING gist constraint that rejects two rows for the same `employee_id` whose `daterange(start_date, end_date, '[]')` overlaps, scoped via a partial predicate to `status IN ('pending','approved')`. `rejected` and `cancelled` requests do not lock dates. Violations raise SQLSTATE 23P01, which the leave Server Actions translate to a user-facing message. Action-layer overlap pre-checks in `submitLeaveRequest` / `approveLeaveRequest` provide the primary user feedback; the DB constraint is the race-safety floor.

### `documents`
Metadata for files stored in private Supabase Storage.

Fields: subject employee, uploader, category (`document_category`), storage bucket/path, visibility/share state, deleted timestamp.

Payslips use category `payslip` and are uploaded by admins only.

File policy: upload validation is enforced in `src/server/actions/documents.ts` before Storage write. Category-specific limits are `contract` = PDF/DOC/DOCX, `id_document` = PDF/JPG/PNG, `payslip` = PDF only, `policy` = PDF only, `other` = PDF/DOC/DOCX/JPG/PNG/TXT; every category is capped at 10 MiB. The bucket-level MIME allowlist is the union of those types because Supabase Storage bucket settings are not category-specific.

### `onboarding_templates`
Reusable task lists. Fields: name, description, active flag.

### `onboarding_tasks`
Assigned tasks for employees.

Fields: employee reference, assignee reference, template reference (optional), title, due date, status (`task_status`).

### `performance_review_cycles`
Admin-managed appraisal windows.

Fields: title, description, status (`performance_cycle_status`), start date, end date, due date, optional `submission_deadline` (date) + `submission_lock_enabled` (boolean, default `false`, migration 0038), created_by.

Rules: admins create and activate cycles. Managers and employees can view active cycles only when they have related goals/reviews. Closing a cycle prevents new manager submissions unless reopened by admin. **Codex update (2026-05-26):** When `submission_lock_enabled = true` and `submission_deadline` is in the past according to `app_settings.timezone`, Server Actions reject authored changes and reopens against the cycle with `auth.access_denied` + `reason="deadline_passed"`. Employee acknowledgment of an already-submitted appraisal remains available and audited because it records receipt rather than changing review content. This remains distinct from `status='closed'` (closed = archived; deadline-locked = authored content frozen but still readable). Check constraint: `submission_deadline IS NULL OR submission_deadline >= start_date`.

### `performance_goals`
Employee goals set by admins or managers.

Fields: employee reference, creator reference, title, description, due date, status (`performance_goal_status`), progress percentage (`0`-`100`), optional employee progress note, employee progress updated timestamp, optional review cycle reference.

Rules: admins can create goals for anyone; managers can create and update goals for direct reports; employees can view own goals and update only their own progress percentage, progress note, and completion state through the audited employee progress action. Employees cannot create goals or edit manager-owned title/description/due-date/cycle fields.

### `performance_reviews`
Simple appraisal record for one employee in one cycle.

Fields: employee reference, manager reference, cycle reference, status (`performance_review_status`), score integer (`1`-`5`), self-review comment, manager strengths, improvement areas, next steps, submitted timestamp, acknowledged timestamp.

Rules: one review per employee per cycle. Managers submit appraisals for direct reports only. Employees can add self-review comments before manager submission and acknowledge after manager submission. Admins can view all and reopen/correct records only through audited admin actions.

Sensitive-data note: appraisals are private HR data. Do not store compensation decisions, salary recommendations, bank/tax data, or disciplinary legal notes in these tables.

### `audit_logs`
Append-only. No UPDATE or DELETE policy for any role including admin.

Fields: actor (user id), action (text), entity (table name), entity id, metadata (jsonb), created timestamp.

All inserts go through `insert_audit_log()` with `security definer`. No role may insert directly.

### `app_settings`
Fields: setting key, value, description.

## Trigger Conventions

### `set_updated_at()`
Defined once, applied per table:
```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger set_updated_at before update on public.<table>
  for each row execute function public.set_updated_at();
```

### `handle_new_user()`
Creates a `profiles` row on Supabase Auth sign-up so every authenticated user always has a profile row:
```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, display_name, work_email)
  values (new.id, 'employee', new.raw_user_meta_data->>'full_name', new.email);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

### `sync_role_to_jwt()`
Mirrors `profiles.role` to `app_metadata` so RLS policies can use `(auth.jwt() ->> 'role')::user_role` without a cross-table join on every query:
```sql
create or replace function public.sync_role_to_jwt()
returns trigger language plpgsql security definer as $$
begin
  update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', new.role)
  where id = new.id;
  return new;
end; $$;

create trigger sync_role_after_update after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_jwt();
```

## Audit Log Helper

Called explicitly from Server Actions — not via table triggers:
```sql
create or replace function public.insert_audit_log(
  p_actor uuid, p_action text, p_entity text, p_entity_id uuid,
  p_metadata jsonb default '{}'
) returns void language plpgsql security definer as $$
begin
  insert into public.audit_logs (actor, action, entity, entity_id, metadata)
  values (p_actor, p_action, p_entity, p_entity_id, p_metadata);
end; $$;
```

Treat this function's signature as a stable internal API. Any change requires updating all call sites.

## Migration Rules

- Enable RLS in the same migration that creates a table.
- Add policies before exposing any UI or API access.
- Add indexes for every column referenced in RLS policies.
- Keep sensitive payroll, bank, tax, and national ID fields in `employee_compensation` only.
- Seed data goes in `supabase/seed.sql`, not in a migration.
