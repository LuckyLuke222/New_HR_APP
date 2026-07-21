import { requireRole } from "@/lib/supabase/helpers";
import { getDocuments, DOCUMENT_CATEGORIES, type DocumentCategory } from "@/server/dal/documents";
import { getAllEmployeeOptions, getManagerUploadEmployeeOptions } from "@/server/dal/employees";
import { DocumentUploadForm } from "@/components/documents/document-upload-form";
import { DocumentDownloadButton } from "@/components/documents/document-download-button";
import { SoftDeleteDocumentForm } from "@/components/documents/soft-delete-document-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

type PageProps = {
  searchParams: Promise<{ category?: string; employeeId?: string }>;
};

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Contract",
  id_document: "ID Document",
  payslip: "Payslip",
  policy: "Policy",
  other: "Other",
};

export default async function DocumentsPage({ searchParams }: PageProps) {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/documents",
  });

  const params = await searchParams;
  const categoryFilter = DOCUMENT_CATEGORIES.includes(params.category as DocumentCategory)
    ? (params.category as DocumentCategory)
    : undefined;
  const employeeFilter = params.employeeId ?? undefined;

  const [{ documents, error }, { employees: employeeOptions }] = await Promise.all([
    getDocuments({ category: categoryFilter, employeeId: employeeFilter }),
    user.role === "admin"
      ? getAllEmployeeOptions()
      : user.role === "manager"
        ? getManagerUploadEmployeeOptions(user.id)
        : Promise.resolve({ employees: [], error: null }),
  ]);

  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";
  // Admin + manager get the employee picker (manager's list is scoped to direct reports).
  const showPicker = isAdmin || isManager;

  const uploadEmployees = employeeOptions.map((m) => ({ id: m.id, label: m.label }));

  // Admin uploads for anyone; employee for self; manager for self (any non-payslip)
  // or a direct report (policy/other). Managers always have themselves, so they can always upload.
  const canUpload = isAdmin || isManager || user.role === "employee";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "All employee documents."
              : user.role === "manager"
                ? "Your documents and your direct reports'."
                : "Your documents."}
          </p>
        </div>
      </div>

      {/* Upload panel */}
      {canUpload && (
        <CollapsibleSection title="Upload document" id="document-upload-panel">
          <DocumentUploadForm
            employees={uploadEmployees.map((e) => ({ id: e.id, name: e.label }))}
            currentUserId={user.id}
            isAdmin={isAdmin}
            isManager={isManager}
            showPicker={showPicker}
          />
        </CollapsibleSection>
      )}

      {/* Filter bar */}
      <form action="/documents" className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="category" className="sr-only">Filter by category</label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter ?? ""}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All categories</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">Apply</Button>
        {categoryFilter && (
          <Button asChild variant="ghost">
            <a href="/documents">Clear</a>
          </Button>
        )}
      </form>

      {/* Document list */}
      <section className="rounded-xl border bg-card text-card-foreground shadow">
        {error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>Unable to load documents. {error}</AlertDescription>
            </Alert>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-sm font-semibold">No documents found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {categoryFilter ? "Try a different category filter." : "Upload a document to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Title</th>
                  {user.role !== "employee" && (
                    <th scope="col" className="px-4 py-3">Employee</th>
                  )}
                  <th scope="col" className="px-4 py-3">Category</th>
                  <th scope="col" className="px-4 py-3">Uploaded by</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {documents.map((doc) => (
                  <tr key={doc.id} className="align-middle hover:bg-muted/40">
                    <td className="max-w-xs truncate px-4 py-3 font-medium text-foreground">
                      {doc.title}
                    </td>
                    {user.role !== "employee" && (
                      <td className="px-4 py-3 text-foreground">{doc.employeeName}</td>
                    )}
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="font-medium">
                        {CATEGORY_LABELS[doc.category]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{doc.uploaderName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <DocumentDownloadButton documentId={doc.id} />
                        {isAdmin && <SoftDeleteDocumentForm documentId={doc.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
