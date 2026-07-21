import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/server/authz/roles";
import { safeDalError } from "@/server/dal/errors";
import { getAssignableEmployees } from "@/server/dal/onboarding";

export type PerformanceGoalStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "cancelled";

export type PerformanceCycleStatus = "draft" | "active" | "closed";

export type PerformanceReviewStatus =
  | "draft"
  | "self_reviewed"
  | "manager_submitted"
  | "acknowledged";

export type PerformanceCycle = {
  id: string;
  title: string;
  description: string | null;
  status: PerformanceCycleStatus;
  startDate: string;
  endDate: string;
  dueDate: string | null;
  submissionDeadline: string | null;
  submissionLockEnabled: boolean;
};

export { isCycleDeadlineLocked } from "@/lib/performance-deadline";

export type PerformanceGoal = {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId: string | null;
  cycleTitle: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: PerformanceGoalStatus;
  progress: number;
  employeeProgressNote: string | null;
  employeeProgressUpdatedAt: string | null;
  goalDefinitionSubmittedAt: string | null;
  goalDefinitionSubmittedBy: string | null;
  goalDefinitionSubmittedByName: string | null;
};

export type PerformanceReview = {
  id: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  managerName: string | null;
  cycleId: string;
  cycleTitle: string;
  status: PerformanceReviewStatus;
  score: number | null;
  selfReview: string | null;
  managerStrengths: string | null;
  managerImprovements: string | null;
  managerNextSteps: string | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
};

export type PerformanceDashboardSummary = {
  activeGoals: number;
  openReviews: number;
  submittedReviews: number;
};

export async function getPerformanceCycles(): Promise<{
  cycles: PerformanceCycle[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_review_cycles")
    .select("id, title, description, status, start_date, end_date, due_date, submission_deadline, submission_lock_enabled")
    .order("start_date", { ascending: false });

  if (error) return { cycles: [], error: safeDalError("performance.getPerformanceCycles", error, "Unable to load performance cycles.") };

  return {
    cycles: (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | null,
      status: row.status as PerformanceCycleStatus,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      dueDate: row.due_date as string | null,
      submissionDeadline: row.submission_deadline as string | null,
      submissionLockEnabled: row.submission_lock_enabled as boolean,
    })),
    error: null,
  };
}

export async function getActiveOrVisibleCycles(): Promise<{
  cycles: PerformanceCycle[];
  error: string | null;
}> {
  const result = await getPerformanceCycles();
  return {
    cycles: result.cycles.filter((cycle) => cycle.status !== "closed"),
    error: result.error,
  };
}

export async function getPerformanceGoals(): Promise<{
  goals: PerformanceGoal[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_goals")
    .select("id, employee_id, cycle_id, title, description, due_date, status, progress, employee_progress_note, employee_progress_updated_at, goal_definition_submitted_at, goal_definition_submitted_by")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return { goals: [], error: safeDalError("performance.getPerformanceGoals", error, "Unable to load performance goals.") };

  return { goals: await hydrateGoals(data ?? []), error: null };
}

export async function getPerformanceReviews(): Promise<{
  reviews: PerformanceReview[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_reviews")
    .select(
      "id, employee_id, manager_id, cycle_id, status, score, self_review, manager_strengths, manager_improvements, manager_next_steps, submitted_at, acknowledged_at",
    )
    .order("created_at", { ascending: false });

  if (error) return { reviews: [], error: safeDalError("performance.getPerformanceReviews", error, "Unable to load performance reviews.") };

  return { reviews: await hydrateReviews(data ?? []), error: null };
}

export async function getPerformanceEmployees(
  role: UserRole,
  userId: string,
) {
  return getAssignableEmployees(role, userId);
}

export async function getPerformanceDashboardSummary(
  role: UserRole,
): Promise<{ summary: PerformanceDashboardSummary; error: string | null }> {
  const supabase = await createClient();
  const errors: string[] = [];

  const [goalsResult, reviewsResult] = await Promise.all([
    supabase
      .from("performance_goals")
      .select("id", { count: "exact", head: true })
      .neq("status", "completed")
      .neq("status", "cancelled"),
    supabase
      .from("performance_reviews")
      .select("id, status"),
  ]);

  if (goalsResult.error) {
    errors.push(safeDalError("performance.getPerformanceDashboardSummary.goals", goalsResult.error, "Unable to load performance summary."));
  }
  if (reviewsResult.error) {
    errors.push(safeDalError("performance.getPerformanceDashboardSummary.reviews", reviewsResult.error, "Unable to load performance summary."));
  }

  const reviewRows = reviewsResult.data ?? [];
  const openReviews = reviewRows.filter((review) =>
    role === "employee"
      ? review.status === "manager_submitted"
      : review.status === "draft" || review.status === "self_reviewed",
  ).length;
  const submittedReviews = reviewRows.filter(
    (review) =>
      review.status === "manager_submitted" || review.status === "acknowledged",
  ).length;

  return {
    summary: {
      activeGoals: goalsResult.count ?? 0,
      openReviews,
      submittedReviews,
    },
    error: errors[0] ?? null,
  };
}

async function hydrateGoals(
  rows: Array<Record<string, unknown>>,
): Promise<PerformanceGoal[]> {
  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const peopleIds = unique(
    rows.flatMap((row) => [
      row.employee_id as string,
      row.goal_definition_submitted_by as string | null,
    ]).filter(Boolean) as string[],
  );
  const cycleIds = unique(
    rows.map((row) => row.cycle_id as string | null).filter(Boolean) as string[],
  );

  const [profiles, cycles] = await Promise.all([
    fetchProfileNames(admin, peopleIds),
    fetchCycleTitles(admin, cycleIds),
  ]);

  return rows.map((row) => {
    const submittedBy = row.goal_definition_submitted_by as string | null;
    return {
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
      cycleId: row.cycle_id as string | null,
      cycleTitle: row.cycle_id
        ? (cycles.get(row.cycle_id as string) ?? null)
        : null,
      title: row.title as string,
      description: row.description as string | null,
      dueDate: row.due_date as string | null,
      status: row.status as PerformanceGoalStatus,
      progress: row.progress as number,
      employeeProgressNote: row.employee_progress_note as string | null,
      employeeProgressUpdatedAt: row.employee_progress_updated_at as string | null,
      goalDefinitionSubmittedAt: row.goal_definition_submitted_at as string | null,
      goalDefinitionSubmittedBy: submittedBy,
      goalDefinitionSubmittedByName: submittedBy ? (profiles.get(submittedBy) ?? null) : null,
    };
  });
}

async function hydrateReviews(
  rows: Array<Record<string, unknown>>,
): Promise<PerformanceReview[]> {
  if (rows.length === 0) return [];

  const admin = createAdminClient();
  const peopleIds = unique(
    rows.flatMap((row) => [
      row.employee_id as string,
      row.manager_id as string | null,
    ]).filter(Boolean) as string[],
  );
  const cycleIds = unique(rows.map((row) => row.cycle_id as string));

  const [profiles, cycles] = await Promise.all([
    fetchProfileNames(admin, peopleIds),
    fetchCycleTitles(admin, cycleIds),
  ]);

  return rows.map((row) => ({
    id: row.id as string,
    employeeId: row.employee_id as string,
    employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
    managerId: row.manager_id as string | null,
    managerName: row.manager_id
      ? (profiles.get(row.manager_id as string) ?? null)
      : null,
    cycleId: row.cycle_id as string,
    cycleTitle: cycles.get(row.cycle_id as string) ?? "Unknown cycle",
    status: row.status as PerformanceReviewStatus,
    score: row.score as number | null,
    selfReview: row.self_review as string | null,
    managerStrengths: row.manager_strengths as string | null,
    managerImprovements: row.manager_improvements as string | null,
    managerNextSteps: row.manager_next_steps as string | null,
    submittedAt: row.submitted_at as string | null,
    acknowledgedAt: row.acknowledged_at as string | null,
  }));
}

async function fetchProfileNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, work_email")
    .in("id", ids);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(
      row.id as string,
      (row.display_name as string | null) ??
        (row.work_email as string | null) ??
        "Unknown",
    );
  }
  return map;
}

async function fetchCycleTitles(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from("performance_review_cycles")
    .select("id, title")
    .in("id", ids);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.id as string, row.title as string);
  }
  return map;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
