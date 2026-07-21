-- KushHR: payroll_change_requests table with RLS.
-- Employees submit requests to change their own payroll/bank details.
-- Admins review and apply approved changes.
-- Managers: no access (payloads may contain bank/tax data).

create table public.payroll_change_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete restrict,
  request_type    text not null,                     -- e.g. 'bank_details', 'tax_id', 'salary'
  requested_changes jsonb not null default '{}',     -- field/value pairs; may contain sensitive data
  status          public.leave_request_status not null default 'pending',
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  rejection_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null
);

alter table public.payroll_change_requests enable row level security;

revoke all on public.payroll_change_requests from anon;
grant select, insert, update on public.payroll_change_requests to authenticated;

create index payroll_cr_employee_idx on public.payroll_change_requests(employee_id);
create index payroll_cr_status_idx   on public.payroll_change_requests(status);
create index payroll_cr_reviewer_idx on public.payroll_change_requests(reviewed_by);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: read all, update all (approve/reject). No direct delete — preserve audit trail.
create policy "admin_select_payroll_cr" on public.payroll_change_requests
  for select to authenticated
  using (public.get_user_role() = 'admin');

create policy "admin_update_payroll_cr" on public.payroll_change_requests
  for update to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

create policy "admin_insert_payroll_cr" on public.payroll_change_requests
  for insert to authenticated
  with check (public.get_user_role() = 'admin');

-- Employee: read own requests; submit new ones for themselves only.
create policy "employee_select_own_payroll_cr" on public.payroll_change_requests
  for select to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
  );

create policy "employee_insert_own_payroll_cr" on public.payroll_change_requests
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
    and status = 'pending'
  );

-- Employee: cancel own pending requests only (set status to 'cancelled').
create policy "employee_cancel_own_payroll_cr" on public.payroll_change_requests
  for update to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
    and status = 'pending'
  )
  with check (
    employee_id = auth.uid()
    and status = 'cancelled'
  );

-- Managers: no policy = no access.
