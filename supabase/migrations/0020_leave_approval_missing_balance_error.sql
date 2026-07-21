-- Make leave approval fail visibly when no matching balance row exists.
--
-- The previous trigger raised only a warning, so the request could become
-- approved while the leave balance stayed unchanged. Raising an exception
-- rolls back the approval update and lets the Server Action return an error.

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
    raise exception
      'leave_balance_on_approval: no balance row for employee=% type=% year=%',
      new.employee_id, new.leave_type_id, v_year
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
