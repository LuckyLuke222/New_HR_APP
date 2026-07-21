-- 0031_employee_select_own_manager_profile.sql
-- Allow an employee to read the profile row of their own assigned manager.
--
-- Why: the employee self-view (/employees/[id]) renders "Manager: <name>".
-- The DAL projects manager_id from employee_records and then joins to
-- profiles via the RLS-scoped client. Existing profiles SELECT policies
-- grant employees access only to their own row, so the manager join
-- returned no row and the Manager field rendered as "Not set" — while
-- admins and the manager themselves saw it populated.
--
-- Scope: SELECT only; restricted to the profile whose id equals the
-- caller's employee_records.manager_id (and only while the employee is
-- not terminated). Implemented via a SECURITY DEFINER helper to avoid
-- recursive RLS on profiles.

create or replace function public.is_own_manager(target_profile_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.employee_records
    where employee_id   = auth.uid()
      and manager_id    = target_profile_id
      and employment_status != 'terminated'
  )
$$;

create policy "employee_select_own_manager_profile" on public.profiles
  for select to authenticated
  using (public.is_own_manager(id));
