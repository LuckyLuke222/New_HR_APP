-- KushHR: allow employees and managers to cancel their own APPROVED leaves
-- (in addition to pending ones), so the refund pathway introduced by
-- migration 0042's handle_leave_refund() trigger can actually fire.
--
-- Before this migration, both employee_cancel_own_leave (migration 0006) and
-- manager_cancel_own_leave (migration 0022) had `using (... status = 'pending')`.
-- That silently rejected UPDATEs against approved rows: PostgREST returned
-- success with 0 rows affected, no error surfaced to the action layer, and
-- the refund trigger never fired. Surfaced 2026-05-28 during UAT R1.
--
-- with check (status = 'cancelled') is unchanged — the policy still only
-- permits the row to LAND in the cancelled state.

drop policy if exists "employee_cancel_own_leave" on public.leave_requests;
create policy "employee_cancel_own_leave" on public.leave_requests
  for update to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'employee'
    and status in ('pending', 'approved')
  )
  with check (
    employee_id = auth.uid()
    and status = 'cancelled'
  );

drop policy if exists "manager_cancel_own_leave" on public.leave_requests;
create policy "manager_cancel_own_leave" on public.leave_requests
  for update to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'manager'
    and status in ('pending', 'approved')
  )
  with check (
    employee_id = auth.uid()
    and public.get_user_role() = 'manager'
    and status = 'cancelled'
  );

comment on policy "employee_cancel_own_leave" on public.leave_requests is
  'Employees can move their own pending OR approved leave to cancelled. Approved-cancel triggers handle_leave_refund (migration 0042) which refunds deducted_days back to leave_balances.';
comment on policy "manager_cancel_own_leave" on public.leave_requests is
  'Managers can move their own pending OR approved leave to cancelled. Approved-cancel triggers handle_leave_refund (migration 0042) which refunds deducted_days back to leave_balances.';
