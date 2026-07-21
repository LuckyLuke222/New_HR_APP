"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import { insertAuditLog } from "@/server/audit";

export type DepartmentActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Department name must be at least 2 characters.")
    .max(80, "Department name must be 80 characters or fewer."),
  managerId: z.preprocess(
    emptyToNull,
    postgresUuid("Select a valid manager.").nullable(),
  ),
});

const departmentIdSchema = z.object({
  id: z.string().uuid("Invalid department id."),
});

const updateDepartmentSchema = departmentSchema.merge(departmentIdSchema);

export async function createDepartment(
  _previousState: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:departments.create",
  });
  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    managerId: formData.get("managerId"),
  });

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = await createClient();
  const managerError = await validateManager(supabase, parsed.data.managerId);

  if (managerError) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: { managerId: [managerError] },
    };
  }

  const { data, error } = await supabase
    .from("departments")
    .insert({
      name: parsed.data.name,
      manager_id: parsed.data.managerId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id, name")
    .single();

  if (error) {
    console.error("departments.create failed", error);
    return safeError("Department could not be created.");
  }

  await insertAuditLog({
    actorId: user.id,
    action: "department.created",
    entity: "department",
    entityId: data.id,
    metadata: {
      name: data.name,
      manager_id: parsed.data.managerId,
    },
  });
  revalidatePath("/departments");

  return { success: true, message: "Department created." };
}

export async function updateDepartment(
  _previousState: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:departments.update",
  });
  const parsed = updateDepartmentSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    managerId: formData.get("managerId"),
  });

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = await createClient();
  const managerError = await validateManager(supabase, parsed.data.managerId);

  if (managerError) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: { managerId: [managerError] },
    };
  }

  const { data, error } = await supabase
    .from("departments")
    .update({
      name: parsed.data.name,
      manager_id: parsed.data.managerId,
      updated_by: user.id,
    })
    .eq("id", parsed.data.id)
    .select("id, name")
    .single();

  if (error) {
    console.error("departments.update failed", error);
    return safeError("Department could not be updated.");
  }

  await insertAuditLog({
    actorId: user.id,
    action: "department.updated",
    entity: "department",
    entityId: data.id,
    metadata: {
      name: data.name,
      manager_id: parsed.data.managerId,
    },
  });
  revalidatePath("/departments");

  return { success: true, message: "Department updated." };
}

export async function deleteDepartment(
  _previousState: DepartmentActionState,
  formData: FormData,
): Promise<DepartmentActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:departments.delete",
  });
  const parsed = departmentIdSchema.safeParse({
    id: formData.get("id"),
  });

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase
    .from("departments")
    .select("id, name")
    .eq("id", parsed.data.id)
    .single();

  if (lookupError) {
    console.error("departments.delete lookup failed", lookupError);
    return safeError("Department could not be deleted.");
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", parsed.data.id);

  if (error) {
    console.error("departments.delete failed", error);
    return safeError(
      "Department could not be deleted. Reassign employees first if it is in use.",
    );
  }

  await insertAuditLog({
    actorId: user.id,
    action: "department.deleted",
    entity: "department",
    entityId: existing.id,
    metadata: {
      name: existing.name,
    },
  });
  revalidatePath("/departments");

  return { success: true, message: "Department deleted." };
}

function validationError(error: z.ZodError): DepartmentActionState {
  return {
    success: false,
    message: "Check the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function safeError(message: string): DepartmentActionState {
  return {
    success: false,
    message,
  };
}

async function validateManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  managerId: string | null,
): Promise<string | null> {
  if (!managerId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", managerId)
    .in("role", ["admin", "manager"])
    .maybeSingle();

  if (error) {
    console.error("departments manager validation failed", error);
    return "Selected manager could not be validated.";
  }

  return data ? null : "Select an admin or manager.";
}
