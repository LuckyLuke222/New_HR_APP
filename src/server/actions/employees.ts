"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recoveryUrlFromTokenHash } from "@/lib/auth/recovery-url";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import { authRedirectUrl } from "@/server/actions/auth";
import { insertAuditLog } from "@/server/audit";
import { getAppSettingsAsAdmin } from "@/server/dal/app-settings";

export type EmployeeActionState = {
  success: boolean;
  message: string;
  resetLink?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedEmployeeValues;
};

export type SubmittedEmployeeValues = {
  displayName?: string;
  workEmail?: string;
  phone?: string;
  role?: string;
  jobTitle?: string;
  departmentId?: string;
  managerId?: string;
  employmentStatus?: string;
  employmentType?: string;
  startDate?: string;
  endDate?: string;
  workLocation?: string;
};

function submittedValues(formData: FormData): SubmittedEmployeeValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return {
    displayName: get("displayName"),
    workEmail: get("workEmail"),
    phone: get("phone"),
    role: get("role"),
    jobTitle: get("jobTitle"),
    // B2 (F2): only read the hidden <select> value, not the search-input text.
    // SearchableSelectField submits both `<name>` (resolved UUID) and
    // `<name>Search` (raw query). Falling back to the raw query is what lets
    // typed text like "Unassigned" reach the schema; the strict-blur change in
    // SearchableSelectField now also clears the visible input on no-match.
    departmentId: get("departmentId"),
    managerId: get("managerId"),
    employmentStatus: get("employmentStatus"),
    employmentType: get("employmentType"),
    startDate: get("startDate"),
    endDate: get("endDate"),
    workLocation: get("workLocation"),
  };
}

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

// B1: the create/edit form defaults the Phone input to "+230 " so admins
// don't have to type the Mauritius country code. If the admin saves the
// form without typing any digits after the prefix, we'd otherwise persist
// "+230" as a value — which then renders on the profile page as a
// partial-looking value rather than empty. Treat country-code-only
// strings as no-phone-on-file.
const phoneToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^\+?\d{1,4}$/.test(trimmed)) return null;
  return trimmed;
};

const employeeBaseSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name must be 120 characters or fewer."),
  workEmail: z.string().trim().email("Enter a valid work email."),
  phone: z.preprocess(
    phoneToNull,
    z.string().max(40, "Phone must be 40 characters or fewer.").nullable(),
  ),
  role: z.enum(["admin", "manager", "employee"]),
  // Mandatory for v1 (per Round 3 mandatory-field policy): every employee record must
  // carry an HR-visible job title at creation/edit. Department and manager remain optional
  // because partial onboarding can land before the org structure is finalized.
  jobTitle: z
    .string()
    .trim()
    .min(1, "Job title is required.")
    .max(120, "Job title must be 120 characters or fewer."),
  departmentId: z.preprocess(
    emptyToNull,
    postgresUuid("Select a department from the list.").nullable(),
  ),
  managerId: z.preprocess(
    emptyToNull,
    postgresUuid("Select a manager from the list.").nullable(),
  ),
  employmentStatus: z.enum(["active", "inactive", "terminated"]),
  employmentType: z.enum(["full_time", "part_time", "contractor", "intern"]),
  startDate: z.string().date("Enter a valid start date."),
  endDate: z.preprocess(
    emptyToNull,
    z.string().date("Enter a valid end date.").nullable(),
  ),
  workLocation: z.preprocess(
    emptyToNull,
    z.string().max(120, "Work location must be 120 characters or fewer.").nullable(),
  ),
});

const createEmployeeSchema = employeeBaseSchema;

const updateEmployeeSchema = employeeBaseSchema
  .omit({ workEmail: true })
  .extend({
    id: postgresUuid("Invalid employee id."),
    recordId: z.string().uuid("Invalid employee record id."),
  });

export async function createEmployee(
  _previousState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:employees.create",
  });
  const admin = createAdminClient();
  const parsed = createEmployeeSchema.safeParse(
    await formValues(formData, admin),
  );

  if (!parsed.success) {
    return validationError(parsed.error, formData);
  }

  const supabase = await createClient();
  const managerError = await validateManager(
    supabase,
    parsed.data.managerId,
    null,
  );

  if (managerError) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: { managerId: [managerError] },
      values: submittedValues(formData),
    };
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.workEmail,
    password: generateTemporaryPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.displayName,
    },
  });

  if (authError || !authData.user) {
    console.error("employees.create auth failed", authError);
    const failure = describeAuthError(authError);
    await insertAuditLog({
      actorId: user.id,
      action: "employee.create_failed",
      entity: "employee",
      metadata: {
        stage: "auth",
        work_email: parsed.data.workEmail,
        error_code: failure.code,
        error_message: failure.message,
        error_status: failure.status,
      },
    });
    const fieldErrors: EmployeeActionState["fieldErrors"] = failure.fieldKey
      ? { [failure.fieldKey]: [failure.userMessage] }
      : undefined;
    return {
      success: false,
      message: failure.userMessage
        ? `Could not create employee: ${failure.userMessage}`
        : "Employee account could not be created. See audit log entry employee.create_failed for the cause.",
      fieldErrors,
      values: submittedValues(formData),
    };
  }

  const employeeId = authData.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      work_email: parsed.data.workEmail,
      phone: parsed.data.phone,
      role: parsed.data.role,
    })
    .eq("id", employeeId)
    .select("id")
    .single();

  if (profileError) {
    console.error("employees.create profile failed", profileError);
    await cleanupPartialEmployee(admin, employeeId);
    await insertAuditLog({
      actorId: user.id,
      action: "employee.create_failed",
      entity: "employee",
      entityId: employeeId,
      metadata: {
        stage: "profile",
        work_email: parsed.data.workEmail,
        error_code: profileError.code ?? null,
        error_message: profileError.message ?? null,
      },
    });
    return safeError(
      profileError.code
        ? `Employee profile could not be completed (db code ${profileError.code}). See audit log entry employee.create_failed for full detail.`
        : "Employee profile could not be completed. See audit log entry employee.create_failed for the cause.",
      formData,
    );
  }

  const { error: recordError } = await supabase.from("employee_records").insert({
    employee_id: employeeId,
    department_id: parsed.data.departmentId,
    manager_id: parsed.data.managerId,
    job_title: parsed.data.jobTitle,
    employment_status: parsed.data.employmentStatus,
    employment_type: parsed.data.employmentType,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    work_location: parsed.data.workLocation,
    created_by: user.id,
    updated_by: user.id,
  });

  if (recordError) {
    console.error("employees.create record failed", recordError);
    await cleanupPartialEmployee(admin, employeeId);
    await insertAuditLog({
      actorId: user.id,
      action: "employee.create_failed",
      entity: "employee",
      entityId: employeeId,
      metadata: {
        stage: "employee_record",
        work_email: parsed.data.workEmail,
        error_code: recordError.code ?? null,
        error_message: recordError.message ?? null,
      },
    });
    return safeError(
      recordError.code
        ? `Employee job record could not be created (db code ${recordError.code}). See audit log entry employee.create_failed for full detail.`
        : "Employee job record could not be created. See audit log entry employee.create_failed for the cause.",
      formData,
    );
  }

  await seedDefaultLeaveBalances(admin, employeeId, user.id);

  await insertAuditLog({
    actorId: user.id,
    action: "employee.created",
    entity: "employee",
    entityId: employeeId,
    metadata: {
      work_email: parsed.data.workEmail,
      role: parsed.data.role,
      department_id: parsed.data.departmentId,
      manager_id: parsed.data.managerId,
      password_strategy: "random_unshared",
    },
  });
  revalidatePath("/employees");
  revalidatePath("/dashboard");

  return {
    success: true,
    message:
      "Employee created. Generate a password reset link before first login.",
  };
}

// Fallback values used only if app_settings is unavailable (e.g. before
// migration 0032 was applied). Normal operation reads from app_settings
// so admins can tune defaults from /settings without a code change.
const FALLBACK_LEAVE_POLICY: ReadonlyArray<{ name: string; balance: number }> = [
  { name: "Local Leave", balance: 22 },
  { name: "Sick Leave", balance: 15 },
];

async function seedDefaultLeaveBalances(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
  actorId: string,
): Promise<void> {
  const settings = await getAppSettingsAsAdmin();
  const policy: ReadonlyArray<{ name: string; balance: number }> = settings
    ? [
        { name: "Local Leave", balance: settings.localLeaveDefaultDays },
        { name: "Sick Leave", balance: settings.sickLeaveDefaultDays },
      ]
    : FALLBACK_LEAVE_POLICY;

  const names = policy.map((p) => p.name);
  const { data: types, error: typeError } = await admin
    .from("leave_types")
    .select("id, name")
    .in("name", names)
    .eq("is_active", true);

  if (typeError) {
    console.error("employees.create default leave lookup failed", typeError);
    await insertAuditLog({
      actorId,
      action: "employee.default_leave_seed_failed",
      entity: "employee",
      entityId: employeeId,
      metadata: {
        stage: "leave_type_lookup",
        error_code: typeError.code ?? null,
        error_message: typeError.message ?? null,
      },
    });
    return;
  }

  const typeByName = new Map<string, string>();
  for (const row of types ?? []) {
    typeByName.set(row.name as string, row.id as string);
  }

  const year = new Date().getFullYear();
  const rows = policy.flatMap((entry) => {
    const id = typeByName.get(entry.name);
    if (!id) return [];
    return [{
      employee_id: employeeId,
      leave_type_id: id,
      balance: entry.balance,
      year,
      created_by: actorId,
    }];
  });

  if (rows.length === 0) return;

  const { error } = await admin
    .from("leave_balances")
    .upsert(rows, { onConflict: "employee_id,leave_type_id,year", ignoreDuplicates: true });

  if (error) {
    console.error("employees.create default leave seed failed", error);
    await insertAuditLog({
      actorId,
      action: "employee.default_leave_seed_failed",
      entity: "employee",
      entityId: employeeId,
      metadata: {
        stage: "leave_balance_upsert",
        error_code: error.code ?? null,
        error_message: error.message ?? null,
      },
    });
  }
}

export async function updateEmployee(
  _previousState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:employees.update",
  });
  const admin = createAdminClient();
  const parsed = updateEmployeeSchema.safeParse({
    ...(await formValues(formData, admin)),
    id: formData.get("id"),
    recordId: formData.get("recordId"),
  });

  if (!parsed.success) {
    return validationError(parsed.error, formData);
  }

  const supabase = await createClient();
  const managerError = await validateManager(
    supabase,
    parsed.data.managerId,
    parsed.data.id,
  );

  if (managerError) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: { managerId: [managerError] },
      values: submittedValues(formData),
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      phone: parsed.data.phone,
      role: parsed.data.role,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .single();

  if (profileError) {
    console.error("employees.update profile failed", profileError);
    return safeError("Employee profile could not be updated.", formData);
  }

  const { error: recordError } = await supabase
    .from("employee_records")
    .update({
      department_id: parsed.data.departmentId,
      manager_id: parsed.data.managerId,
      job_title: parsed.data.jobTitle,
      employment_status: parsed.data.employmentStatus,
      employment_type: parsed.data.employmentType,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      work_location: parsed.data.workLocation,
      updated_by: user.id,
    })
    .eq("id", parsed.data.recordId)
    .eq("employee_id", parsed.data.id)
    .select("id")
    .single();

  if (recordError) {
    console.error("employees.update record failed", recordError);
    return safeError("Employee job record could not be updated.", formData);
  }

  await insertAuditLog({
    actorId: user.id,
    action: "employee.updated",
    entity: "employee",
    entityId: parsed.data.id,
    metadata: {
      role: parsed.data.role,
      employment_status: parsed.data.employmentStatus,
      department_id: parsed.data.departmentId,
      manager_id: parsed.data.managerId,
    },
  });
  revalidatePath("/employees");
  revalidatePath(`/employees/${parsed.data.id}`);
  revalidatePath("/dashboard");

  return {
    success: true,
    message: "Employee updated.",
    values: {
      displayName: parsed.data.displayName,
      phone: parsed.data.phone ?? "",
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      departmentId: parsed.data.departmentId ?? "",
      managerId: parsed.data.managerId ?? "",
      employmentStatus: parsed.data.employmentStatus,
      employmentType: parsed.data.employmentType,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? "",
      workLocation: parsed.data.workLocation ?? "",
    },
  };
}

export async function sendEmployeePasswordReset(
  _previousState: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:employees.send_password_reset",
  });
  const employeeId = formData.get("employeeId");
  const parsed = postgresUuid("Invalid employee id.").safeParse(employeeId);

  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid employee.",
      fieldErrors: { employeeId: ["Invalid employee id."] },
    };
  }

  const admin = createAdminClient();
  const { data: employee, error: employeeError } = await admin
    .from("profiles")
    .select("id, work_email, display_name")
    .eq("id", parsed.data)
    .maybeSingle();

  if (employeeError) {
    console.error("employees.send_password_reset profile failed", employeeError);
    return safeError("Employee could not be loaded.");
  }

  if (!employee?.work_email) {
    return safeError("Employee has no work email for password reset.");
  }

  const redirectTo = await authRedirectUrl("/reset-password");
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: employee.work_email as string,
    options: { redirectTo },
  });

  if (error || !data.properties?.action_link) {
    console.error("employees.send_password_reset failed", error);
    return safeError("Password reset link could not be generated.");
  }

  const resetLink = data.properties.hashed_token
    ? recoveryUrlFromTokenHash(redirectTo, data.properties.hashed_token)
    : data.properties.action_link;

  await insertAuditLog({
    actorId: user.id,
    action: "auth.password_reset_link_generated",
    entity: "employee",
    entityId: parsed.data,
    metadata: {
      work_email: employee.work_email,
      display_name: employee.display_name,
    },
  });

  return {
    success: true,
    message: "Password reset link generated. Share it with the employee securely.",
    resetLink,
  };
}

async function formValues(
  formData: FormData,
  admin: ReturnType<typeof createAdminClient>,
) {
  const departmentId = await resolveDepartmentId(
    admin,
    formData.get("departmentId"),
    formData.get("departmentIdSearch"),
  );
  const managerId = await resolveManagerId(
    admin,
    formData.get("managerId"),
    formData.get("managerIdSearch"),
  );

  return {
    displayName: formData.get("displayName"),
    workEmail: formData.get("workEmail"),
    phone: formData.get("phone"),
    role: formData.get("role"),
    jobTitle: formData.get("jobTitle"),
    departmentId,
    managerId,
    employmentStatus: formData.get("employmentStatus"),
    employmentType: formData.get("employmentType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    workLocation: formData.get("workLocation"),
  };
}

async function resolveDepartmentId(
  admin: ReturnType<typeof createAdminClient>,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
) {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue;
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { data, error } = await admin
    .from("departments")
    .select("id, name")
    .ilike("name", `%${search}%`)
    .order("name")
    .limit(5);

  if (error) {
    console.error("employees.resolve_department failed", error);
    return selectedValue;
  }

  const exact = data?.find(
    (department) =>
      String(department.name).toLowerCase() === search.toLowerCase(),
  );
  return (exact ?? data?.[0])?.id ?? null;
}

async function resolveManagerId(
  admin: ReturnType<typeof createAdminClient>,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
) {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue;
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, work_email")
    .in("role", ["admin", "manager"])
    .or(`display_name.ilike.%${search}%,work_email.ilike.%${search}%`)
    .order("display_name")
    .limit(10);

  if (error) {
    console.error("employees.resolve_manager failed", error);
    return selectedValue;
  }

  const exact = data?.find((profile) => {
    const label = String(profile.display_name ?? profile.work_email ?? "");
    return label.toLowerCase() === search.toLowerCase();
  });
  return (exact ?? data?.[0])?.id ?? null;
}

function validationError(
  error: z.ZodError,
  formData?: FormData,
): EmployeeActionState {
  return {
    success: false,
    message: "Check the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
    values: formData ? submittedValues(formData) : undefined,
  };
}

type AuthFailureSummary = {
  code: string | null;
  message: string | null;
  status: number | null;
  duplicate: boolean;
  /** Field key on `SubmittedEmployeeValues` to attach a field-level error to, when known. */
  fieldKey: keyof SubmittedEmployeeValues | null;
  /** Human-readable reason to surface in the form toast. Empty when only the generic message applies. */
  userMessage: string;
};

// Known Supabase Auth error codes mapped to a precise user message and (when relevant) a field
// to highlight. Unknown codes fall through to a generic line that quotes the raw code/status so
// the admin doesn't have to dig through audit logs to know what failed.
const AUTH_REASON_MAP: Record<
  string,
  { message: string; field?: keyof SubmittedEmployeeValues; duplicate?: boolean }
> = {
  email_exists: {
    message: "An account with this email already exists.",
    field: "workEmail",
    duplicate: true,
  },
  user_already_exists: {
    message: "An account with this email already exists.",
    field: "workEmail",
    duplicate: true,
  },
  email_address_invalid: {
    message: "The work email address is not valid for sign-up.",
    field: "workEmail",
  },
  invalid_email: {
    message: "The work email address is not valid for sign-up.",
    field: "workEmail",
  },
  weak_password: {
    message:
      "The auto-generated password did not meet the configured policy. Update Supabase Auth password settings or rotate the generator.",
  },
  signup_disabled: {
    message:
      "New-user sign-ups are disabled in Supabase Auth settings. Re-enable them before creating employees.",
  },
  over_email_send_rate_limit: {
    message: "Auth email send rate limit exceeded. Try again in a few minutes.",
  },
  email_provider_disabled: {
    message: "Email/password sign-up is disabled in Supabase Auth providers.",
  },
};

function describeAuthError(error: unknown): AuthFailureSummary {
  if (!error || typeof error !== "object") {
    return {
      code: null,
      message: null,
      status: null,
      duplicate: false,
      fieldKey: null,
      userMessage: "",
    };
  }
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : null;
  const message = typeof candidate.message === "string" ? candidate.message : null;
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const lowered = `${code ?? ""} ${message ?? ""}`.toLowerCase();

  const mapped = code ? AUTH_REASON_MAP[code] : undefined;

  // Substring fallbacks for older/variant Supabase responses that don't populate `code`.
  const duplicateBySubstring =
    lowered.includes("already been registered") ||
    lowered.includes("already exists") ||
    lowered.includes("user_already_exists") ||
    lowered.includes("email_exists");

  const duplicate = Boolean(mapped?.duplicate) || duplicateBySubstring;

  let userMessage = mapped?.message ?? "";
  if (!userMessage && duplicateBySubstring) {
    userMessage = "An account with this email already exists.";
  }
  // Last resort: surface whatever the API gave us so the admin can act without opening audit logs.
  if (!userMessage) {
    const parts: string[] = [];
    if (code) parts.push(`code ${code}`);
    if (status !== null) parts.push(`HTTP ${status}`);
    if (message) parts.push(message);
    userMessage = parts.length > 0 ? parts.join(" — ") : "Unknown Supabase Auth error.";
  }

  const fieldKey: keyof SubmittedEmployeeValues | null =
    mapped?.field ?? (duplicateBySubstring ? "workEmail" : null);

  return {
    code,
    message,
    status,
    duplicate,
    fieldKey,
    userMessage,
  };
}

function safeError(message: string, formData?: FormData): EmployeeActionState {
  return {
    success: false,
    message,
    values: formData ? submittedValues(formData) : undefined,
  };
}

async function validateManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  managerId: string | null,
  employeeId: string | null,
): Promise<string | null> {
  if (!managerId) return null;

  if (employeeId && managerId === employeeId) {
    return "An employee cannot be their own manager.";
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", managerId)
    .in("role", ["admin", "manager"])
    .maybeSingle();

  if (error) {
    console.error("employees manager validation failed", error);
    return "Selected manager could not be validated.";
  }

  return data ? null : "Select an admin or manager.";
}

async function cleanupPartialEmployee(
  admin: ReturnType<typeof createAdminClient>,
  employeeId: string,
) {
  const { error: profileDeleteError } = await admin
    .from("profiles")
    .delete()
    .eq("id", employeeId);

  if (profileDeleteError) {
    console.error("employees cleanup profile failed", profileDeleteError);
  }

  const { error: authDeleteError } =
    await admin.auth.admin.deleteUser(employeeId);

  if (authDeleteError) {
    console.error("employees cleanup auth user failed", authDeleteError);
  }
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url") + "Aa1!";
}
