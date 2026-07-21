-- B5 / F5 (deadline mechanism): admin-set submission deadline per review cycle
-- with an opt-in hard-lock. Layered on top of the existing Edit-button + audit
-- reopen policy (goal definition lock from 0036; manager review + self review
-- reopens already in place). Within the window the Edit-button flow stays
-- intact; past the deadline (and when lock is enabled) Server Actions reject
-- all writes against the cycle with auth.access_denied.
--
-- Additive + defaulted: existing cycles preserve current behaviour
-- (submission_deadline null and submission_lock_enabled false).
-- Distinct from status='closed' (closed = archived; deadline-locked = frozen
-- but still readable). No RLS change — admin-only writes already gated by
-- requireRole at the Server Action layer.

alter table public.performance_review_cycles
  add column if not exists submission_deadline date null,
  add column if not exists submission_lock_enabled boolean not null default false;

alter table public.performance_review_cycles
  drop constraint if exists performance_review_cycles_submission_deadline_order;

alter table public.performance_review_cycles
  add constraint performance_review_cycles_submission_deadline_order
  check (submission_deadline is null or submission_deadline >= start_date);

comment on column public.performance_review_cycles.submission_deadline is
  'Optional admin-set last day on which submissions/reopens are accepted for this cycle. Null = no deadline.';
comment on column public.performance_review_cycles.submission_lock_enabled is
  'When true, Server Actions reject any submit/reopen/acknowledge after submission_deadline. False (default) = legacy behaviour even if a deadline date is set.';
