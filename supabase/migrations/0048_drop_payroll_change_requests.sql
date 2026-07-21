-- KushHR Session 154 (2026-06-02): retire the payroll change-request workflow.
-- Replaced by employee self-service editing of non-salary compensation fields
-- (migration 0049). Historical `change_request.*` audit_logs rows remain
-- queryable — audit metadata is JSONB and entity_id is not FK-linked, so
-- dropping the table does not orphan the audit trail.

drop policy if exists "admin_select_payroll_cr"          on public.payroll_change_requests;
drop policy if exists "admin_update_payroll_cr"          on public.payroll_change_requests;
drop policy if exists "admin_insert_payroll_cr"          on public.payroll_change_requests;
drop policy if exists "employee_select_own_payroll_cr"   on public.payroll_change_requests;
drop policy if exists "employee_insert_own_payroll_cr"   on public.payroll_change_requests;
drop policy if exists "employee_cancel_own_payroll_cr"   on public.payroll_change_requests;

drop table if exists public.payroll_change_requests cascade;
