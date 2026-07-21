-- KushHR: employee_records table with RLS.
-- One active record per employee. FK to profiles on delete restrict —
-- employee records must be removed before a profile can be deleted.
-- This migration also adds the manager direct-report SELECT policy on profiles.

-- ─── employee_records ─────────────────────────────────────────────────────────

create table public.employee_records (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null unique references public.profiles(id) on delete restrict,
  department_id     uuid references public.departments(id) on delete restrict,
  manager_id        uuid references public.profiles(id) on delete set null,
  job_title         text,
  employment_status public.employment_status not null default 'active',
  employment_type   public.employment_type,
  start_date        date not null,
  end_date          date,
  work_location     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null
);

alter table public.employee_records enable row level security;

grant select on public.employee_records to authenticated;
grant insert, update, delete on public.employee_records to authenticated;

create index employee_records_employee_idx   on public.employee_records(employee_id);
create index employee_records_manager_idx    on public.employee_records(manager_id);
create index employee_records_department_idx on public.employee_records(department_id);
create index employee_records_status_idx     on public.employee_records(employment_status);

-- ─── Helper: direct-report check ─────────────────────────────────────────────
-- Returns true if target_employee_id is an active direct report of auth.uid().
-- security definer bypasses RLS to avoid infinite recursion.
-- Excludes terminated employees so managers lose scope when reports leave.

create or replace function public.is_direct_report(target_employee_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.employee_records
    where employee_id   = target_employee_id
      and manager_id    = auth.uid()
      and employment_status != 'terminated'
  )
$$;

-- ─── RLS policies: employee_records ──────────────────────────────────────────

-- Admin: full access.
create policy "admin_all_employee_records" on public.employee_records
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read own record only.
create policy "employee_select_own_record" on public.employee_records
  for select to authenticated
  using (employee_id = auth.uid());

-- Manager: read own record + active direct reports.
create policy "manager_select_employee_records" on public.employee_records
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and (employee_id = auth.uid() or public.is_direct_report(employee_id))
  );

-- ─── profiles: add manager direct-report SELECT policy ───────────────────────
-- Now that employee_records exists, managers can SELECT direct-report profiles.
-- This completes the profiles RLS setup started in 0002.

create policy "manager_select_direct_report_profiles" on public.profiles
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(id)
  );
