-- KushHR: shared triggers.
-- 1. set_updated_at() — keep updated_at current on every row update.
-- 2. handle_new_user() — create a profiles row on Supabase Auth sign-up.

-- ─── set_updated_at ───────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to every table that has an updated_at column.
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.employee_records
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.employee_compensation
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.payroll_change_requests
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.leave_types
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.onboarding_templates
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.onboarding_tasks
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();


-- ─── handle_new_user ──────────────────────────────────────────────────────────
-- Fires after every Supabase Auth sign-up. Creates a profiles row with
-- default role 'employee'. Role is updated by admin after onboarding.
-- security definer runs as the function owner (postgres) so it can insert
-- into profiles without the new user having an existing row to satisfy RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, work_email)
  values (
    new.id,
    'employee',
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;   -- idempotent: safe to re-run
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
