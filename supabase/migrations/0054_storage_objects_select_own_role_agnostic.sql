-- 0054_storage_objects_select_own_role_agnostic.sql
--
-- Mirror migration 0053 into the storage layer.
--
-- 0053 made "see your own documents" role-agnostic on public.documents
-- (select_own_documents: employee_id = auth.uid()), so every user — not just
-- employees — sees documents on their own profile. But the matching STORAGE
-- policy employee_select_own_objects (0015) still gates
-- get_user_role() = 'employee', so a manager/admin acting as themselves could
-- read their own DOCUMENT ROW but not the underlying FILE via RLS. The two RLS
-- layers guarding the same resource must agree.
--
-- Not exploitable today: every server file path uses the service-role admin
-- client (getSignedDownloadUrl reads the row via the session client, then signs
-- via createAdminClient), which bypasses storage RLS entirely. The risk is
-- latent — the day any path reads storage with an authenticated session client,
-- the stale role gate would silently deny non-employees their own files.
--
-- Strictly self-scoped (folder prefix = auth.uid()) — no cross-tenant change.
-- Removes only the role gate, never the ownership predicate. admin_all_hr_objects
-- and manager_select_direct_report_objects are unchanged and additive (OR'd), so
-- this only ADDS own-file visibility for non-employees.
--
-- CROSS-LINK (keep in sync): the unchanged manager_select_direct_report_objects
-- category denylist (`category not in ('payslip','id_document','contract')`) must
-- stay equal to the MANAGER_UPLOAD_CATEGORIES allowlist (`policy`/`other`) in
-- src/lib/document-upload-policy.ts — letting a manager upload a category they
-- can't SELECT would create a file invisible to the uploader. They currently agree.

drop policy if exists "employee_select_own_objects" on storage.objects;

create policy "select_own_objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
