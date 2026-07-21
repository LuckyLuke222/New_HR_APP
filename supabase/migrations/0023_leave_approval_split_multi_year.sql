-- Split approved leave deductions across calendar-year balance rows.
--
-- Migrations 0020/0021 made approval failures visible and prevented negative
-- balances, but still charged the entire request to start_date's year. This
-- version deducts each inclusive date segment from its own leave_balances row.

create or replace function public.handle_leave_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year        integer;
  v_start_year  integer;
  v_end_year    integer;
  v_segment_from date;
  v_segment_to   date;
  v_days        integer;
  v_updated     integer;
  v_row_exists  boolean;
begin
  -- Only act when status transitions TO 'approved'.
  if old.status = new.status or new.status <> 'approved' then
    return new;
  end if;

  v_start_year := extract(year from new.start_date)::integer;
  v_end_year := extract(year from new.end_date)::integer;

  for v_year in v_start_year..v_end_year loop
    v_segment_from := greatest(new.start_date, make_date(v_year, 1, 1));
    v_segment_to := least(new.end_date, make_date(v_year, 12, 31));
    v_days := (v_segment_to - v_segment_from) + 1;

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
  end loop;

  return new;
end;
$$;
