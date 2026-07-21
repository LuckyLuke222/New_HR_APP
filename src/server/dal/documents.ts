import "server-only";

import { createClient } from "@/lib/supabase/server";
import { safeDalError } from "@/server/dal/errors";

export type DocumentCategory =
  | "contract"
  | "id_document"
  | "payslip"
  | "policy"
  | "other";

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "contract",
  "id_document",
  "payslip",
  "policy",
  "other",
];

export type DocumentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  uploadedById: string;
  uploaderName: string;
  category: DocumentCategory;
  title: string;
  storagePath: string;
  fileSize: number | null;
  mimeType: string | null;
  isShared: boolean;
  createdAt: string;
};

export type DocumentFilters = {
  category?: DocumentCategory | "all";
  employeeId?: string;
};

export async function getDocuments(
  filters: DocumentFilters = {},
): Promise<{ documents: DocumentRow[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select(
      "id, employee_id, uploaded_by, category, title, storage_path, file_size, mime_type, is_shared, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.category && filters.category !== "all") {
    query = query.eq("category", filters.category);
  }
  if (filters.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }

  const { data, error } = await query;
  if (error) return { documents: [], error: safeDalError("documents.getDocuments", error, "Unable to load documents.") };

  const rows = data ?? [];
  const employeeIds = unique(rows.map((r) => r.employee_id as string));
  const uploaderIds = unique(rows.map((r) => r.uploaded_by as string));
  const allIds = unique([...employeeIds, ...uploaderIds]);

  const profiles = await fetchProfileNames(supabase, allIds);

  return {
    documents: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
      uploadedById: row.uploaded_by as string,
      uploaderName: profiles.get(row.uploaded_by as string) ?? "Unknown",
      category: row.category as DocumentCategory,
      title: row.title as string,
      storagePath: row.storage_path as string,
      fileSize: row.file_size as number | null,
      mimeType: row.mime_type as string | null,
      isShared: row.is_shared as boolean,
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}

export async function getDocumentById(
  id: string,
): Promise<{ document: DocumentRow | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, employee_id, uploaded_by, category, title, storage_path, file_size, mime_type, is_shared, created_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { document: null, error: safeDalError("documents.getDocumentById", error, "Unable to load document.") };
  if (!data) return { document: null, error: null };

  const profiles = await fetchProfileNames(supabase, [
    data.employee_id as string,
    data.uploaded_by as string,
  ]);

  return {
    document: {
      id: data.id as string,
      employeeId: data.employee_id as string,
      employeeName: profiles.get(data.employee_id as string) ?? "Unknown",
      uploadedById: data.uploaded_by as string,
      uploaderName: profiles.get(data.uploaded_by as string) ?? "Unknown",
      category: data.category as DocumentCategory,
      title: data.title as string,
      storagePath: data.storage_path as string,
      fileSize: data.file_size as number | null,
      mimeType: data.mime_type as string | null,
      isShared: data.is_shared as boolean,
      createdAt: data.created_at as string,
    },
    error: null,
  };
}

async function fetchProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  // Route through the security-definer RPC (migration 0046) so admin uploaders
  // hidden from non-direct-report employees by profiles RLS still resolve to a
  // display name instead of the "Unknown" fallback.
  const { data } = await supabase.rpc("get_profile_display_names", { p_ids: ids });
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) {
    map.set(row.id, row.display_name);
  }
  return map;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
