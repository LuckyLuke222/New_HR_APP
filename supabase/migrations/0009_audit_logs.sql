-- KushHR: audit_logs — append-only event log.
-- No UPDATE or DELETE policy for any role. Only the insert_audit_log()
-- security-definer function (0012) may insert rows.
-- Admin-only read access.

create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references auth.users(id) on delete set null, -- set null preserves history
  action     text not null,    -- e.g. 'leave.approved', 'auth.access_denied', 'comp.updated'
  entity     text not null,    -- table name or resource type
  entity_id  uuid,             -- affected row id (nullable for non-row events)
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
  -- no updated_at: append-only
);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon;
-- No direct insert grant for authenticated. All inserts via security-definer function.
grant select on public.audit_logs to authenticated;

create index audit_logs_actor_idx    on public.audit_logs(actor);
create index audit_logs_action_idx   on public.audit_logs(action);
create index audit_logs_entity_idx   on public.audit_logs(entity, entity_id);
create index audit_logs_created_idx  on public.audit_logs(created_at desc);

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: read all. No one can update or delete (append-only).
create policy "admin_select_audit_logs" on public.audit_logs
  for select to authenticated
  using (public.get_user_role() = 'admin');

-- No INSERT/UPDATE/DELETE policies for any role.
-- insert_audit_log() runs as security definer (postgres) and bypasses RLS.
