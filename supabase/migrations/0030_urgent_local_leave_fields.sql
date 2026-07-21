-- KushHR Phase 13: capture urgent Local Leave justification on leave requests.
--
-- Local Leave includes 3 urgent days within the annual allowance. The balance
-- remains owned by leave_balances and is still decremented by the approval
-- trigger; these columns only preserve the employee's request context for
-- approvers and audit review.

alter table public.leave_requests
  add column if not exists is_urgent_local_leave boolean not null default false,
  add column if not exists urgent_leave_reason text;

alter table public.leave_requests
  drop constraint if exists urgent_local_leave_reason_required;

alter table public.leave_requests
  add constraint urgent_local_leave_reason_required
  check (
    (
      is_urgent_local_leave = false
      and urgent_leave_reason is null
    )
    or (
      is_urgent_local_leave = true
      and length(btrim(coalesce(urgent_leave_reason, ''))) between 1 and 500
    )
  );

comment on column public.leave_requests.is_urgent_local_leave is
  'True when the employee flags a Local Leave request as one of the urgent-day allowance requests.';

comment on column public.leave_requests.urgent_leave_reason is
  'Required justification when is_urgent_local_leave is true. Limited to 500 characters by urgent_local_leave_reason_required.';
