-- KushHR: sync_role_to_jwt() — mirrors profiles.role into auth.users.raw_app_meta_data
-- so the Supabase JWT carries the role claim. This lets RLS policies and server
-- utilities read the role from the JWT without a round-trip to profiles.
--
-- State ownership rule: profiles.role is the truth. The JWT claim is a derived
-- read cache. If they ever conflict, the DB row wins.
-- Blast-radius note: if this trigger is dropped or fails, role changes in the DB
-- silently stop propagating to JWT until the user's token is refreshed (~1h).
-- See docs/systems-thinking.md for the full blast-radius map.

create or replace function public.sync_role_to_jwt()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role::text)
  where id = new.id;
  return new;
end;
$$;

create trigger sync_role_to_jwt_on_profile_change
  after insert or update of role on public.profiles
  for each row execute function public.sync_role_to_jwt();
