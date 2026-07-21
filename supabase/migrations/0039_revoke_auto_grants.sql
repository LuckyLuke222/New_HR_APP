-- Opt in to Supabase explicit-grants model (supabase/discussions/45329).
-- New tables in public no longer receive automatic grants to anon,
-- authenticated, or service_role. Every future migration must include
-- explicit GRANT statements (see 0000_scaffold_conventions.sql rule 3).
--
-- Existing tables are unaffected — their grants are already explicit.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;
