-- B5 / F5: lock goal definition fields after explicit submit.
-- Adds nullable columns so the application layer can render a read-only
-- summary + Edit button. Definition lock is independent of the goal status
-- lifecycle (not_started/in_progress/completed/cancelled) and independent of
-- the employee progress fields added in migration 0025 — those remain
-- always-editable via updateOwnGoalProgress.

alter table public.performance_goals
  add column if not exists goal_definition_submitted_at timestamptz null,
  add column if not exists goal_definition_submitted_by uuid null references public.profiles(id);

comment on column public.performance_goals.goal_definition_submitted_at is
  'Timestamp when goal definition (title/description/dates) was submitted and locked. Null = draft / unlocked.';
comment on column public.performance_goals.goal_definition_submitted_by is
  'Actor (admin or manager) who locked the definition. Cleared on reopen.';
