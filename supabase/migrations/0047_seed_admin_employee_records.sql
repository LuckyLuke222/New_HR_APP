-- 0047_seed_admin_employee_records.sql
-- Backfill: every admin profile gets an `employee_records` row so all
-- employment-rooted aggregates (dashboard headcount, /employees directory,
-- People Directory RPC) include the admin user. Admins are real people who
-- run the platform; absent rows previously made them invisible to those
-- surfaces (UAT new-hire-onboarding F1, 2026-06-01).
--
-- Idempotent: skips any admin who already has an employee_records row.
-- Manager and employee roles are unaffected (createEmployee Server Action
-- continues to own that path).

insert into public.employee_records (
  employee_id, department_id, manager_id, job_title,
  employment_status, employment_type, start_date, created_by
)
select
  p.id,
  null,
  null,
  'Administrator',
  'active',
  'full_time',
  coalesce(p.created_at::date, current_date),
  p.id
from public.profiles p
where p.role = 'admin'
  and not exists (
    select 1 from public.employee_records er where er.employee_id = p.id
  );
