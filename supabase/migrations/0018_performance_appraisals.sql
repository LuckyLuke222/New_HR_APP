-- KushHR: performance goals, review cycles, and appraisals.
-- Mutations are owned by Server Actions so score/feedback edits can be
-- tightly authorized and audited. RLS protects all direct table reads.

-- ─── Enums ───────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'performance_goal_status') then
    create type public.performance_goal_status as enum (
      'not_started',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'performance_cycle_status') then
    create type public.performance_cycle_status as enum (
      'draft',
      'active',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'performance_review_status') then
    create type public.performance_review_status as enum (
      'draft',
      'self_reviewed',
      'manager_submitted',
      'acknowledged'
    );
  end if;
end $$;

-- ─── Review cycles ───────────────────────────────────────────────────────────

create table public.performance_review_cycles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      public.performance_cycle_status not null default 'draft',
  start_date  date not null,
  end_date    date not null,
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint performance_review_cycles_date_order
    check (end_date >= start_date),
  constraint performance_review_cycles_due_order
    check (due_date is null or due_date >= start_date)
);

alter table public.performance_review_cycles enable row level security;
revoke all on public.performance_review_cycles from anon;
grant select on public.performance_review_cycles to authenticated;

create index performance_review_cycles_status_idx on public.performance_review_cycles(status);
create index performance_review_cycles_dates_idx on public.performance_review_cycles(start_date, end_date);

create policy "admin_select_performance_cycles" on public.performance_review_cycles
  for select to authenticated
  using (public.get_user_role() = 'admin');

-- ─── Goals ───────────────────────────────────────────────────────────────────

create table public.performance_goals (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  cycle_id    uuid references public.performance_review_cycles(id) on delete set null,
  title       text not null,
  description text,
  due_date    date,
  status      public.performance_goal_status not null default 'not_started',
  progress    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint performance_goals_progress_range check (progress between 0 and 100)
);

alter table public.performance_goals enable row level security;
revoke all on public.performance_goals from anon;
grant select on public.performance_goals to authenticated;

create index performance_goals_employee_idx on public.performance_goals(employee_id);
create index performance_goals_cycle_idx on public.performance_goals(cycle_id);
create index performance_goals_status_idx on public.performance_goals(status);
create index performance_goals_due_date_idx on public.performance_goals(due_date);

create policy "admin_select_performance_goals" on public.performance_goals
  for select to authenticated
  using (public.get_user_role() = 'admin');

create policy "employee_select_own_performance_goals" on public.performance_goals
  for select to authenticated
  using (employee_id = auth.uid());

create policy "manager_select_direct_report_performance_goals" on public.performance_goals
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
  );

-- ─── Reviews ─────────────────────────────────────────────────────────────────

create table public.performance_reviews (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.profiles(id) on delete restrict,
  manager_id         uuid references public.profiles(id) on delete set null,
  cycle_id           uuid not null references public.performance_review_cycles(id) on delete restrict,
  status             public.performance_review_status not null default 'draft',
  score              integer,
  self_review        text,
  manager_strengths  text,
  manager_improvements text,
  manager_next_steps text,
  submitted_at       timestamptz,
  acknowledged_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_by         uuid references auth.users(id) on delete set null,
  constraint performance_reviews_score_range check (score is null or score between 1 and 5),
  constraint performance_reviews_one_per_employee_cycle unique (employee_id, cycle_id),
  constraint performance_reviews_ack_after_submit
    check (acknowledged_at is null or submitted_at is not null)
);

alter table public.performance_reviews enable row level security;
revoke all on public.performance_reviews from anon;
grant select on public.performance_reviews to authenticated;

create index performance_reviews_employee_idx on public.performance_reviews(employee_id);
create index performance_reviews_manager_idx on public.performance_reviews(manager_id);
create index performance_reviews_cycle_idx on public.performance_reviews(cycle_id);
create index performance_reviews_status_idx on public.performance_reviews(status);

create policy "admin_select_performance_reviews" on public.performance_reviews
  for select to authenticated
  using (public.get_user_role() = 'admin');

create policy "employee_select_own_performance_reviews" on public.performance_reviews
  for select to authenticated
  using (employee_id = auth.uid());

create policy "manager_select_direct_report_performance_reviews" on public.performance_reviews
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
  );

create policy "scoped_select_performance_cycles" on public.performance_review_cycles
  for select to authenticated
  using (
    exists (
      select 1 from public.performance_goals g
      where g.cycle_id = performance_review_cycles.id
        and (
          g.employee_id = auth.uid()
          or public.is_direct_report(g.employee_id)
        )
    )
    or exists (
      select 1 from public.performance_reviews r
      where r.cycle_id = performance_review_cycles.id
        and (
          r.employee_id = auth.uid()
          or public.is_direct_report(r.employee_id)
        )
    )
  );

-- ─── Triggers ────────────────────────────────────────────────────────────────

create trigger set_updated_at before update on public.performance_review_cycles
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.performance_goals
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.performance_reviews
  for each row execute function public.set_updated_at();
