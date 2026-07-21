-- Phase 13 Round 3: document upload file policy.
--
-- Keep the private bucket aligned with the Server Action category policy:
-- - Max object size: 10 MiB.
-- - Global MIME allowlist is the union of per-category allowed types.
-- Category-specific rules are enforced in src/server/actions/documents.ts
-- before Storage upload, because Supabase bucket configuration is bucket-wide.

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain'
  ]
where id = 'hr-documents';
