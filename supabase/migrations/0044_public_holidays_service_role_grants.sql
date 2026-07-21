-- KushHR: grant service_role write privileges on public_holidays.
--
-- Migration 0040 created the table and granted SELECT/INSERT/UPDATE/DELETE to
-- authenticated, but missed service_role. Migration 0039 had revoked the
-- automatic grants Supabase used to apply to new tables, so service_role
-- got nothing. Result: every admin-client write through createPublicHoliday,
-- updatePublicHoliday, togglePublicHoliday, bulkUploadPublicHolidays failed
-- with SQLSTATE 42501 (insufficient_privilege).
--
-- Surfaced 2026-05-28 during UAT C1 — "Holiday could not be created (42501):
-- permission denied for table public_holidays".

grant select, insert, update, delete on public.public_holidays to service_role;
