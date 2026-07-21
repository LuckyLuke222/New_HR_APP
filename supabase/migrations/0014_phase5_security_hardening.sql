-- KushHR Phase 5 security hardening.
-- 1. Audit helper RPC is no longer executable through the exposed API.
--    Trusted Server Actions insert audit rows with the server-only service-role
--    client instead.
-- 2. Employees cannot directly SELECT employee_compensation rows because RLS is
--    row-level, not column-level. Employee payroll summaries need a restricted
--    view/RPC in Phase 8.
-- 3. Self-service profile updates are limited at the grant layer.
-- 4. Manager document access excludes contracts as a sensitive category.

-- ─── Audit RPC: remove direct authenticated execution ────────────────────────

revoke execute on function public.insert_audit_log(uuid, text, text, uuid, jsonb)
  from public;
revoke execute on function public.insert_audit_log(uuid, text, text, uuid, jsonb)
  from anon;
revoke execute on function public.insert_audit_log(uuid, text, text, uuid, jsonb)
  from authenticated;
grant insert on public.audit_logs to service_role;

-- ─── Compensation: admin direct table only ───────────────────────────────────

drop policy if exists "employee_select_own_compensation"
  on public.employee_compensation;

comment on table public.employee_compensation is
  'Admin-only direct table access. Employee payroll summaries must use a restricted view/RPC that omits bank, tax, national ID, and notes fields.';

-- ─── Profiles: self-service update grant tightening ──────────────────────────
-- RLS still decides which row can be updated. Column grants decide which profile
-- fields a browser/session-scoped client can update directly.

revoke update on public.profiles from authenticated;
grant update (display_name, phone, avatar_url) on public.profiles to authenticated;

-- ─── Documents: managers cannot view contracts ───────────────────────────────

drop policy if exists "manager_select_direct_report_documents"
  on public.documents;

create policy "manager_select_direct_report_documents" on public.documents
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
    and deleted_at is null
    and category not in ('payslip', 'id_document', 'contract')
  );
