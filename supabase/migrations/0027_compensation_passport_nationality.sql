-- KushHR Phase 13: add passport_number and nationality to employee_compensation.
-- Both fields are HR/admin data; passport_number is sensitive (treat like national_id).
-- RLS policies are unchanged: admin-only mutations and reads of sensitive columns;
-- employees still read only the salary summary projection via the application layer.

alter table public.employee_compensation
  add column if not exists passport_number text,
  add column if not exists nationality text;

comment on column public.employee_compensation.passport_number is
  'HR/admin-only. Treat as sensitive ID; encrypt in Phase 11 hardening alongside national_id and tax_id.';
comment on column public.employee_compensation.nationality is
  'HR profile attribute (free text in v1). Admin-managed; not exposed in the employee salary summary.';
