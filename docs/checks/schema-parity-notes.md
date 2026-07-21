# Schema parity — manual classification notes

Companion to the **auto-generated** `schema-parity-cloud-vs-selfhost.md` (regenerated
on every `infra/supabase/checks/schema-parity.sh` run — never hand-edit that file).
This file holds the durable human classification of each diff and the decisions taken.

## Session 166 (2026-06-10) — first parity run

The automated verdict flags ANY `public` diff as `DRIFT`. Investigated:

| # | Object | Schema | Direction | Classification |
|---|---|---|---|---|
| 1 | `public.rls_auto_enable()` + event trigger `ensure_rls` (`ddl_command_end`) | public | cloud-only | **DRIFT — out-of-band.** Not in `supabase/migrations/*` (verified by grep). Defense-in-depth: auto-enables RLS on any newly-created `public` table. Low impact today (every existing table already has RLS via migrations); a posture divergence for *future* tables. |
| 2 | `idx_users_email`, `idx_users_name` (on `raw_user_meta_data->>'name'`), `idx_users_created_at_desc`, `idx_users_last_sign_in_at_desc` | auth | cloud-only | **DRIFT — out-of-band** perf indexes on `auth.users` (admin user listing / search / sort). Negligible at 15–20 users; `idx_users_email` largely redundant with GoTrue's existing unique-email constraint. |
| 3 | `storage.iceberg_namespaces` / `iceberg_tables` (+ indexes / FKs / RLS) | storage | self-host-only | **BENIGN** — newer storage-api image ships Iceberg/analytics tables; the app never touches them. Expected image-version noise. |

**Net:** no cloud object the app depends on is missing from self-host. The two cloud-only
drifts (#1, #2) are manual additions never captured in migrations.

**Decision (Session 166): port BOTH #1 + #2** into a new idempotent `supabase/migrations/*`
migration for exact parity + reproducibility — queued as its own planned change (plan +
Systems Thinking; touches a SECURITY DEFINER DDL event trigger + `auth.users`). Tracked in
`docs/follow-ups.md`. After that migration is applied to self-host, this run's `public` +
`auth` diffs should drop to zero (only the benign `storage` image noise remaining).

### RESOLVED — Session 166 (2026-06-10) by migration `0052`

`supabase/migrations/0052_schema_parity_rls_auto_enable_and_auth_user_indexes.sql` recreates
#1 (`rls_auto_enable` fn + `ensure_rls` event trigger) and #2 (the 4 `auth.users` indexes),
byte-exact from cloud, idempotent. Applied to the running self-host DB as `supabase_admin`
(superuser required for the event trigger). **Re-run verdict: PARITY** — `public` = 0 and
`auth` = 0 changed lines; only the benign `storage` iceberg image noise (#3) remains.
Owner on self-host is `supabase_admin` vs `postgres` on cloud — invisible under `--no-owner`,
functionally equivalent. **Cutover constraint:** the migration set must be applied as
`supabase_admin` so `0052`'s event trigger succeeds on a fresh rebuild.
