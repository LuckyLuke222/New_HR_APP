-- Allow employees to record goal-level progress notes without overwriting the
-- manager-owned goal description.

alter table public.performance_goals
  add column if not exists employee_progress_note text,
  add column if not exists employee_progress_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'performance_goals_employee_progress_note_length'
  ) then
    alter table public.performance_goals
      add constraint performance_goals_employee_progress_note_length
      check (
        employee_progress_note is null
        or char_length(employee_progress_note) <= 1200
      );
  end if;
end $$;
