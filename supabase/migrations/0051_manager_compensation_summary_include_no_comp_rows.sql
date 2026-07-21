-- 0051_manager_compensation_summary_include_no_comp_rows.sql
-- F5 — restore pre-F4 UX where direct reports without a compensation row
-- appear in the manager view with null summary fields, signalling HR setup
-- needed. After migration 0050 the RPC's inner join from
-- employee_compensation hid those direct reports entirely.
--
-- The fix drives the join from employee_records and left-joins
-- employee_compensation, so the row count matches direct-report count
-- regardless of compensation setup state. Column projection / scope
-- guarantees from 0050 are preserved — only the row population semantic
-- changes.

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
    er.employee_id,
    coalesce(p.display_name, p.work_email, 'Unknown') as employee_name,
    ec.salary_amount,
    ec.salary_currency,
    ec.pay_frequency,
    ec.effective_date
  from public.employee_records er
  left join public.employee_compensation ec on ec.employee_id = er.employee_id
  left join public.profiles p on p.id = er.employee_id
  where auth.uid() is not null
    and er.manager_id = auth.uid()
    and er.employment_status != 'terminated'
  order by employee_name;
$$;
