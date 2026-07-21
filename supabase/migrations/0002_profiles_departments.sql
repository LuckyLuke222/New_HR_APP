-- KushHR: profiles and departments tables with RLS.
-- profiles.id = auth.users.id (1-to-1 with Supabase Auth).
-- Rows are created automatically by the handle_new_user trigger (0011).

-- ─── profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete restrict,
  role         public.user_role not null default 'employee',
  display_name text,
  work_email   text unique,
  phone        text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Grant: authenticated users only. No anon access to HR data.
grant select, update on public.profiles to authenticated;

-- Helper: returns the calling user's role from the profiles table.
-- security definer runs as the function owner (postgres), bypassing RLS
-- to avoid infinite recursion. stable = safe to cache per query.
create or replace function public.get_user_role()
returns public.user_role
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Indexes
create index profiles_role_idx on public.profiles(role);
create index profiles_work_email_idx on public.profiles(work_email);

-- ─── RLS policies: profiles ───────────────────────────────────────────────────

-- Admin: full access to all profiles.
create policy "admin_all_profiles" on public.profiles
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read own profile.
create policy "employee_select_own_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Employee: update own profile — with check prevents role self-escalation.
create policy "employee_update_own_profile" on public.profiles
  for update to authenticated
  using  (id = auth.uid() and public.get_user_role() = 'employee')
  with check (id = auth.uid() and role = 'employee');

-- Manager: read own profile + direct reports. Policy added in 0003 after
-- employee_records exists. The policy below covers the manager's own row.
create policy "manager_select_own_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() and public.get_user_role() = 'manager');

create policy "manager_update_own_profile" on public.profiles
  for update to authenticated
  using  (id = auth.uid() and public.get_user_role() = 'manager')
  with check (id = auth.uid() and role = 'manager');


-- ─── departments ──────────────────────────────────────────────────────────────

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  parent_id  uuid references public.departments(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.departments enable row level security;

grant select on public.departments to authenticated;
grant insert, update, delete on public.departments to authenticated;

create index departments_manager_idx on public.departments(manager_id);

-- ─── RLS policies: departments ────────────────────────────────────────────────

-- All authenticated users can view departments (employee directory).
create policy "authenticated_select_departments" on public.departments
  for select to authenticated
  using (auth.uid() is not null);

-- Only admins can create, edit, or delete departments.
create policy "admin_manage_departments" on public.departments
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');
