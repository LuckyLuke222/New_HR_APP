"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import { insertAuditLog } from "@/server/audit";
import { sendEmail, getRecipient } from "@/server/email";
import {
  onboardingTasksAssignedEmail,
  onboardingTasksAssignedConfirmationEmail,
  onboardingTaskAssignedEmail,
  onboardingTaskAssignedConfirmationEmail,
} from "@/server/email-templates";
import {
  getAssignableEmployees,
  getDirectReportIds,
  getTemplates,
} from "@/server/dal/onboarding";

export type OnboardingActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedOnboardingValues;
};

export type SubmittedOnboardingValues = {
  // template create / item add
  name?: string;
  description?: string;
  templateId?: string;
  // assign template / individual
  employeeId?: string;
  dueDate?: string;
  title?: string;
  // task complete
  completionNote?: string;
};

function onboardingSubmittedValues(formData: FormData): SubmittedOnboardingValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return {
    name: get("name"),
    description: get("description"),
    templateId: get("templateId") || get("templateIdSearch"),
    employeeId: get("employeeId") || get("employeeIdSearch"),
    dueDate: get("dueDate"),
    title: get("title"),
    completionNote: get("completionNote"),
  };
}

const emptyToNull = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t.length === 0 ? null : t;
};

const requiredUuid = (message: string) =>
  z.preprocess((value) => value ?? "", postgresUuid(message));

// ─── Create template ──────────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  description: z.preprocess(emptyToNull, z.string().max(500).nullable()),
});

export async function createTemplate(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:onboarding.createTemplate" });
  const parsed = createTemplateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { success: false, message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values: onboardingSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_templates")
    .insert({ name: parsed.data.name, description: parsed.data.description, created_by: user.id, updated_by: user.id })
    .select("id")
    .single();

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.template_created",
    entity: "onboarding_templates",
    entityId: data.id as string,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/admin");
  return { success: true, message: `Template "${parsed.data.name}" created.` };
}

// ─── Toggle template active ───────────────────────────────────────────────────

export async function toggleTemplate(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:onboarding.toggleTemplate" });

  const templateId = formData.get("templateId") as string | null;
  if (!templateId) return { success: false, message: "Missing template ID.", values: onboardingSubmittedValues(formData) };

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("onboarding_templates")
    .select("is_active, name")
    .eq("id", templateId)
    .maybeSingle();

  if (!current) return { success: false, message: "Template not found.", values: onboardingSubmittedValues(formData) };

  const { error } = await admin
    .from("onboarding_templates")
    .update({ is_active: !current.is_active, updated_by: user.id })
    .eq("id", templateId);

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.template_toggled",
    entity: "onboarding_templates",
    entityId: templateId,
    metadata: { is_active: !current.is_active },
  });

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/admin");
  return { success: true, message: `Template ${!current.is_active ? "activated" : "deactivated"}.` };
}

// ─── Add template item ────────────────────────────────────────────────────────

const addItemSchema = z.object({
  templateId: requiredUuid("Invalid template."),
  title: z.string().min(1, "Title is required.").max(200),
  description: z.preprocess(emptyToNull, z.string().max(500).nullable()),
});

export async function addTemplateItem(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:onboarding.addTemplateItem" });
  const parsed = addItemSchema.safeParse({
    templateId: formData.get("templateId"),
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { success: false, message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values: onboardingSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_template_items")
    .insert({
      template_id: parsed.data.templateId,
      title: parsed.data.title,
      description: parsed.data.description,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.template_item_created",
    entity: "onboarding_template_items",
    entityId: data.id as string,
    metadata: { template_id: parsed.data.templateId, title: parsed.data.title },
  });

  revalidatePath("/onboarding/admin");
  return { success: true, message: "Task added to template." };
}

// ─── Delete template item ─────────────────────────────────────────────────────

export async function deleteTemplateItem(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:onboarding.deleteTemplateItem" });

  const itemId = formData.get("itemId") as string | null;
  if (!itemId) return { success: false, message: "Missing item ID.", values: onboardingSubmittedValues(formData) };

  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_template_items")
    .delete()
    .eq("id", itemId);

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.template_item_deleted",
    entity: "onboarding_template_items",
    entityId: itemId,
  });

  revalidatePath("/onboarding/admin");
  return { success: true, message: "Task removed from template." };
}

// ─── Assign tasks from template ───────────────────────────────────────────────

const assignTemplateSchema = z.object({
  employeeId: requiredUuid("Select an employee."),
  templateId: requiredUuid("Select a template."),
  dueDate: z.preprocess(emptyToNull, z.string().date().nullable()),
});

export async function assignTemplateToEmployee(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin", "manager"], { attemptedResource: "action:onboarding.assignTemplate" });
  const employeeId = await resolveAssignableEmployeeId(
    user.role,
    user.id,
    formData.get("employeeId"),
    formData.get("employeeIdSearch"),
  );
  const templateId = await resolveAssignableTemplateId(
    formData.get("templateId"),
    formData.get("templateIdSearch"),
  );
  const parsed = assignTemplateSchema.safeParse({
    employeeId,
    templateId,
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    return { success: false, message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values: onboardingSubmittedValues(formData) };
  }

  // Manager scope check.
  if (user.role === "manager") {
    const drIds = await getDirectReportIds(user.id);
    if (!drIds.includes(parsed.data.employeeId)) {
      await insertAuditLog({
        actorId: user.id,
        action: "auth.access_denied",
        entity: "onboarding_tasks",
        metadata: { reason: "manager_assign_outside_direct_reports", target_employee: parsed.data.employeeId },
      });
      return { success: false, message: "You can only assign tasks to your direct reports.", values: onboardingSubmittedValues(formData) };
    }
  }

  const admin = createAdminClient();
  const { data: items, error: itemErr } = await admin
    .from("onboarding_template_items")
    .select("title, description")
    .eq("template_id", parsed.data.templateId)
    .order("sort_order");

  if (itemErr) { console.error("onboarding.assignTemplate items load failed", itemErr); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }
  if (!items || items.length === 0) return { success: false, message: "Template has no tasks. Add tasks before assigning.", values: onboardingSubmittedValues(formData) };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_tasks").insert(
    items.map((item) => ({
      employee_id: parsed.data.employeeId,
      assignee_id: parsed.data.employeeId,
      template_id: parsed.data.templateId,
      title: item.title,
      description: item.description,
      due_date: parsed.data.dueDate,
      status: "pending",
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
    })),
  );

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.tasks_assigned",
    entity: "onboarding_tasks",
    metadata: {
      employee_id: parsed.data.employeeId,
      template_id: parsed.data.templateId,
      task_count: items.length,
    },
  });

  // Notify the assignee + a confirmation to the assigner (actor). Fire-and-forget.
  try {
    const [assignee, self] = await Promise.all([
      getRecipient(parsed.data.employeeId),
      getRecipient(user.id),
    ]);
    if (assignee) {
      const tmpl = onboardingTasksAssignedEmail({
        taskCount: items.length,
        dueDate: parsed.data.dueDate,
      });
      await sendEmail({
        to: [assignee],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        template: "onboarding_tasks_assigned",
        actorId: user.id,
      });
    }
    // Skip the confirmation when the assigner assigned to themselves (the
    // assignee email already covers it).
    if (self && self.email !== assignee?.email) {
      const confirm = onboardingTasksAssignedConfirmationEmail({
        taskCount: items.length,
        assigneeName: assignee?.name ?? "the employee",
      });
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "onboarding_tasks_assigned_confirmation",
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/admin");
  return { success: true, message: `${items.length} task${items.length === 1 ? "" : "s"} assigned.` };
}

// ─── Add individual task ──────────────────────────────────────────────────────

const addTaskSchema = z.object({
  employeeId: requiredUuid("Select an employee."),
  title: z.string().min(1, "Title is required.").max(200),
  description: z.preprocess(emptyToNull, z.string().max(500).nullable()),
  dueDate: z.preprocess(emptyToNull, z.string().date().nullable()),
});

export async function addIndividualTask(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin", "manager"], { attemptedResource: "action:onboarding.addTask" });
  const employeeId = await resolveAssignableEmployeeId(
    user.role,
    user.id,
    formData.get("employeeId"),
    formData.get("employeeIdSearch"),
  );
  const parsed = addTaskSchema.safeParse({
    employeeId,
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) {
    return { success: false, message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values: onboardingSubmittedValues(formData) };
  }

  // Manager scope check.
  if (user.role === "manager") {
    const drIds = await getDirectReportIds(user.id);
    if (!drIds.includes(parsed.data.employeeId)) {
      await insertAuditLog({
        actorId: user.id,
        action: "auth.access_denied",
        entity: "onboarding_tasks",
        metadata: { reason: "manager_assign_outside_direct_reports", target_employee: parsed.data.employeeId },
      });
      return { success: false, message: "You can only assign tasks to your direct reports.", values: onboardingSubmittedValues(formData) };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_tasks")
    .insert({
      employee_id: parsed.data.employeeId,
      assignee_id: parsed.data.employeeId,
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: parsed.data.dueDate,
      status: "pending",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.task_assigned",
    entity: "onboarding_tasks",
    entityId: data.id as string,
    metadata: { employee_id: parsed.data.employeeId, title: parsed.data.title },
  });

  // Notify the assignee + a confirmation to the assigner (actor). Fire-and-forget.
  try {
    const [assignee, self] = await Promise.all([
      getRecipient(parsed.data.employeeId),
      getRecipient(user.id),
    ]);
    if (assignee) {
      const tmpl = onboardingTaskAssignedEmail({
        title: parsed.data.title,
        dueDate: parsed.data.dueDate,
      });
      await sendEmail({
        to: [assignee],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        template: "onboarding_task_assigned",
        entityId: data.id as string,
        actorId: user.id,
      });
    }
    if (self && self.email !== assignee?.email) {
      const confirm = onboardingTaskAssignedConfirmationEmail({
        title: parsed.data.title,
        assigneeName: assignee?.name ?? "the employee",
      });
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "onboarding_task_assigned_confirmation",
        entityId: data.id as string,
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/admin");
  return { success: true, message: "Task assigned." };
}

async function resolveAssignableEmployeeId(
  role: "admin" | "manager" | "employee",
  userId: string,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { employees } = await getAssignableEmployees(role, userId);
  const lower = search.toLowerCase();
  const exact = employees.find((employee) => employee.label.toLowerCase() === lower);
  const partial = employees.find((employee) =>
    employee.label.toLowerCase().includes(lower),
  );
  return (exact ?? partial)?.id ?? null;
}

async function resolveAssignableTemplateId(
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { templates } = await getTemplates();
  const activeTemplates = templates.filter(
    (template) => template.isActive && template.items.length > 0,
  );
  const lower = search.toLowerCase();
  const exact = activeTemplates.find(
    (template) =>
      template.name.toLowerCase() === lower ||
      templateSearchLabel(template).toLowerCase() === lower,
  );
  const partial = activeTemplates.find(
    (template) =>
      template.name.toLowerCase().includes(lower) ||
      templateSearchLabel(template).toLowerCase().includes(lower),
  );
  return (exact ?? partial)?.id ?? null;
}

function templateSearchLabel(template: {
  name: string;
  items: Array<unknown>;
}): string {
  return `${template.name} (${template.items.length} task${template.items.length === 1 ? "" : "s"})`;
}

// ─── Complete task ────────────────────────────────────────────────────────────

const completeTaskSchema = z.object({
  taskId: requiredUuid("Invalid task."),
  completionNote: z
    .string()
    .trim()
    .max(1200, "Completion note must be 1200 characters or fewer.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export async function completeTask(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["employee"], { attemptedResource: "action:onboarding.completeTask" });
  const parsed = completeTaskSchema.safeParse({
    taskId: formData.get("taskId"),
    completionNote: formData.get("completionNote") ?? undefined,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid task.", values: onboardingSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data: task, error: taskError } = await admin
    .from("onboarding_tasks")
    .select("employee_id, assignee_id, status")
    .eq("id", parsed.data.taskId)
    .maybeSingle();

  if (taskError) { console.error("onboarding.completeTask load failed", taskError); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }
  if (!task) return { success: false, message: "Task not found.", values: onboardingSubmittedValues(formData) };

  const isOwn = task.employee_id === user.id || task.assignee_id === user.id;
  if (!isOwn) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "onboarding_tasks",
      entityId: parsed.data.taskId,
      metadata: { reason: "employee_complete_other_task" },
    });
    return { success: false, message: "You can only complete your own tasks.", values: onboardingSubmittedValues(formData) };
  }

  if (task.status === "completed") {
    return { success: false, message: "Task is already completed.", values: onboardingSubmittedValues(formData) };
  }

  const { data: updated, error } = await admin
    .from("onboarding_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completion_note: parsed.data.completionNote,
      updated_by: user.id,
    })
    .eq("id", parsed.data.taskId)
    .eq("status", "pending")
    .or(`employee_id.eq.${user.id},assignee_id.eq.${user.id}`)
    .select("id")
    .maybeSingle();

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }
  if (!updated) return { success: false, message: "Task could not be completed. Refresh and try again.", values: onboardingSubmittedValues(formData) };

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.task_completed",
    entity: "onboarding_tasks",
    entityId: parsed.data.taskId,
    metadata: {
      employee_id: task.employee_id,
      has_completion_note: parsed.data.completionNote !== null,
    },
  });

  revalidatePath("/onboarding");
  return { success: true, message: "Task marked as complete." };
}

// ─── Delete task ──────────────────────────────────────────────────────────────

export async function deleteTask(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const user = await requireRole(["admin"], { attemptedResource: "action:onboarding.deleteTask" });

  const taskId = formData.get("taskId") as string | null;
  if (!taskId) return { success: false, message: "Missing task ID.", values: onboardingSubmittedValues(formData) };

  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_tasks")
    .delete()
    .eq("id", taskId);

  if (error) { console.error("onboarding action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: onboardingSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "onboarding.task_deleted",
    entity: "onboarding_tasks",
    entityId: taskId,
  });

  revalidatePath("/onboarding");
  revalidatePath("/onboarding/admin");
  return { success: true, message: "Task deleted." };
}
