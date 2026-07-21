# Supabase

Supabase is the selected backend for KushHR: Auth, Postgres + RLS, and Storage.

## Applying Migrations

```bash
supabase db reset               # drop, re-apply all migrations, then run seed.sql
supabase db push                # apply pending migrations to a linked remote project
supabase migration new <name>   # create a new numbered migration file
```

## Migration Files

| File | Contents |
|------|----------|
| `0000_scaffold_conventions.sql` | Migration rules comment — no tables |
| `0001_enums.sql` | All custom enum types |
| `0002_profiles_departments.sql` | `profiles`, `departments`, `get_user_role()`, RLS |
| `0003_employee_records.sql` | `employee_records`, `is_direct_report()`, RLS; adds manager direct-report policy on profiles |
| `0004_employee_compensation.sql` | `employee_compensation`, RLS (manager: no access) |
| `0005_payroll_change_requests.sql` | `payroll_change_requests`, RLS |
| `0006_leave.sql` | `leave_types`, `leave_balances`, `leave_requests`, RLS |
| `0007_documents.sql` | `documents` metadata, RLS |
| `0008_onboarding.sql` | `onboarding_templates`, `onboarding_tasks`, RLS |
| `0009_audit_logs.sql` | `audit_logs`, RLS (admin-read, append-only) |
| `0010_app_settings.sql` | `app_settings`, RLS |
| `0011_triggers.sql` | `set_updated_at()` on all tables; `handle_new_user()` on `auth.users` |
| `0012_audit_helper.sql` | `insert_audit_log()` security-definer function |
| `0013_role_sync.sql` | `sync_role_to_jwt()` — mirrors `profiles.role` to JWT `app_metadata` |
| `0014_phase5_security_hardening.sql` | Security hardening for audit RPC, payroll visibility, and Storage policies |
| `0015_storage_documents.sql` | Private `hr-documents` Storage bucket |
| `0016_onboarding_template_items.sql` | Reusable onboarding template item model |
| `0017_onboarding_task_update_hardening.sql` | Onboarding task update permission hardening |
| `0018_performance_appraisals.sql` | Review cycles, goals, reviews, RLS, constraints, and indexes |

## Seed Data

`seed.sql` creates four demo accounts (password: `TestPass123!` for all):

| Email | Role | Notes |
|-------|------|-------|
| `admin@kushhr.dev` | Admin | Full access |
| `manager@kushhr.dev` | Manager | Engineering Lead; Alice is a direct report |
| `alice@kushhr.dev` | Employee | Software Engineer; direct report of manager |
| `bob@kushhr.dev` | Employee | Operations Coordinator; no manager |

Run with `supabase db reset`. Do not run in production.

The seed inserts deterministic local/demo Auth users and matching `auth.identities` rows. Keep the empty Auth token string fields and identity records in place: GoTrue requires this row shape for password sign-in, and omitting it can cause `Database error querying schema` during login.

## Security Rules

- RLS enabled on every table in the same migration that creates it.
- Service-role keys are backend-only — never import from browser code.
- Private HR/payroll documents go in the `hr-documents` Storage bucket (configured in Phase 7).
- Storage access enforced via `storage.objects` RLS and server-generated signed URLs.
- Document uploads are capped at 10 MiB. The bucket MIME allowlist is the union of the category-specific policy enforced in `src/server/actions/documents.ts`.
- `insert_audit_log()` is the only permitted insert path for `audit_logs`.
