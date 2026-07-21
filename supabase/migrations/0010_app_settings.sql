-- KushHR: app_settings — admin-managed key-value store for application config.

create table public.app_settings (
  id          uuid primary key default gen_random_uuid(),
  category    text not null default 'general',
  key         text not null,
  value       text,
  description text,
  is_sensitive boolean not null default false, -- sensitive settings hidden from non-admin select
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  unique (category, key)
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon;
grant select, insert, update, delete on public.app_settings to authenticated;

create index app_settings_category_idx on public.app_settings(category);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: full access to all settings including sensitive ones.
create policy "admin_all_settings" on public.app_settings
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- All authenticated users: read non-sensitive settings only.
create policy "authenticated_select_public_settings" on public.app_settings
  for select to authenticated
  using (
    auth.uid() is not null
    and is_sensitive = false
  );
