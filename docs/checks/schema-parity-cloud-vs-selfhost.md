# Schema parity — cloud vs self-host

_Generated: 2026-06-10T13:49:17Z by infra/supabase/checks/schema-parity.sh_

**Verdict: PARITY (public schema identical)**

> This file is **auto-generated** — do not hand-edit. The durable human
> classification of each diff + decisions taken lives in
> [`schema-parity-notes.md`](schema-parity-notes.md).

Schema-only DDL dumped from both ends via the PG17 client in `supabase-db`,
normalized (comments / SET / set_config / restrict markers / blank lines stripped),
then `diff -u` (cloud = left/-, self-host = right/+).

| Schema | Changed diff lines | Notes |
|---|---|---|
| `public` | 0 | **primary verdict** (manual SQL / RLS / grants drift) |
| `auth` | 0 | supabase-managed; image-version differences expected |
| `storage` | 39 | supabase-managed; image-version differences expected |

## `public` schema diff

_No differences._

## `auth` schema diff

_No differences._

## `storage` schema diff

```diff
--- /var/folders/_m/z1kvz9jj40vd70t39bfqxcbh0000gp/T/tmp.EVobVv3ZPo/cloud.storage.sql	2026-06-10 17:49:14
+++ /var/folders/_m/z1kvz9jj40vd70t39bfqxcbh0000gp/T/tmp.EVobVv3ZPo/self.storage.sql	2026-06-10 17:49:14
@@ -793,7 +793,29 @@
     type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
     created_at timestamp with time zone DEFAULT now() NOT NULL,
     updated_at timestamp with time zone DEFAULT now() NOT NULL
+);
+CREATE TABLE storage.iceberg_namespaces (
+    id uuid DEFAULT gen_random_uuid() NOT NULL,
+    bucket_name text NOT NULL,
+    name text NOT NULL COLLATE pg_catalog."C",
+    created_at timestamp with time zone DEFAULT now() NOT NULL,
+    updated_at timestamp with time zone DEFAULT now() NOT NULL,
+    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
+    catalog_id uuid NOT NULL
 );
+CREATE TABLE storage.iceberg_tables (
+    id uuid DEFAULT gen_random_uuid() NOT NULL,
+    namespace_id uuid NOT NULL,
+    bucket_name text NOT NULL,
+    name text NOT NULL COLLATE pg_catalog."C",
+    location text NOT NULL,
+    created_at timestamp with time zone DEFAULT now() NOT NULL,
+    updated_at timestamp with time zone DEFAULT now() NOT NULL,
+    remote_table_id text,
+    shard_key text,
+    shard_id text,
+    catalog_id uuid NOT NULL
+);
 CREATE TABLE storage.migrations (
     id integer NOT NULL,
     name character varying(100) NOT NULL,
@@ -856,6 +878,10 @@
     ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);
 ALTER TABLE ONLY storage.buckets_vectors
     ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);
+ALTER TABLE ONLY storage.iceberg_namespaces
+    ADD CONSTRAINT iceberg_namespaces_pkey PRIMARY KEY (id);
+ALTER TABLE ONLY storage.iceberg_tables
+    ADD CONSTRAINT iceberg_tables_pkey PRIMARY KEY (id);
 ALTER TABLE ONLY storage.migrations
     ADD CONSTRAINT migrations_name_key UNIQUE (name);
 ALTER TABLE ONLY storage.migrations
@@ -871,6 +897,9 @@
 CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);
 CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);
 CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);
+CREATE UNIQUE INDEX idx_iceberg_namespaces_bucket_id ON storage.iceberg_namespaces USING btree (catalog_id, name);
+CREATE UNIQUE INDEX idx_iceberg_tables_location ON storage.iceberg_tables USING btree (location);
+CREATE UNIQUE INDEX idx_iceberg_tables_namespace_id ON storage.iceberg_tables USING btree (catalog_id, namespace_id, name);
 CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);
 CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");
 CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");
@@ -880,6 +909,12 @@
 CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
 CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();
 CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();
+ALTER TABLE ONLY storage.iceberg_namespaces
+    ADD CONSTRAINT iceberg_namespaces_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;
+ALTER TABLE ONLY storage.iceberg_tables
+    ADD CONSTRAINT iceberg_tables_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES storage.buckets_analytics(id) ON DELETE CASCADE;
+ALTER TABLE ONLY storage.iceberg_tables
+    ADD CONSTRAINT iceberg_tables_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES storage.iceberg_namespaces(id) ON DELETE CASCADE;
 ALTER TABLE ONLY storage.objects
     ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);
 ALTER TABLE ONLY storage.s3_multipart_uploads
@@ -896,6 +931,8 @@
 ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;
 CREATE POLICY employee_insert_own_objects ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'hr-documents'::text) AND (public.get_user_role() = 'employee'::public.user_role) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
 CREATE POLICY employee_select_own_objects ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'hr-documents'::text) AND (public.get_user_role() = 'employee'::public.user_role) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
+ALTER TABLE storage.iceberg_namespaces ENABLE ROW LEVEL SECURITY;
+ALTER TABLE storage.iceberg_tables ENABLE ROW LEVEL SECURITY;
 CREATE POLICY manager_select_direct_report_objects ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'hr-documents'::text) AND (public.get_user_role() = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
    FROM public.documents d
   WHERE ((d.storage_path = objects.name) AND public.is_direct_report(d.employee_id) AND (d.deleted_at IS NULL) AND (d.category <> ALL (ARRAY['payslip'::public.document_category, 'id_document'::public.document_category, 'contract'::public.document_category])))))));
```

## storage.buckets

_Identical._

## Manual checks (not auto-diffable)

- **GoTrue/auth config** (lives in GoTrue env, not the DB): compare the cloud
  dashboard Auth settings against `infra/supabase/.env` — SITE_URL / redirect
  URLs, JWT expiry, password policy, mailer/SMTP, external providers.
- **Hooks / webhooks / cron**: `supabase_functions` + `net` rows both sides
  (no `cron` schema present → pg_cron N/A).
