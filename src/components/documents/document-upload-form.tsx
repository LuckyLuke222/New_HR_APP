"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelectField } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_POLICY,
  MANAGER_UPLOAD_CATEGORIES,
  formatDocumentUploadMaxSize,
} from "@/lib/document-upload-policy";
import { uploadDocument, type DocumentActionState } from "@/server/actions/documents";
import type { DocumentCategory } from "@/server/dal/documents";

type EmployeeOption = { id: string; name: string };

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  contract: "Contract",
  id_document: "ID Document",
  payslip: "Payslip",
  policy: "Policy",
  other: "Other",
};

const EMPLOYEE_CATEGORIES: DocumentCategory[] = ["contract", "id_document", "policy", "other"];
const ADMIN_CATEGORIES: DocumentCategory[] = ["contract", "id_document", "payslip", "policy", "other"];

const initial: DocumentActionState = { success: false, message: "" };

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Props = {
  employees: EmployeeOption[];
  currentUserId: string;
  isAdmin: boolean;
  isManager: boolean;
  // Show the employee picker (admin → all; manager → direct reports).
  // When false (employee), the form posts a hidden self employeeId.
  showPicker: boolean;
  onSuccess?: () => void;
};

export function DocumentUploadForm({ employees, currentUserId, isAdmin, isManager, showPicker, onSuccess }: Props) {
  const [state, action, pending] = useActionState(uploadDocument, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Track the selected upload target so a manager's category list can react to it:
  // self → any non-payslip (employee categories); a direct report → policy/other
  // (only what a manager can SEE for reports). Managers default to themselves.
  const managerDefaultTarget = isManager ? currentUserId : "";
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    (state.values?.employeeId as string | undefined) ?? managerDefaultTarget,
  );

  const categories = useMemo<DocumentCategory[]>(() => {
    if (isAdmin) return ADMIN_CATEGORIES;
    if (isManager) {
      return selectedEmployeeId === currentUserId ? EMPLOYEE_CATEGORIES : MANAGER_UPLOAD_CATEGORIES;
    }
    return EMPLOYEE_CATEGORIES;
  }, [isAdmin, isManager, selectedEmployeeId, currentUserId]);

  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>(
    (state.values?.category as DocumentCategory | undefined) ?? categories[0],
  );

  // Derive (don't store-and-clamp) the effective category: if switching target
  // narrowed the list and the held selection is no longer valid (e.g. "Contract"
  // for self → then a report → Policy/Other only), fall back to the first valid
  // option. Avoids a setState-in-effect cascade.
  const effectiveCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : categories[0];

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  const selectedPolicy = DOCUMENT_UPLOAD_POLICY[effectiveCategory];

  // When switching to a direct report narrows the categories and discards the
  // held choice, tell the user instead of silently swapping it.
  const clampNotice =
    effectiveCategory !== selectedCategory
      ? `${CATEGORY_LABELS[selectedCategory]} isn't available for a direct report — using ${CATEGORY_LABELS[effectiveCategory]}.`
      : null;

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {state.message && (
        <Alert
          role={state.success ? "status" : "alert"}
          variant={state.success ? "default" : "destructive"}
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {showPicker && (
        <SearchableSelectField
          id="up-employee"
          name="employeeId"
          label="Employee"
          options={employees.map((employee) => ({
            value: employee.id,
            label: employee.name,
          }))}
          defaultValue={state.values?.employeeId ?? managerDefaultTarget}
          onValueChange={setSelectedEmployeeId}
          emptyLabel="Select employee"
          error={state.fieldErrors?.employeeId?.[0]}
          required
        />
      )}

      {!showPicker && (
        <input type="hidden" name="employeeId" value={currentUserId} />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="up-category">Category</Label>
        <select
          id="up-category"
          name="category"
          required
          value={effectiveCategory}
          onChange={(event) => setSelectedCategory(event.currentTarget.value as DocumentCategory)}
          className={SELECT_CLASS}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category && (
          <p className="text-xs text-destructive">{state.fieldErrors.category[0]}</p>
        )}
        {clampNotice && (
          <p role="status" className="text-xs text-muted-foreground">{clampNotice}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="up-title">Title</Label>
        <Input
          id="up-title"
          name="title"
          type="text"
          required
          minLength={2}
          maxLength={160}
          defaultValue={state.values?.title ?? ""}
          placeholder="e.g. Employment Contract 2024"
        />
        {state.fieldErrors?.title && (
          <p className="text-xs text-destructive">{state.fieldErrors.title[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="up-file">File</Label>
        {/* Intentionally not round-tripped on validation failure
            (Session 65 exclusion — file inputs cannot be repopulated). */}
        <input
          id="up-file"
          name="file"
          type="file"
          required
          accept={DOCUMENT_UPLOAD_ACCEPT}
          className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
        />
        <p className="text-xs text-muted-foreground">
          {CATEGORY_LABELS[effectiveCategory]} accepts {selectedPolicy.label}; max {formatDocumentUploadMaxSize()}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload document"}
        </Button>
        {state.message && (
          <p
            role={state.success ? "status" : "alert"}
            className={cn(
              "text-sm",
              state.success ? "text-emerald-700" : "text-destructive",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
