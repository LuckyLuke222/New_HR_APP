-- 0052_schema_parity_rls_auto_enable_and_auth_user_indexes.sql
--
-- Capture two objects that existed in the Supabase CLOUD project but were added
-- by hand (dashboard SQL) and never written into a migration — so the
-- migration-rebuilt self-host DB was missing them. Surfaced by the Session-166
-- schema-parity gate (docs/checks/schema-parity-cloud-vs-selfhost.md). Porting
-- them makes "migrations are the complete source of truth" actually true.
--
-- !! SUPERUSER REQUIRED !!  Unlike 0001-0051, this migration creates an EVENT
-- TRIGGER, which Postgres only allows a superuser to do. On the self-host stack
-- `postgres` is NOT a superuser (Supabase strips it); the superuser is
-- `supabase_admin`. Apply this file (and, at cutover, the whole migration set)
-- as supabase_admin:
--
--   docker exec -i supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
--     < supabase/migrations/0052_schema_parity_rls_auto_enable_and_auth_user_indexes.sql
--
-- Owner note: on self-host these objects end up owned by `supabase_admin` vs
-- `postgres` on cloud. That difference is invisible to the parity diff
-- (pg_dump --no-owner) and functionally irrelevant (the superuser definer can
-- ALTER TABLE ... ENABLE RLS). Idempotent: safe to re-run, and a no-op on cloud
-- (which already has these).

-- 1) Defense-in-depth: auto-enable RLS on any newly-created public table.
--    Body is byte-exact from the cloud project (pg_get_functiondef). DO NOT
--    "tidy" the body — the `IN ('public') AND NOT IN ('pg_catalog',…)` guard
--    has redundant-looking exclusions, but ANY edit changes the stored function
--    source (prosrc) and reintroduces the schema-parity drift this migration
--    closed. Comments must stay OUTSIDE the $function$ body for the same reason.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- No GRANT EXECUTE: rls_auto_enable() is invoked only by the ensure_rls event
-- trigger (superuser/definer context), never by an application role — so anon /
-- authenticated must NOT be granted execute on it.

-- 2) The event trigger that drives the function. No IF NOT EXISTS form exists
--    for event triggers, so guard it. Matches cloud: ddl_command_end + the
--    three CREATE-TABLE-family tags, default-enabled ('O' → inert in replica
--    mode, so cutover data-reloads are unaffected).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;

-- 3) Performance indexes on auth.users (admin user listing / search / sort).
--    Defs byte-exact from cloud (pg_indexes).
CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON auth.users USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON auth.users USING btree (email);
CREATE INDEX IF NOT EXISTS idx_users_last_sign_in_at_desc ON auth.users USING btree (last_sign_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_name ON auth.users USING btree (((raw_user_meta_data ->> 'name'::text))) WHERE ((raw_user_meta_data ->> 'name'::text) IS NOT NULL);
