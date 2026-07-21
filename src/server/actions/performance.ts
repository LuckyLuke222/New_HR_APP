"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isCycleDeadlineLocked,
  isValidIanaTimeZone,
  resolvePerformanceTimeZone,
} from "@/lib/performance-deadline";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import { requireRole } from "@/lib/supabase/helpers";
import {
  insertAuditLog,
  logEntityNotFound,
  logValidationFailed,
} from "@/server/audit";
import { sendEmail, getRecipient } from "@/server/email";
import {
  performanceReviewSubmittedEmail,
  performanceReviewSubmittedConfirmationEmail,
  performanceReviewAcknowledgedEmail,
  performanceReviewAcknowledgedConfirmationEmail,
} from "@/server/email-templates";
import { getAssignableEmployees, getDirectReportIds } from "@/server/dal/onboarding";
import { getAppTimezoneAsAdmin } from "@/server/dal/app-settings";
import type { UserRole } from "@/server/authz/roles";

export type PerformanceActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedPerformanceValues;
};

export type SubmittedPerformanceValues = {
  cycleId?: string;
  goalId?: string;
  reviewId?: string;
  employeeId?: string;
  goalCycleId?: string;
  title?: string;
  description?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  submissionDeadline?: string;
  submissionLockEnabled?: string;
  progress?: string;
  employeeProgressNote?: string;
  markComplete?: string;
  score?: string;
  managerStrengths?: string;
  managerImprovements?: string;
  managerNextSteps?: string;
  selfReview?: string;
  intent?: string;
};

function performanceSubmittedValues(formData: FormData): SubmittedPerformanceValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return {
    cycleId: get("cycleId"),
    goalId: get("goalId"),
    reviewId: get("reviewId"),
    employeeId: get("employeeId") || get("employeeIdSearch"),
    goalCycleId: get("goalCycleId") || get("goalCycleIdSearch"),
    title: get("title"),
    description: get("description"),
    status: get("status"),
    startDate: get("startDate"),
    endDate: get("endDate"),
    dueDate: get("dueDate"),
    submissionDeadline: get("submissionDeadline"),
    submissionLockEnabled: get("submissionLockEnabled"),
    progress: get("progress"),
    employeeProgressNote: get("employeeProgressNote"),
    markComplete: get("markComplete"),
    score: get("score"),
    managerStrengths: get("managerStrengths"),
    managerImprovements: get("managerImprovements"),
    managerNextSteps: get("managerNextSteps"),
    selfReview: get("selfReview"),
    intent: get("intent"),
  };
}

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const optionalUuid = z.preprocess(
  emptyToNull,
  postgresUuid().nullable(),
);

const requiredUuid = (message: string) =>
  z.preprocess((value) => value ?? "", postgresUuid(message));

const cycleSchema = z.object({
  title: z.string().min(1, "Title is required.").max(120),
  description: z.preprocess(emptyToNull, z.string().max(600).nullable()),
  status: z.enum(["draft", "active", "closed"]),
  startDate: z.string().date("Start date is required."),
  endDate: z.string().date("End date is required."),
  dueDate: z.preprocess(emptyToNull, z.string().date().nullable()),
  submissionDeadline: z.preprocess(emptyToNull, z.string().date().nullable()),
  submissionLockEnabled: z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.boolean(),
  ),
});

export async function createReviewCycle(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:performance.createCycle",
  });

  const parsed = cycleSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    dueDate: formData.get("dueDate"),
    submissionDeadline: formData.get("submissionDeadline"),
    submissionLockEnabled: formData.get("submissionLockEnabled"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.createCycle",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    return { success: false, message: "End date must be after start date.", values: performanceSubmittedValues(formData) };
  }

  if (parsed.data.submissionDeadline && parsed.data.submissionDeadline < parsed.data.startDate) {
    return { success: false, message: "Submission deadline cannot be before the cycle start date.", values: performanceSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_review_cycles")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      due_date: parsed.data.dueDate,
      submission_deadline: parsed.data.submissionDeadline,
      submission_lock_enabled: parsed.data.submissionLockEnabled,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  const cycleId = data.id as string;
  await insertAuditLog({
    actorId: user.id,
    action:
      parsed.data.status === "active"
        ? "performance.cycle_activated"
        : "performance.cycle_created",
    entity: "performance_review_cycles",
    entityId: cycleId,
    metadata: { title: parsed.data.title, status: parsed.data.status },
  });

  if (parsed.data.submissionDeadline) {
    await insertAuditLog({
      actorId: user.id,
      action: "performance.cycle_deadline_set",
      entity: "performance_review_cycles",
      entityId: cycleId,
      metadata: { previous: null, current: parsed.data.submissionDeadline },
    });
  }
  if (parsed.data.submissionLockEnabled) {
    await insertAuditLog({
      actorId: user.id,
      action: "performance.cycle_lock_enabled",
      entity: "performance_review_cycles",
      entityId: cycleId,
      metadata: { previous: false, current: true },
    });
  }

  revalidatePerformancePaths();
  return { success: true, message: "Review cycle created." };
}

export async function updateReviewCycle(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:performance.updateCycle",
  });

  const parsed = cycleSchema.extend({
    cycleId: requiredUuid("Invalid review cycle."),
  }).safeParse({
    cycleId: formData.get("cycleId"),
    title: formData.get("title"),
    description: formData.get("description"),
    status: formData.get("status"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    dueDate: formData.get("dueDate"),
    submissionDeadline: formData.get("submissionDeadline"),
    submissionLockEnabled: formData.get("submissionLockEnabled"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.updateCycle",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    return { success: false, message: "End date must be after start date.", values: performanceSubmittedValues(formData) };
  }

  if (parsed.data.submissionDeadline && parsed.data.submissionDeadline < parsed.data.startDate) {
    return { success: false, message: "Submission deadline cannot be before the cycle start date.", values: performanceSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("performance_review_cycles")
    .select("status, submission_deadline, submission_lock_enabled")
    .eq("id", parsed.data.cycleId)
    .maybeSingle();

  if (currentError) {
    console.error("performance.updateCycle load failed", currentError);
    return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) };
  }
  if (!current) {
    await logEntityNotFound({
      actorId: user.id,
      resource: "performance.updateCycle",
      entity: "performance_review_cycles",
      entityId: parsed.data.cycleId,
    });
    return { success: false, message: "Review cycle not found.", values: performanceSubmittedValues(formData) };
  }

  const { error } = await admin
    .from("performance_review_cycles")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      due_date: parsed.data.dueDate,
      submission_deadline: parsed.data.submissionDeadline,
      submission_lock_enabled: parsed.data.submissionLockEnabled,
      updated_by: user.id,
    })
    .eq("id", parsed.data.cycleId);

  if (error) {
    console.error("performance.updateCycle failed", error);
    return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) };
  }

  const previousStatus = current.status as string;
  const action =
    parsed.data.status === "active" && previousStatus !== "active"
      ? "performance.cycle_activated"
      : parsed.data.status === "closed" && previousStatus !== "closed"
        ? "performance.cycle_closed"
        : "performance.cycle_updated";

  await insertAuditLog({
    actorId: user.id,
    action,
    entity: "performance_review_cycles",
    entityId: parsed.data.cycleId,
    metadata: {
      title: parsed.data.title,
      previous_status: previousStatus,
      status: parsed.data.status,
    },
  });

  const previousDeadline = (current.submission_deadline as string | null) ?? null;
  const nextDeadline = parsed.data.submissionDeadline;
  if (previousDeadline !== nextDeadline) {
    await insertAuditLog({
      actorId: user.id,
      action:
        previousDeadline === null
          ? "performance.cycle_deadline_set"
          : "performance.cycle_deadline_updated",
      entity: "performance_review_cycles",
      entityId: parsed.data.cycleId,
      metadata: { previous: previousDeadline, current: nextDeadline },
    });
  }

  const previousLock = Boolean(current.submission_lock_enabled);
  const nextLock = parsed.data.submissionLockEnabled;
  if (previousLock !== nextLock) {
    await insertAuditLog({
      actorId: user.id,
      action: nextLock
        ? "performance.cycle_lock_enabled"
        : "performance.cycle_lock_disabled",
      entity: "performance_review_cycles",
      entityId: parsed.data.cycleId,
      metadata: { previous: previousLock, current: nextLock },
    });
  }

  revalidatePerformancePaths();
  return {
    success: true,
    message: "Review cycle updated.",
    values: performanceSubmittedValues(formData),
  };
}

const goalSchema = z.object({
  goalId: optionalUuid,
  employeeId: requiredUuid("Select an employee."),
  cycleId: requiredUuid("Select a review cycle."),
  title: z.string().min(1, "Title is required.").max(160),
  description: z.preprocess(emptyToNull, z.string().max(800).nullable()),
  dueDate: z.preprocess(emptyToNull, z.string().date().nullable()),
  status: z.enum(["not_started", "in_progress", "completed", "cancelled"]),
  progress: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Progress is required." })
      .int("Progress must be a whole number.")
      .min(0, "Progress cannot be below 0.")
      .max(100, "Progress cannot exceed 100."),
  ),
});

export async function savePerformanceGoal(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:performance.saveGoal",
  });

  const employeeId = await resolveEmployeeId(
    user.role,
    user.id,
    formData.get("employeeId"),
    formData.get("employeeIdSearch"),
  );
  const cycleId = await resolveCycleId(
    formData.get("goalCycleId"),
    formData.get("goalCycleIdSearch"),
  );
  const intent = formData.get("intent") === "submit" ? "submit" : "draft";

  const parsed = goalSchema.safeParse({
    goalId: formData.get("goalId"),
    employeeId,
    cycleId,
    title: formData.get("title"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
    status: formData.get("status"),
    progress: formData.get("progress"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.saveGoal",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  if (!(await canManageEmployee(user.id, user.role, parsed.data.employeeId))) {
    await logDenied(user.id, "performance_goals", {
      reason: "goal_outside_scope",
      employee_id: parsed.data.employeeId,
    });
    return { success: false, message: "You can only manage goals for employees in your scope.", values: performanceSubmittedValues(formData) };
  }

  const deadlineDenied = await assertCycleNotDeadlineLocked({
    cycleId: parsed.data.cycleId,
    actorId: user.id,
    entity: "performance_goals",
    resource: "performance.saveGoal",
  });
  if (deadlineDenied) {
    return { success: false, message: deadlineDenied, values: performanceSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const submittedAtIso = new Date().toISOString();

  if (parsed.data.goalId) {
    const { data: current } = await admin
      .from("performance_goals")
      .select("employee_id, goal_definition_submitted_at")
      .eq("id", parsed.data.goalId)
      .maybeSingle();

    if (!current) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "performance.saveGoal",
        entity: "performance_goals",
        entityId: parsed.data.goalId,
      });
      return { success: false, message: "Goal not found.", values: performanceSubmittedValues(formData) };
    }
    if (!(await canManageEmployee(user.id, user.role, current.employee_id as string))) {
      await logDenied(user.id, "performance_goals", {
        reason: "goal_update_outside_scope",
        goal_id: parsed.data.goalId,
      });
      return { success: false, message: "You can only update goals for employees in your scope.", values: performanceSubmittedValues(formData) };
    }

    // Locked definitions must be explicitly reopened first. Progress fields are
    // owned by updateOwnGoalProgress and are unaffected by this guard.
    if (current.goal_definition_submitted_at) {
      return {
        success: false,
        message: "This goal is submitted. Click Edit to re-open before changing it.",
        values: performanceSubmittedValues(formData),
      };
    }

    // Goals cannot be transferred between employees: employee_id is intentionally
    // omitted so a crafted form cannot reassign a goal to someone outside scope.
    const updatePayload: Record<string, unknown> = {
      cycle_id: parsed.data.cycleId,
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: parsed.data.dueDate,
      status: parsed.data.status,
      progress: parsed.data.progress,
      updated_by: user.id,
    };
    if (intent === "submit") {
      updatePayload.goal_definition_submitted_at = submittedAtIso;
      updatePayload.goal_definition_submitted_by = user.id;
    }

    // Atomic lock guard: the update only matches rows whose definition is
    // still unlocked. If a concurrent submit raced ahead, the row count comes
    // back zero and we surface the same "click Edit" message — closing the
    // TOCTOU between the maybeSingle read above and this update.
    const { data: updated, error } = await admin
      .from("performance_goals")
      .update(updatePayload)
      .eq("id", parsed.data.goalId)
      .is("goal_definition_submitted_at", null)
      .select("id");

    if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

    if (!updated || updated.length === 0) {
      return {
        success: false,
        message: "This goal is submitted. Click Edit to re-open before changing it.",
        values: performanceSubmittedValues(formData),
      };
    }

    await insertAuditLog({
      actorId: user.id,
      action:
        parsed.data.status === "completed" || parsed.data.status === "cancelled"
          ? "performance.goal_closed"
          : "performance.goal_updated",
      entity: "performance_goals",
      entityId: parsed.data.goalId,
      metadata: {
        employee_id: parsed.data.employeeId,
        cycle_id: parsed.data.cycleId,
        title: parsed.data.title,
        description: parsed.data.description,
        due_date: parsed.data.dueDate,
        status: parsed.data.status,
        progress: parsed.data.progress,
      },
    });

    if (intent === "submit") {
      await insertAuditLog({
        actorId: user.id,
        action: "performance.goal_definition_submitted",
        entity: "performance_goals",
        entityId: parsed.data.goalId,
        metadata: {
          employee_id: parsed.data.employeeId,
          cycle_id: parsed.data.cycleId,
          submitted_at: submittedAtIso,
        },
      });
    }

    revalidatePerformancePaths();
    return {
      success: true,
      message: intent === "submit" ? "Goal submitted and locked." : "Goal updated.",
    };
  }

  const insertPayload: Record<string, unknown> = {
    employee_id: parsed.data.employeeId,
    cycle_id: parsed.data.cycleId,
    title: parsed.data.title,
    description: parsed.data.description,
    due_date: parsed.data.dueDate,
    status: parsed.data.status,
    progress: parsed.data.progress,
    created_by: user.id,
    updated_by: user.id,
  };
  if (intent === "submit") {
    insertPayload.goal_definition_submitted_at = submittedAtIso;
    insertPayload.goal_definition_submitted_by = user.id;
  }

  const { data, error } = await admin
    .from("performance_goals")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  const { data: existingReview } = await admin
    .from("performance_reviews")
    .select("id")
    .eq("employee_id", parsed.data.employeeId)
    .eq("cycle_id", parsed.data.cycleId)
    .maybeSingle();

  if (!existingReview) {
    const { data: bootstrappedReview, error: reviewInsertError } = await admin.from("performance_reviews").insert({
      employee_id: parsed.data.employeeId,
      manager_id: user.id,
      cycle_id: parsed.data.cycleId,
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
    }).select("id").single();
    if (reviewInsertError) {
      console.error("failed to bootstrap review row for goal", reviewInsertError);
    } else {
      await insertAuditLog({
        actorId: user.id,
        action: "performance.review_bootstrapped",
        entity: "performance_reviews",
        entityId: bootstrappedReview.id as string,
        metadata: {
          employee_id: parsed.data.employeeId,
          cycle_id: parsed.data.cycleId,
          triggered_by: "goal_created",
        },
      });
    }
  }

  await insertAuditLog({
    actorId: user.id,
    action: "performance.goal_created",
    entity: "performance_goals",
    entityId: data.id as string,
    metadata: {
      employee_id: parsed.data.employeeId,
      cycle_id: parsed.data.cycleId,
      status: parsed.data.status,
    },
  });

  if (intent === "submit") {
    await insertAuditLog({
      actorId: user.id,
      action: "performance.goal_definition_submitted",
      entity: "performance_goals",
      entityId: data.id as string,
      metadata: {
        employee_id: parsed.data.employeeId,
        cycle_id: parsed.data.cycleId,
        submitted_at: submittedAtIso,
      },
    });
  }

  revalidatePerformancePaths();
  return {
    success: true,
    message: intent === "submit" ? "Goal created and submitted." : "Goal created.",
  };
}

export async function reopenGoalDefinition(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:performance.reopenGoalDefinition",
  });

  const goalIdRaw = formData.get("goalId");
  const parsed = postgresUuid().safeParse(goalIdRaw);
  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.reopenGoalDefinition",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid goal." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("performance_goals")
    .select("employee_id, cycle_id, title, description, due_date, status, progress, goal_definition_submitted_at, goal_definition_submitted_by")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!current) {
    await logEntityNotFound({
      actorId: user.id,
      resource: "performance.reopenGoalDefinition",
      entity: "performance_goals",
      entityId: parsed.data,
    });
    return { success: false, message: "Goal not found." };
  }

  if (!(await canManageEmployee(user.id, user.role, current.employee_id as string))) {
    await logDenied(user.id, "performance_goals", {
      reason: "goal_reopen_outside_scope",
      goal_id: parsed.data,
    });
    return { success: false, message: "You can only manage goals for employees in your scope." };
  }

  const deadlineDenied = await assertCycleNotDeadlineLocked({
    cycleId: current.cycle_id as string | null,
    actorId: user.id,
    entity: "performance_goals",
    resource: "performance.reopenGoalDefinition",
  });
  if (deadlineDenied) {
    return { success: false, message: deadlineDenied };
  }

  if (!current.goal_definition_submitted_at) {
    return { success: true, message: "Goal is already editable." };
  }

  const { error } = await admin
    .from("performance_goals")
    .update({
      goal_definition_submitted_at: null,
      goal_definition_submitted_by: null,
      updated_by: user.id,
    })
    .eq("id", parsed.data);

  if (error) {
    console.error("performance action failed", error);
    return { success: false, message: "An unexpected error occurred. Please try again." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "performance.goal_definition_reopened",
    entity: "performance_goals",
    entityId: parsed.data,
    metadata: {
      employee_id: current.employee_id,
      previous_submitted_at: current.goal_definition_submitted_at,
      previous_submitted_by: current.goal_definition_submitted_by,
      before: {
        title: current.title,
        description: current.description,
        due_date: current.due_date,
        status: current.status,
        progress: current.progress,
        cycle_id: current.cycle_id,
      },
    },
  });

  revalidatePerformancePaths();
  return { success: true, message: "Goal re-opened for editing." };
}

const employeeGoalProgressSchema = z.object({
  goalId: requiredUuid("Invalid goal."),
  progress: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Progress is required." })
      .int("Progress must be a whole number.")
      .min(0, "Progress cannot be below 0.")
      .max(100, "Progress cannot exceed 100."),
  ),
  employeeProgressNote: z.preprocess(
    emptyToNull,
    z.string().min(1, "Progress note is required.").max(1200).nullable(),
  ),
  markComplete: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean(),
  ),
});

export async function updateOwnGoalProgress(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["employee"], {
    attemptedResource: "action:performance.updateOwnGoalProgress",
  });

  const parsed = employeeGoalProgressSchema.safeParse({
    goalId: formData.get("goalId"),
    progress: formData.get("progress"),
    employeeProgressNote: formData.get("employeeProgressNote"),
    markComplete: formData.get("markComplete"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.updateOwnGoalProgress",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const { data: current, error: currentError } = await admin
    .from("performance_goals")
    .select("employee_id, status")
    .eq("id", parsed.data.goalId)
    .maybeSingle();

  if (currentError) { console.error("performance action failed", currentError); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  if (!current || current.employee_id !== user.id) {
    await logDenied(user.id, "performance_goals", {
      reason: "goal_progress_not_owner",
      goal_id: parsed.data.goalId,
    });
    return { success: false, message: "You can only update your own goals.", values: performanceSubmittedValues(formData) };
  }

  if (current.status === "cancelled") {
    return { success: false, message: "Cancelled goals cannot be updated.", values: performanceSubmittedValues(formData) };
  }

  const status = nextEmployeeGoalStatus(
    parsed.data.progress,
    parsed.data.markComplete,
  );

  const { error } = await admin
    .from("performance_goals")
    .update({
      progress: parsed.data.markComplete ? 100 : parsed.data.progress,
      status,
      employee_progress_note: parsed.data.employeeProgressNote,
      employee_progress_updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", parsed.data.goalId);

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action:
      status === "completed"
        ? "performance.goal_employee_completed"
        : "performance.goal_employee_updated",
    entity: "performance_goals",
    entityId: parsed.data.goalId,
    metadata: {
      progress: parsed.data.markComplete ? 100 : parsed.data.progress,
      status,
    },
  });

  // No revalidatePath — see submitSelfReview. EmployeeGoalProgressForm calls
  // router.refresh() on success; synchronous current-route revalidation would wedge
  // the form's useActionState pending on the heavy /performance tree.
  return { success: true, message: "Goal progress saved." };
}

function nextEmployeeGoalStatus(
  progress: number,
  markComplete: boolean,
): "not_started" | "in_progress" | "completed" {
  if (markComplete || progress === 100) return "completed";
  if (progress === 0) return "not_started";
  return "in_progress";
}

const managerReviewSchema = z.object({
  employeeId: requiredUuid("Select an employee."),
  cycleId: requiredUuid("Select a cycle."),
  score: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Select a score." })
      .int("Score must be a whole number.")
      .min(1, "Score must be between 1 and 5.")
      .max(5, "Score must be between 1 and 5."),
  ),
  managerStrengths: z.string().min(1, "Strengths are required.").max(1200),
  managerImprovements: z.string().min(1, "Improvement areas are required.").max(1200),
  managerNextSteps: z.string().min(1, "Next steps are required.").max(1200),
});

const managerReviewDraftSchema = z.object({
  employeeId: requiredUuid("Select an employee."),
  cycleId: requiredUuid("Select a cycle."),
  score: z.preprocess(
    emptyToNull,
    z.coerce
      .number()
      .int("Score must be a whole number.")
      .min(1, "Score must be between 1 and 5.")
      .max(5, "Score must be between 1 and 5.")
      .nullable(),
  ),
  managerStrengths: z.preprocess(emptyToNull, z.string().max(1200).nullable()),
  managerImprovements: z.preprocess(emptyToNull, z.string().max(1200).nullable()),
  managerNextSteps: z.preprocess(emptyToNull, z.string().max(1200).nullable()),
});

export async function submitManagerReview(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:performance.submitManagerReview",
  });

  const employeeId = await resolveEmployeeId(
    user.role,
    user.id,
    formData.get("employeeId"),
    formData.get("employeeIdSearch"),
  );
  const cycleId = await resolveCycleId(
    formData.get("cycleId"),
    formData.get("cycleIdSearch"),
  );
  const intent = formData.get("intent") === "draft" ? "draft" : "submit";
  const schema = intent === "draft" ? managerReviewDraftSchema : managerReviewSchema;

  const parsed = schema.safeParse({
    employeeId,
    cycleId,
    score: formData.get("score"),
    managerStrengths: formData.get("managerStrengths"),
    managerImprovements: formData.get("managerImprovements"),
    managerNextSteps: formData.get("managerNextSteps"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.submitManagerReview",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  if (!(await canManageEmployee(user.id, user.role, parsed.data.employeeId))) {
    await logDenied(user.id, "performance_reviews", {
      reason: "review_outside_scope",
      employee_id: parsed.data.employeeId,
    });
    return { success: false, message: "You can only appraise employees in your scope.", values: performanceSubmittedValues(formData) };
  }

  const deadlineDenied = await assertCycleNotDeadlineLocked({
    cycleId: parsed.data.cycleId,
    actorId: user.id,
    entity: "performance_reviews",
    resource: "performance.submitManagerReview",
  });
  if (deadlineDenied) {
    return { success: false, message: deadlineDenied, values: performanceSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("performance_reviews")
    .select("id, status")
    .eq("employee_id", parsed.data.employeeId)
    .eq("cycle_id", parsed.data.cycleId)
    .maybeSingle();

  if (existingError) { console.error("performance action failed", existingError); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  if (existing?.status === "acknowledged") {
    return { success: false, message: "Acknowledged reviews cannot be edited.", values: performanceSubmittedValues(formData) };
  }

  if (existing?.status === "manager_submitted" && intent === "submit") {
    return {
      success: false,
      message: "This appraisal is submitted. Click Edit to re-open before resubmitting.",
      values: performanceSubmittedValues(formData),
    };
  }

  const reviewPayload =
    intent === "draft"
      ? {
          status: existing?.status === "self_reviewed" ? "self_reviewed" as const : "draft" as const,
          score: parsed.data.score,
          manager_strengths: parsed.data.managerStrengths,
          manager_improvements: parsed.data.managerImprovements,
          manager_next_steps: parsed.data.managerNextSteps,
          submitted_at: null,
          updated_by: user.id,
        }
      : {
          status: "manager_submitted" as const,
          score: parsed.data.score,
          manager_strengths: parsed.data.managerStrengths,
          manager_improvements: parsed.data.managerImprovements,
          manager_next_steps: parsed.data.managerNextSteps,
          submitted_at: new Date().toISOString(),
          updated_by: user.id,
        };

  const { data, error } = existing
    ? await admin
        .from("performance_reviews")
        .update(reviewPayload)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await admin
        .from("performance_reviews")
        .insert({
          ...reviewPayload,
          employee_id: parsed.data.employeeId,
          manager_id: user.id,
          cycle_id: parsed.data.cycleId,
          created_by: user.id,
        })
        .select("id")
        .single();

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action:
      intent === "draft"
        ? "performance.review_manager_draft_saved"
        : "performance.review_manager_submitted",
    entity: "performance_reviews",
    entityId: data.id as string,
    metadata: {
      employee_id: parsed.data.employeeId,
      cycle_id: parsed.data.cycleId,
      score: parsed.data.score,
    },
  });

  // Notify the employee that their review was submitted + a confirmation to the
  // manager (actor) — submit intent only, not drafts. Fire-and-forget.
  if (intent === "submit") {
    try {
      const [employee, self] = await Promise.all([
        getRecipient(parsed.data.employeeId),
        getRecipient(user.id),
      ]);
      if (employee) {
        const tmpl = performanceReviewSubmittedEmail();
        await sendEmail({
          to: [employee],
          subject: tmpl.subject,
          html: tmpl.html,
          text: tmpl.text,
          template: "performance_review_submitted",
          entityId: data.id as string,
          actorId: user.id,
        });
      }
      if (self) {
        const confirm = performanceReviewSubmittedConfirmationEmail({
          employeeName: employee?.name ?? "the employee",
        });
        await sendEmail({
          to: [self],
          subject: confirm.subject,
          html: confirm.html,
          text: confirm.text,
          template: "performance_review_submitted_confirmation",
          entityId: data.id as string,
          actorId: user.id,
        });
      }
    } catch {
      /* boundary already swallows; belt-and-braces */
    }
  }

  revalidatePerformancePaths();
  return {
    success: true,
    message: intent === "draft" ? "Manager appraisal draft saved." : "Manager appraisal submitted.",
  };
}

export async function reopenManagerReview(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:performance.reopenManagerReview",
  });

  const reviewIdRaw = formData.get("reviewId");
  const parsed = postgresUuid().safeParse(reviewIdRaw);
  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.reopenManagerReview",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid review." };
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("performance_reviews")
    .select("id, employee_id, cycle_id, status, self_review, submitted_at, score, manager_strengths, manager_improvements, manager_next_steps")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!review) {
    await logEntityNotFound({
      actorId: user.id,
      resource: "performance.reopenManagerReview",
      entity: "performance_reviews",
      entityId: parsed.data,
    });
    return { success: false, message: "Review not found." };
  }

  if (!(await canManageEmployee(user.id, user.role, review.employee_id as string))) {
    await logDenied(user.id, "performance_reviews", {
      reason: "review_reopen_outside_scope",
      review_id: parsed.data,
    });
    return { success: false, message: "You can only manage reviews for employees in your scope." };
  }

  const deadlineDenied = await assertCycleNotDeadlineLocked({
    cycleId: review.cycle_id as string | null,
    actorId: user.id,
    entity: "performance_reviews",
    resource: "performance.reopenManagerReview",
  });
  if (deadlineDenied) {
    return { success: false, message: deadlineDenied };
  }

  if (review.status === "acknowledged") {
    return {
      success: false,
      message: "Acknowledged reviews cannot be re-opened.",
    };
  }

  if (review.status !== "manager_submitted") {
    return { success: true, message: "Review is already editable." };
  }

  // Revert to whichever pre-submit state applies: keep the employee's
  // self-review intact, so if a self-review exists we go back to
  // self_reviewed; otherwise back to draft.
  const previousStatus = review.self_review ? ("self_reviewed" as const) : ("draft" as const);

  const { error } = await admin
    .from("performance_reviews")
    .update({
      status: previousStatus,
      submitted_at: null,
      updated_by: user.id,
    })
    .eq("id", parsed.data);

  if (error) {
    console.error("performance action failed", error);
    return { success: false, message: "An unexpected error occurred. Please try again." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "performance.review_manager_reopened",
    entity: "performance_reviews",
    entityId: parsed.data,
    metadata: {
      employee_id: review.employee_id,
      previous_status: "manager_submitted",
      previous_submitted_at: review.submitted_at,
      reverted_to: previousStatus,
      before: {
        score: review.score,
        manager_strengths: review.manager_strengths,
        manager_improvements: review.manager_improvements,
        manager_next_steps: review.manager_next_steps,
      },
    },
  });

  revalidatePerformancePaths();
  return { success: true, message: "Appraisal re-opened for editing." };
}

const selfReviewSchema = z.object({
  reviewId: requiredUuid("Invalid review."),
  selfReview: z.string().min(1, "Self-review comment is required.").max(1200),
});

export async function submitSelfReview(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["employee"], {
    attemptedResource: "action:performance.submitSelfReview",
  });

  const parsed = selfReviewSchema.safeParse({
    reviewId: formData.get("reviewId"),
    selfReview: formData.get("selfReview"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.submitSelfReview",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: performanceSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("performance_reviews")
    .select("employee_id, cycle_id, status, self_review")
    .eq("id", parsed.data.reviewId)
    .maybeSingle();

  if (!review || review.employee_id !== user.id) {
    await logDenied(user.id, "performance_reviews", {
      reason: "self_review_not_owner",
      review_id: parsed.data.reviewId,
    });
    return { success: false, message: "You can only update your own review.", values: performanceSubmittedValues(formData) };
  }

  if (review.status === "manager_submitted" || review.status === "acknowledged") {
    return { success: false, message: "Self-review is closed after manager submission.", values: performanceSubmittedValues(formData) };
  }

  const deadlineDenied = await assertCycleNotDeadlineLocked({
    cycleId: review.cycle_id as string | null,
    actorId: user.id,
    entity: "performance_reviews",
    resource: "performance.submitSelfReview",
  });
  if (deadlineDenied) {
    return { success: false, message: deadlineDenied, values: performanceSubmittedValues(formData) };
  }

  const isResubmit = review.status === "self_reviewed";

  const { error } = await admin
    .from("performance_reviews")
    .update({
      self_review: parsed.data.selfReview,
      status: "self_reviewed",
      updated_by: user.id,
    })
    .eq("id", parsed.data.reviewId);

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  // A resubmit leaves two rows so the timeline reads:
  // ... self_submitted → self_reopened → self_submitted ...
  // Mirrors the manager review pattern even though the self-review has no
  // separate reopen action (the field is a single textarea — one save covers
  // both the implicit reopen and the new submit).
  if (isResubmit) {
    await insertAuditLog({
      actorId: user.id,
      action: "performance.review_self_reopened",
      entity: "performance_reviews",
      entityId: parsed.data.reviewId,
      metadata: {
        reason: "implicit_on_resubmit",
        before: { self_review: review.self_review },
      },
    });
  }

  await insertAuditLog({
    actorId: user.id,
    action: "performance.review_self_submitted",
    entity: "performance_reviews",
    entityId: parsed.data.reviewId,
  });

  // No server revalidatePath here: synchronously revalidating the current /performance
  // route makes the Server Action response carry a re-render of the large employee tree
  // (many useActionState forms), and committing that tree as this action's result wedges
  // the form's useActionState `pending` transition → button stuck on "Saving…" (the POST
  // returns 200; the hang is the client commit). Instead SelfReviewForm calls
  // router.refresh() on success — a separate navigation that brings fresh props without
  // the wedge. The page is dynamic (cookie-based Supabase client), so other users/routes
  // get fresh data on their next load regardless. See handover Session 173.
  // `values` lets a reopen (Edit) show the just-submitted text before the refresh lands.
  return {
    success: true,
    message: isResubmit ? "Self-review re-submitted." : "Self-review saved.",
    values: performanceSubmittedValues(formData),
  };
}

export async function acknowledgeReview(
  _prev: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  const user = await requireRole(["employee"], {
    attemptedResource: "action:performance.acknowledgeReview",
  });

  const reviewId = formData.get("reviewId");
  const parsed = postgresUuid().safeParse(reviewId);
  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "performance.acknowledgeReview",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid review.", values: performanceSubmittedValues(formData) };
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("performance_reviews")
    .select("employee_id, cycle_id, status, manager_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!review || review.employee_id !== user.id) {
    await logDenied(user.id, "performance_reviews", {
      reason: "acknowledge_not_owner",
      review_id: parsed.data,
    });
    return { success: false, message: "You can only acknowledge your own review.", values: performanceSubmittedValues(formData) };
  }

  if (review.status !== "manager_submitted") {
    return { success: false, message: "Only submitted reviews can be acknowledged.", values: performanceSubmittedValues(formData) };
  }

  const { error } = await admin
    .from("performance_reviews")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", parsed.data);

  if (error) { console.error("performance action failed", error); return { success: false, message: "An unexpected error occurred. Please try again.", values: performanceSubmittedValues(formData) }; }

  await insertAuditLog({
    actorId: user.id,
    action: "performance.review_acknowledged",
    entity: "performance_reviews",
    entityId: parsed.data,
  });

  // Notify the manager who submitted the review + a confirmation to the employee
  // (actor) who acknowledged it. Fire-and-forget.
  try {
    const [manager, self] = await Promise.all([
      review.manager_id ? getRecipient(review.manager_id as string) : Promise.resolve(null),
      getRecipient(user.id),
    ]);
    if (manager) {
      const tmpl = performanceReviewAcknowledgedEmail({
        employeeName: user.displayName ?? user.email,
      });
      await sendEmail({
        to: [manager],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        template: "performance_review_acknowledged",
        entityId: parsed.data,
        actorId: user.id,
      });
    }
    if (self) {
      const confirm = performanceReviewAcknowledgedConfirmationEmail();
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "performance_review_acknowledged_confirmation",
        entityId: parsed.data,
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  // No revalidatePath — see submitSelfReview. AcknowledgeReviewForm calls
  // router.refresh() on success (same employee/heavy-page wedge avoided).
  return { success: true, message: "Review acknowledged." };
}

async function canManageEmployee(
  userId: string,
  role: "admin" | "manager" | "employee",
  employeeId: string,
): Promise<boolean> {
  // Separation of duties: nobody can appraise themselves, including admin.
  if (employeeId === userId) return false;
  if (role === "admin") return true;
  if (role !== "manager") return false;
  const directReportIds = await getDirectReportIds(userId);
  return directReportIds.includes(employeeId);
}

async function logDenied(
  actorId: string,
  entity: string,
  metadata: Record<string, unknown>,
) {
  await insertAuditLog({
    actorId,
    action: "auth.access_denied",
    entity,
    metadata,
  });
}

// Returns a friendly deny message when the cycle's submission window has
// passed (and the admin opted in to hard-lock). On deny, writes an
// auth.access_denied audit row with reason "deadline_passed" so the negative
// path is observable. Returns null when the write is allowed.
async function assertCycleNotDeadlineLocked({
  cycleId,
  actorId,
  entity,
  resource,
}: {
  cycleId: string | null | undefined;
  actorId: string;
  entity: string;
  resource: string;
}): Promise<string | null> {
  if (!cycleId) return null;
  const admin = createAdminClient();
  const { data: cycle } = await admin
    .from("performance_review_cycles")
    .select("submission_deadline, submission_lock_enabled")
    .eq("id", cycleId)
    .maybeSingle();
  if (!cycle) return null;
  const configuredTimeZone = await getAppTimezoneAsAdmin();
  if (configuredTimeZone && !isValidIanaTimeZone(configuredTimeZone)) {
    console.error("performance.deadline invalid app timezone; using fallback", {
      configuredTimeZone,
    });
  }
  const timeZone = resolvePerformanceTimeZone(configuredTimeZone);
  const locked = isCycleDeadlineLocked(
    {
      submissionDeadline: (cycle.submission_deadline as string | null) ?? null,
      submissionLockEnabled: Boolean(cycle.submission_lock_enabled),
    },
    timeZone,
  );
  if (!locked) return null;
  await logDenied(actorId, entity, {
    reason: "deadline_passed",
    resource,
    cycle_id: cycleId,
    submission_deadline: cycle.submission_deadline,
  });
  return `Submission deadline passed (${cycle.submission_deadline}). Contact an admin to extend.`;
}

async function resolveEmployeeId(
  role: UserRole,
  userId: string,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  // Scope label resolution to the same employees the form was allowed to show:
  // admin sees all, manager sees direct reports. canManageEmployee still gates
  // the final mutation, so a forged label outside scope is rejected anyway.
  const { employees } = await getAssignableEmployees(role, userId);
  const lower = search.toLowerCase();
  const exact = employees.find((employee) => employee.label.toLowerCase() === lower);
  const partial = employees.find((employee) => employee.label.toLowerCase().includes(lower));
  return (exact ?? partial)?.id ?? null;
}

async function resolveCycleId(
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("performance_review_cycles")
    .select("id, title, status")
    .neq("status", "closed")
    .ilike("title", `%${search}%`)
    .order("title")
    .limit(5);

  if (error) {
    console.error("performance.resolve_cycle failed", error);
    return null;
  }

  const lower = search.toLowerCase();
  const exact = data?.find((cycle) => String(cycle.title).toLowerCase() === lower);
  return (exact ?? data?.[0])?.id ?? null;
}

function revalidatePerformancePaths() {
  revalidatePath("/performance");
  revalidatePath("/performance/reviews");
  revalidatePath("/dashboard");
}
