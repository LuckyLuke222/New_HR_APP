-- 0032_app_settings.sql
-- Singleton app-wide settings: company info, leave policy defaults,
-- working week / timezone / currency.
--
-- The table is constrained to a single row via a boolean primary key with
-- a CHECK (singleton = true) so there is always exactly one settings row
-- to read. Admin-only RLS (SELECT + UPDATE); no INSERT/DELETE (row is
-- created by this migration). Updates are audited from the application
-- layer.
--
-- Phase 13 / E3.
--
-- Migration 0010 created an empty key-value app_settings table that no
-- application code ever read or wrote. Drop it cleanly so we can
-- recreate app_settings with the typed singleton shape this phase needs.
-- (No data loss — 0010 left the table empty by design.)

drop table if exists public.app_settings cascade;

create table public.app_settings (
  singleton                   boolean primary key default true,
  company_name                text        not null default '',
  company_address             text        not null default '',
  company_logo_url            text        not null default '',
  local_leave_default_days    integer     not null default 22 check (local_leave_default_days >= 0 and local_leave_default_days <= 365),
  sick_leave_default_days     integer     not null default 15 check (sick_leave_default_days  >= 0 and sick_leave_default_days  <= 365),
  working_days                text[]      not null default array['mon','tue','wed','thu','fri']::text[],
  timezone                    text        not null default 'Indian/Mauritius',
  currency                    text        not null default 'MUR',
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid        references auth.users(id) on delete set null,
  constraint app_settings_singleton check (singleton = true)
);

-- Seed the singleton row idempotently.
insert into public.app_settings (singleton)
values (true)
on conflict (singleton) do nothing;

-- updated_at trigger.
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

grant select, update on public.app_settings to authenticated;

-- Admin: full read + update access. (No insert/delete needed — the row
-- is created by this migration and pinned by the singleton constraint.)
create policy "admin_select_app_settings" on public.app_settings
  for select to authenticated
  using (public.get_user_role() = 'admin');

create policy "admin_update_app_settings" on public.app_settings
  for update to authenticated
  using      (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

comment on table public.app_settings is
  'Singleton company/policy settings (E3, phase 13). Always exactly one row, identified by singleton = true. Admin-only RLS.';
comment on column public.app_settings.local_leave_default_days is
  'Default Local Leave allowance used when seeding leave_balances for new employees and (later) by the year-rollover action.';
comment on column public.app_settings.sick_leave_default_days is
  'Default Sick Leave allowance used when seeding leave_balances for new employees and (later) by the year-rollover action.';
comment on column public.app_settings.working_days is
  'IANA-style three-letter weekday tokens for the working week (e.g. mon, tue). Stored but not yet consumed elsewhere in v1.';
comment on column public.app_settings.timezone is
  'IANA timezone (e.g. Indian/Mauritius). Stored but not yet consumed elsewhere in v1.';
comment on column public.app_settings.currency is
  'ISO 4217 currency code (e.g. MUR). Stored but not yet consumed elsewhere in v1.';
