-- KushHR: leave_types, leave_balances, and leave_requests tables with RLS.
-- Leave balances are manually managed by admins in v1 (no accrual automation).

-- ─── leave_types ──────────────────────────────────────────────────────────────

create table public.leave_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  description text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.leave_types enable row level security;
grant select on public.leave_types to authenticated;
grant insert, update, delete on public.leave_types to authenticated;

create index leave_types_active_idx on public.leave_types(is_active);

-- All authenticated users can view active leave types.
create policy "authenticated_select_active_leave_types" on public.leave_types
  for select to authenticated
  using (is_active = true or public.get_user_role() = 'admin');

create policy "admin_manage_leave_types" on public.leave_types
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');


-- ─── leave_balances ───────────────────────────────────────────────────────────

create table public.leave_balances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  balance       numeric(6, 2) not null default 0,
  year          int not null default extract(year from now())::int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  unique (employee_id, leave_type_id, year)
);

alter table public.leave_balances enable row level security;
revoke all on public.leave_balances from anon;
grant select on public.leave_balances to authenticated;
grant insert, update, delete on public.leave_balances to authenticated;

create index leave_balances_employee_idx on public.leave_balances(employee_id);
create index leave_balances_type_idx     on public.leave_balances(leave_type_id);

create policy "admin_all_leave_balances" on public.leave_balances
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

create policy "employee_select_own_balance" on public.leave_balances
  for select to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
  );

create policy "manager_select_direct_report_balances" on public.leave_balances
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and (employee_id = auth.uid() or public.is_direct_report(employee_id))
  );


-- ─── leave_requests ───────────────────────────────────────────────────────────

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.profiles(id) on delete restrict,
  leave_type_id   uuid not null references public.leave_types(id) on delete restrict,
  start_date      date not null,
  end_date        date not null,
  status          public.leave_request_status not null default 'pending',
  approver_id     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  employee_note   text,
  approver_note   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  constraint leave_dates_valid check (end_date >= start_date)
);

alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon;
grant select, insert, update on public.leave_requests to authenticated;

create index leave_requests_employee_idx on public.leave_requests(employee_id);
create index leave_requests_status_idx   on public.leave_requests(status);
create index leave_requests_dates_idx    on public.leave_requests(start_date, end_date);
create index leave_requests_approver_idx on public.leave_requests(approver_id);

-- Admin: full access.
create policy "admin_all_leave_requests" on public.leave_requests
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read own; submit own; cancel own pending.
-- Cannot approve own leave (approver_id must differ from employee_id — enforced in Server Action).
create policy "employee_select_own_leave" on public.leave_requests
  for select to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
  );

create policy "employee_insert_own_leave" on public.leave_requests
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
    and status = 'pending'
  );

-- Employee cancel: can only move own pending request to cancelled.
create policy "employee_cancel_own_leave" on public.leave_requests
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

-- Manager: read direct reports; approve/reject direct reports.
create policy "manager_select_leave_requests" on public.leave_requests
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and (employee_id = auth.uid() or public.is_direct_report(employee_id))
  );

-- Manager approve/reject: only status, approver_id, approved_at, approver_note columns
-- changed; enforced by Server Action. RLS here scopes to direct reports.
create policy "manager_update_direct_report_leave" on public.leave_requests
  for update to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
    and status = 'pending'
  )
  with check (
    public.is_direct_report(employee_id)
    and status in ('approved', 'rejected')
    -- Server Action must also verify approver_id != employee_id
  );
