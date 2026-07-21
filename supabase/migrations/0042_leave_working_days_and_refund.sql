-- KushHR: working-days leave counting + half-day support + refund-on-cancel.
--
-- Replaces the calendar-days math in handle_leave_approval() (migrations 0019
-- and 0023) with a working_days() function that excludes weekends (Sat+Sun,
-- hardcoded) and active public_holidays (per country, defaults to MU).
--
-- Adds two columns to leave_requests:
--   - is_half_day: single-day half-day requests; 0.5 deducted instead of 1.
--   - deducted_days: frozen at approval time; cancellation refunds from this
--     column so retroactive holiday additions never re-shuffle balances.
--
-- New trigger trg_leave_refund_on_cancel fires when status transitions
-- approved -> cancelled and refunds deducted_days back to balances. Legacy
-- rows approved before this migration have deducted_days = NULL; refund
-- falls back to inclusive-calendar-days so historical refunds match what
-- was originally debited.
--
-- Blast radius: every leave approval flows through handle_leave_approval().
-- Risk-mitigated by (a) preserving the per-year segment loop from 0023, only
-- swapping the day-count formula; (b) legacy-row fallback in the refund
-- path; (c) overlap constraint (0035) untouched.

-- ─── Schema additions ────────────────────────────────────────────────────────

alter table public.leave_requests
  add column if not exists is_half_day boolean not null default false;

alter table public.leave_requests
  add column if not exists deducted_days numeric(6, 2);

alter table public.leave_requests
  drop constraint if exists leave_requests_half_day_single_day;
alter table public.leave_requests
  add constraint leave_requests_half_day_single_day
  check (is_half_day = false or start_date = end_date);

comment on column public.leave_requests.is_half_day is
  'Single-day half-day request. When true, 0.5 days deducted instead of 1; enforced single-day by check constraint.';
comment on column public.leave_requests.deducted_days is
  'Frozen at approval: total days actually debited from leave_balances across all year segments. Refunded verbatim on cancel of approved leave. NULL for legacy rows approved before migration 0042.';

-- ─── working_days() helper ───────────────────────────────────────────────────

create or replace function public.working_days(
  p_start date,
  p_end   date,
  p_country text default 'MU'
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case
      when extract(dow from d) in (0, 6) then 0
      when exists (
        select 1 from public.public_holidays h
        where h.date = d
          and h.country_code = p_country
          and h.is_active = true
      ) then 0
      else 1
    end
  ), 0)::numeric
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as d;
$$;

comment on function public.working_days(date, date, text) is
  'Count of working days in [p_start, p_end] for p_country. Excludes Sat+Sun and active public_holidays. Returns numeric so callers can scale (half-day = 0.5 of one working day).';

-- ─── handle_leave_approval(): now uses working_days() + writes deducted_days ─

create or replace function public.handle_leave_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year         integer;
  v_start_year   integer;
  v_end_year     integer;
  v_segment_from date;
  v_segment_to   date;
  v_days         numeric(6, 2);
  v_total_days   numeric(6, 2) := 0;
  v_updated      integer;
  v_row_exists   boolean;
begin
  -- Only act when status transitions TO 'approved'.
  if old.status = new.status or new.status <> 'approved' then
    return new;
  end if;

  v_start_year := extract(year from new.start_date)::integer;
  v_end_year   := extract(year from new.end_date)::integer;

  for v_year in v_start_year..v_end_year loop
    v_segment_from := greatest(new.start_date, make_date(v_year, 1, 1));
    v_segment_to   := least(new.end_date, make_date(v_year, 12, 31));

    if new.is_half_day then
      -- Single-day by check constraint; entire request is half a working day.
      v_days := 0.5;
    else
      v_days := public.working_days(v_segment_from, v_segment_to);
    end if;

    -- A segment with zero working days is a no-op for balance deduction but
    -- legitimate (e.g. multi-year leave whose entire end-year segment falls on
    -- weekends/holidays). Skip the balance update for that year.
    if v_days = 0 then
      continue;
    end if;

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

    v_total_days := v_total_days + v_days;
  end loop;

  -- Freeze the total at approval. Used by the refund trigger on cancel.
  new.deducted_days := v_total_days;

  return new;
end;
$$;

-- Recreate trigger as BEFORE UPDATE so new.deducted_days persists.
drop trigger if exists trg_leave_balance_on_approval on public.leave_requests;
create trigger trg_leave_balance_on_approval
  before update on public.leave_requests
  for each row
  execute function public.handle_leave_approval();

-- ─── handle_leave_refund(): refund on approved -> cancelled transition ───────

create or replace function public.handle_leave_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year         integer;
  v_start_year   integer;
  v_end_year     integer;
  v_segment_from date;
  v_segment_to   date;
  v_days         numeric(6, 2);
  v_total_legacy numeric(6, 2);
  v_use_legacy   boolean;
  v_updated      integer;
begin
  -- Only refund when an APPROVED leave is being CANCELLED.
  if old.status <> 'approved' or new.status <> 'cancelled' then
    return new;
  end if;

  -- Legacy fallback: rows approved before migration 0042 have deducted_days
  -- NULL and were debited using inclusive calendar-days. Refund the same way
  -- so the balance returns to exactly what it was pre-approval.
  v_use_legacy := old.deducted_days is null;

  v_start_year := extract(year from old.start_date)::integer;
  v_end_year   := extract(year from old.end_date)::integer;

  if v_use_legacy then
    -- Per-year calendar-days refund (mirrors pre-0042 deduction logic).
    for v_year in v_start_year..v_end_year loop
      v_segment_from := greatest(old.start_date, make_date(v_year, 1, 1));
      v_segment_to   := least(old.end_date, make_date(v_year, 12, 31));
      v_days := (v_segment_to - v_segment_from) + 1;

      update public.leave_balances
      set
        balance    = balance + v_days,
        updated_at = now()
      where employee_id   = old.employee_id
        and leave_type_id = old.leave_type_id
        and year          = v_year;

      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise warning
          'leave_refund: no balance row for legacy refund employee=% type=% year=%',
          old.employee_id, old.leave_type_id, v_year;
      end if;
    end loop;
  else
    -- Modern path: refund the per-year working-days split. Single-year and
    -- half-day requests collapse to one iteration of the loop.
    for v_year in v_start_year..v_end_year loop
      v_segment_from := greatest(old.start_date, make_date(v_year, 1, 1));
      v_segment_to   := least(old.end_date, make_date(v_year, 12, 31));

      if old.is_half_day then
        v_days := 0.5;
      else
        v_days := public.working_days(v_segment_from, v_segment_to);
      end if;

      if v_days = 0 then
        continue;
      end if;

      update public.leave_balances
      set
        balance    = balance + v_days,
        updated_at = now()
      where employee_id   = old.employee_id
        and leave_type_id = old.leave_type_id
        and year          = v_year;

      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise warning
          'leave_refund: no balance row for refund employee=% type=% year=%',
          old.employee_id, old.leave_type_id, v_year;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_refund_on_cancel on public.leave_requests;
create trigger trg_leave_refund_on_cancel
  before update on public.leave_requests
  for each row
  execute function public.handle_leave_refund();
