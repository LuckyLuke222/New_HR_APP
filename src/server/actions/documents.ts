"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_POLICY,
  MANAGER_UPLOAD_CATEGORIES,
  formatDocumentUploadMaxSize,
} from "@/lib/document-upload-policy";
import {
  insertAuditLog,
  logEntityNotFound,
  logValidationFailed,
} from "@/server/audit";
import type { DocumentCategory } from "@/server/dal/documents";
import { getDirectReportIds } from "@/server/dal/onboarding";

const BUCKET = "hr-documents";
// Signed URLs expire after 60 seconds — enough time to open a download.
const SIGNED_URL_EXPIRY_SECONDS = 60;

export type DocumentActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedDocumentValues;
};

export type SubmittedDocumentValues = {
  employeeId?: string;
  category?: string;
  title?: string;
};

function documentSubmittedValues(formData: FormData): SubmittedDocumentValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  // The `file` input is intentionally excluded — File objects cannot be
  // round-tripped via FormData and `<input type="file">` ignores defaultValue.
  return {
    employeeId: get("employeeId") || get("employeeIdSearch"),
    category: get("category"),
    title: get("title"),
  };
}

const ALLOWED_CATEGORIES: DocumentCategory[] = [
  "contract",
  "id_document",
  "payslip",
  "policy",
  "other",
];

// ─── Upload ───────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  employeeId: postgresUuid("Invalid employee."),
  category: z.enum(
    ALLOWED_CATEGORIES as [DocumentCategory, ...DocumentCategory[]],
    { error: "Select a valid category." },
  ),
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters.")
    .max(160, "Title must be 160 characters or fewer."),
});

export async function uploadDocument(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "action:documents.upload",
  });

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return {
      success: false,
      message: "Select a file to upload.",
      values: documentSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const resolvedEmployeeId = await resolveUploadEmployeeId({
    admin,
    role: user.role,
    userId: user.id,
    selectedValue: formData.get("employeeId"),
    searchValue: formData.get("employeeIdSearch"),
  });

  const parsed = uploadSchema.safeParse({
    employeeId: resolvedEmployeeId,
    category: formData.get("category"),
    title: formData.get("title"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "documents.upload",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: documentSubmittedValues(formData),
    };
  }

  const { employeeId, category, title } = parsed.data;
  const fileValidationError = validateUploadFile(file, category);
  if (fileValidationError) {
    return {
      success: false,
      message: fileValidationError,
      values: documentSubmittedValues(formData),
    };
  }

  // Employees can only upload for themselves.
  if (user.role === "employee" && employeeId !== user.id) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "document",
      metadata: {
        attempted_resource: "action:documents.upload",
        target_employee_id: employeeId,
        role: user.role,
      },
    });
    return {
      success: false,
      message: "You can only upload documents for yourself.",
      values: documentSubmittedValues(formData),
    };
  }

  // Payslips are admin-only (sensitive compensation data) — blocks employee AND manager.
  if (user.role !== "admin" && category === "payslip") {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "document",
      metadata: {
        attempted_resource: "action:documents.upload",
        target_employee_id: employeeId,
        category,
        reason: "non_admin_payslip_upload",
        role: user.role,
      },
    });
    return {
      success: false,
      message: "Payslips are uploaded by administrators only.",
      values: documentSubmittedValues(formData),
    };
  }

  // A manager may upload for THEMSELVES (any non-payslip category — payslip is
  // already blocked above for non-admins; managers see their own docs via the
  // role-agnostic select_own_documents policy) OR for a DIRECT REPORT but only in
  // categories they can see for reports (policy/other — contract/id_document stay
  // admin-only per the documents RLS), so a manager never creates a document they
  // can't then see.
  if (user.role === "manager") {
    const directReportIds = await getDirectReportIds(user.id);
    const isSelf = employeeId === user.id;
    const isReportInScope =
      directReportIds.includes(employeeId) &&
      MANAGER_UPLOAD_CATEGORIES.includes(category);
    const inScope = isSelf || isReportInScope;
    if (!inScope) {
      await insertAuditLog({
        actorId: user.id,
        action: "auth.access_denied",
        entity: "document",
        metadata: {
          attempted_resource: "action:documents.upload",
          target_employee_id: employeeId,
          category,
          reason: "manager_upload_outside_scope",
          role: user.role,
        },
      });
      return {
        success: false,
        message: "Managers can upload their own documents, or Policy/Other documents for a direct report.",
        values: documentSubmittedValues(formData),
      };
    }
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${employeeId}/${category}/${randomUUID()}.${ext}`;

  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (storageError) {
    console.error("documents.upload storage failed", storageError);
    return {
      success: false,
      message: "File could not be uploaded.",
      values: documentSubmittedValues(formData),
    };
  }

  const { data: docData, error: dbError } = await admin
    .from("documents")
    .insert({
      employee_id: employeeId,
      uploaded_by: user.id,
      category,
      title,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      is_shared: false,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("documents.upload metadata insert failed", dbError);
    // Best-effort: remove the orphaned Storage object.
    await admin.storage.from(BUCKET).remove([storagePath]);
    return {
      success: false,
      message: "Document metadata could not be saved.",
      values: documentSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "document.uploaded",
    entity: "document",
    entityId: docData.id as string,
    metadata: {
      employee_id: employeeId,
      category,
      file_size: file.size,
      mime_type: file.type || null,
    },
  });
  revalidatePath("/documents");
  revalidatePath(`/employees/${employeeId}`);

  return { success: true, message: "Document uploaded." };
}

function validateUploadFile(file: File, category: DocumentCategory): string | null {
  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return `File must be ${formatDocumentUploadMaxSize()} or smaller.`;
  }

  const rule = DOCUMENT_UPLOAD_POLICY[category];
  const extension = fileExtension(file.name);
  const mimeType = file.type.toLowerCase();

  if (!mimeType || !rule.mimeTypes.includes(mimeType)) {
    return `${CATEGORY_LABELS[category]} uploads must be ${rule.label}.`;
  }

  if (!extension || !rule.extensions.includes(extension)) {
    return `${CATEGORY_LABELS[category]} uploads must use ${rule.label} files.`;
  }

  return null;
}

function fileExtension(name: string): string | null {
  const index = name.lastIndexOf(".");
  if (index < 0) return null;
  return name.slice(index).toLowerCase();
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Contract",
  id_document: "ID document",
  payslip: "Payslip",
  policy: "Policy",
  other: "Other document",
};

async function resolveUploadEmployeeId({
  admin,
  role,
  userId,
  selectedValue,
  searchValue,
}: {
  admin: ReturnType<typeof createAdminClient>;
  role: string;
  userId: string;
  selectedValue: FormDataEntryValue | null;
  searchValue: FormDataEntryValue | null;
}): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  if (role !== "admin") {
    return userId;
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, work_email")
    .or(`display_name.ilike.%${search}%,work_email.ilike.%${search}%`)
    .order("display_name")
    .limit(10);

  if (error) {
    console.error("documents.resolve_upload_employee failed", error);
    return null;
  }

  const lower = search.toLowerCase();
  const exact = data?.find((profile) => profileLabel(profile).toLowerCase() === lower);
  const partial = data?.find((profile) =>
    profileLabel(profile).toLowerCase().includes(lower),
  );
  return (exact ?? partial)?.id ?? null;
}

function profileLabel(profile: {
  display_name: string | null;
  work_email: string | null;
}): string {
  return profile.display_name ?? profile.work_email ?? "Unassigned";
}

// ─── Signed URL download ──────────────────────────────────────────────────────

export async function getSignedDownloadUrl(
  documentId: string,
): Promise<{ url: string | null; error: string | null }> {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: `action:documents.download:${documentId}`,
  });

  // Validate documentId.
  const idCheck = z.string().uuid().safeParse(documentId);
  if (!idCheck.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "documents.download",
      zodError: idCheck.error,
    });
    return { url: null, error: "Invalid document." };
  }

  // Fetch via session client — RLS enforces visibility.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, storage_path, category, employee_id, deleted_at")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (docError || !doc) {
    if (!docError) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "documents.download",
        entity: "document",
        entityId: documentId,
        reason: "missing_or_rls_denied",
      });
    }
    return { url: null, error: "Document not found or access denied." };
  }

  // Generate signed URL via admin client (service-role bypasses Storage auth).
  const admin = createAdminClient();
  const { data: signedData, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path as string, SIGNED_URL_EXPIRY_SECONDS, {
      download: true,
    });

  if (signedError || !signedData?.signedUrl) {
    console.error("documents.download sign failed", signedError);
    return { url: null, error: "Download link could not be generated." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "document.downloaded",
    entity: "document",
    entityId: documentId,
    metadata: {
      category: doc.category,
      employee_id: doc.employee_id,
    },
  });

  return { url: signedData.signedUrl, error: null };
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function softDeleteDocument(
  _prev: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:documents.delete",
  });

  const parsed = z
    .object({ documentId: z.string().uuid("Invalid document.") })
    .safeParse({ documentId: formData.get("documentId") });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "documents.delete",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid document." };
  }

  const admin = createAdminClient();
  const { data: doc, error: lookupError } = await admin
    .from("documents")
    .select("id, storage_path, employee_id, category")
    .eq("id", parsed.data.documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError || !doc) {
    if (!lookupError) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "documents.delete",
        entity: "document",
        entityId: parsed.data.documentId,
      });
    }
    return { success: false, message: "Document not found." };
  }

  const { error } = await admin
    .from("documents")
    .update({ deleted_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", parsed.data.documentId);

  if (error) {
    console.error("documents.delete failed", error);
    return { success: false, message: "Document could not be deleted." };
  }

  // Best-effort Storage cleanup. The metadata row is already soft-deleted so
  // the file is unreachable via the app regardless; log and continue if removal fails.
  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .remove([doc.storage_path as string]);
  if (storageError) {
    console.warn("documents.delete storage cleanup failed", storageError);
  }

  await insertAuditLog({
    actorId: user.id,
    action: "document.deleted",
    entity: "document",
    entityId: parsed.data.documentId,
    metadata: {
      employee_id: doc.employee_id,
      category: doc.category,
      storage_path: doc.storage_path,
    },
  });
  revalidatePath("/documents");
  revalidatePath(`/employees/${doc.employee_id}`);

  return { success: true, message: "Document deleted." };
}
