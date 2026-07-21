-- KushHR: employee_compensation table with RLS.
-- Admin-only write access. Manager access: NONE.
-- Employee can read their own compensation summary (salary + pay_frequency only).
-- Bank, tax, and national ID fields are admin-only in all contexts.
-- Full bank account number stored here; application layer always masks to last 4 digits.
-- Consider encryption for bank_account_number and tax_id in Phase 11 hardening.

create table public.employee_compensation (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null unique references public.profiles(id) on delete restrict,
  salary_amount        numeric(14, 2),
  salary_currency      text not null default 'USD',
  pay_frequency        public.pay_frequency,
  bank_name            text,
  bank_account_holder  text,
  bank_account_number  text,                       -- masked at app layer; encrypt in Phase 11
  tax_id               text,                       -- encrypt in Phase 11
  national_id          text,                       -- encrypt in Phase 11
  effective_date       date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references auth.users(id) on delete set null,
  updated_by           uuid references auth.users(id) on delete set null
);

alter table public.employee_compensation enable row level security;

-- No anon access. Authenticated access gated entirely by RLS below.
revoke all on public.employee_compensation from anon;
grant select, insert, update, delete on public.employee_compensation to authenticated;

create index employee_compensation_employee_idx on public.employee_compensation(employee_id);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: full access.
create policy "admin_all_compensation" on public.employee_compensation
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read own row only (application layer restricts which columns are shown).
-- Employees never see bank/tax fields — enforced in the Server Action DTO, not here.
create policy "employee_select_own_compensation" on public.employee_compensation
  for select to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
  );

-- Managers: no policy = no access. RLS denies by default.
