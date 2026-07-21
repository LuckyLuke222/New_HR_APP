-- KushHR Phase 13 / Security & RBAC UAT Batch B1 (F1): enforce no overlapping
-- leave_requests per employee at the database layer.
--
-- State owner: public.leave_requests already owns the date range per request.
-- This adds a defense-in-depth EXCLUDE constraint so that even if the app
-- bypasses the action-layer overlap check (race, forge, future caller), the
-- database refuses to land two pending-or-approved requests for the same
-- employee with intersecting date ranges.
--
-- The action-layer check in src/server/actions/leave.ts is the primary
-- feedback path (user-friendly error + audit row). This constraint catches
-- races and is translated to the same user message via SQLSTATE 23P01.
--
-- Scope: status IN ('pending','approved') only. Rejected/cancelled requests
-- do not lock dates so they are explicitly excluded from the constraint.
--
-- Pre-flight (run 2026-05-22): 2 overlapping pairs existed in the deterministic
-- seed accounts (Alice + Morgan) — UAT residue. Hard-deleted before this
-- migration was authored. Re-checked: 0 overlaps remaining.

create extension if not exists btree_gist;

alter table public.leave_requests
  drop constraint if exists leave_requests_no_overlap;

alter table public.leave_requests
  add constraint leave_requests_no_overlap
  exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'));

comment on constraint leave_requests_no_overlap on public.leave_requests is
  'B1/F1 defense-in-depth: rejects overlapping pending-or-approved leave for the same employee. SQLSTATE 23P01 on violation; action layer translates to user message.';
