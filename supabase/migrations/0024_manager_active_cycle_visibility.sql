-- Allow managers to see active review cycles before goals/reviews exist.
--
-- Managers need to select an admin-created active cycle when creating the first
-- direct-report goal or appraisal. The original scoped cycle policy only showed
-- cycles after a goal/review already existed in the manager's scope, creating a
-- first-use catch-22.

create policy "manager_select_active_performance_cycles"
  on public.performance_review_cycles
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and status = 'active'
  );
