-- 0046_profile_display_names_rpc.sql
-- Security-definer projection of profiles.display_name for arbitrary user ids.
--
-- Base RLS on public.profiles scopes SELECT to:
--   employee -> own row + manager's row; manager -> own + direct reports; admin -> all.
-- Several read paths (e.g. /documents uploader column) need to resolve a display
-- name for a user the caller cannot SELECT via RLS — most commonly an admin who
-- uploaded a document on the employee's behalf. Rather than widening profiles
-- RLS (which would also widen every other reader), this RPC exposes only the
-- minimal name projection needed for those joins. Mirrors the pattern of
-- get_people_directory (0033) and get_company_approved_leave (0045).
--
-- Disclosure surface: any authenticated caller can resolve display_name (or
-- work_email fallback) for any profile id they pass. This is no broader than
-- get_people_directory, which already lists every active employee's name +
-- email to every authenticated user; this RPC additionally covers users
-- without an employee_records row (e.g. the admin profile) because uploader
-- name resolution needs them.

create or replace function public.get_profile_display_names(p_ids uuid[])
returns table (id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    coalesce(p.display_name, p.work_email, 'Unknown') as display_name
  from public.profiles p
  where p.id = any(p_ids)
    and auth.uid() is not null;
$$;

revoke all on function public.get_profile_display_names(uuid[]) from public;
grant execute on function public.get_profile_display_names(uuid[]) to authenticated;
