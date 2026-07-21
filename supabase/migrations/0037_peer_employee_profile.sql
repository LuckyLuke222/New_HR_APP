-- 0037_peer_employee_profile.sql
-- Peer-visible single-employee projection.
--
-- Mirrors the get_people_directory pattern (0033): RLS on the base tables
-- restricts employees to their own employee_records row and their own +
-- manager's profile (0031). This SECURITY DEFINER RPC widens that for the
-- specific 5-field peer view exposed when a non-admin / non-manager-of-
-- subject viewer opens /employees/{peer-id}.
--
-- The SELECT list is hard-coded to the 5 allowed peer fields; admins and
-- managers continue to use the existing RLS-scoped DAL path for the full
-- profile. Active employees only.

create or replace function public.get_peer_employee_profile(p_subject_id uuid)
returns table (
  id uuid,
  display_name text,
  work_email text,
  phone text,
  department_id uuid,
  department_name text,
  manager_id uuid,
  manager_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.display_name,
    p.work_email,
    p.phone,
    er.department_id,
    d.name as department_name,
    er.manager_id,
    mp.display_name as manager_name
  from public.profiles p
  join public.employee_records er on er.employee_id = p.id
  left join public.departments d on d.id = er.department_id
  left join public.profiles mp on mp.id = er.manager_id
  where auth.uid() is not null
    and p.id = p_subject_id
    and er.employment_status = 'active';
$$;

revoke all on function public.get_peer_employee_profile(uuid) from public;
grant execute on function public.get_peer_employee_profile(uuid) to authenticated;
