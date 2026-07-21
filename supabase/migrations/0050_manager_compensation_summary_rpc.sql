-- 0050_manager_compensation_summary_rpc.sql
-- Manager scope on employee_compensation moves from base-table RLS to a
-- SECURITY DEFINER projection RPC.
--
-- Why: migration 0049's column-grant tightening covered UPDATE only. The
-- broad SELECT grant from 0004 left bank/tax/national-id/passport columns
-- readable by any authenticated user that the manager_select_direct_report
-- policy let through. UAT step 8 (Session 154, 2026-06-02) confirmed a
-- manager session could read these columns for direct reports via raw
-- supabase-js — application DAL projection was the only thing hiding them.
-- Defence-in-depth gap closed here at the DB layer.
--
-- Pattern mirrors get_peer_employee_profile (0037) and get_people_directory
-- (0033). The RPC's WHERE clause replaces the dropped RLS policy's scope
-- check; SECURITY DEFINER bypasses RLS but the inlined auth.uid()
-- restriction ensures the caller only sees their own direct reports.

drop policy if exists "manager_select_direct_report_compensation"
  on public.employee_compensation;

create or replace function public.get_direct_report_compensation_summaries()
returns table (
  employee_id uuid,
  employee_name text,
  salary_amount numeric,
  salary_currency text,
  pay_frequency public.pay_frequency,
  effective_date date
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ec.employee_id,
    coalesce(p.display_name, p.work_email, 'Unknown') as employee_name,
    ec.salary_amount,
    ec.salary_currency,
    ec.pay_frequency,
    ec.effective_date
  from public.employee_compensation ec
  join public.employee_records er on er.employee_id = ec.employee_id
  left join public.profiles p on p.id = ec.employee_id
  where auth.uid() is not null
    and er.manager_id = auth.uid()
    and er.employment_status != 'terminated'
  order by employee_name;
$$;

revoke all on function public.get_direct_report_compensation_summaries() from public;
grant execute on function public.get_direct_report_compensation_summaries() to authenticated;

comment on function public.get_direct_report_compensation_summaries() is
  'Manager-scope projection of direct-report compensation summaries. Returns salary, currency, pay frequency, and effective date only — never bank, tax, national ID, passport, or notes. Scope enforced by the inlined auth.uid() = employee_records.manager_id check. Replaces the manager_select_direct_report_compensation RLS policy (dropped here).';

comment on table public.employee_compensation is
  'Compensation record. Admin: full read/write via service-role. Employee: read own + update own non-salary columns (bank, tax, national_id, passport, nationality) via column grants. Manager: NO base-table SELECT — manager scope is enforced exclusively by SECURITY DEFINER RPC public.get_direct_report_compensation_summaries(), which returns the summary projection (salary, currency, pay_frequency, effective_date) and never exposes sensitive columns. Salary / effective_date / pay_frequency / notes are admin-only writes by column grant.';
