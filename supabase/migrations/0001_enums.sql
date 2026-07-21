-- KushHR: Custom enum types
-- All enums are created in the public schema.

create type public.user_role as enum ('admin', 'manager', 'employee');
create type public.employment_status as enum ('active', 'inactive', 'terminated');
create type public.employment_type as enum ('full_time', 'part_time', 'contractor', 'intern');
create type public.leave_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.document_category as enum ('contract', 'id_document', 'payslip', 'policy', 'other');
create type public.pay_frequency as enum ('monthly', 'weekly', 'hourly');
create type public.task_status as enum ('pending', 'completed');
