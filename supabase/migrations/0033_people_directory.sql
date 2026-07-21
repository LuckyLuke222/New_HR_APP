-- 0033_people_directory.sql
-- Employee-visible colleague directory projection.
--
-- The base tables remain tightly scoped by RLS:
-- - employees can read only their own employee_records row
-- - employees can read only their own profile plus their manager's profile
--
-- This RPC intentionally exposes a limited active-colleague projection for
-- the People Directory without granting broad SELECT on either base table.

create or replace function public.get_people_directory()
returns table (
  id uuid,
  display_name text,
  job_title text,
  department_name text,
  work_email text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    er.job_title,
    d.name as department_name,
    p.work_email
  from public.profiles p
  join public.employee_records er on er.employee_id = p.id
  left join public.departments d on d.id = er.department_id
  where auth.uid() is not null
    and er.employment_status = 'active'
  order by p.display_name nulls last, p.work_email nulls last;
$$;

revoke all on function public.get_people_directory() from public;
grant execute on function public.get_people_directory() to authenticated;
