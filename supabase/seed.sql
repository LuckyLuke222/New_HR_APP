-- KushHR seed data — local development and demo only.
-- Never run in production. Apply with: supabase db reset
--
-- Demo accounts (password: TestPass123! for all):
--   admin@kushhr.dev    → Admin
--   manager@kushhr.dev  → Manager (Engineering Lead)
--   alice@kushhr.dev    → Employee (Software Engineer, direct report of manager)
--   bob@kushhr.dev      → Employee (Operations Coordinator)

-- pgcrypto is required for crypt() password hashing.
create extension if not exists pgcrypto;

do $$
declare
  v_admin_id   uuid := 'a0000000-0000-0000-0000-000000000001';
  v_manager_id uuid := 'b0000000-0000-0000-0000-000000000002';
  v_alice_id   uuid := 'c0000000-0000-0000-0000-000000000003';
  v_bob_id     uuid := 'd0000000-0000-0000-0000-000000000004';
  v_dept_eng   uuid := 'e0000000-0000-0000-0000-000000000001';
  v_dept_ops   uuid := 'e0000000-0000-0000-0000-000000000002';
  v_instance   uuid := '00000000-0000-0000-0000-000000000000';
begin

  -- ── Auth users ──────────────────────────────────────────────────────────────
  -- Inserting here fires the handle_new_user trigger which auto-creates profiles
  -- with role='employee'. We then UPDATE roles below for admin and manager.

  insert into auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin
  ) values
    (v_instance, v_admin_id,   'authenticated', 'authenticated',
     'admin@kushhr.dev',   crypt('TestPass123!', gen_salt('bf')),
     now(), now(), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Alex Admin","email_verified":true}', false),

    (v_instance, v_manager_id, 'authenticated', 'authenticated',
     'manager@kushhr.dev', crypt('TestPass123!', gen_salt('bf')),
     now(), now(), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Morgan Manager","email_verified":true}', false),

    (v_instance, v_alice_id,   'authenticated', 'authenticated',
     'alice@kushhr.dev',   crypt('TestPass123!', gen_salt('bf')),
     now(), now(), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Alice Employee","email_verified":true}', false),

    (v_instance, v_bob_id,     'authenticated', 'authenticated',
     'bob@kushhr.dev',     crypt('TestPass123!', gen_salt('bf')),
     now(), now(), now(),
     '', '', '', '', '', '', '', '',
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Bob Employee","email_verified":true}', false)

  on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values
    (gen_random_uuid(), v_admin_id::text, v_admin_id,
     jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@kushhr.dev', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now()),
    (gen_random_uuid(), v_manager_id::text, v_manager_id,
     jsonb_build_object('sub', v_manager_id::text, 'email', 'manager@kushhr.dev', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now()),
    (gen_random_uuid(), v_alice_id::text, v_alice_id,
     jsonb_build_object('sub', v_alice_id::text, 'email', 'alice@kushhr.dev', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now()),
    (gen_random_uuid(), v_bob_id::text, v_bob_id,
     jsonb_build_object('sub', v_bob_id::text, 'email', 'bob@kushhr.dev', 'email_verified', true, 'phone_verified', false),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  -- ── Elevate roles (trigger created all profiles as 'employee') ───────────────
  -- sync_role_to_jwt trigger also fires here, updating raw_app_meta_data in auth.users.

  update public.profiles set role = 'admin'   where id = v_admin_id;
  update public.profiles set role = 'manager' where id = v_manager_id;

  -- Ensure display names and work emails are set correctly for all users.
  update public.profiles set
    display_name = 'Alex Admin',      work_email = 'admin@kushhr.dev'
  where id = v_admin_id;

  update public.profiles set
    display_name = 'Morgan Manager',  work_email = 'manager@kushhr.dev'
  where id = v_manager_id;

  update public.profiles set
    display_name = 'Alice Employee',  work_email = 'alice@kushhr.dev'
  where id = v_alice_id;

  update public.profiles set
    display_name = 'Bob Employee',    work_email = 'bob@kushhr.dev'
  where id = v_bob_id;

  -- ── Departments ─────────────────────────────────────────────────────────────

  insert into public.departments (id, name, manager_id, created_by) values
    (v_dept_eng, 'Engineering', v_manager_id, v_admin_id),
    (v_dept_ops, 'Operations',  null,         v_admin_id)
  on conflict (id) do nothing;

  -- ── Employee records ─────────────────────────────────────────────────────────
  -- admin has a record so the dashboard headcount + /employees directory
  -- include the admin user (UAT new-hire-onboarding B1, 2026-06-01).
  -- manager has a record (they're an employee too), no manager above them.
  -- alice is a direct report of manager → tests manager scope.
  -- bob is in Operations with no manager → tests no-manager case.

  insert into public.employee_records (
    employee_id, department_id, manager_id,
    job_title, employment_status, employment_type, start_date, created_by
  ) values
    (v_admin_id,   null,       null,         'Administrator',           'active', 'full_time', '2024-01-01', v_admin_id),
    (v_manager_id, v_dept_eng, null,         'Engineering Lead',        'active', 'full_time', '2024-01-15', v_admin_id),
    (v_alice_id,   v_dept_eng, v_manager_id, 'Software Engineer',       'active', 'full_time', '2024-03-01', v_admin_id),
    (v_bob_id,     v_dept_ops, null,         'Operations Coordinator',  'active', 'full_time', '2024-06-01', v_admin_id)
  on conflict (employee_id) do nothing;

  -- ── Leave types ──────────────────────────────────────────────────────────────

  insert into public.leave_types (name, description, is_active, created_by) values
    ('Local Leave',   'Paid local/annual leave: 22 days/year (includes 3 urgent days).', true,  v_admin_id),
    ('Sick Leave',    'Paid sick leave: 15 days/year.',                                  true,  v_admin_id),
    ('Unpaid Leave',  'Approved leave without pay (legacy; not granted by default).',    false, v_admin_id)
  on conflict (name) do nothing;

  -- ── Leave balances (current year, v1 Mauritius defaults) ────────────────────

  insert into public.leave_balances (employee_id, leave_type_id, balance, year, created_by)
  select
    emp.id,
    lt.id,
    case lt.name
      when 'Local Leave' then 22
      when 'Sick Leave'  then 15
      else 0
    end,
    extract(year from now())::int,
    v_admin_id
  from
    (values (v_manager_id), (v_alice_id), (v_bob_id)) as emp(id),
    public.leave_types lt
  where lt.name in ('Local Leave', 'Sick Leave')
  on conflict (employee_id, leave_type_id, year) do nothing;

  -- ── Onboarding template ──────────────────────────────────────────────────────

  insert into public.onboarding_templates (name, description, is_active, created_by) values
    ('Standard Onboarding', 'Default checklist for new hires', true, v_admin_id)
  on conflict (name) do nothing;

end $$;
