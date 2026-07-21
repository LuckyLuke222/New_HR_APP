-- KushHR Session 154 (2026-06-02): payroll self-service + manager summary view.
--
-- State shift:
-- - Employees regain SELECT on their own employee_compensation row (full row;
--   the application form lets them see salary read-only and edit the
--   non-salary fields). Policy was removed in 0014 when all reads were
--   funnelled through the admin-client DAL; we restore it now because the
--   employee self-edit form needs to pre-fill bank/tax/national-id.
-- - Employees gain UPDATE on their own row, restricted to non-salary columns
--   via column grants. Salary, currency, pay_frequency, effective_date, and
--   notes are physically unwritable on the session-client; admin uses
--   service-role and is unaffected.
-- - Managers gain SELECT on direct-report rows. The application reads only
--   the summary projection (salary, currency, pay_frequency, effective_date)
--   via the DAL helper getCompensationSummary; bank/tax columns never enter
--   the manager code path. Defence-in-depth, not the primary gate.
--
-- All access for everyone else: denied by default (RLS).

-- ─── Re-add employee self-SELECT (role-agnostic so manager-of-self works) ────

create policy "employee_select_own_compensation" on public.employee_compensation
  for select to authenticated
  using (employee_id = auth.uid());

-- ─── Manager direct-report SELECT ────────────────────────────────────────────

create policy "manager_select_direct_report_compensation" on public.employee_compensation
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
  );

-- ─── Employee self-UPDATE ────────────────────────────────────────────────────

create policy "employee_update_own_compensation" on public.employee_compensation
  for update to authenticated
  using (employee_id = auth.uid())
  with check (employee_id = auth.uid());

-- ─── Column grant: employees can only touch non-salary columns ───────────────
-- Pattern follows 0014's tightening of public.profiles.
-- Admin path bypasses these grants via service-role.

revoke update on public.employee_compensation from authenticated;

grant update (
  bank_name,
  bank_account_holder,
  bank_account_number,
  tax_id,
  national_id,
  passport_number,
  nationality
) on public.employee_compensation to authenticated;

comment on table public.employee_compensation is
  'Compensation record. Admin: full read/write via service-role. Employee: read own + update own non-salary columns (bank, tax, national_id, passport, nationality) via column grants. Manager: read direct-report rows (application restricts to summary projection: salary, currency, pay_frequency, effective_date). Salary / effective_date / pay_frequency / notes are admin-only writes by column grant.';
