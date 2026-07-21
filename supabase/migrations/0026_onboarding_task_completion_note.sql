-- Allow the user marking an onboarding task complete to attach a short note
-- describing what was done. Stored alongside the task; surfaced in the UI and
-- in the audit log for the completion event.

alter table public.onboarding_tasks
  add column if not exists completion_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'onboarding_tasks_completion_note_length'
  ) then
    alter table public.onboarding_tasks
      add constraint onboarding_tasks_completion_note_length
      check (
        completion_note is null
        or char_length(completion_note) <= 1200
      );
  end if;
end $$;
