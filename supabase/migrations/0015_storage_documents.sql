-- KushHR Phase 7: private hr-documents Storage bucket and RLS.
--
-- File path convention: {employee_id}/{category}/{uuid}.{ext}
-- All server-side operations use the service-role client (bypasses RLS).
-- These policies guard against direct authenticated/anon client access.

-- ─── Bucket ───────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hr-documents',
  'hr-documents',
  false,
  52428800, -- 50 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- ─── Storage RLS ──────────────────────────────────────────────────────────────

-- Admin: full access to hr-documents bucket.
create policy "admin_all_hr_objects" on storage.objects
  for all to authenticated
  using  (bucket_id = 'hr-documents' and public.get_user_role() = 'admin')
  with check (bucket_id = 'hr-documents' and public.get_user_role() = 'admin');

-- Employee: read files in their own folder (path prefix = their UUID).
create policy "employee_select_own_objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-documents'
    and public.get_user_role() = 'employee'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Employee: upload files into their own folder only.
-- Payslip category enforcement is at the Server Action layer (not path-based).
create policy "employee_insert_own_objects" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hr-documents'
    and public.get_user_role() = 'employee'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Manager: read non-sensitive files for direct reports.
-- Category check is delegated to the documents metadata table join.
create policy "manager_select_direct_report_objects" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hr-documents'
    and public.get_user_role() = 'manager'
    and exists (
      select 1 from public.documents d
      where d.storage_path = name
        and public.is_direct_report(d.employee_id)
        and d.deleted_at is null
        and d.category not in ('payslip', 'id_document', 'contract')
    )
  );
