-- 0045_company_leave_calendar.sql
-- Company-wide approved-leave projection for the cross-role leave calendar.
--
-- Base RLS on public.leave_requests scopes SELECT to:
--   employee -> own rows; manager -> own + direct reports; admin -> all rows.
-- The leave calendar at /leave/calendar needs read-only company-wide visibility
-- of approved leave for all roles. Rather than loosening leave_requests RLS
-- (which would also widen every existing reader), this RPC exposes only the
-- minimal columns needed to render the grid for rows where status = 'approved'.

create or replace function public.get_company_approved_leave(
  p_from date,
  p_to date
)
returns table (
  id uuid,
  employee_id uuid,
  employee_name text,
  leave_type_id uuid,
  leave_type_name text,
  start_date date,
  end_date date,
  is_half_day boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    lr.id,
    lr.employee_id,
    coalesce(p.display_name, p.work_email, 'Unknown') as employee_name,
    lr.leave_type_id,
    coalesce(lt.name, 'Unknown') as leave_type_name,
    lr.start_date,
    lr.end_date,
    lr.is_half_day
  from public.leave_requests lr
  join public.profiles p on p.id = lr.employee_id
  join public.leave_types lt on lt.id = lr.leave_type_id
  where auth.uid() is not null
    and lr.status = 'approved'
    and lr.start_date <= p_to
    and lr.end_date >= p_from
  order by lr.start_date, p.display_name nulls last;
$$;

revoke all on function public.get_company_approved_leave(date, date) from public;
grant execute on function public.get_company_approved_leave(date, date) to authenticated;
