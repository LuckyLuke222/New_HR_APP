# Sol Audit 5 — Schema, Migrations, and RLS Integrity

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## 1. Executive summary

The data layer has substantial strengths: every surviving public application table enables RLS; grants are explicit after migration 0039; core relationships use foreign keys; migration 0052 adds future RLS defense; and the incremental runner records checksums and applies each migration plus ledger row transactionally (`scripts/db-migrate.mjs:19-30`, `:224-240`). Compensation manager reads use a fixed security-definer projection rather than base-table over-fetch.

It is **not yet data-integrity sound**. The leave refund trigger contradicts its own frozen-debit contract and can permanently lose balance after a retroactive holiday edit. Several browser-facing mutation grants rely on Server Actions for column-level integrity even though callers can bypass those actions. Key numeric HR/payroll invariants exist only in Zod, not the database. Documentation also overstates several final policies.

I walked migrations `0000` through `0054` in lexical/numeric order. The findings below concern the final accumulated schema unless explicitly labeled historical/bootstrap-only.

## 2. Ranked findings

### BLOCKER — Approved-leave refund recomputes current holidays instead of reversing the frozen debit

**Evidence:** migration contract says `deducted_days` is frozen so retroactive holidays never reshuffle balances (`supabase/migrations/0042_leave_working_days_and_refund.sql:7-16`, column comment `:37-40`). Approval stores total debit at `:95-153`. Modern refund ignores that total and recalculates `working_days` from the current holiday table at `:220-251`.

**Concrete trace:** Alice's Monday–Friday leave is approved when all five are working days, so balance decreases by 5 and `deducted_days=5`. An admin later adds Wednesday as a holiday. Alice cancels. Refund recalculates four working days and restores 4, leaving a permanent one-day deficit despite the “refund verbatim” contract.

For multi-year leave, a single total is insufficient to know which year's balance to restore. The trigger also merely raises a warning if a required balance row is missing (`:245-250`) and still allows cancellation, silently dropping that year's refund.

**Fix:** store an immutable per-year debit ledger at approval (child rows or validated JSONB), then refund exactly those rows. Make missing refund targets abort the cancellation or create a durable reconciliation item; never warn-and-commit financial/leave loss. Add migration-level regression tests for retroactive holiday activation/deactivation, multi-year segments, half-day, and missing balances.

**Confidence:** high.

### NEEDS-FIX — RLS scopes manager leave rows but does not protect immutable columns

**Evidence:** table-wide authenticated update grant at `supabase/migrations/0006_leave.sql:97-100`; manager policy only constrains row relationship and final status at `:150-163`. Application payload is narrow at `src/server/actions/leave.ts:600-610`.

**Concrete trace:** a manager directly changes a report's pending request dates, type, half-day flag, target employee (to another report), and approver while setting approved. RLS passes. The security-definer balance trigger applies the fabricated values. A weekend `is_half_day=true` also deducts 0.5 because the trigger unconditionally assigns 0.5 at `supabase/migrations/0042_leave_working_days_and_refund.sql:102-106`, while only the Server Action rejects non-working half-days.

**Fix:** revoke direct update and use a narrow transactional decision RPC, or enforce field immutability/transition rules in a trigger plus restrictive column privileges. See Audit 1 §2 for the end-to-end authorization trace.

**Confidence:** high.

### NEEDS-FIX — Numeric payroll/leave invariants are missing from the database

**Evidence:** `salary_amount numeric(14,2)` has no non-negative check (`supabase/migrations/0004_employee_compensation.sql:8-24`); `leave_balances.balance` and `year` have no range checks (`supabase/migrations/0006_leave.sql:36-47`). The action enforces 0–365 and 2020–2100 only in Zod (`src/server/actions/leave.ts:1204-1221`). Document `file_size` also has no non-negative check (`supabase/migrations/0007_documents.sql:7-22`).

**Concrete trace:** an admin session or future import writes `salary_amount=-5000`, `balance=-25`, `year=0`, or `file_size=-1`. RLS permits the admin and Postgres accepts the row; dashboards and approval logic now operate on invalid HR state even though the normal form would reject it.

**Fix:** add `CHECK` constraints after auditing/repairing existing rows: salary/balance/file size non-negative, bounded leave year, trimmed non-empty names/titles, and product-approved currency format. Keep Zod for UX, DB constraints for truth.

**Confidence:** high.

### NEEDS-FIX — Future-table RLS event trigger fails open

**Evidence:** migration 0052 creates a superuser event trigger to enable RLS (`supabase/migrations/0052_schema_parity_rls_auto_enable_and_auth_user_indexes.sql:24-48`), but catches every failure and only `RAISE LOG`s it at `:49-52`. Default API grants are revoked by `supabase/migrations/0039_revoke_auto_grants.sql:1-14`.

**Concrete trace:** a future migration creates a public table under conditions where the event-trigger `ALTER TABLE` fails. DDL still commits because the exception is swallowed. A later migration explicitly grants access and assumes the auto-enable guarantee; the table is exposed without RLS.

**Fix:** re-raise the exception so table creation fails closed. Add a CI schema assertion over `pg_class.relrowsecurity` for every exposed public table after migrations; do not treat logs as enforcement.

**Confidence:** high.

### NEEDS-FIX — Direct document/task insert grants omit application integrity rules

**Evidence:** employee document insert policy checks only owner/uploader/non-payslip (`supabase/migrations/0007_documents.sql:52-59`); manager onboarding insert checks only direct-report employee (`supabase/migrations/0008_onboarding.sql:95-100`). Storage insert only checks UUID folder (`supabase/migrations/0015_storage_documents.sql:44-52`).

**Concrete trace:** an employee directly inserts document metadata that does not match the underlying object/category contract; a manager inserts a “completed” task with an unrelated assignee. All rows satisfy RLS yet violate application assumptions and omit audit.

**Fix:** remove the direct grants or encode all immutable/default/provenance rules in narrow RPCs. RLS is row filtering, not a substitute for column and transition integrity.

**Confidence:** high. Full exploit traces are in Audit 1.

### NEEDS-FIX — Fresh bootstrap is not atomic and can leave a misleading partial schema

**Evidence:** the bootstrap concatenates all migrations and seed (`scripts/db-bootstrap.mjs:82-107`) but does not pass `--single-transaction`; on error it explicitly says the DB may be half-applied (`:109-115`). Its “already initialized” probe checks only whether `public.profiles` exists (`:54-79`).

**Concrete trace:** migration 0030 fails after earlier tables were created. A rerun sees `profiles` and exits successfully without applying the remaining migrations/seed. The operator has a partial database that the tool reports as initialized.

**Fix:** run the fresh bundle in one transaction if every migration remains transaction-safe, then initialize the migration ledger in that same flow. At minimum, probe the complete ledger/latest migration, not one early table, and fail on partial state.

**Confidence:** high.

### NEEDS-FIX — Historical destructive migrations rely on asserted, not verified, preconditions

**Evidence:** migration 0032 drops `app_settings ... cascade` based on a comment that it is empty (`supabase/migrations/0032_app_settings.sql:13-20`); migration 0048 drops the payroll change-request table and all rows (`supabase/migrations/0048_drop_payroll_change_requests.sql:1-14`).

**Concrete trace:** an environment used the old key/value settings or retained payroll change-request records. Applying pending migrations permanently removes that data; no SQL precondition, copy/archive table, or row-count assertion protects the claim.

**Fix:** future destructive migrations should assert the expected state, migrate/archive data, and fail if assumptions are false. Already-applied files are append-only—do not edit them; record the discipline in the migration template and test from representative upgraded snapshots.

**Confidence:** high on behavior; repository history says the loss was intentional.

### NIT — RLS policy map does not match final effective grants/predicates

**Evidence:** policy map says employee document UPDATE (`docs/rls-policy-map.md:173-180`) but no such policy exists; it says admin app-settings INSERT/DELETE (`:287-294`) while migration 0032 grants only select/update (`supabase/migrations/0032_app_settings.sql:44-57`); it says non-admin holidays are active-only (`docs/rls-policy-map.md:155-162`) while policy returns all rows (`supabase/migrations/0040_public_holidays.sql:51-53`).

**Concrete trace:** a reviewer approves a change based on the map, but a direct request is denied for document update/settings insert or unexpectedly returns inactive holidays. The doc inventory gate cannot detect predicate/operation drift (`docs/rls-policy-map.md:3-7`).

**Fix:** generate the operation/policy inventory from a migrated scratch database and compare it with an explicit expected manifest. Keep prose for intent, executable assertions for reality.

**Confidence:** high.

## 3. Final RLS coverage table

Legend: “service only” means `authenticated` lacks an effective grant/policy and the app uses the server service role. “Default deny” is secure but implicit; it is not an explicit deny policy (Postgres has no required explicit deny object).

| Table | SELECT | INSERT | UPDATE | DELETE | Verdict |
|---|---|---|---|---|---|
| `profiles` | Own/manager/report/admin + fixed RPC projections | No authenticated grant | Own limited columns; admin broader | No authenticated grant | RLS on; role column protected. Direct self-edit is broader than app. |
| `departments` | All authenticated | Admin | Admin | Admin | Complete and aligned. |
| `employee_records` | Own/report/admin | Admin | Admin | Admin | Complete; FKs mostly restrict deletion. |
| `employee_compensation` | Own/admin; manager report summary via fixed RPC | Admin | Own restricted columns + admin | Admin | Strong projection design; missing value constraints. |
| `leave_types` | Active or admin | Admin | Admin | Admin | Complete. |
| `leave_balances` | Own/report/admin | Admin | Admin/trigger | Admin | Complete row scope; missing numeric/year constraints. |
| `leave_requests` | Own/report/admin | Own self-service + admin | Own cancel, manager report decision, admin | No grant (default deny) | **Column/transition gap on UPDATE.** |
| `public_holidays` | Every row to authenticated | Admin | Admin | Admin | RLS on; SELECT broader than docs. |
| `documents` | Own/report-safe/admin | Employee own non-payslip + admin | Admin only | No authenticated grant | Insert broader than app; docs incorrectly claim employee UPDATE. |
| `onboarding_templates` | Active or admin | Admin | Admin | Admin | Complete. |
| `onboarding_template_items` | Items under active templates/admin | Admin | No grant | Admin | Complete for app behavior. |
| `onboarding_tasks` | Own/report/admin | Manager report + admin | Service only after migration 0017 | Service only | Manager insert too broad; docs overstate direct update. |
| `performance_review_cycles` | Scoped active/related + admin | Service only | Service only | Service only | Intentional Server Action ownership; default deny mutations. |
| `performance_goals` | Own/report/admin | Service only | Service only | Service only | Intentional service-only mutation. |
| `performance_reviews` | Own/report/admin | Service only | Service only | Service only | Intentional service-only mutation. |
| `audit_logs` | Admin | Service-role grant only | No grant/policy | No grant/policy | Append-only to app roles; application insert is fail-open. |
| `app_settings` | Admin | No grant | Admin | No grant | Typed singleton final schema; docs stale. |
| `storage.objects` / `hr-documents` | Own folder, safe report object, admin | Employee own folder + admin | Admin policy | Admin policy | Private bucket, but direct employee insert bypasses app category contract. |

All surviving public application tables listed above have `ENABLE ROW LEVEL SECURITY` in migration history. `payroll_change_requests` is dropped by migration 0048 and is not part of final coverage.

## 4. Trigger and FK notes

- `handle_new_user` is security-definer with pinned search path and idempotent profile insert (`supabase/migrations/0011_triggers.sql:45-68`), but open signup turns that robustness into an account-creation exposure (Audit 2).
- `sync_role_to_jwt` pins `public, auth` and writes only the corresponding Auth user (`supabase/migrations/0013_role_sync.sql:12-27`). App/RLS authority remains the profile row, so JWT drift is not a demonstrated elevation path.
- Core employee-linked data mostly uses `ON DELETE RESTRICT`, preserving HR history. Actor/provenance FKs often use `SET NULL`, which is appropriate for retaining records but means display-name reconstruction depends on audit metadata/snapshots.
- Security-definer RPCs inspected revoke public execution and grant only intended roles (for example manager compensation at `supabase/migrations/0050_manager_compensation_summary_rpc.sql:18-55`).

## 5. Could not verify

- **UNVERIFIED:** final live schema parity, policy enablement, owners, grants, and migration ledger were not queried; this table is reconstructed from ordered migrations.
- **UNVERIFIED:** existing rows may already violate proposed constraints; a data audit is required before adding `NOT VALID`/validated checks.
- **UNVERIFIED:** migration upgrade safety was not replayed from historical database snapshots, and bootstrap/migrate commands were not run.
- **UNVERIFIED:** PostgreSQL execution plans and trigger concurrency under real isolation/load require database tests.
