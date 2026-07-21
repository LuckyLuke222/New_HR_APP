-- KushHR: insert_audit_log() — the only permitted path for writing to audit_logs.
-- Called explicitly from Server Actions for defined audit events.
-- security definer bypasses the audit_logs RLS (which has no INSERT policy)
-- so authenticated users can log events without direct table access.
-- Treat the function signature as a stable internal API: any change requires
-- updating every call site in the application.

create or replace function public.insert_audit_log(
  p_actor     uuid,
  p_action    text,
  p_entity    text,
  p_entity_id uuid    default null,
  p_metadata  jsonb   default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor, action, entity, entity_id, metadata)
  values (p_actor, p_action, p_entity, p_entity_id, p_metadata);
end;
$$;

-- Grant execute to authenticated so Server Actions (running as the user)
-- can call this function. The function itself controls what gets logged.
grant execute on function public.insert_audit_log(uuid, text, text, uuid, jsonb)
  to authenticated;
