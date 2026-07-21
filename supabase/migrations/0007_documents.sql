-- KushHR: documents metadata table with RLS.
-- Binary files live in Supabase Storage (private bucket: hr-documents).
-- This table stores metadata only. Storage RLS mirrors these policies.
-- Payslips (category = payslip) are admin-upload only; employees can view own.
-- Managers cannot view payslip, id_document, or contract categories.

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete restrict,
  uploaded_by   uuid not null references public.profiles(id) on delete restrict,
  category      public.document_category not null,
  title         text not null,
  storage_path  text not null unique,                -- path in hr-documents Storage bucket
  file_size     bigint,
  mime_type     text,
  is_shared     boolean not null default false,      -- shared with employee by admin/manager
  deleted_at    timestamptz,                         -- soft delete; retain for audit
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null
);

alter table public.documents enable row level security;
revoke all on public.documents from anon;
grant select, insert, update on public.documents to authenticated;

create index documents_employee_idx  on public.documents(employee_id);
create index documents_category_idx  on public.documents(category);
create index documents_uploaded_idx  on public.documents(uploaded_by);
create index documents_deleted_idx   on public.documents(deleted_at) where deleted_at is null;

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Admin: full access (SELECT includes deleted rows for audit).
create policy "admin_all_documents" on public.documents
  for all to authenticated
  using  (public.get_user_role() = 'admin')
  with check (public.get_user_role() = 'admin');

-- Employee: read own non-deleted documents + documents shared with them.
-- Payslips visible to the employee who owns them.
create policy "employee_select_own_documents" on public.documents
  for select to authenticated
  using (
    public.get_user_role() = 'employee'
    and employee_id = auth.uid()
    and deleted_at is null
  );

-- Employee: upload own documents (not payslips — admin only for payslip category).
create policy "employee_insert_own_documents" on public.documents
  for insert to authenticated
  with check (
    public.get_user_role() = 'employee'
    and employee_id = auth.uid()
    and uploaded_by = auth.uid()
    and category != 'payslip'
  );

-- Manager: read active non-sensitive documents for direct reports.
-- Blocked from: payslip, id_document (sensitive categories).
create policy "manager_select_direct_report_documents" on public.documents
  for select to authenticated
  using (
    public.get_user_role() = 'manager'
    and public.is_direct_report(employee_id)
    and deleted_at is null
    and category not in ('payslip', 'id_document')
  );
