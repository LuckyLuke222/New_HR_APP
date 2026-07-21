"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postgresUuid } from "@/lib/validation/postgres-uuid";
import {
  insertAuditLog,
  logEntityNotFound,
  logValidationFailed,
} from "@/server/audit";
import {
  sendEmail,
  getAdminRecipients,
  getManagerRecipientForEmployee,
  getRecipient,
  type Recipient,
} from "@/server/email";
import {
  leaveSubmittedEmail,
  leaveSubmittedConfirmationEmail,
  leaveDecisionEmail,
  leaveDecisionConfirmationEmail,
} from "@/server/email-templates";
import { getAppSettingsAsAdmin } from "@/server/dal/app-settings";

export type LeaveActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: SubmittedLeaveValues;
};

export type SubmittedLeaveValues = {
  // submitLeaveRequest
  leaveTypeId?: string;
  startDate?: string;
  endDate?: string;
  employeeNote?: string;
  urgentLocalLeave?: string;
  urgentLeaveReason?: string;
  isHalfDay?: string;
  // approve/reject decision form
  approverNote?: string;
  // createLeaveType
  name?: string;
  description?: string;
  defaultDays?: string;
  // upsertLeaveBalance
  employeeId?: string;
  year?: string;
  balance?: string;
  reason?: string;
  // public holidays
  date?: string;
  isTentative?: string;
  countryCode?: string;
};

function leaveSubmittedValues(formData: FormData): SubmittedLeaveValues {
  const get = (key: string): string | undefined => {
    const v = formData.get(key);
    return typeof v === "string" ? v : undefined;
  };
  return {
    leaveTypeId: get("leaveTypeId") || get("leaveTypeIdSearch"),
    startDate: get("startDate"),
    endDate: get("endDate"),
    employeeNote: get("employeeNote"),
    urgentLocalLeave: get("urgentLocalLeave"),
    urgentLeaveReason: get("urgentLeaveReason"),
    isHalfDay: get("isHalfDay"),
    approverNote: get("approverNote"),
    name: get("name"),
    description: get("description"),
    defaultDays: get("defaultDays"),
    employeeId: get("employeeId") || get("employeeIdSearch"),
    year: get("year"),
    balance: get("balance"),
    reason: get("reason"),
    date: get("date"),
    isTentative: get("isTentative"),
    countryCode: get("countryCode"),
  };
}

const emptyToNull = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t.length === 0 ? null : t;
};

const requiredUuid = (message: string) =>
  z.preprocess((value) => value ?? "", postgresUuid(message));

// ─── Overlap detection (B1/F1) ────────────────────────────────────────────────
// Defense in depth with the EXCLUDE constraint on leave_requests
// (migration 0035). The action layer surfaces a user-friendly message; the DB
// constraint catches races and is translated below via SQLSTATE 23P01.

type OverlapHit = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
};

async function findOverlappingLeaveRequest(args: {
  employeeId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}): Promise<OverlapHit | null> {
  const admin = createAdminClient();
  let query = admin
    .from("leave_requests")
    .select("id, start_date, end_date, status")
    .eq("employee_id", args.employeeId)
    .in("status", ["pending", "approved"])
    .lte("start_date", args.endDate)
    .gte("end_date", args.startDate)
    .limit(1);
  if (args.excludeRequestId) {
    query = query.neq("id", args.excludeRequestId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("leave overlap lookup failed", error);
    throw error;
  }
  return (data as OverlapHit | null) ?? null;
}

// ─── Submit leave request ─────────────────────────────────────────────────────

const submitSchema = z
  .object({
    leaveTypeId: requiredUuid("Select a leave type."),
    startDate: z.string().date("Enter a valid start date."),
    endDate: z.string().date("Enter a valid end date."),
    urgentLocalLeave: z.preprocess((value) => value === "on", z.boolean()),
    urgentLeaveReason: z.preprocess(
      emptyToNull,
      z.string().max(500, "Urgent reason must be 500 characters or fewer.").nullable(),
    ),
    employeeNote: z.preprocess(
      emptyToNull,
      z.string().max(500, "Note must be 500 characters or fewer.").nullable(),
    ),
    isHalfDay: z.preprocess((value) => value === "on", z.boolean()),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after the start date.",
    path: ["endDate"],
  })
  .refine((d) => !d.urgentLocalLeave || Boolean(d.urgentLeaveReason), {
    message: "Urgent reason is required.",
    path: ["urgentLeaveReason"],
  })
  .refine((d) => !d.isHalfDay || d.startDate === d.endDate, {
    message: "Half-day requests must be for a single date.",
    path: ["isHalfDay"],
  });

export async function submitLeaveRequest(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "action:leave.submit",
  });
  const parsed = submitSchema.safeParse({
    leaveTypeId: formData.get("leaveTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    urgentLocalLeave: formData.get("urgentLocalLeave"),
    urgentLeaveReason: formData.get("urgentLeaveReason"),
    employeeNote: formData.get("employeeNote"),
    isHalfDay: formData.get("isHalfDay"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.submit",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: leaveSubmittedValues(formData),
    };
  }

  const supabase = await createClient();
  // Years touched by this request. E2: allow currentYear and currentYear + 1
  // only. Auto-seed missing Local/Sick balances for those years from
  // app_settings so the approval-time deduction trigger and the visible
  // available-days panel both work without a separate admin action.
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1;
  const startYear = Number(parsed.data.startDate.slice(0, 4));
  const endYear = Number(parsed.data.endDate.slice(0, 4));
  if (endYear > maxYear || startYear > maxYear) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        endDate: [
          `Leave can only be requested up to ${maxYear}. Rollover for later years happens at year end.`,
        ],
      },
      values: leaveSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const { data: requestedType, error: requestedTypeError } = await admin
    .from("leave_types")
    .select("name")
    .eq("id", parsed.data.leaveTypeId)
    .maybeSingle();

  if (requestedTypeError || !requestedType) {
    console.error("leave.submit type lookup failed", requestedTypeError);
    if (!requestedTypeError) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "leave.submit",
        entity: "leave_type",
        entityId: parsed.data.leaveTypeId,
      });
    }
    return {
      success: false,
      message: "Leave request could not be submitted.",
      values: leaveSubmittedValues(formData),
    };
  }

  const requestedTypeName = String(requestedType.name);
  const seededYears = new Set<number>();
  for (let y = startYear; y <= endYear; y++) seededYears.add(y);

  if (requestedTypeName === "Local Leave" || requestedTypeName === "Sick Leave") {
    const settings = await getAppSettingsAsAdmin();
    const defaultDays =
      requestedTypeName === "Local Leave"
        ? settings?.localLeaveDefaultDays ?? 22
        : settings?.sickLeaveDefaultDays ?? 15;
    const seedRows = Array.from(seededYears).map((y) => ({
      employee_id: user.id,
      leave_type_id: parsed.data.leaveTypeId,
      balance: defaultDays,
      year: y,
      created_by: user.id,
      updated_by: user.id,
    }));
    const { error: seedError } = await admin
      .from("leave_balances")
      .upsert(seedRows, {
        onConflict: "employee_id,leave_type_id,year",
        ignoreDuplicates: true,
      });
    if (seedError) {
      console.error("leave.submit auto-seed failed", seedError);
      return {
        success: false,
        message: "Leave request could not be submitted.",
        values: leaveSubmittedValues(formData),
      };
    }
  } else {
    // Custom leave type: require an existing balance for every year touched.
    const { data: existing, error: existingError } = await admin
      .from("leave_balances")
      .select("year")
      .eq("employee_id", user.id)
      .eq("leave_type_id", parsed.data.leaveTypeId)
      .in("year", Array.from(seededYears));
    if (existingError) {
      console.error("leave.submit existing balance lookup failed", existingError);
      return {
        success: false,
        message: "Leave request could not be submitted.",
        values: leaveSubmittedValues(formData),
      };
    }
    const have = new Set((existing ?? []).map((r) => Number(r.year)));
    const missing = Array.from(seededYears).filter((y) => !have.has(y));
    if (missing.length > 0) {
      return {
        success: false,
        message: "Check the highlighted fields.",
        fieldErrors: {
          leaveTypeId: [
            `No balance set for ${requestedTypeName} in ${missing.join(", ")}. Ask admin to set one first.`,
          ],
        },
        values: leaveSubmittedValues(formData),
      };
    }
  }

  if (parsed.data.urgentLocalLeave) {
    const { data: leaveType, error: leaveTypeError } = await supabase
      .from("leave_types")
      .select("name")
      .eq("id", parsed.data.leaveTypeId)
      .maybeSingle();

    if (leaveTypeError) {
      console.error("leave.submit leave type lookup failed", leaveTypeError);
      return {
        success: false,
        message: "Leave request could not be submitted.",
        values: leaveSubmittedValues(formData),
      };
    }

    if (leaveType?.name !== "Local Leave") {
      return {
        success: false,
        message: "Urgent leave can only be flagged for Local Leave.",
        fieldErrors: {
          urgentLocalLeave: ["Urgent leave can only be flagged for Local Leave."],
        },
        values: leaveSubmittedValues(formData),
      };
    }
  }

  // Working-days math: reject submissions whose entire date range falls on
  // weekends + active public holidays. Mirrors the trigger logic so the user
  // sees the friendly error before the DB raises one. Half-day is always
  // 0.5 working days by construction (single-day enforced by schema refine).
  const workingDayCount = await calculateWorkingDays(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.isHalfDay,
  );
  if (workingDayCount.totalDays === 0) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        startDate: [
          "This range has no working days — pick a weekday range that doesn't fall entirely on weekends or public holidays.",
        ],
      },
      values: leaveSubmittedValues(formData),
    };
  }

  // Hard balance gate at submission time (UAT F1 / B1). Same helper as the
  // approval-time check so the two paths cannot drift; approval keeps its
  // check as defense-in-depth for the admin-edits-balance-between-submit-
  // and-approve race.
  const balanceSetupError = await getLeaveBalanceSetupError({
    employeeId: user.id,
    leaveTypeId: parsed.data.leaveTypeId,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    isHalfDay: parsed.data.isHalfDay,
  });
  if (balanceSetupError) {
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: { leaveTypeId: [balanceSetupError] },
      values: leaveSubmittedValues(formData),
    };
  }

  // B1/F1: Reject overlap with the employee's own pending or approved leave.
  const overlap = await findOverlappingLeaveRequest({
    employeeId: user.id,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });
  if (overlap) {
    await insertAuditLog({
      actorId: user.id,
      action: "leave.submission_blocked_overlap",
      entity: "leave_request",
      entityId: overlap.id,
      metadata: {
        requested_start: parsed.data.startDate,
        requested_end: parsed.data.endDate,
        conflicting_request_id: overlap.id,
        conflicting_start: overlap.start_date,
        conflicting_end: overlap.end_date,
        conflicting_status: overlap.status,
      },
    });
    return {
      success: false,
      message: `This request overlaps with an existing ${overlap.status} leave (${overlap.start_date} → ${overlap.end_date}). Cancel the existing one first.`,
      fieldErrors: { startDate: ["Overlaps an existing leave request."] },
      values: leaveSubmittedValues(formData),
    };
  }

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: user.id,
    leave_type_id: parsed.data.leaveTypeId,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    status: "pending",
    employee_note: parsed.data.employeeNote,
    is_urgent_local_leave: parsed.data.urgentLocalLeave,
    urgent_leave_reason: parsed.data.urgentLocalLeave
      ? parsed.data.urgentLeaveReason
      : null,
    is_half_day: parsed.data.isHalfDay,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    if (error.code === "23P01") {
      await insertAuditLog({
        actorId: user.id,
        action: "leave.submission_blocked_overlap",
        entity: "leave_request",
        metadata: {
          reason: "db_exclusion_race",
          requested_start: parsed.data.startDate,
          requested_end: parsed.data.endDate,
        },
      });
      return {
        success: false,
        message: "This request overlaps with another leave request. Refresh and try again.",
        fieldErrors: { startDate: ["Overlaps an existing leave request."] },
        values: leaveSubmittedValues(formData),
      };
    }
    console.error("leave.submit failed", error);
    return {
      success: false,
      message: "Leave request could not be submitted.",
      values: leaveSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave.submitted",
    entity: "leave_request",
    metadata: {
      leave_type_id: parsed.data.leaveTypeId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      is_urgent_local_leave: parsed.data.urgentLocalLeave,
      has_urgent_leave_reason: Boolean(parsed.data.urgentLeaveReason),
      is_half_day: parsed.data.isHalfDay,
      working_days: workingDayCount.totalDays,
    },
  });

  // Notify the requester's manager + all admins, plus a confirmation back to the
  // requester (the actor). Fire-and-forget — sendEmail never throws, the
  // try/catch is belt-and-braces so a boundary bug can't regress submission.
  try {
    const [self, managerRecipient, adminRecipients] = await Promise.all([
      getRecipient(user.id),
      getManagerRecipientForEmployee(user.id),
      getAdminRecipients(),
    ]);
    // Approvers minus the actor — an admin submitting their own leave shouldn't
    // get the "awaiting your decision" email; they get the confirmation instead.
    const approvers = [managerRecipient, ...adminRecipients]
      .filter((r): r is Recipient => r !== null)
      .filter((r) => r.email !== self?.email);
    const tmpl = leaveSubmittedEmail({
      requesterName: user.displayName ?? user.email,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      isHalfDay: parsed.data.isHalfDay,
      workingDays: workingDayCount.totalDays,
    });
    await sendEmail({
      to: approvers,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
      template: "leave_submitted",
      actorId: user.id,
    });
    if (self) {
      const confirm = leaveSubmittedConfirmationEmail({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        isHalfDay: parsed.data.isHalfDay,
        workingDays: workingDayCount.totalDays,
      });
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "leave_submitted_confirmation",
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  revalidatePath("/leave");

  return { success: true, message: "Leave request submitted." };
}

// ─── Approve ─────────────────────────────────────────────────────────────────

const decisionSchema = z.object({
  requestId: z.string().uuid("Invalid request."),
  approverNote: z.preprocess(
    emptyToNull,
    z.string().max(500).nullable(),
  ),
});

export async function approveLeaveRequest(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:leave.approve",
  });
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    approverNote: formData.get("approverNote"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.approve",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid request.", values: leaveSubmittedValues(formData) };
  }

  const supabase = await createClient();

  // Load the request to check self-approval and scope.
  const { data: req, error: loadErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, status, is_half_day")
    .eq("id", parsed.data.requestId)
    .eq("status", "pending")
    .maybeSingle();

  if (loadErr || !req) {
    if (!loadErr) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "leave.approve",
        entity: "leave_request",
        entityId: parsed.data.requestId,
      });
    }
    return { success: false, message: "Request not found or already decided.", values: leaveSubmittedValues(formData) };
  }

  // Server Action guard: no self-approval.
  if (req.employee_id === user.id) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "leave_request",
      entityId: parsed.data.requestId,
      metadata: { reason: "self_approval_attempt", role: user.role },
    });
    return { success: false, message: "You cannot approve your own leave request.", values: leaveSubmittedValues(formData) };
  }

  const setupError = await getLeaveBalanceSetupError({
    employeeId: req.employee_id as string,
    leaveTypeId: req.leave_type_id as string,
    startDate: req.start_date as string,
    endDate: req.end_date as string,
    isHalfDay: Boolean(req.is_half_day),
  });
  if (setupError) {
    return { success: false, message: setupError, values: leaveSubmittedValues(formData) };
  }

  // B1/F1 overlap rejection at approval time is enforced by the
  // leave_requests_no_overlap EXCLUDE constraint (migration 0035) at insert
  // time — by the time a row reaches approval, no overlapping pending/approved
  // row can exist. No action-layer check needed here.

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      approver_id: user.id,
      approved_at: new Date().toISOString(),
      approver_note: parsed.data.approverNote,
      updated_by: user.id,
    })
    .eq("id", parsed.data.requestId)
    .eq("status", "pending");

  if (error) {
    console.error("leave.approve failed", error);
    return {
      success: false,
      message: await leaveApprovalErrorMessage(error.code, {
        employeeId: req.employee_id as string,
        leaveTypeId: req.leave_type_id as string,
        startDate: req.start_date as string,
        endDate: req.end_date as string,
        isHalfDay: Boolean(req.is_half_day),
      }),
      values: leaveSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave.approved",
    entity: "leave_request",
    entityId: parsed.data.requestId,
    metadata: { employee_id: req.employee_id },
  });

  // Notify the requester of the decision + a confirmation to the approver (actor).
  try {
    const [requester, self] = await Promise.all([
      getRecipient(req.employee_id as string),
      getRecipient(user.id),
    ]);
    if (requester) {
      const tmpl = leaveDecisionEmail({
        approved: true,
        startDate: req.start_date as string,
        endDate: req.end_date as string,
        isHalfDay: Boolean(req.is_half_day),
        approverNote: parsed.data.approverNote,
      });
      await sendEmail({
        to: [requester],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        template: "leave_approved",
        entityId: parsed.data.requestId,
        actorId: user.id,
      });
    }
    if (self) {
      const confirm = leaveDecisionConfirmationEmail({
        approved: true,
        requesterName: requester?.name ?? "the employee",
        startDate: req.start_date as string,
        endDate: req.end_date as string,
        isHalfDay: Boolean(req.is_half_day),
      });
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "leave_approved_confirmation",
        entityId: parsed.data.requestId,
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  revalidatePath("/leave");

  return { success: true, message: "Leave request approved." };
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectLeaveRequest(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin", "manager"], {
    attemptedResource: "action:leave.reject",
  });
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    approverNote: formData.get("approverNote"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.reject",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid request.", values: leaveSubmittedValues(formData) };
  }

  const supabase = await createClient();

  const { data: req, error: loadErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, status, start_date, end_date, is_half_day")
    .eq("id", parsed.data.requestId)
    .eq("status", "pending")
    .maybeSingle();

  if (loadErr || !req) {
    if (!loadErr) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "leave.reject",
        entity: "leave_request",
        entityId: parsed.data.requestId,
      });
    }
    return { success: false, message: "Request not found or already decided.", values: leaveSubmittedValues(formData) };
  }

  if (req.employee_id === user.id) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "leave_request",
      entityId: parsed.data.requestId,
      metadata: { reason: "self_rejection_attempt", role: user.role },
    });
    return { success: false, message: "You cannot reject your own leave request.", values: leaveSubmittedValues(formData) };
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      approver_id: user.id,
      approved_at: new Date().toISOString(),
      approver_note: parsed.data.approverNote,
      updated_by: user.id,
    })
    .eq("id", parsed.data.requestId)
    .eq("status", "pending");

  if (error) {
    console.error("leave.reject failed", error);
    return { success: false, message: "Leave request could not be rejected.", values: leaveSubmittedValues(formData) };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave.rejected",
    entity: "leave_request",
    entityId: parsed.data.requestId,
    metadata: { employee_id: req.employee_id },
  });

  // Notify the requester of the decision + a confirmation to the approver (actor).
  try {
    const [requester, self] = await Promise.all([
      getRecipient(req.employee_id as string),
      getRecipient(user.id),
    ]);
    if (requester) {
      const tmpl = leaveDecisionEmail({
        approved: false,
        startDate: req.start_date as string,
        endDate: req.end_date as string,
        isHalfDay: Boolean(req.is_half_day),
        approverNote: parsed.data.approverNote,
      });
      await sendEmail({
        to: [requester],
        subject: tmpl.subject,
        html: tmpl.html,
        text: tmpl.text,
        template: "leave_rejected",
        entityId: parsed.data.requestId,
        actorId: user.id,
      });
    }
    if (self) {
      const confirm = leaveDecisionConfirmationEmail({
        approved: false,
        requesterName: requester?.name ?? "the employee",
        startDate: req.start_date as string,
        endDate: req.end_date as string,
        isHalfDay: Boolean(req.is_half_day),
      });
      await sendEmail({
        to: [self],
        subject: confirm.subject,
        html: confirm.html,
        text: confirm.text,
        template: "leave_rejected_confirmation",
        entityId: parsed.data.requestId,
        actorId: user.id,
      });
    }
  } catch {
    /* boundary already swallows; belt-and-braces */
  }

  revalidatePath("/leave");

  return { success: true, message: "Leave request rejected." };
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelLeaveRequest(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "action:leave.cancel",
  });
  const parsed = z
    .object({ requestId: z.string().uuid("Invalid request.") })
    .safeParse({ requestId: formData.get("requestId") });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.cancel",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid request." };
  }

  const supabase = await createClient();

  // Allow cancel of pending OR approved. For approved, the refund trigger
  // (migration 0042) auto-refunds deducted_days back to leave_balances.
  const { data: req, error: loadErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, status, deducted_days, is_half_day, start_date, end_date")
    .eq("id", parsed.data.requestId)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (loadErr || !req) {
    if (!loadErr) {
      await logEntityNotFound({
        actorId: user.id,
        resource: "leave.cancel",
        entity: "leave_request",
        entityId: parsed.data.requestId,
      });
    }
    return { success: false, message: "Request not found or cannot be cancelled." };
  }

  if (user.role !== "admin" && req.employee_id !== user.id) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "leave_request",
      entityId: parsed.data.requestId,
      metadata: { reason: "cancel_other_employee", role: user.role },
    });
    return { success: false, message: "You can only cancel your own leave requests." };
  }

  const priorStatus = req.status as "pending" | "approved";
  // Select-back the updated row so we can verify the UPDATE actually landed.
  // Without this, RLS rejections return success+0-rows and we'd write a
  // misleading audit row (root cause of UAT R1, fixed by migration 0043).
  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled", updated_by: user.id })
    .eq("id", parsed.data.requestId)
    .in("status", ["pending", "approved"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("leave.cancel failed", error);
    return { success: false, message: "Leave request could not be cancelled." };
  }
  if (!updated) {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "leave_request",
      entityId: parsed.data.requestId,
      metadata: { reason: "cancel_rls_rejected", role: user.role, prior_status: priorStatus },
    });
    return {
      success: false,
      message: "Leave request could not be cancelled (permission denied or already changed).",
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave.cancelled",
    entity: "leave_request",
    entityId: parsed.data.requestId,
    metadata: {
      employee_id: req.employee_id,
      prior_status: priorStatus,
      refunded_days:
        priorStatus === "approved" ? Number(req.deducted_days ?? 0) : 0,
      is_half_day: Boolean(req.is_half_day),
    },
  });
  revalidatePath("/leave");

  return {
    success: true,
    message:
      priorStatus === "approved"
        ? "Leave request cancelled. Balance refunded."
        : "Leave request cancelled.",
  };
}

type LeaveApprovalContext = {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
};

async function leaveApprovalErrorMessage(
  code: string | undefined,
  context: LeaveApprovalContext,
): Promise<string> {
  if (code === "P0001" || code === "P0002") {
    return (
      (await getLeaveBalanceSetupError(context)) ??
      (code === "P0002"
        ? "Insufficient leave balance for this request."
        : "A matching leave balance is missing for this request.")
    );
  }

  return "Leave request could not be approved.";
}

async function getLeaveBalanceSetupError({
  employeeId,
  leaveTypeId,
  startDate,
  endDate,
  isHalfDay,
}: LeaveApprovalContext): Promise<string | null> {
  const { perYear } = await calculateWorkingDays(startDate, endDate, isHalfDay);
  const segments = perYear;
  const years = segments.map((segment) => segment.year);
  const admin = createAdminClient();

  const [{ data: leaveType }, { data: balances, error: balanceError }] =
    await Promise.all([
      admin
        .from("leave_types")
        .select("name")
        .eq("id", leaveTypeId)
        .maybeSingle(),
      admin
        .from("leave_balances")
        .select("year, balance")
        .eq("employee_id", employeeId)
        .eq("leave_type_id", leaveTypeId)
        .in("year", years),
    ]);

  if (balanceError) {
    console.error("leave.approve balance precheck failed", balanceError);
    return null;
  }

  const leaveTypeName = (leaveType?.name as string | undefined) ?? "selected leave";
  const balanceByYear = new Map(
    (balances ?? []).map((balance) => [
      balance.year as number,
      Number(balance.balance),
    ]),
  );

  const missingYears = segments
    .filter((segment) => !balanceByYear.has(segment.year))
    .map((segment) => segment.year);
  if (missingYears.length > 0) {
    return `No ${formatYears(missingYears)} ${leaveTypeName} balance exists for this employee.`;
  }

  const insufficient = segments.find(
    (segment) => (balanceByYear.get(segment.year) ?? 0) < segment.days,
  );
  if (insufficient) {
    const available = balanceByYear.get(insufficient.year) ?? 0;
    return `Insufficient ${insufficient.year} ${leaveTypeName} balance: ${formatDays(available)} available, ${formatDays(insufficient.days)} requested.`;
  }

  return null;
}

// Working-days math (TS mirror of the SQL working_days() function in
// migration 0042). Sat+Sun + active public_holidays excluded. Both this and
// the trigger read the same public_holidays table — they can drift, so any
// change to one MUST be made in lockstep with the other.

async function fetchActiveHolidayDates(country: string = "MU"): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("public_holidays")
    .select("date")
    .eq("country_code", country)
    .eq("is_active", true);
  if (error) {
    console.error("public_holidays lookup failed", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => String(r.date)));
}

function workingDaysInRange(
  startDate: string,
  endDate: string,
  holidays: Set<string>,
): number {
  let count = 0;
  const d = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const iso = d.toISOString().slice(0, 10);
      if (!holidays.has(iso)) count += 1;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

async function calculateWorkingDays(
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
): Promise<{ totalDays: number; perYear: Array<{ year: number; days: number }> }> {
  const holidays = await fetchActiveHolidayDates();
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));

  if (isHalfDay) {
    // Half-day is enforced single-day by schema refine + check constraint.
    // If the chosen date is not a working day, total is 0 (submit blocks).
    const base = workingDaysInRange(startDate, endDate, holidays);
    const days = base === 0 ? 0 : 0.5;
    return { totalDays: days, perYear: [{ year: startYear, days }] };
  }

  const perYear: Array<{ year: number; days: number }> = [];
  let total = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    const from = startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
    const to = endDate < `${year}-12-31` ? endDate : `${year}-12-31`;
    const days = workingDaysInRange(from, to, holidays);
    perYear.push({ year, days });
    total += days;
  }
  return { totalDays: total, perYear };
}

function formatYears(years: number[]): string {
  return years.length === 1 ? String(years[0]) : years.join(" and ");
}

function formatDays(days: number): string {
  // Working-days math admits fractional values (half-day = 0.5). Render
  // integers without decimal point; fractional values with a single decimal.
  const formatted =
    Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${days === 1 ? "day" : "days"}`;
}

// ─── Admin: leave types ───────────────────────────────────────────────────────

const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80),
  description: z.preprocess(emptyToNull, z.string().max(300).nullable()),
});

export async function createLeaveType(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:leave.createType",
  });
  const parsed = leaveTypeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.createType",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: leaveSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_types")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description,
      is_active: true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("leave.createType failed", error);
    return {
      success: false,
      message: "Leave type could not be created.",
      values: leaveSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave_type.created",
    entity: "leave_type",
    entityId: data.id as string,
    metadata: { name: parsed.data.name },
  });
  revalidatePath("/leave/admin");

  return { success: true, message: "Leave type created." };
}

export async function toggleLeaveType(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:leave.toggleType",
  });
  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.string() })
    .safeParse({ id: formData.get("id"), isActive: formData.get("isActive") });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.toggleType",
      zodError: parsed.error,
    });
    return { success: false, message: "Invalid request." };
  }

  const newActive = parsed.data.isActive !== "true";
  const admin = createAdminClient();
  const { error } = await admin
    .from("leave_types")
    .update({ is_active: newActive, updated_by: user.id })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("leave.toggleType failed", error);
    return { success: false, message: "Leave type could not be updated." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave_type.toggled",
    entity: "leave_type",
    entityId: parsed.data.id,
    metadata: { is_active: newActive },
  });
  revalidatePath("/leave/admin");

  return {
    success: true,
    message: newActive ? "Leave type activated." : "Leave type deactivated.",
  };
}

// ─── Admin: leave balances ────────────────────────────────────────────────────

const balanceSchema = z.object({
  employeeId: requiredUuid("Select an employee."),
  leaveTypeId: requiredUuid("Select a leave type."),
  balance: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Balance is required." })
      .min(0, "Balance must be 0 or more.")
      .max(365, "Balance must be 365 or fewer."),
  ),
  year: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce
      .number({ error: "Year is required." })
      .int("Year must be a whole number.")
      .min(2020, "Year must be 2020 or later.")
      .max(2100, "Year must be 2100 or earlier."),
  ),
  // Reason for the manual adjustment. Required so the provenance row on the
  // balance has a human-readable explanation alongside the structured
  // adjusted_at/adjusted_by columns. Mirrors urgent_leave_reason (migration
  // 0030) — 1..500 chars, trimmed.
  reason: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string({ error: "Reason is required." })
      .min(3, "Reason must be at least 3 characters.")
      .max(500, "Reason must be 500 characters or fewer."),
  ),
});

export async function upsertLeaveBalance(
  _prev: LeaveActionState,
  formData: FormData,
): Promise<LeaveActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:leave.upsertBalance",
  });
  const admin = createAdminClient();
  const employeeId = await resolveBalanceEmployeeId(
    admin,
    formData.get("employeeId"),
    formData.get("employeeIdSearch"),
  );
  const leaveTypeId = await resolveBalanceLeaveTypeId(
    admin,
    formData.get("leaveTypeId"),
    formData.get("leaveTypeIdSearch"),
  );

  const parsed = balanceSchema.safeParse({
    employeeId,
    leaveTypeId,
    balance: formData.get("balance"),
    year: formData.get("year"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "leave.upsertBalance",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: leaveSubmittedValues(formData),
    };
  }

  const { error } = await admin.from("leave_balances").upsert(
    {
      employee_id: parsed.data.employeeId,
      leave_type_id: parsed.data.leaveTypeId,
      balance: parsed.data.balance,
      year: parsed.data.year,
      updated_by: user.id,
      adjustment_reason: parsed.data.reason,
      adjusted_at: new Date().toISOString(),
      adjusted_by: user.id,
    },
    { onConflict: "employee_id,leave_type_id,year" },
  );

  if (error) {
    console.error("leave.upsertBalance failed", error);
    return {
      success: false,
      message: "Balance could not be updated.",
      values: leaveSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "leave_balance.updated",
    entity: "leave_balance",
    metadata: {
      employee_id: parsed.data.employeeId,
      leave_type_id: parsed.data.leaveTypeId,
      balance: parsed.data.balance,
      year: parsed.data.year,
      reason: parsed.data.reason,
    },
  });
  revalidatePath("/leave");
  revalidatePath("/leave/admin");

  return { success: true, message: "Balance updated." };
}

async function resolveBalanceEmployeeId(
  admin: ReturnType<typeof createAdminClient>,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
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
    console.error("leave.resolve_balance_employee failed", error);
    return null;
  }

  const lower = search.toLowerCase();
  const exact = data?.find((profile) => profileLabel(profile).toLowerCase() === lower);
  const partial = data?.find((profile) =>
    profileLabel(profile).toLowerCase().includes(lower),
  );
  return (exact ?? partial)?.id ?? null;
}

async function resolveBalanceLeaveTypeId(
  admin: ReturnType<typeof createAdminClient>,
  selectedValue: FormDataEntryValue | null,
  searchValue: FormDataEntryValue | null,
): Promise<string | null> {
  if (typeof selectedValue === "string" && selectedValue.trim()) {
    return selectedValue.trim();
  }

  const search = typeof searchValue === "string" ? searchValue.trim() : "";
  if (!search) return null;

  const { data, error } = await admin
    .from("leave_types")
    .select("id, name")
    .eq("is_active", true)
    .ilike("name", `%${search}%`)
    .order("name")
    .limit(10);

  if (error) {
    console.error("leave.resolve_balance_type failed", error);
    return null;
  }

  const lower = search.toLowerCase();
  const exact = data?.find((type) => String(type.name).toLowerCase() === lower);
  return (exact ?? data?.[0])?.id ?? null;
}

function profileLabel(profile: {
  display_name: string | null;
  work_email: string | null;
}): string {
  return profile.display_name ?? profile.work_email ?? "Unassigned";
}

// ─── Year rollover (E2 / phase 13) ────────────────────────────────────────────
//
// Admin-triggered: upsert next-year leave_balances rows for every active
// employee × {Local Leave, Sick Leave} using day counts from app_settings.
// Custom leave types are NOT auto-rolled (decision: Batch 6) — admins
// seed those manually via the balance form.
// Idempotent: ON CONFLICT DO NOTHING on (employee_id, leave_type_id, year),
// so re-clicking does not reset already-rolled-over balances.

export type RolloverActionState = LeaveActionState & {
  createdCount?: number;
  skippedCount?: number;
  targetYear?: number;
};

export async function rolloverLeaveBalances(
  _prev: RolloverActionState,
  _formData: FormData,
): Promise<RolloverActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:leave.rolloverBalances",
  });
  const admin = createAdminClient();
  const targetYear = new Date().getFullYear() + 1;

  const settings = await getAppSettingsAsAdmin();
  if (!settings) {
    return { success: false, message: "Cannot read app settings. Try again later." };
  }

  const { data: types, error: typeError } = await admin
    .from("leave_types")
    .select("id, name")
    .in("name", ["Local Leave", "Sick Leave"])
    .eq("is_active", true);

  if (typeError || !types) {
    console.error("leave.rollover type lookup failed", typeError);
    return { success: false, message: "Could not load leave types." };
  }

  const balanceByName: Record<string, number> = {
    "Local Leave": settings.localLeaveDefaultDays,
    "Sick Leave": settings.sickLeaveDefaultDays,
  };

  const { data: employees, error: empError } = await admin
    .from("employee_records")
    .select("employee_id")
    .neq("employment_status", "terminated");

  if (empError || !employees) {
    console.error("leave.rollover employee lookup failed", empError);
    return { success: false, message: "Could not load employees." };
  }

  const rows = employees.flatMap((emp) =>
    types.map((t) => ({
      employee_id: emp.employee_id as string,
      leave_type_id: t.id as string,
      balance: balanceByName[t.name as string] ?? 0,
      year: targetYear,
      created_by: user.id,
      updated_by: user.id,
    })),
  );

  if (rows.length === 0) {
    return {
      success: true,
      message: `Nothing to roll over for ${targetYear}.`,
      createdCount: 0,
      skippedCount: 0,
      targetYear,
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("leave_balances")
    .upsert(rows, {
      onConflict: "employee_id,leave_type_id,year",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    console.error("leave.rollover upsert failed", insertError);
    return { success: false, message: "Could not roll over balances." };
  }

  const createdCount = inserted?.length ?? 0;
  const skippedCount = rows.length - createdCount;

  await insertAuditLog({
    actorId: user.id,
    action: "leave.balances_rolled_over",
    entity: "leave_balance",
    metadata: {
      year: targetYear,
      created_count: createdCount,
      skipped_count: skippedCount,
    },
  });

  revalidatePath("/leave");
  revalidatePath("/leave/admin");

  return {
    success: true,
    message: `Rolled over ${createdCount} balance(s) for ${targetYear}. Skipped ${skippedCount} (already present).`,
    createdCount,
    skippedCount,
    targetYear,
  };
}

// ─── Working-days preview (form helper) ───────────────────────────────────────
//
// Exposed to leave-request-form so the user sees "X working days (Y excluded:
// 1 weekend, 1 holiday – <name>)" before submitting. Uses the same TS-side
// math as calculateWorkingDays, plus the holiday names for context.

export type WorkingDaysPreview = {
  totalDays: number;
  perYear: Array<{ year: number; days: number }>;
  weekendCount: number;
  holidayMatches: Array<{ date: string; name: string }>;
};

export async function previewWorkingDays(args: {
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
}): Promise<WorkingDaysPreview | null> {
  // Auth gate: any authenticated user (employees use this for their own form).
  await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "action:leave.previewWorkingDays",
  });

  // Basic input sanity (mirrors submitSchema rules, friendlier here).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) return null;
  if (args.endDate < args.startDate) return null;
  if (args.isHalfDay && args.startDate !== args.endDate) return null;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("public_holidays")
    .select("date, name")
    .eq("country_code", "MU")
    .eq("is_active", true)
    .gte("date", args.startDate)
    .lte("date", args.endDate);
  if (error) {
    console.error("public_holidays preview lookup failed", error);
    return null;
  }
  const holidaysByDate = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const date = String(row.date);
    const list = holidaysByDate.get(date) ?? [];
    list.push(String(row.name));
    holidaysByDate.set(date, list);
  }

  let weekendCount = 0;
  const holidayMatches: Array<{ date: string; name: string }> = [];
  const startYear = Number(args.startDate.slice(0, 4));
  const endYear = Number(args.endDate.slice(0, 4));
  const perYear: Array<{ year: number; days: number }> = [];
  let total = 0;

  for (let year = startYear; year <= endYear; year += 1) {
    const from = args.startDate > `${year}-01-01` ? args.startDate : `${year}-01-01`;
    const to = args.endDate < `${year}-12-31` ? args.endDate : `${year}-12-31`;
    let yearDays = 0;
    const d = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (d.getTime() <= end.getTime()) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) {
        weekendCount += 1;
      } else if (holidaysByDate.has(iso)) {
        for (const name of holidaysByDate.get(iso)!) {
          holidayMatches.push({ date: iso, name });
        }
      } else {
        yearDays += 1;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    perYear.push({ year, days: yearDays });
    total += yearDays;
  }

  if (args.isHalfDay) {
    // total here is the full working-day count for the single date (0 or 1).
    // Half-day collapses to 0.5 unless the date itself is non-working.
    const days = total === 0 ? 0 : 0.5;
    return {
      totalDays: days,
      perYear: [{ year: startYear, days }],
      weekendCount,
      holidayMatches,
    };
  }

  return { totalDays: total, perYear, weekendCount, holidayMatches };
}

// ─── Admin: public holidays ───────────────────────────────────────────────────

export type PublicHolidayActionState = LeaveActionState & {
  insertedCount?: number;
  skippedCount?: number;
};

const holidayCreateSchema = z.object({
  date: z.string().date("Enter a valid date."),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Country code must be two letters.")
    .default("MU"),
  isTentative: z.preprocess((value) => value === "on", z.boolean()),
});

export async function createPublicHoliday(
  _prev: PublicHolidayActionState,
  formData: FormData,
): Promise<PublicHolidayActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:holiday.create",
  });
  const parsed = holidayCreateSchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
    countryCode: formData.get("countryCode") ?? "MU",
    isTentative: formData.get("isTentative"),
  });
  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "holiday.create",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: leaveSubmittedValues(formData),
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("public_holidays")
    .insert({
      date: parsed.data.date,
      name: parsed.data.name,
      country_code: parsed.data.countryCode,
      is_tentative: parsed.data.isTentative,
      is_active: true,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        message: "A holiday with this date and name already exists.",
        fieldErrors: { name: ["Duplicate (date, name) for this country."] },
        values: leaveSubmittedValues(formData),
      };
    }
    console.error("holiday.create failed", error);
    // Surface the actual error so the admin can self-diagnose instead of
    // staring at a generic message. Postgres error codes (e.g. 23514 check
    // constraint, 23502 not-null) tell the user what went wrong.
    return {
      success: false,
      message: `Holiday could not be created (${error.code ?? "unknown"}): ${error.message}`,
      values: leaveSubmittedValues(formData),
    };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "holiday.created",
    entity: "public_holiday",
    entityId: data.id as string,
    metadata: {
      date: parsed.data.date,
      name: parsed.data.name,
      country_code: parsed.data.countryCode,
      is_tentative: parsed.data.isTentative,
    },
  });
  revalidatePath("/leave/admin");

  return { success: true, message: "Holiday added." };
}

const holidayUpdateSchema = z.object({
  id: z.string().uuid("Invalid holiday."),
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  isTentative: z.preprocess((value) => value === "on", z.boolean()),
});

export async function updatePublicHoliday(
  _prev: PublicHolidayActionState,
  formData: FormData,
): Promise<PublicHolidayActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:holiday.update",
  });
  const parsed = holidayUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    isTentative: formData.get("isTentative"),
  });
  if (!parsed.success) {
    await logValidationFailed({
      actorId: user.id,
      resource: "holiday.update",
      zodError: parsed.error,
    });
    return {
      success: false,
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("public_holidays")
    .update({
      name: parsed.data.name,
      is_tentative: parsed.data.isTentative,
      updated_by: user.id,
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("holiday.update failed", error);
    return { success: false, message: "Holiday could not be updated." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "holiday.updated",
    entity: "public_holiday",
    entityId: parsed.data.id,
    metadata: { name: parsed.data.name, is_tentative: parsed.data.isTentative },
  });
  revalidatePath("/leave/admin");

  return { success: true, message: "Holiday updated." };
}

export async function togglePublicHoliday(
  _prev: PublicHolidayActionState,
  formData: FormData,
): Promise<PublicHolidayActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:holiday.toggle",
  });
  const parsed = z
    .object({ id: z.string().uuid(), isActive: z.string() })
    .safeParse({ id: formData.get("id"), isActive: formData.get("isActive") });
  if (!parsed.success) {
    return { success: false, message: "Invalid request." };
  }
  const newActive = parsed.data.isActive !== "true";

  const admin = createAdminClient();
  const { error } = await admin
    .from("public_holidays")
    .update({ is_active: newActive, updated_by: user.id })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("holiday.toggle failed", error);
    return { success: false, message: "Holiday could not be updated." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: newActive ? "holiday.activated" : "holiday.deactivated",
    entity: "public_holiday",
    entityId: parsed.data.id,
    metadata: { is_active: newActive },
  });
  revalidatePath("/leave/admin");

  return {
    success: true,
    message: newActive ? "Holiday activated." : "Holiday deactivated.",
  };
}

// CSV bulk upload — additive-only. Client parses + previews; this action
// receives a JSON-stringified array of validated rows in `payload`. Skips
// duplicates by (date, country_code, name) so re-uploading is idempotent.

const bulkRowSchema = z.object({
  date: z.string().date(),
  name: z.string().trim().min(2).max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default("MU"),
  isTentative: z.boolean().default(false),
});

const bulkPayloadSchema = z.array(bulkRowSchema).min(1).max(200);

export async function bulkUploadPublicHolidays(
  _prev: PublicHolidayActionState,
  formData: FormData,
): Promise<PublicHolidayActionState> {
  const user = await requireRole(["admin"], {
    attemptedResource: "action:holiday.bulkUpload",
  });

  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length === 0) {
    return { success: false, message: "No rows provided." };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, message: "Upload payload is not valid JSON." };
  }
  const parsed = bulkPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message:
        "Upload contains invalid rows. Fix the highlighted rows in the preview and try again.",
    };
  }

  const admin = createAdminClient();
  const rows = parsed.data.map((row) => ({
    date: row.date,
    name: row.name,
    country_code: row.countryCode,
    is_tentative: row.isTentative,
    is_active: true,
    created_by: user.id,
    updated_by: user.id,
  }));

  // Pre-check duplicates so we can report skippedCount. The partial unique
  // index (date, country_code, name) where is_active fires on conflict; we
  // ask Postgres to ignore them so the upload remains additive-only.
  const datesByKey = rows.map((r) => `${r.date}|${r.country_code}|${r.name}`);
  const dateList = Array.from(new Set(rows.map((r) => r.date)));
  const { data: existing, error: existingError } = await admin
    .from("public_holidays")
    .select("date, name, country_code")
    .in("date", dateList)
    .eq("is_active", true);
  if (existingError) {
    console.error("holiday.bulkUpload duplicate check failed", existingError);
    return { success: false, message: "Could not check for duplicates." };
  }
  const existingKeys = new Set(
    (existing ?? []).map(
      (r) => `${String(r.date)}|${String(r.country_code)}|${String(r.name)}`,
    ),
  );
  const toInsert = rows.filter(
    (_, i) => !existingKeys.has(datesByKey[i]),
  );
  const skippedCount = rows.length - toInsert.length;

  if (toInsert.length === 0) {
    await insertAuditLog({
      actorId: user.id,
      action: "holiday.bulk_uploaded",
      entity: "public_holiday",
      metadata: { inserted_count: 0, skipped_count: skippedCount },
    });
    return {
      success: true,
      message: `No new holidays — all ${skippedCount} row(s) already exist.`,
      insertedCount: 0,
      skippedCount,
    };
  }

  const { error: insertError } = await admin
    .from("public_holidays")
    .insert(toInsert);
  if (insertError) {
    console.error("holiday.bulkUpload insert failed", insertError);
    return { success: false, message: "Bulk upload failed." };
  }

  await insertAuditLog({
    actorId: user.id,
    action: "holiday.bulk_uploaded",
    entity: "public_holiday",
    metadata: {
      inserted_count: toInsert.length,
      skipped_count: skippedCount,
    },
  });
  revalidatePath("/leave/admin");

  return {
    success: true,
    message: `Added ${toInsert.length} holiday(s). Skipped ${skippedCount} duplicate(s).`,
    insertedCount: toInsert.length,
    skippedCount,
  };
}
