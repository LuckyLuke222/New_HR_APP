import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getAuditLogs, type AuditLogRow } from "@/server/dal/audit-logs";
import { getDocuments, type DocumentRow } from "@/server/dal/documents";
import {
  getCompensationSummary,
  type CompensationSummary,
} from "@/server/dal/compensation";
import {
  getCompanyApprovedLeave,
  getLeaveRequests,
  getMyLeaveBalances,
  type CompanyLeaveEntry,
  type LeaveBalance,
  type LeaveRequest,
} from "@/server/dal/leave";
import {
  getDirectReportIds,
  getMyTasks,
  type OnboardingTask,
} from "@/server/dal/onboarding";
import { getEmployeesNeedingAttention } from "@/server/dal/employees";
import { safeDalError } from "@/server/dal/errors";
import {
  getPerformanceDashboardSummary,
  type PerformanceDashboardSummary,
} from "@/server/dal/performance";

export type DashboardActionItem = {
  id: string;
  kind: "leave" | "performance";
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
};

export type DashboardRecentUpdateTone =
  | "success"
  | "danger"
  | "pending"
  | "info";

export type DashboardRecentUpdate = {
  id: string;
  kind: "leave" | "onboarding" | "performance" | "document";
  tone?: DashboardRecentUpdateTone;
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
};

// Backwards-compatible alias for the previous narrower employee-only type.
export type EmployeeRecentUpdate = DashboardRecentUpdate;

export type UnroutedPendingLeave = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  createdAt: string;
};

export type AdminDashboardData = {
  headcount: number;
  pendingLeave: number;
  onboarding: { total: number; completed: number; pending: number };
  recentAuditEvents: AuditLogRow[];
  startersLast30Days: number;
  leaversLast30Days: number;
  leaveUsageApprovedDays: number;
  employeesNeedingAttention: number;
  unroutedPendingLeave: UnroutedPendingLeave[];
  performance: PerformanceDashboardSummary;
  actionItems: DashboardActionItem[];
  recentUpdates: DashboardRecentUpdate[];
  whoIsOut: CompanyLeaveEntry[];
  errors: string[];
};

export type ManagerDashboardData = {
  directReports: number;
  pendingApprovals: number;
  pendingApprovalRequests: LeaveRequest[];
  whoIsOut: CompanyLeaveEntry[];
  openTasks: number;
  performance: PerformanceDashboardSummary;
  actionItems: DashboardActionItem[];
  recentUpdates: DashboardRecentUpdate[];
  errors: string[];
};

export type EmployeeDashboardData = {
  balances: LeaveBalance[];
  pendingTasks: number;
  pendingTaskItems: OnboardingTask[];
  recentUpdates: DashboardRecentUpdate[];
  recentDocuments: DocumentRow[];
  compensationSummary: CompensationSummary | null;
  performance: PerformanceDashboardSummary;
  whoIsOut: CompanyLeaveEntry[];
  errors: string[];
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = await createClient();
  const errors: string[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sinceDate = toDate(thirtyDaysAgo);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);

  const sinceIso = thirtyDaysAgo.toISOString();

  // B3 (UAT new-hire-onboarding, 2026-06-01): admin profiles are seeded into
  // employee_records with manager_id=null so they count toward headcount /
  // directory, but admin has no upline by design — filter their own leave out
  // of the admin-facing "Unrouted pending leave" and "Action items" panels.
  const { data: adminProfiles, error: adminProfilesError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  collectError(errors, safeDashboardError("dashboard.admin.adminIds", adminProfilesError));
  const adminIds = new Set((adminProfiles ?? []).map((p) => p.id as string));

  const [
    headcountResult,
    pendingLeaveResult,
    onboardingResult,
    auditResult,
    startersResult,
    leaversResult,
    approvedLeaveResult,
    needsAttentionResult,
    performanceResult,
    pendingLeaveListResult,
    recentLeaveDecisionsResult,
    unroutedPendingLeaveResult,
    whoIsOutResult,
  ] = await Promise.all([
    supabase
      .from("employee_records")
      .select("id", { count: "exact", head: true })
      .neq("employment_status", "terminated"),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("onboarding_tasks")
      .select("status"),
    getAuditLogs(),
    supabase
      .from("employee_records")
      .select("id", { count: "exact", head: true })
      .gte("start_date", sinceDate),
    // A2: count terminated rows where end_date is within the window, OR
    // end_date is null but the row was updated within the window. The OR
    // fallback covers terminations recorded without an explicit end_date
    // (A1's auto-default only protects future saves).
    supabase
      .from("employee_records")
      .select("id", { count: "exact", head: true })
      .eq("employment_status", "terminated")
      .or(
        `end_date.gte.${sinceDate},and(end_date.is.null,updated_at.gte.${sinceIso})`,
      ),
    supabase
      .from("leave_requests")
      .select("start_date, end_date")
      .eq("status", "approved")
      .gte("start_date", sinceDate),
    getEmployeesNeedingAttention(),
    getPerformanceDashboardSummary("admin"),
    getLeaveRequests({ status: "pending" }),
    supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type_id, start_date, end_date, status, approved_at")
      .in("status", ["approved", "rejected"])
      .not("approved_at", "is", null)
      .gte("approved_at", sinceIso)
      .order("approved_at", { ascending: false })
      .limit(10),
    getUnroutedPendingLeave(adminIds),
    getCompanyApprovedLeave(toDate(now), toDate(weekEnd)),
  ]);

  collectError(errors, safeDashboardError("dashboard.admin.headcount", headcountResult.error));
  collectError(errors, safeDashboardError("dashboard.admin.pendingLeave", pendingLeaveResult.error));
  collectError(errors, safeDashboardError("dashboard.admin.onboarding", onboardingResult.error));
  collectError(errors, auditResult.error);
  collectError(errors, safeDashboardError("dashboard.admin.starters", startersResult.error));
  collectError(errors, safeDashboardError("dashboard.admin.leavers", leaversResult.error));
  collectError(errors, safeDashboardError("dashboard.admin.approvedLeave", approvedLeaveResult.error));
  collectError(errors, safeDashboardError("dashboard.admin.needsAttention", needsAttentionResult.error));
  collectError(errors, performanceResult.error);
  collectError(errors, pendingLeaveListResult.error);
  collectError(errors, safeDashboardError("dashboard.admin.recentLeaveDecisions", recentLeaveDecisionsResult.error));
  collectError(errors, unroutedPendingLeaveResult.error);
  collectError(errors, whoIsOutResult.error);

  const actionItems = buildAdminActionItems({
    pendingLeaveRequests: pendingLeaveListResult.requests.filter(
      (request) => !adminIds.has(request.employeeId),
    ),
  });

  const leaveTypeNamesForUpdates = await fetchLeaveTypeNames(
    supabase,
    unique((recentLeaveDecisionsResult.data ?? []).map((row) => row.leave_type_id as string)),
  );
  const recentUpdates = buildAdminRecentUpdates({
    leaveDecisions: recentLeaveDecisionsResult.data ?? [],
    leaveTypeNames: leaveTypeNamesForUpdates,
  });

  const onboardingRows = onboardingResult.data ?? [];
  const completed = onboardingRows.filter((task) => task.status === "completed").length;
  const approvedLeaveDays = (approvedLeaveResult.data ?? []).reduce(
    (sum, row) => sum + inclusiveDays(row.start_date as string, row.end_date as string),
    0,
  );

  return {
    headcount: headcountResult.count ?? 0,
    pendingLeave: pendingLeaveResult.count ?? 0,
    onboarding: {
      total: onboardingRows.length,
      completed,
      pending: onboardingRows.length - completed,
    },
    recentAuditEvents: auditResult.logs.slice(0, 5),
    startersLast30Days: startersResult.count ?? 0,
    leaversLast30Days: leaversResult.count ?? 0,
    leaveUsageApprovedDays: approvedLeaveDays,
    employeesNeedingAttention: needsAttentionResult.rows.length,
    unroutedPendingLeave: unroutedPendingLeaveResult.requests,
    performance: performanceResult.summary,
    actionItems,
    recentUpdates,
    whoIsOut: whoIsOutResult.entries,
    errors,
  };
}

// B1/F6: surface pending leave from employees who have no manager. State
// owner is unchanged — leave_requests still owns the row; this is a derived
// view for admin visibility.
async function getUnroutedPendingLeave(adminIds: Set<string>): Promise<{
  requests: UnroutedPendingLeave[];
  error: string | null;
}> {
  const supabase = await createClient();

  const { data: unroutedEmployees, error: empErr } = await supabase
    .from("employee_records")
    .select("employee_id")
    .is("manager_id", null)
    .neq("employment_status", "terminated");

  if (empErr) {
    return {
      requests: [],
      error: safeDalError(
        "dashboard.unroutedPendingLeave.employees",
        empErr,
        "Unable to load unrouted leave.",
      ),
    };
  }

  const ids = (unroutedEmployees ?? [])
    .map((r) => r.employee_id as string)
    .filter((id) => id && !adminIds.has(id));
  if (ids.length === 0) {
    return { requests: [], error: null };
  }

  const { data: rows, error: leaveErr } = await supabase
    .from("leave_requests")
    .select("id, employee_id, leave_type_id, start_date, end_date, created_at")
    .eq("status", "pending")
    .in("employee_id", ids)
    .order("created_at", { ascending: false })
    .limit(10);

  if (leaveErr) {
    return {
      requests: [],
      error: safeDalError(
        "dashboard.unroutedPendingLeave.requests",
        leaveErr,
        "Unable to load unrouted leave.",
      ),
    };
  }

  const empIds = unique((rows ?? []).map((r) => r.employee_id as string));
  const ltIds = unique((rows ?? []).map((r) => r.leave_type_id as string));
  if (empIds.length === 0) return { requests: [], error: null };

  const [nameMap, typeMap] = await Promise.all([
    fetchProfileNames(supabase, empIds),
    fetchLeaveTypeNames(supabase, ltIds),
  ]);

  return {
    requests: (rows ?? []).map((r) => ({
      id: r.id as string,
      employeeId: r.employee_id as string,
      employeeName: nameMap.get(r.employee_id as string) ?? "Unknown",
      leaveTypeName: typeMap.get(r.leave_type_id as string) ?? "Leave",
      startDate: r.start_date as string,
      endDate: r.end_date as string,
      createdAt: r.created_at as string,
    })),
    error: null,
  };
}

export async function getManagerDashboardData(managerId: string): Promise<ManagerDashboardData> {
  const supabase = await createClient();
  const errors: string[] = [];
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sinceIso = thirtyDaysAgo.toISOString();

  const [{ entries: whoIsOut, error: whoIsOutError }, reportIds] = await Promise.all([
    getCompanyApprovedLeave(toDate(now), toDate(weekEnd)),
    getDirectReportIds(managerId),
  ]);

  const hasReports = reportIds.length > 0;
  const [
    pendingApprovalsResult,
    pendingApprovalRequestsResult,
    openTasksResult,
    performanceResult,
    pendingReviewsResult,
    recentLeaveDecisionsResult,
    recentCompletedTasksResult,
    recentReviewSubmissionsResult,
  ] = await Promise.all([
    hasReports
      ? supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .in("employee_id", reportIds)
      : Promise.resolve({ count: 0, error: null }),
    hasReports
      ? getLeaveRequests({ status: "pending" })
      : Promise.resolve({ requests: [], error: null }),
    hasReports
      ? supabase
          .from("onboarding_tasks")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .in("employee_id", reportIds)
      : Promise.resolve({ count: 0, error: null }),
    getPerformanceDashboardSummary("manager"),
    hasReports
      ? supabase
          .from("performance_reviews")
          .select("id, employee_id, cycle_id, status, updated_at")
          .eq("status", "self_reviewed")
          .in("employee_id", reportIds)
          .order("updated_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    hasReports
      ? supabase
          .from("leave_requests")
          .select("id, employee_id, leave_type_id, start_date, end_date, status, approved_at")
          .in("status", ["approved", "rejected"])
          .in("employee_id", reportIds)
          .not("approved_at", "is", null)
          .gte("approved_at", sinceIso)
          .order("approved_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    hasReports
      ? supabase
          .from("onboarding_tasks")
          .select("id, employee_id, title, completed_at, status")
          .eq("status", "completed")
          .in("employee_id", reportIds)
          .not("completed_at", "is", null)
          .gte("completed_at", sinceIso)
          .order("completed_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    hasReports
      ? supabase
          .from("performance_reviews")
          .select("id, employee_id, cycle_id, status, submitted_at")
          .eq("status", "acknowledged")
          .in("employee_id", reportIds)
          .not("submitted_at", "is", null)
          .gte("submitted_at", sinceIso)
          .order("submitted_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  collectError(errors, whoIsOutError);
  collectError(errors, safeDashboardError("dashboard.manager.pendingApprovals", pendingApprovalsResult.error));
  collectError(errors, pendingApprovalRequestsResult.error);
  collectError(errors, safeDashboardError("dashboard.manager.openTasks", openTasksResult.error));
  collectError(errors, performanceResult.error);
  collectError(errors, safeDashboardError("dashboard.manager.pendingReviews", pendingReviewsResult.error));
  collectError(errors, safeDashboardError("dashboard.manager.recentLeaveDecisions", recentLeaveDecisionsResult.error));
  collectError(errors, safeDashboardError("dashboard.manager.recentCompletedTasks", recentCompletedTasksResult.error));
  collectError(errors, safeDashboardError("dashboard.manager.recentReviewSubmissions", recentReviewSubmissionsResult.error));

  const reportIdSet = new Set(reportIds);
  const pendingApprovalRequests = pendingApprovalRequestsResult.requests
    .filter((request) => reportIdSet.has(request.employeeId))
    .slice(0, 5);

  const pendingReviews = pendingReviewsResult.data ?? [];
  const recentLeaveRows = recentLeaveDecisionsResult.data ?? [];
  const recentTaskRows = recentCompletedTasksResult.data ?? [];
  const recentReviewRows = recentReviewSubmissionsResult.data ?? [];

  const involvedEmployeeIds = unique([
    ...pendingReviews.map((r) => r.employee_id as string),
    ...recentLeaveRows.map((r) => r.employee_id as string),
    ...recentTaskRows.map((r) => r.employee_id as string),
    ...recentReviewRows.map((r) => r.employee_id as string),
  ]);
  const involvedCycleIds = unique([
    ...pendingReviews.map((r) => r.cycle_id as string),
    ...recentReviewRows.map((r) => r.cycle_id as string),
  ]);
  const involvedLeaveTypeIds = unique(
    recentLeaveRows.map((r) => r.leave_type_id as string),
  );

  const [employeeNames, cycleTitles, leaveTypeNames] = await Promise.all([
    fetchProfileNames(supabase, involvedEmployeeIds),
    fetchPerformanceCycleTitles(supabase, involvedCycleIds),
    fetchLeaveTypeNames(supabase, involvedLeaveTypeIds),
  ]);

  const actionItems = buildManagerActionItems({
    pendingApprovalRequests,
    pendingReviews: pendingReviews.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      cycleId: row.cycle_id as string,
      updatedAt: row.updated_at as string,
    })),
    employeeNames,
    cycleTitles,
  });

  const recentUpdates = buildManagerRecentUpdates({
    leaveRows: recentLeaveRows,
    taskRows: recentTaskRows,
    reviewRows: recentReviewRows,
    employeeNames,
    cycleTitles,
    leaveTypeNames,
  });

  return {
    directReports: reportIds.length,
    pendingApprovals: pendingApprovalsResult.count ?? 0,
    pendingApprovalRequests,
    whoIsOut,
    openTasks: openTasksResult.count ?? 0,
    performance: performanceResult.summary,
    actionItems,
    recentUpdates,
    errors,
  };
}

export async function getEmployeeDashboardData(employeeId: string): Promise<EmployeeDashboardData> {
  const supabase = await createClient();
  const errors: string[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);

  const [
    balancesResult,
    tasksResult,
    myTasksResult,
    documentsResult,
    compensationResult,
    performanceResult,
    whoIsOutResult,
  ] = await Promise.all([
    getMyLeaveBalances(),
    supabase
      .from("onboarding_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .or(`employee_id.eq.${employeeId},assignee_id.eq.${employeeId}`),
    getMyTasks(employeeId),
    getDocuments({ employeeId }),
    getCompensationSummary(employeeId),
    getPerformanceDashboardSummary("employee"),
    getCompanyApprovedLeave(toDate(now), toDate(weekEnd)),
  ]);

  collectError(errors, balancesResult.error);
  collectError(errors, safeDashboardError("dashboard.employee.tasks", tasksResult.error));
  collectError(errors, myTasksResult.error);
  collectError(errors, documentsResult.error);
  collectError(errors, compensationResult.error);
  collectError(errors, performanceResult.error);
  collectError(errors, whoIsOutResult.error);

  const pendingTaskItems = myTasksResult.tasks
    .filter((task) => task.status === "pending")
    .sort((a, b) => sortByDueDate(a.dueDate, b.dueDate))
    .slice(0, 5);
  const recentUpdatesResult = await getEmployeeRecentUpdates({
    employeeId,
    documents: documentsResult.documents,
    tasks: myTasksResult.tasks,
    sinceIso: thirtyDaysAgo.toISOString(),
  });

  for (const err of recentUpdatesResult.errors) collectError(errors, err);

  return {
    balances: balancesResult.balances.filter(
      (balance) => balance.employeeId === employeeId && balance.leaveTypeIsActive,
    ),
    pendingTasks: tasksResult.count ?? 0,
    pendingTaskItems,
    recentUpdates: recentUpdatesResult.updates,
    recentDocuments: documentsResult.documents.slice(0, 5),
    compensationSummary: compensationResult.summary,
    performance: performanceResult.summary,
    whoIsOut: whoIsOutResult.entries,
    errors,
  };
}

async function getEmployeeRecentUpdates({
  employeeId,
  documents,
  tasks,
  sinceIso,
}: {
  employeeId: string;
  documents: DocumentRow[];
  tasks: OnboardingTask[];
  sinceIso: string;
}): Promise<{ updates: EmployeeRecentUpdate[]; errors: string[] }> {
  const supabase = await createClient();
  const [leaveResult, pendingLeaveResult, reviewsResult] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, status, approved_at")
      .eq("employee_id", employeeId)
      .in("status", ["approved", "rejected"])
      .not("approved_at", "is", null)
      .gte("approved_at", sinceIso)
      .order("approved_at", { ascending: false })
      .limit(5),
    // F2: surface newly-submitted pending leave on the employee dashboard so
    // step 4 of the lifecycle UAT has visible confirmation that the request
    // was recorded. Keyed off `created_at` since pending rows have no
    // `approved_at`.
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, created_at")
      .eq("employee_id", employeeId)
      .eq("status", "pending")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("performance_reviews")
      .select("id, cycle_id, status, submitted_at")
      .eq("employee_id", employeeId)
      .eq("status", "manager_submitted")
      .not("submitted_at", "is", null)
      .gte("submitted_at", sinceIso)
      .order("submitted_at", { ascending: false })
      .limit(5),
  ]);

  const errors = [
    safeDashboardError("dashboard.employee.recentLeaveUpdates", leaveResult.error),
    safeDashboardError("dashboard.employee.recentPendingLeave", pendingLeaveResult.error),
    safeDashboardError("dashboard.employee.recentReviewUpdates", reviewsResult.error),
  ].filter(Boolean) as string[];

  const leaveRows = leaveResult.data ?? [];
  const pendingLeaveRows = pendingLeaveResult.data ?? [];
  const reviewRows = reviewsResult.data ?? [];
  const [leaveTypeNames, cycleTitles] = await Promise.all([
    fetchLeaveTypeNames(
      supabase,
      unique([
        ...leaveRows.map((row) => row.leave_type_id as string),
        ...pendingLeaveRows.map((row) => row.leave_type_id as string),
      ]),
    ),
    fetchPerformanceCycleTitles(
      supabase,
      unique(reviewRows.map((row) => row.cycle_id as string)),
    ),
  ]);

  const leaveUpdates: EmployeeRecentUpdate[] = leaveRows.map((row) => {
    const status = row.status as "approved" | "rejected";
    const typeName =
      leaveTypeNames.get(row.leave_type_id as string) ?? "Leave request";
    return {
      id: `leave-${row.id as string}`,
      kind: "leave",
      tone: status === "approved" ? "success" : "danger",
      title: `${typeName} ${status}`,
      detail: `${formatDateRange(row.start_date as string, row.end_date as string)} · ${status === "approved" ? "Approved" : "Rejected"}`,
      occurredAt: row.approved_at as string,
      href: "/leave",
    };
  });

  const pendingLeaveUpdates: EmployeeRecentUpdate[] = pendingLeaveRows.map((row) => {
    const typeName =
      leaveTypeNames.get(row.leave_type_id as string) ?? "Leave request";
    return {
      id: `leave-pending-${row.id as string}`,
      kind: "leave",
      tone: "pending",
      title: `${typeName} pending`,
      detail: `${formatDateRange(row.start_date as string, row.end_date as string)} · Pending approval`,
      occurredAt: row.created_at as string,
      href: "/leave",
    };
  });

  const taskUpdates: EmployeeRecentUpdate[] = tasks
    .filter((task) => task.status === "completed" && task.completedAt)
    .filter((task) => String(task.completedAt) >= sinceIso)
    .map((task) => ({
      id: `task-${task.id}`,
      kind: "onboarding" as const,
      title: task.title,
      detail: "Onboarding task completed",
      occurredAt: task.completedAt as string,
      href: "/onboarding",
    }));

  const reviewUpdates: EmployeeRecentUpdate[] = reviewRows.map((row) => ({
    id: `review-${row.id as string}`,
    kind: "performance",
    title: "Review ready for acknowledgement",
    detail: cycleTitles.get(row.cycle_id as string) ?? "Performance review",
    occurredAt: row.submitted_at as string,
    href: "/performance?view=reviews#performance-reviews",
  }));

  const documentUpdates: EmployeeRecentUpdate[] = documents
    .filter((document) => document.createdAt >= sinceIso)
    .slice(0, 5)
    .map((document) => ({
      id: `document-${document.id}`,
      kind: "document" as const,
      title: document.title,
      detail: `${document.category.replace("_", " ")} document added`,
      occurredAt: document.createdAt,
      href: "/documents",
    }));

  return {
    updates: [
      ...leaveUpdates,
      ...pendingLeaveUpdates,
      ...taskUpdates,
      ...reviewUpdates,
      ...documentUpdates,
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 6),
    errors,
  };
}

async function fetchLeaveTypeNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("leave_types")
    .select("id, name")
    .in("id", ids);
  return new Map((data ?? []).map((row) => [row.id as string, row.name as string]));
}

async function fetchProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);
  return new Map(
    (data ?? []).map((row) => [row.id as string, (row.display_name as string) ?? "Unknown"]),
  );
}

function buildAdminActionItems({
  pendingLeaveRequests,
}: {
  pendingLeaveRequests: LeaveRequest[];
}): DashboardActionItem[] {
  return pendingLeaveRequests
    .map((request): DashboardActionItem => ({
      id: `leave-${request.id}`,
      kind: "leave",
      title: `Leave · ${request.employeeName}`,
      detail: `${request.leaveTypeName} · ${request.startDate} to ${request.endDate}`,
      occurredAt: request.createdAt,
      href: `/leave?status=pending#leave-request-${request.id}`,
    }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 5);
}

function buildAdminRecentUpdates({
  leaveDecisions,
  leaveTypeNames,
}: {
  leaveDecisions: Array<Record<string, unknown>>;
  leaveTypeNames: Map<string, string>;
}): DashboardRecentUpdate[] {
  return leaveDecisions
    .map((row): DashboardRecentUpdate => {
      const status = row.status as "approved" | "rejected";
      const typeName =
        leaveTypeNames.get(row.leave_type_id as string) ?? "Leave request";
      return {
        id: `leave-${row.id as string}`,
        kind: "leave",
        tone: status === "approved" ? "success" : "danger",
        title: `${typeName} ${status}`,
        detail: `${formatDateRange(row.start_date as string, row.end_date as string)} · ${status === "approved" ? "Approved" : "Rejected"}`,
        occurredAt: row.approved_at as string,
        href: "/leave",
      };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 6);
}

function buildManagerActionItems({
  pendingApprovalRequests,
  pendingReviews,
  employeeNames,
  cycleTitles,
}: {
  pendingApprovalRequests: LeaveRequest[];
  pendingReviews: Array<{ id: string; employeeId: string; cycleId: string; updatedAt: string }>;
  employeeNames: Map<string, string>;
  cycleTitles: Map<string, string>;
}): DashboardActionItem[] {
  const leaveItems: DashboardActionItem[] = pendingApprovalRequests.map((request) => ({
    id: `leave-${request.id}`,
    kind: "leave",
    title: `Leave · ${request.employeeName}`,
    detail: `${request.leaveTypeName} · ${request.startDate} to ${request.endDate}`,
    occurredAt: request.createdAt,
    href: `/leave?status=pending#leave-request-${request.id}`,
  }));
  const reviewItems: DashboardActionItem[] = pendingReviews.map((review) => ({
    id: `review-${review.id}`,
    kind: "performance",
    title: `Appraisal due · ${employeeNames.get(review.employeeId) ?? "Direct report"}`,
    detail: `${cycleTitles.get(review.cycleId) ?? "Review cycle"} · self-review submitted`,
    occurredAt: review.updatedAt,
    href: `/performance?view=appraisals&reviewCycleId=${review.cycleId}&reviewEmployeeId=${review.employeeId}#manager-appraisal-workspace`,
  }));
  return [...leaveItems, ...reviewItems]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 5);
}

function buildManagerRecentUpdates({
  leaveRows,
  taskRows,
  reviewRows,
  employeeNames,
  cycleTitles,
  leaveTypeNames,
}: {
  leaveRows: Array<Record<string, unknown>>;
  taskRows: Array<Record<string, unknown>>;
  reviewRows: Array<Record<string, unknown>>;
  employeeNames: Map<string, string>;
  cycleTitles: Map<string, string>;
  leaveTypeNames: Map<string, string>;
}): DashboardRecentUpdate[] {
  const leaveUpdates: DashboardRecentUpdate[] = leaveRows.map((row) => {
    const status = row.status as "approved" | "rejected";
    const typeName =
      leaveTypeNames.get(row.leave_type_id as string) ?? "Leave request";
    const employee = employeeNames.get(row.employee_id as string) ?? "Direct report";
    return {
      id: `leave-${row.id as string}`,
      kind: "leave",
      tone: status === "approved" ? "success" : "danger",
      title: `${typeName} ${status}`,
      detail: `${employee} · ${formatDateRange(row.start_date as string, row.end_date as string)}`,
      occurredAt: row.approved_at as string,
      href: "/leave",
    };
  });
  const taskUpdates: DashboardRecentUpdate[] = taskRows.map((row) => ({
    id: `task-${row.id as string}`,
    kind: "onboarding",
    title: (row.title as string) ?? "Onboarding task",
    detail: `${employeeNames.get(row.employee_id as string) ?? "Direct report"} · completed`,
    occurredAt: row.completed_at as string,
    href: "/onboarding",
  }));
  const reviewUpdates: DashboardRecentUpdate[] = reviewRows.map((row) => ({
    id: `review-${row.id as string}`,
    kind: "performance",
    tone: "info",
    title: "Appraisal acknowledged",
    detail: `${employeeNames.get(row.employee_id as string) ?? "Direct report"} · ${cycleTitles.get(row.cycle_id as string) ?? "Review cycle"}`,
    occurredAt: row.submitted_at as string,
    href: "/performance?view=reviews#performance-reviews",
  }));
  return [...leaveUpdates, ...taskUpdates, ...reviewUpdates]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 6);
}

async function fetchPerformanceCycleTitles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("performance_review_cycles")
    .select("id, title")
    .in("id", ids);
  return new Map((data ?? []).map((row) => [row.id as string, row.title as string]));
}

function sortByDueDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

function collectError(errors: string[], error?: string | null) {
  if (error) errors.push(error);
}

function safeDashboardError(context: string, error: unknown): string | null {
  if (!error) return null;
  return safeDalError(context, error, "Unable to load dashboard data.");
}

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function inclusiveDays(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(1, Math.floor((endTime - startTime) / 86_400_000) + 1);
}

function formatDateRange(start: string, end: string): string {
  return start === end ? start : `${start} to ${end}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}
