-- Allow managers to use the same self-service leave flow as employees.
--
-- Managers may submit and cancel their own pending leave requests, but approval
-- remains scoped to direct reports and the Server Action still blocks
-- self-approval/self-rejection.

create policy "manager_insert_own_leave" on public.leave_requests
  for insert to authenticated
  with check (
    employee_id = auth.uid()
    and public.get_user_role() = 'manager'
    and status = 'pending'
  );

create policy "manager_cancel_own_leave" on public.leave_requests
  for update to authenticated
  using (
    employee_id = auth.uid()
    and public.get_user_role() = 'manager'
    and status = 'pending'
  )
  with check (
    employee_id = auth.uid()
    and public.get_user_role() = 'manager'
    and status = 'cancelled'
  );
