-- KushHR: onboarding_template_items — task definitions within reusable onboarding templates.
-- Referenced by onboarding_tasks.template_id (soft link — tasks keep the template label even if items change).

create table public.onboarding_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  title       text not null,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

alter table public.onboarding_template_items enable row level security;

grant select on public.onboarding_template_items to authenticated;
grant insert, delete on public.onboarding_template_items to authenticated;

create index onboarding_template_items_template_idx on public.onboarding_template_items(template_id);

-- Admin: full access.
create policy "admin_all_template_items" on public.onboarding_template_items
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- All authenticated: read items for active templates (so managers and employees can preview).
create policy "authenticated_select_template_items" on public.onboarding_template_items
  for select to authenticated
  using (
    exists (
      select 1 from public.onboarding_templates t
      where t.id = template_id
        and (t.is_active = true or public.get_user_role() = 'admin')
    )
  );
