import "server-only";

import { createClient } from "@/lib/supabase/server";
import { safeDalError } from "@/server/dal/errors";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveType = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type LeaveBalance = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeIsActive: boolean;
  balance: number;
  year: number;
  adjustmentReason: string | null;
  adjustedAt: string | null;
  adjustedById: string | null;
  adjustedByName: string | null;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  approverId: string | null;
  approverName: string | null;
  approvedAt: string | null;
  employeeNote: string | null;
  isUrgentLocalLeave: boolean;
  urgentLeaveReason: string | null;
  approverNote: string | null;
  isHalfDay: boolean;
  deductedDays: number | null;
  createdAt: string;
};

export type CompanyLeaveEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
};

export type LeaveRequestFilters = {
  status?: LeaveStatus | "all";
  from?: string;
  to?: string;
  employeeId?: string;
};

export type PublicHoliday = {
  id: string;
  date: string;
  name: string;
  countryCode: string;
  isActive: boolean;
  isTentative: boolean;
};

export async function getPublicHolidays(args?: {
  fromYear?: number;
  toYear?: number;
  countryCode?: string;
  includeInactive?: boolean;
}): Promise<{ holidays: PublicHoliday[]; error: string | null }> {
  const supabase = await createClient();
  const country = args?.countryCode ?? "MU";
  let query = supabase
    .from("public_holidays")
    .select("id, date, name, country_code, is_active, is_tentative")
    .eq("country_code", country)
    .order("date", { ascending: true });

  if (args?.fromYear) {
    query = query.gte("date", `${args.fromYear}-01-01`);
  }
  if (args?.toYear) {
    query = query.lte("date", `${args.toYear}-12-31`);
  }
  if (!args?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    return {
      holidays: [],
      error: safeDalError("leave.getPublicHolidays", error, "Unable to load public holidays."),
    };
  }

  return {
    holidays: (data ?? []).map((row) => ({
      id: row.id as string,
      date: String(row.date),
      name: String(row.name),
      countryCode: String(row.country_code),
      isActive: row.is_active as boolean,
      isTentative: row.is_tentative as boolean,
    })),
    error: null,
  };
}

// ─── Leave types ──────────────────────────────────────────────────────────────

export async function getLeaveTypes(): Promise<{
  types: LeaveType[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select("id, name, description, is_active")
    .order("name");

  if (error) return { types: [], error: safeDalError("leave.getLeaveTypes", error, "Unable to load leave types.") };

  return {
    types: (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      isActive: row.is_active as boolean,
    })),
    error: null,
  };
}

export async function getActiveLeaveTypes(): Promise<{
  types: LeaveType[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select("id, name, description, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) return { types: [], error: safeDalError("leave.getActiveLeaveTypes", error, "Unable to load leave types.") };

  return {
    types: (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | null,
      isActive: true,
    })),
    error: null,
  };
}

// ─── Leave balances ───────────────────────────────────────────────────────────

export async function getMyLeaveBalances(
  year?: number | number[] | "all",
): Promise<{
  balances: LeaveBalance[];
  error: string | null;
}> {
  const supabase = await createClient();
  const years =
    year === "all"
      ? null
      : Array.isArray(year)
        ? unique(year)
        : [year ?? new Date().getFullYear()];

  let query = supabase
    .from("leave_balances")
    .select(
      "id, employee_id, leave_type_id, balance, year, adjustment_reason, adjusted_at, adjusted_by",
    )
    .order("leave_type_id");
  if (years !== null) {
    query = years.length === 1 ? query.eq("year", years[0]) : query.in("year", years);
  }

  const { data, error } = await query;

  if (error) return { balances: [], error: safeDalError("leave.getMyLeaveBalances", error, "Unable to load leave balances.") };

  const rows = data ?? [];
  const employeeIds = unique(rows.map((r) => r.employee_id as string));
  const adjusterIds = unique(
    rows.map((r) => r.adjusted_by as string | null).filter(Boolean) as string[],
  );
  const typeIds = unique(rows.map((r) => r.leave_type_id as string));

  const [profiles, adjusters, types] = await Promise.all([
    fetchProfileNames(supabase, employeeIds),
    fetchProfileNames(supabase, adjusterIds),
    fetchTypeNames(supabase, typeIds),
  ]);

  return {
    balances: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
      leaveTypeId: row.leave_type_id as string,
      leaveTypeName: types.get(row.leave_type_id as string)?.name ?? "Unknown",
      // RLS hides inactive leave types from non-admins, so a missing lookup
      // means the type is inactive for the current viewer. Default to false
      // so /leave + dashboard balance cards drop the row instead of showing
      // an "Unknown · isActive=true" zombie.
      leaveTypeIsActive: types.get(row.leave_type_id as string)?.isActive ?? false,
      balance: Number(row.balance),
      year: row.year as number,
      adjustmentReason: row.adjustment_reason as string | null,
      adjustedAt: row.adjusted_at as string | null,
      adjustedById: row.adjusted_by as string | null,
      adjustedByName: row.adjusted_by
        ? (adjusters.get(row.adjusted_by as string) ?? null)
        : null,
    })),
    error: null,
  };
}

// ─── Leave requests ───────────────────────────────────────────────────────────

export async function getLeaveRequests(
  filters: LeaveRequestFilters = {},
): Promise<{ requests: LeaveRequest[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("leave_requests")
    .select(
      "id, employee_id, leave_type_id, start_date, end_date, status, approver_id, approved_at, employee_note, is_urgent_local_leave, urgent_leave_reason, approver_note, is_half_day, deducted_days, created_at",
    )
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.from) {
    query = query.gte("start_date", filters.from);
  }
  if (filters.to) {
    query = query.lte("end_date", filters.to);
  }
  if (filters.employeeId) {
    query = query.eq("employee_id", filters.employeeId);
  }

  const { data, error } = await query;
  if (error) return { requests: [], error: safeDalError("leave.getLeaveRequests", error, "Unable to load leave requests.") };

  const rows = data ?? [];
  const employeeIds = unique(rows.map((r) => r.employee_id as string));
  const approverIds = unique(
    rows.map((r) => r.approver_id as string | null).filter(Boolean) as string[],
  );
  const typeIds = unique(rows.map((r) => r.leave_type_id as string));

  const [profiles, approvers, types] = await Promise.all([
    fetchProfileNames(supabase, employeeIds),
    fetchProfileNames(supabase, approverIds),
    fetchTypeNames(supabase, typeIds),
  ]);

  return {
    requests: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
      leaveTypeId: row.leave_type_id as string,
      leaveTypeName: types.get(row.leave_type_id as string)?.name ?? "Unknown",
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      status: row.status as LeaveStatus,
      approverId: row.approver_id as string | null,
      approverName: row.approver_id
        ? (approvers.get(row.approver_id as string) ?? null)
        : null,
      approvedAt: row.approved_at as string | null,
      employeeNote: row.employee_note as string | null,
      isUrgentLocalLeave: Boolean(row.is_urgent_local_leave),
      urgentLeaveReason: row.urgent_leave_reason as string | null,
      approverNote: row.approver_note as string | null,
      isHalfDay: Boolean(row.is_half_day),
      deductedDays:
        row.deducted_days === null || row.deducted_days === undefined
          ? null
          : Number(row.deducted_days),
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}

export async function getWhoIsOut(
  from: string,
  to: string,
  statuses: LeaveStatus[] = ["approved"],
): Promise<{ requests: LeaveRequest[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      "id, employee_id, leave_type_id, start_date, end_date, status, approver_id, approved_at, employee_note, is_urgent_local_leave, urgent_leave_reason, approver_note, is_half_day, deducted_days, created_at",
    )
    .in("status", statuses)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");

  if (error) return { requests: [], error: safeDalError("leave.getWhoIsOut", error, "Unable to load leave requests.") };

  const rows = data ?? [];
  const employeeIds = unique(rows.map((r) => r.employee_id as string));
  const typeIds = unique(rows.map((r) => r.leave_type_id as string));

  const [profiles, types] = await Promise.all([
    fetchProfileNames(supabase, employeeIds),
    fetchTypeNames(supabase, typeIds),
  ]);

  return {
    requests: rows.map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: profiles.get(row.employee_id as string) ?? "Unknown",
      leaveTypeId: row.leave_type_id as string,
      leaveTypeName: types.get(row.leave_type_id as string)?.name ?? "Unknown",
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      status: row.status as LeaveStatus,
      approverId: row.approver_id as string | null,
      // Intentional join-skip: the "who is out" view doesn't resolve the approver
      // display name (contrast getLeaveRequests, which does).
      approverName: null,
      approvedAt: row.approved_at as string | null,
      employeeNote: row.employee_note as string | null,
      isUrgentLocalLeave: Boolean(row.is_urgent_local_leave),
      urgentLeaveReason: row.urgent_leave_reason as string | null,
      approverNote: row.approver_note as string | null,
      isHalfDay: Boolean(row.is_half_day),
      deductedDays:
        row.deducted_days === null || row.deducted_days === undefined
          ? null
          : Number(row.deducted_days),
      createdAt: row.created_at as string,
    })),
    error: null,
  };
}

export async function getCompanyApprovedLeave(
  from: string,
  to: string,
): Promise<{ entries: CompanyLeaveEntry[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_company_approved_leave", {
    p_from: from,
    p_to: to,
  });

  if (error) {
    return {
      entries: [],
      error: safeDalError(
        "leave.getCompanyApprovedLeave",
        error,
        "Unable to load leave calendar.",
      ),
    };
  }

  return {
    entries: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      employeeId: row.employee_id as string,
      employeeName: (row.employee_name as string | null) ?? "Unknown",
      leaveTypeId: row.leave_type_id as string,
      leaveTypeName: (row.leave_type_name as string | null) ?? "Unknown",
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      isHalfDay: Boolean(row.is_half_day),
    })),
    error: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchProfileNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
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

async function fetchTypeNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, { name: string; isActive: boolean }>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("leave_types")
    .select("id, name, is_active")
    .in("id", ids);
  const map = new Map<string, { name: string; isActive: boolean }>();
  for (const row of data ?? []) {
    map.set(row.id as string, {
      name: row.name as string,
      isActive: row.is_active as boolean,
    });
  }
  return map;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}
