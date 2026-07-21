-- Automatically decrement leave_balances when a leave request is approved.
-- The trigger fires AFTER UPDATE on leave_requests whenever status transitions
-- to 'approved'. It decrements the balance row matching employee, type, and year
-- by the calendar-day count of the approved request.
--
-- SECURITY DEFINER: the UPDATE on leave_balances must bypass RLS since the
-- approving user (manager/admin) does not have an INSERT/UPDATE policy on
-- leave_balances. Running as the function owner (postgres) is safe here because
-- the trigger condition is tightly scoped to the approved-status transition.

create or replace function public.handle_leave_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_year integer;
  v_updated integer;
begin
  -- Only act when status transitions TO 'approved'.
  if old.status = new.status or new.status <> 'approved' then
    return new;
  end if;

  v_days := (new.end_date - new.start_date) + 1;
  v_year := extract(year from new.start_date)::integer;

  update public.leave_balances
  set
    balance    = balance - v_days,
    updated_at = now()
  where employee_id   = new.employee_id
    and leave_type_id = new.leave_type_id
    and year          = v_year;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise warning
      'leave_balance_on_approval: no balance row for employee=% type=% year=% — balance not decremented',
      new.employee_id, new.leave_type_id, v_year;
  end if;

  return new;
end;
$$;

create trigger trg_leave_balance_on_approval
  after update on public.leave_requests
  for each row
  execute function public.handle_leave_approval();
