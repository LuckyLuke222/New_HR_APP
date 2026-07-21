-- Make leave approval fail visibly when the employee has insufficient balance.
--
-- Migration 0020 raises an exception only when no balance row exists, so an
-- employee with a balance row could still be approved into a negative balance
-- (no CHECK constraint on `leave_balances.balance`, no Server Action pre-check).
-- This migration extends the trigger with a `balance >= v_days` predicate on
-- the UPDATE and distinguishes:
--   - P0001: no balance row for this (employee, leave_type, year)
--   - P0002: balance row exists but would go negative
-- The Server Action maps P0002 to a user-facing "Insufficient leave balance" message.

create or replace function public.handle_leave_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days       integer;
  v_year       integer;
  v_updated    integer;
  v_row_exists boolean;
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
    and year          = v_year
    and balance      >= v_days;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    select exists (
      select 1
      from public.leave_balances
      where employee_id   = new.employee_id
        and leave_type_id = new.leave_type_id
        and year          = v_year
    ) into v_row_exists;

    if v_row_exists then
      raise exception
        'leave_balance_on_approval: insufficient balance for employee=% type=% year=% days=%',
        new.employee_id, new.leave_type_id, v_year, v_days
        using errcode = 'P0002';
    else
      raise exception
        'leave_balance_on_approval: no balance row for employee=% type=% year=%',
        new.employee_id, new.leave_type_id, v_year
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
