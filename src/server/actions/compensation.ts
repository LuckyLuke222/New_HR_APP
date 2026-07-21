"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import {
  insertAuditLog,
  logEntityNotFound,
  logValidationFailed,
} from "@/server/audit";
import { MAURITIUS_BANKS } from "@/lib/mauritius-banks";

export type CompensationActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedCompensationValues;
};

export type SubmittedCompensationValues = {
  salaryAmount?: string;
  salaryCurrency?: string;
  payFrequency?: string;
  bankName?: string;
  bankAccountHolder?: string;
  taxId?: string;
  nationalId?: string;
  passportNumber?: string;
  nationality?: string;
  effectiveDate?: string;
  notes?: string;
};

function adminSubmittedValues(formData: FormData): SubmittedCompensationValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  // Intentionally omit `bankAccountNumber` — sensitive password-typed input must not round-trip server-side.
  return {
    salaryAmount: get("salaryAmount"),
    salaryCurrency: get("salaryCurrency"),
    payFrequency: get("payFrequency"),
    bankName: get("bankName"),
    bankAccountHolder: get("bankAccountHolder"),
    taxId: get("taxId"),
    nationalId: get("nationalId"),
    passportNumber: get("passportNumber"),
    nationality: get("nationality"),
    effectiveDate: get("effectiveDate"),
    notes: get("notes"),
  };
}

function selfSubmittedValues(formData: FormData): SubmittedCompensationValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return {
    bankName: get("bankName"),
    bankAccountHolder: get("bankAccountHolder"),
    taxId: get("taxId"),
    nationalId: get("nationalId"),
    passportNumber: get("passportNumber"),
    nationality: get("nationality"),
  };
}

const PAY_FREQUENCIES = ["monthly", "weekly", "hourly"] as const;
const SALARY_CURRENCIES = ["MUR", "AED", "USD"] as const;

// Fields the employee self-update path must never accept. If any of these
// appear in the submitted FormData, the action rejects + audits.
//
// Note on layering: `selfUpdateCompensation` performs its DB write via
// `createAdminClient()` (service-role), which bypasses both RLS and column
// grants. The migration 0049 column-grant on `authenticated` is therefore
// NOT a backstop for this action — it backstops only direct session-client
// writes (which the application never performs). The `ADMIN_ONLY_FIELDS`
// check below + the hard-coded `eq("employee_id", user.id)` are the only
// layers protecting the self-update path; treat this guard as primary, not
// secondary.
const ADMIN_ONLY_FIELDS = [
  "salaryAmount",
  "salaryCurrency",
  "payFrequency",
  "effectiveDate",
  "notes",
] as const;

// ─── Admin: upsert compensation ───────────────────────────────────────────────

// Mandatory fields for a v1 compensation record (per Round 3 manual review):
// salaryAmount, salaryCurrency, payFrequency, effectiveDate, taxId, nationalId.
// Optional pending hire-source data: bank fields, passportNumber, nationality, notes.
const compensationSchema = z.object({
  employeeId: postgresUuid("Invalid employee."),
  salaryAmount: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce
      .number({ error: "Enter a salary amount." })
      .min(0, "Salary must be 0 or more.")
      .max(9_999_999, "Salary too large."),
  ),
  salaryCurrency: z
    .string()
    .trim()
    .min(1, "Select a currency.")
    .toUpperCase()
    .pipe(z.enum(SALARY_CURRENCIES, { error: "Select MUR, AED, or USD." })),
  payFrequency: z
    .string()
    .trim()
    .min(1, "Select a pay frequency.")
    .pipe(z.enum(PAY_FREQUENCIES, { error: "Select a pay frequency." })),
  bankName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || (MAURITIUS_BANKS as readonly string[]).includes(value),
      { message: "Select a Mauritius bank from the list." },
    ),
  bankAccountHolder: z
    .string()
    .trim()
    .min(1, "Account holder is required.")
    .max(120, "Account holder must be 120 characters or fewer."),
  bankAccountNumber: z.string().trim().max(64).optional().or(z.literal("")),
  taxId: z
    .string()
    .trim()
    .min(1, "Tax ID is required.")
    .max(64, "Tax ID must be 64 characters or fewer."),
  nationalId: z
    .string()
    .trim()
    .min(1, "National ID is required.")
    .max(64, "National ID must be 64 characters or fewer."),
  passportNumber: z.string().trim().max(64).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  effectiveDate: z
    .string()
    .trim()
    .min(1, "Effective date is required.")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid effective date."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function upsertCompensation(
  _prev: CompensationActionState,
  formData: FormData,
): Promise<CompensationActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:compensation.upsert" });

  // Required fields pass their raw FormData value so the schema's `.min(1, …)` rule produces the
  // matching field-level error when the input is blank. Optional fields collapse blank to undefined.
  const parsed = compensationSchema.safeParse({
    employeeId: formData.get("employeeId"),
    salaryAmount: formData.get("salaryAmount"),
    salaryCurrency: formData.get("salaryCurrency"),
    payFrequency: formData.get("payFrequency"),
    bankName: formData.get("bankName") || undefined,
    bankAccountHolder: formData.get("bankAccountHolder"),
    bankAccountNumber: formData.get("bankAccountNumber") || undefined,
    taxId: formData.get("taxId"),
    nationalId: formData.get("nationalId"),
    passportNumber: formData.get("passportNumber") || undefined,
    nationality: formData.get("nationality") || undefined,
    effectiveDate: formData.get("effectiveDate"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "compensation.upsert",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: adminSubmittedValues(formData),
    };
  }

  const d = parsed.data;
  const admin = createAdminClient();

  const { data: empCheck } = await admin.auth.admin.getUserById(d.employeeId);
  if (!empCheck.user) {
    await logEntityNotFound({
      actorId: user.id,
      resource: "compensation.upsert",
      entity: "auth.user",
      entityId: d.employeeId,
    });
    return {
      success: false,
      message: "Employee not found.",
      values: adminSubmittedValues(formData),
    };
  }

  const { data: current, error: currentError } = await admin
    .from("employee_compensation")
    .select("bank_account_number")
    .eq("employee_id", d.employeeId)
    .maybeSingle();

  if (currentError) {
    console.error("compensation.current load failed", currentError);
    return {
      success: false,
      message: "Compensation could not be saved.",
      values: adminSubmittedValues(formData),
    };
  }

  const payload = {
    employee_id: d.employeeId,
    salary_amount: d.salaryAmount,
    salary_currency: d.salaryCurrency,
    pay_frequency: d.payFrequency,
    bank_name: d.bankName || null,
    bank_account_holder: d.bankAccountHolder || null,
    bank_account_number:
      d.bankAccountNumber || (current?.bank_account_number as string | null | undefined) || null,
    tax_id: d.taxId,
    national_id: d.nationalId,
    passport_number: d.passportNumber || null,
    nationality: d.nationality || null,
    effective_date: d.effectiveDate,
    notes: d.notes || null,
  };

  const { error } = await admin
    .from("employee_compensation")
    .upsert(payload, { onConflict: "employee_id" });

  if (error) {
    console.error("compensation.upsert failed", error);
    return {
      success: false,
      message: "Compensation could not be saved.",
      values: adminSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "compensation.updated",
    entity: "employee_compensation",
    metadata: {
      employee_id: d.employeeId,
      fields_updated: Object.keys(payload).filter(
        (k) => k !== "employee_id" && payload[k as keyof typeof payload] !== null,
      ),
    },
  });
  revalidatePath("/payroll");
  revalidatePath(`/employees/${d.employeeId}`);

  return { success: true, message: "Compensation saved." };
}

// ─── Employee self-update: non-salary fields only ────────────────────────────

const selfUpdateSchema = z.object({
  bankName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || (MAURITIUS_BANKS as readonly string[]).includes(value),
      { message: "Select a Mauritius bank from the list." },
    ),
  bankAccountHolder: z
    .string()
    .trim()
    .min(1, "Account holder is required.")
    .max(120, "Account holder must be 120 characters or fewer."),
  bankAccountNumber: z.string().trim().max(64).optional().or(z.literal("")),
  taxId: z
    .string()
    .trim()
    .min(1, "Tax ID is required.")
    .max(64, "Tax ID must be 64 characters or fewer."),
  nationalId: z
    .string()
    .trim()
    .min(1, "National ID is required.")
    .max(64, "National ID must be 64 characters or fewer."),
  passportNumber: z.string().trim().max(64).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
});

export async function selfUpdateCompensation(
  _prev: CompensationActionState,
  formData: FormData,
): Promise<CompensationActionState> {
  // All three roles can self-edit because everyone is an employee in their
  // own row. Manager + admin reach the UI for this action via the same
  // employee self-edit form path; the action's hard-coded
  // `eq("employee_id", user.id)` below ensures only the caller's own row is
  // ever written, regardless of role.
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "action:compensation.self_update",
  });

  // Defence in depth on top of the 0049 column grant: if the form posted any
  // admin-only key, refuse + audit. A logged-in employee with DevTools can
  // inject a hidden `salaryAmount` input; we want a clear audit trail when
  // they try.
  const submittedAdminOnly = ADMIN_ONLY_FIELDS.filter((key) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "";
  });
  if (submittedAdminOnly.length > 0) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "employee_compensation",
      metadata: {
        attempted_resource: "action:compensation.self_update",
        reason: "salary_field_in_self_update",
        fields: submittedAdminOnly,
        role: user.role,
      },
    });
    return {
      success: false,
      message: "Salary and pay details can only be updated by an admin.",
      values: selfSubmittedValues(formData),
    };
  }

  const parsed = selfUpdateSchema.safeParse({
    bankName: formData.get("bankName") || undefined,
    bankAccountHolder: formData.get("bankAccountHolder"),
    bankAccountNumber: formData.get("bankAccountNumber") || undefined,
    taxId: formData.get("taxId"),
    nationalId: formData.get("nationalId"),
    passportNumber: formData.get("passportNumber") || undefined,
    nationality: formData.get("nationality") || undefined,
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "compensation.self_update",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: selfSubmittedValues(formData),
    };
  }

  const d = parsed.data;
  const admin = createAdminClient();

  // Self-edit always targets the authenticated user's own row — there is no
  // employeeId parameter on this action. Any client-supplied employeeId is
  // ignored by design.
  const { data: current, error: currentError } = await admin
    .from("employee_compensation")
    .select("id, bank_account_number")
    .eq("employee_id", user.id)
    .maybeSingle();

  if (currentError) {
    console.error("compensation.self_update current load failed", currentError);
    return {
      success: false,
      message: "Your details could not be saved.",
      values: selfSubmittedValues(formData),
    };
  }
  if (!current) {
    await logEntityNotFound({
      actorId: user.id,
      resource: "compensation.self_update",
      entity: "employee_compensation",
      entityId: user.id,
      reason: "no_compensation_row",
    });
    return {
      success: false,
      message: "No compensation record on file. Ask an admin to set up your record first.",
      values: selfSubmittedValues(formData),
    };
  }

  const updatePayload = {
    bank_name: d.bankName || null,
    bank_account_holder: d.bankAccountHolder || null,
    bank_account_number:
      d.bankAccountNumber || (current?.bank_account_number as string | null | undefined) || null,
    tax_id: d.taxId,
    national_id: d.nationalId,
    passport_number: d.passportNumber || null,
    nationality: d.nationality || null,
    updated_by: user.id,
  };

  const { error } = await admin
    .from("employee_compensation")
    .update(updatePayload)
    .eq("employee_id", user.id);

  if (error) {
    console.error("compensation.self_update failed", error);
    return {
      success: false,
      message: "Your details could not be saved.",
      values: selfSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "compensation.self_updated",
    entity: "employee_compensation",
    metadata: {
      employee_id: user.id,
      fields_updated: Object.keys(updatePayload).filter(
        (k) => k !== "updated_by" && updatePayload[k as keyof typeof updatePayload] !== null,
      ),
    },
  });
  revalidatePath("/payroll");
  revalidatePath(`/employees/${user.id}`);

  return { success: true, message: "Your details were saved." };
}
