-- Make "see your own documents" role-agnostic.
--
-- The original employee_select_own_documents policy (0007) was gated
-- `get_user_role() = 'employee'`, so MANAGERS and admins-acting-as-themselves
-- could not see their own documents at all (the only self-visibility policy
-- excluded them). Every user should see documents on their own profile,
-- regardless of role. Replace it with a role-agnostic, strictly-self policy.
--
-- Strictly self-scoped (`employee_id = auth.uid()`) — no cross-tenant exposure.
-- admin_all_documents and manager_select_direct_report_documents are unchanged
-- and additive (policies are OR'd), so this only ADDS own-doc visibility for
-- non-employees; it removes no restriction on anyone else's documents.

drop policy if exists "employee_select_own_documents" on public.documents;

create policy "select_own_documents" on public.documents
  for select to authenticated
  using (
    employee_id = auth.uid()
    and deleted_at is null
  );
