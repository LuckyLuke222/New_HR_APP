import "server-only";

import {
  getVisibleEmployees,
  getEmployeesNeedingAttention,
  type EmployeeDirectoryRow,
} from "@/server/dal/employees";
import {
  getLeaveRequests,
  getWhoIsOut,
  type LeaveStatus,
} from "@/server/dal/leave";
import { getOnboardingProgress } from "@/server/dal/onboarding";
import { getPerformanceReviews } from "@/server/dal/performance";

// Admin reporting module — read-only projections over existing source-of-truth
// tables. Reports own no state: every function reads owners (employee_records
// via getVisibleEmployees, the needs-attention helper) and reshapes them into a
// uniform tabular DTO. No recompute of owned numbers, no second source of truth.
// See docs/reporting_module.md for the catalogue and access model.

export type ReportKey =
  | "headcount"
  | "starters"
  | "leavers"
  | "needs-attention"
  | "leave-usage"
  | "absence-list"
  | "onboarding-completion"
  | "review-completion";

// Headcount is a point-in-time snapshot → a single "as of" date (not a range).
// Starters/leavers are flows over a window → a from/to range. Needs-attention
// is a live data-quality scan → no date control.
export type DateControl = "none" | "range" | "asOf";

// Leave usage rolls up days taken by calendar period; only that report exposes a
// grain toggle (Day/Month/Year).
export type LeaveGrain = "day" | "month" | "year";

// Declarative single-series bar-chart spec. Set only on reports where a visual
// adds value; the keys must already exist in that report's `columns`/`rows`, so
// the chart re-plots the same DTO the table renders (no separate data path).
export type ReportChartSpec = {
  categoryKey: string; // x-axis row key
  valueKey: string; // y-axis row key (the single series)
  valueLabel: string; // series + accessible label, e.g. "Headcount"
};

export type ReportMeta = {
  key: ReportKey;
  label: string;
  description: string;
  dateControl: DateControl;
  // True only for reports that expose the Day/Month/Year grain toggle.
  grain?: boolean;
  // True only for reports that expose the leave-status multiselect.
  statusFilter?: boolean;
  // Set only on the reports that render a chart alongside the table.
  chart?: ReportChartSpec;
};

export const REPORTS: ReportMeta[] = [
  {
    key: "headcount",
    label: "Headcount summary",
    description: "Employees on the books as of the selected date, grouped by department.",
    dateControl: "asOf",
    chart: { categoryKey: "department", valueKey: "headcount", valueLabel: "Headcount" },
  },
  {
    key: "starters",
    label: "Starters",
    description: "Employees whose start date falls in the selected range.",
    dateControl: "range",
  },
  {
    key: "leavers",
    label: "Leavers",
    description: "Terminated employees whose end date falls in the selected range.",
    dateControl: "range",
  },
  {
    key: "needs-attention",
    label: "Employees needing attention",
    description: "Active employees with missing or incomplete profile data.",
    dateControl: "none",
  },
  {
    key: "leave-usage",
    label: "Leave usage",
    description: "Approved leave days taken, grouped by calendar period (started in the selected range).",
    dateControl: "range",
    grain: true,
    chart: { categoryKey: "period", valueKey: "days", valueLabel: "Days taken" },
  },
  {
    key: "absence-list",
    label: "Absence list",
    description: "Leave overlapping the selected range, filtered by status (defaults to approved).",
    dateControl: "range",
    statusFilter: true,
  },
  {
    key: "onboarding-completion",
    label: "Onboarding completion",
    description: "Completed vs total onboarding tasks per employee.",
    dateControl: "none",
  },
  {
    key: "review-completion",
    label: "Review completion",
    description: "Performance reviews per cycle, counted by status.",
    dateControl: "none",
  },
];

export function isReportKey(value: string | undefined): value is ReportKey {
  return !!value && REPORTS.some((report) => report.key === value);
}

export function reportMeta(key: ReportKey): ReportMeta {
  return REPORTS.find((report) => report.key === key)!;
}

export type ReportFilters = {
  from?: string;
  to?: string;
  // Snapshot date for the headcount report. Defaults to today when unset.
  asOf?: string;
  // Calendar grain for the leave-usage report. Defaults to "month" when unset.
  grain?: LeaveGrain;
  // Leave statuses for the absence-list report. Defaults to ["approved"] when empty.
  statuses?: LeaveStatus[];
};

const GRAINS: LeaveGrain[] = ["day", "month", "year"];

export function parseGrain(value: string | undefined): LeaveGrain | undefined {
  return GRAINS.find((grain) => grain === value);
}

// Order is the display order of the absence-list status checkboxes.
export const LEAVE_STATUSES: LeaveStatus[] = [
  "approved",
  "pending",
  "cancelled",
  "rejected",
];

// Next surfaces a repeated query param as string | string[]; normalise either
// shape to a deduped list of valid statuses (drops anything unrecognised).
export function parseStatuses(value: string | string[] | undefined): LeaveStatus[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return LEAVE_STATUSES.filter((status) => raw.includes(status));
}

// Accept a query-string date only if it's a well-formed YYYY-MM-DD; otherwise
// drop it so the DAL/page fall back to defaults. Shared by the page's inputs
// and the CSV export route so both parse URL dates identically.
export function cleanDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export type ReportColumn = { key: string; label: string };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export type ReportSummaryItem = { label: string; value: string | number };

export type ReportResult = {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: ReportSummaryItem[];
  error: string | null;
};

function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function today(): string {
  return toDate(new Date());
}

// First and last calendar day of the previous month (UTC), e.g. on 2026-06-03
// → 2026-05-01 … 2026-05-31. `Date.UTC(y, m - 1, 1)` rolls Jan→Dec correctly;
// `Date.UTC(y, m, 0)` is day-0 of the current month = last day of the previous.
function previousMonthRange(now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    from: toDate(new Date(Date.UTC(y, m - 1, 1))),
    to: toDate(new Date(Date.UTC(y, m, 0))),
  };
}

// Default filter values surfaced both in the page's pre-filled inputs and as
// the DAL fallback, so the two never drift. Headcount → as of today; date-range
// reports → the previous calendar month.
export function reportDefaults(key: ReportKey): ReportFilters {
  const meta = reportMeta(key);
  if (meta.dateControl === "asOf") return { asOf: today() };
  if (meta.dateControl === "range") {
    const range = previousMonthRange();
    if (meta.grain) return { ...range, grain: "month" };
    if (meta.statusFilter) return { ...range, statuses: ["approved"] };
    return range;
  }
  return {};
}

function resolveRange(filters: ReportFilters): { from: string; to: string } {
  const fallback = previousMonthRange();
  return {
    from: filters.from ?? fallback.from,
    to: filters.to ?? fallback.to,
  };
}

function inRange(value: string | null, from: string, to: string): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}

// Bucket an ISO date into a calendar period by grain. Pure string slice on the
// YYYY-MM-DD prefix — no Date math, so no timezone drift.
function periodOf(value: string, grain: LeaveGrain): string {
  const day = value.slice(0, 10);
  if (grain === "day") return day;
  if (grain === "month") return day.slice(0, 7);
  return day.slice(0, 4);
}

const EMPTY: ReportResult = { columns: [], rows: [], summary: [], error: null };

export async function getReport(
  key: ReportKey,
  filters: ReportFilters,
): Promise<ReportResult> {
  switch (key) {
    case "headcount":
      return getHeadcountReport(filters);
    case "starters":
      return getStartersReport(filters);
    case "leavers":
      return getLeaversReport(filters);
    case "needs-attention":
      return getNeedsAttentionReport();
    case "leave-usage":
      return getLeaveUsageReport(filters);
    case "absence-list":
      return getAbsenceListReport(filters);
    case "onboarding-completion":
      return getOnboardingCompletionReport();
    case "review-completion":
      return getReviewCompletionReport();
    default:
      // Unreachable while callers guard with isReportKey; return a fresh object
      // rather than the shared singleton so a stray caller can't mutate EMPTY.
      return { ...EMPTY };
  }
}

async function getHeadcountReport(filters: ReportFilters): Promise<ReportResult> {
  const { employees, error } = await getVisibleEmployees();
  if (error) return { ...EMPTY, error };

  // "On the books as of <asOf>": started on/before the date and not yet ended
  // by it. Date-based so the snapshot is correct for any historical date, not
  // just today's employment_status.
  // Falls back to today at run time when asOf is unset (the input ships
  // pre-filled with today, so this only fires if the user clears it — in which
  // case "as of now" is the intended meaning, even across a UTC-midnight tick).
  const asOf = filters.asOf ?? today();
  const onBooks = employees.filter(
    (employee) =>
      employee.startDate <= asOf &&
      (employee.endDate === null || employee.endDate >= asOf),
  );

  const counts = new Map<string, number>();
  for (const employee of onBooks) {
    const department = employee.departmentName ?? "Unassigned";
    counts.set(department, (counts.get(department) ?? 0) + 1);
  }

  const rows: ReportRow[] = Array.from(counts.entries())
    .map(([department, headcount]) => ({ department, headcount }))
    .sort((a, b) => Number(b.headcount) - Number(a.headcount));

  return {
    columns: [
      { key: "department", label: "Department" },
      { key: "headcount", label: "Headcount" },
    ],
    rows,
    summary: [
      { label: `Headcount as of ${asOf}`, value: onBooks.length },
      { label: "Departments", value: counts.size },
    ],
    error: null,
  };
}

async function getStartersReport(filters: ReportFilters): Promise<ReportResult> {
  const { employees, error } = await getVisibleEmployees();
  if (error) return { ...EMPTY, error };

  const { from, to } = resolveRange(filters);
  const starters = employees
    .filter((employee) => inRange(employee.startDate, from, to))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return {
    columns: [
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "jobTitle", label: "Job title" },
      { key: "startDate", label: "Start date" },
    ],
    rows: starters.map(directoryRow),
    summary: [{ label: "Starters in range", value: starters.length }],
    error: null,
  };
}

async function getLeaversReport(filters: ReportFilters): Promise<ReportResult> {
  const { employees, error } = await getVisibleEmployees();
  if (error) return { ...EMPTY, error };

  const { from, to } = resolveRange(filters);
  const leavers = employees
    .filter(
      (employee) =>
        employee.employmentStatus === "terminated" &&
        inRange(employee.endDate, from, to),
    )
    .sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));

  return {
    columns: [
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "endDate", label: "End date" },
    ],
    rows: leavers.map((employee) => ({
      name: employee.displayName,
      department: employee.departmentName ?? "Unassigned",
      endDate: employee.endDate,
    })),
    summary: [{ label: "Leavers in range", value: leavers.length }],
    error: null,
  };
}

async function getNeedsAttentionReport(): Promise<ReportResult> {
  const { rows, error } = await getEmployeesNeedingAttention();
  if (error) return { ...EMPTY, error };

  return {
    columns: [
      { key: "name", label: "Name" },
      { key: "workEmail", label: "Work email" },
      { key: "reasons", label: "Missing / flagged" },
    ],
    rows: rows.map((row) => ({
      name: row.displayName,
      workEmail: row.workEmail,
      reasons: row.attentionReasons.map(reasonLabel).join(", "),
    })),
    summary: [{ label: "Employees flagged", value: rows.length }],
    error: null,
  };
}

async function getLeaveUsageReport(filters: ReportFilters): Promise<ReportResult> {
  const { from, to } = resolveRange(filters);
  const grain = filters.grain ?? "month";

  // Narrow at the DB by lower bound only (start_date >= from). The upper bound
  // can't be pushed down — getLeaveRequests' `to` filters end_date, which would
  // drop requests starting in range but ending after `to` — so inRange still
  // cuts the upper bound in memory. Final row set is identical, fetch is bounded.
  const { requests, error } = await getLeaveRequests({ status: "approved", from });
  if (error) return { ...EMPTY, error };

  // Bucket approved leave by the period its start date falls in, summing the
  // already-computed deducted_days (no recompute — leave.ts owns that number).
  const buckets = new Map<string, { requests: number; days: number }>();
  let totalDays = 0;
  let totalRequests = 0;
  for (const request of requests) {
    if (!inRange(request.startDate, from, to)) continue;
    const period = periodOf(request.startDate, grain);
    const bucket = buckets.get(period) ?? { requests: 0, days: 0 };
    bucket.requests += 1;
    bucket.days += request.deductedDays ?? 0;
    buckets.set(period, bucket);
    totalRequests += 1;
    totalDays += request.deductedDays ?? 0;
  }

  const rows: ReportRow[] = Array.from(buckets.entries())
    .map(([period, bucket]) => ({
      period,
      requests: bucket.requests,
      days: bucket.days,
    }))
    .sort((a, b) => String(b.period).localeCompare(String(a.period)));

  return {
    columns: [
      { key: "period", label: "Period" },
      { key: "requests", label: "Requests" },
      { key: "days", label: "Days taken" },
    ],
    rows,
    summary: [
      { label: "Total days taken", value: totalDays },
      { label: "Requests", value: totalRequests },
    ],
    error: null,
  };
}

async function getAbsenceListReport(filters: ReportFilters): Promise<ReportResult> {
  const { from, to } = resolveRange(filters);
  // Overlap semantics: anyone on leave at any point in the window. Status
  // defaults to approved (the "who's out" view) unless the user picks others.
  const statuses: LeaveStatus[] = filters.statuses?.length
    ? filters.statuses
    : ["approved"];
  const { requests, error } = await getWhoIsOut(from, to, statuses);
  if (error) return { ...EMPTY, error };

  let totalDays = 0;
  const rows: ReportRow[] = requests.map((request) => {
    totalDays += request.deductedDays ?? 0;
    return {
      name: request.employeeName,
      leaveType: request.leaveTypeName,
      status: titleCase(request.status),
      startDate: request.startDate,
      endDate: request.endDate,
      days: request.deductedDays,
    };
  });

  return {
    columns: [
      { key: "name", label: "Name" },
      { key: "leaveType", label: "Leave type" },
      { key: "status", label: "Status" },
      { key: "startDate", label: "From" },
      { key: "endDate", label: "To" },
      { key: "days", label: "Days" },
    ],
    rows,
    summary: [
      { label: "Absences in range", value: requests.length },
      { label: "Total days", value: totalDays },
    ],
    error: null,
  };
}

async function getOnboardingCompletionReport(): Promise<ReportResult> {
  const { progress, error } = await getOnboardingProgress();
  if (error) return { ...EMPTY, error };

  let fullyComplete = 0;
  const rows: ReportRow[] = progress
    .map((row) => {
      const complete = row.totalTasks > 0 && row.completedTasks === row.totalTasks;
      if (complete) fullyComplete += 1;
      return {
        employee: row.employeeName,
        completed: row.completedTasks,
        total: row.totalTasks,
        status:
          row.totalTasks === 0
            ? "No tasks"
            : complete
              ? "Complete"
              : "In progress",
      };
    })
    .sort((a, b) => String(a.employee).localeCompare(String(b.employee)));

  return {
    columns: [
      { key: "employee", label: "Employee" },
      { key: "completed", label: "Completed" },
      { key: "total", label: "Total" },
      { key: "status", label: "Status" },
    ],
    rows,
    summary: [
      { label: "Employees", value: progress.length },
      { label: "Fully complete", value: fullyComplete },
    ],
    error: null,
  };
}

async function getReviewCompletionReport(): Promise<ReportResult> {
  const { reviews, error } = await getPerformanceReviews();
  if (error) return { ...EMPTY, error };

  // Group by cycle, counting reviews per status. Score is never read into a row
  // — this report is status/counts only by design (PII boundary).
  const buckets = new Map<
    string,
    { total: number; draft: number; selfReviewed: number; managerSubmitted: number; acknowledged: number }
  >();
  let acknowledged = 0;
  for (const review of reviews) {
    const cycle = review.cycleTitle || "Unknown cycle";
    const bucket =
      buckets.get(cycle) ??
      { total: 0, draft: 0, selfReviewed: 0, managerSubmitted: 0, acknowledged: 0 };
    bucket.total += 1;
    if (review.status === "draft") bucket.draft += 1;
    else if (review.status === "self_reviewed") bucket.selfReviewed += 1;
    else if (review.status === "manager_submitted") bucket.managerSubmitted += 1;
    else if (review.status === "acknowledged") {
      bucket.acknowledged += 1;
      acknowledged += 1;
    }
    buckets.set(cycle, bucket);
  }

  const rows: ReportRow[] = Array.from(buckets.entries())
    .map(([cycle, bucket]) => ({
      cycle,
      total: bucket.total,
      draft: bucket.draft,
      selfReviewed: bucket.selfReviewed,
      managerSubmitted: bucket.managerSubmitted,
      acknowledged: bucket.acknowledged,
    }))
    .sort((a, b) => String(a.cycle).localeCompare(String(b.cycle)));

  return {
    columns: [
      { key: "cycle", label: "Cycle" },
      { key: "total", label: "Total" },
      { key: "draft", label: "Draft" },
      { key: "selfReviewed", label: "Self-reviewed" },
      { key: "managerSubmitted", label: "Manager submitted" },
      { key: "acknowledged", label: "Acknowledged" },
    ],
    rows,
    summary: [
      { label: "Reviews", value: reviews.length },
      { label: "Acknowledged", value: acknowledged },
    ],
    error: null,
  };
}

function directoryRow(employee: EmployeeDirectoryRow): ReportRow {
  return {
    name: employee.displayName,
    department: employee.departmentName ?? "Unassigned",
    jobTitle: employee.jobTitle,
    startDate: employee.startDate,
  };
}

const REASON_LABELS: Record<string, string> = {
  no_manager: "No manager",
  no_department: "No department",
  no_work_email: "No work email",
  missing_phone: "Missing phone",
  missing_passport: "Missing passport",
  missing_nationality: "Missing nationality",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

// Capitalises the first character only (not true title-case). Correct for the
// single-word LeaveStatus values it's applied to; revisit if used on multi-word input.
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
