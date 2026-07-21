-- KushHR: onboarding_templates and onboarding_tasks with RLS.

-- ─── onboarding_templates ─────────────────────────────────────────────────────

create table public.onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.onboarding_templates enable row level security;
grant select on public.onboarding_templates to authenticated;
grant insert, update, delete on public.onboarding_templates to authenticated;

create index onboarding_templates_active_idx on public.onboarding_templates(is_active);

-- All authenticated users can view active templates.
create policy "authenticated_select_active_templates" on public.onboarding_templates
  for select to authenticated
  using (is_active = true or public.get_user_role() = 'admin');

create policy "admin_manage_templates" on public.onboarding_templates
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');


-- ─── onboarding_tasks ─────────────────────────────────────────────────────────

create table public.onboarding_tasks (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  assignee_id uuid references public.profiles(id) on delete set null, -- who must complete it
  template_id uuid references public.onboarding_templates(id) on delete set null,
  title       text not null,
  description text,
  due_date    date,
  status      public.task_status not null default 'pending',
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.onboarding_tasks enable row level security;
revoke all on public.onboarding_tasks from anon;
grant select, insert, update on public.onboarding_tasks to authenticated;

create index onboarding_tasks_employee_idx  on public.onboarding_tasks(employee_id);
create index onboarding_tasks_assignee_idx  on public.onboarding_tasks(assignee_id);
create index onboarding_tasks_status_idx    on public.onboarding_tasks(status);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: full access.
create policy "admin_all_tasks" on public.onboarding_tasks
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read and complete own tasks (as the employee or the assignee).
create policy "employee_select_own_tasks" on public.onboarding_tasks
  for select to authenticated
  using (
    public.get_user_role() = 'employee'
    and (employee_id = auth.uid() or assignee_id = auth.uid())
  );

-- Employee: mark own tasks complete — only status and completed_at allowed to change.
create policy "employee_complete_own_task" on public.onboarding_tasks
  for update to authenticated
  using (
    public.get_user_role() = 'employee'
    and (employee_id = auth.uid() or assignee_id = auth.uid())
  )
  with check (
    (employee_id = auth.uid() or assignee_id = auth.uid())
    and status = 'completed'
  );

-- Manager: read and assign tasks for direct reports.
create policy "manager_select_tasks" on public.onboarding_tasks
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and (employee_id = auth.uid() or public.is_direct_report(employee_id))
  );

create policy "manager_insert_tasks_for_direct_reports" on public.onboarding_tasks
  for insert to authenticated
  with check (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
  );

create policy "manager_update_tasks_for_direct_reports" on public.onboarding_tasks
  for update to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
  )
  with check (public.is_direct_report(employee_id));
