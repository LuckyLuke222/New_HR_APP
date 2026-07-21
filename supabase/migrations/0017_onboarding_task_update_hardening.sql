-- KushHR: harden onboarding task updates.
-- Employees may complete only their own tasks. Assignment metadata is written
-- through server actions and insert policies, not direct authenticated updates.

revoke update on public.onboarding_tasks from authenticated;

drop policy if exists "manager_update_tasks_for_direct_reports" on public.onboarding_tasks;
drop policy if exists "employee_complete_own_task" on public.onboarding_tasks;
