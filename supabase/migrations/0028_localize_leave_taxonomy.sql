-- KushHR Phase 13: localize leave taxonomy.
-- v1 policy:
--   * Local Leave (renamed from "Annual Leave"): 22 days/year, includes 3 urgent days.
--   * Sick Leave: 15 days/year.
-- Unpaid Leave is deactivated (kept inactive to preserve historical balances/requests
-- via the existing FK relationships). No leave_types row is deleted.

-- Rename Annual Leave → Local Leave (preserves leave_balances and leave_requests FKs).
update public.leave_types
  set name = 'Local Leave',
      description = 'Paid local/annual leave: 22 days/year (includes 3 urgent days).'
  where name = 'Annual Leave';

-- Refresh Sick Leave description to reflect the v1 default.
update public.leave_types
  set description = 'Paid sick leave: 15 days/year.'
  where name = 'Sick Leave';

-- Deactivate Unpaid Leave for v1. Existing balances/requests on this type continue to work;
-- the type just disappears from forms that filter on is_active.
update public.leave_types
  set is_active = false
  where name = 'Unpaid Leave';
