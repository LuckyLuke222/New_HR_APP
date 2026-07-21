import type { DocumentCategory } from "@/server/dal/documents";

export const DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

// Categories a manager may upload for a direct report. Must stay equal to what a
// manager can SEE for reports under BOTH RLS surfaces (policy/other) — uploading
// a category they can't see would create a document invisible to the uploader:
//   - public.documents          → manager_select_direct_report_documents (0014)
//   - storage.objects           → manager_select_direct_report_objects (0015)
// both deny payslip/id_document/contract for reports, leaving policy/other.
// contract/id_document/payslip remain admin-only.
export const MANAGER_UPLOAD_CATEGORIES: DocumentCategory[] = ["policy", "other"];

export type DocumentUploadRule = {
  label: string;
  extensions: readonly string[];
  mimeTypes: readonly string[];
};

export const DOCUMENT_UPLOAD_POLICY: Record<DocumentCategory, DocumentUploadRule> = {
  contract: {
    label: "PDF, DOC, or DOCX",
    extensions: [".pdf", ".doc", ".docx"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  id_document: {
    label: "PDF, JPG, or PNG",
    extensions: [".pdf", ".jpg", ".jpeg", ".png"],
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
  payslip: {
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  policy: {
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  other: {
    label: "PDF, DOC, DOCX, JPG, PNG, or TXT",
    extensions: [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt"],
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "text/plain",
    ],
  },
};

export const DOCUMENT_UPLOAD_ACCEPT = uniqueStrings(
  Object.values(DOCUMENT_UPLOAD_POLICY).flatMap((rule) => [
    ...rule.extensions,
    ...rule.mimeTypes,
  ]),
).join(",");

export const DOCUMENT_STORAGE_ALLOWED_MIME_TYPES = uniqueStrings(
  Object.values(DOCUMENT_UPLOAD_POLICY).flatMap((rule) => rule.mimeTypes),
);

export function formatDocumentUploadMaxSize(): string {
  return `${DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MB`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
