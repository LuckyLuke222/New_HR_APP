-- KushHR: public_holidays — admin-managed list of dates excluded from leave-day
-- counting. Seeded for Mauritius (country_code = 'MU') in migration 0041.
--
-- State owner: this table is the sole source of truth for "is date X a holiday?".
-- Read by the working_days() SQL function (migration 0042) which the leave
-- approval trigger and the request-form preview both call. Admin-only writes;
-- all authenticated users can read so the form can preview excluded days.
--
-- Unique key: (date, country_code, name) where is_active. Mauritius can have
-- two distinct holidays falling on the same calendar date (e.g. 2026-02-01:
-- Abolition of Slavery AND Thaipoosam Cavadee). Both rows are needed for
-- audit / display fidelity; working_days() treats any active row on that
-- date as a non-working day regardless of how many match.
--
-- is_tentative: lunar-calendar holidays (Eid) are gazetted late based on
-- moon-sighting. Admin UI badges tentative rows so the admin remembers to
-- confirm the date once gazetted.

create table public.public_holidays (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  name          text not null,
  country_code  text not null default 'MU',
  is_active     boolean not null default true,
  is_tentative  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  constraint public_holidays_name_not_blank check (length(trim(name)) > 0),
  constraint public_holidays_country_code_format check (country_code ~ '^[A-Z]{2}$')
);

alter table public.public_holidays enable row level security;
revoke all on public.public_holidays from anon;
grant select on public.public_holidays to authenticated;
grant insert, update, delete on public.public_holidays to authenticated;

create unique index public_holidays_active_uniq
  on public.public_holidays (date, country_code, name)
  where is_active;

create index public_holidays_date_idx
  on public.public_holidays (date)
  where is_active;

create index public_holidays_country_date_idx
  on public.public_holidays (country_code, date)
  where is_active;

create policy "authenticated_select_active_public_holidays" on public.public_holidays
  for select to authenticated
  using (auth.uid() is not null);

create policy "admin_manage_public_holidays" on public.public_holidays
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

comment on table public.public_holidays is
  'Admin-managed public holidays per country. Read by working_days() during leave approval and form preview. RLS: admin writes; all authenticated reads.';
comment on column public.public_holidays.is_tentative is
  'True for lunar-calendar holidays (Eid) pending official gazette confirmation. Admin UI surfaces a warning badge.';
