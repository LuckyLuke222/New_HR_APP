-- KushHR Phase 13 / Session 114: capture manual-adjustment provenance on
-- leave_balances. Mirrors the urgent Local Leave reason pattern (migration
-- 0030). State owner unchanged: leave_balances still holds the truth and the
-- trg_leave_balance_on_approval trigger (migration 0019) is the writer for
-- approval-driven decrements. These columns only preserve who/when/why a
-- balance was overridden by an admin via upsertLeaveBalance.

alter table public.leave_balances
  add column if not exists adjustment_reason text,
  add column if not exists adjusted_at timestamptz,
  add column if not exists adjusted_by uuid references auth.users(id) on delete set null;

alter table public.leave_balances
  drop constraint if exists leave_balance_adjustment_reason_length;

alter table public.leave_balances
  add constraint leave_balance_adjustment_reason_length
  check (
    adjustment_reason is null
    or length(btrim(adjustment_reason)) between 1 and 500
  );

comment on column public.leave_balances.adjustment_reason is
  'Free-text reason captured on the most recent manual adjustment via upsertLeaveBalance. NULL for rows that have only ever been auto-seeded by createEmployee. Limited to 500 characters by leave_balance_adjustment_reason_length.';

comment on column public.leave_balances.adjusted_at is
  'Timestamp of the most recent manual adjustment. NULL for auto-seeded rows that have never been manually edited.';

comment on column public.leave_balances.adjusted_by is
  'Auth user id of the admin who performed the most recent manual adjustment. NULL for auto-seeded rows.';
