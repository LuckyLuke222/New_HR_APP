import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeDalError } from "@/server/dal/errors";
import { getDirectReportIds } from "@/server/dal/onboarding";
import type { UserRole } from "@/server/authz/roles";

// D3 (Batch 5): admin-facing data-quality flags surfaced on the
// dashboard "Needs attention" card and the /employees?attention=1
// drilldown. Active employees only.
export type AttentionReason =
  | "no_manager"
  | "no_department"
  | "no_work_email"
  | "missing_phone"
  | "missing_passport"
  | "missing_nationality";

export type EmployeeAttentionRow = EmployeeDirectoryRow & {
  attentionReasons: AttentionReason[];
};

export type EmploymentStatus = "active" | "inactive" | "terminated";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contractor"
  | "intern";

type EmployeeRecordRow = {
  id: string;
  employee_id: string;
  department_id: string | null;
  manager_id: string | null;
  job_title: string | null;
  employment_status: EmploymentStatus;
  employment_type: EmploymentType | null;
  start_date: string;
  end_date: string | null;
  work_location: string | null;
};

type ProfileRow = {
  id: string;
  role: UserRole;
  display_name: string | null;
  work_email: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  manager_id: string | null;
};

export type EmployeeDirectoryRow = {
  id: string;
  recordId: string;
  displayName: string;
  workEmail: string | null;
  phone: string | null;
  role: UserRole;
  jobTitle: string | null;
  employmentStatus: EmploymentStatus;
  employmentType: EmploymentType | null;
  startDate: string;
  endDate: string | null;
  workLocation: string | null;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
};

export type EmployeeDirectoryFilters = {
  query?: string;
  status?: EmploymentStatus | "all";
  role?: UserRole | "all";
  departmentId?: string | "all";
  // "starters" = start_date within the last 30 days. Used by the dashboard
  // Operational report card to deep-link into a date-scoped directory view.
  recent?: "starters" | null;
};

export type PeopleDirectoryFilters = {
  query?: string;
  // Resolved to department name by the page (the RPC row only exposes
  // department_name, not id). Pass null/undefined for "all".
  departmentName?: string | null;
};

type PeopleDirectoryRpcRow = {
  id: string;
  display_name: string | null;
  job_title: string | null;
  department_name: string | null;
  work_email: string | null;
};

export type PeopleDirectoryRow = {
  id: string;
  displayName: string;
  jobTitle: string | null;
  departmentName: string | null;
  workEmail: string | null;
};

export type EmployeeDetail = EmployeeDirectoryRow & {
  avatarUrl: string | null;
};

// B7 peer view (UAT 2026-05-20). Limited 5-field projection returned by the
// SECURITY DEFINER RPC `get_peer_employee_profile` (migration 0037) for
// employees viewing a colleague's profile when they have neither admin
// scope nor a manager relationship to the subject.
export type PeerEmployeeView = {
  id: string;
  displayName: string;
  workEmail: string | null;
  phone: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
};

type PeerEmployeeRpcRow = {
  id: string;
  display_name: string | null;
  work_email: string | null;
  phone: string | null;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
};

export type DepartmentSummary = {
  id: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  employeeCount: number;
};

export type ManagerOption = {
  id: string;
  label: string;
};

export type EmployeeOption = {
  id: string;
  label: string;
};

export type DepartmentOption = {
  id: string;
  label: string;
  managerId: string | null;
};

export async function getVisibleEmployees(
  filters: EmployeeDirectoryFilters = {},
): Promise<{ employees: EmployeeDirectoryRow[]; error: string | null }> {
  const supabase = await createClient();
  const { data: records, error } = await supabase
    .from("employee_records")
    .select(
      "id, employee_id, department_id, manager_id, job_title, employment_status, employment_type, start_date, end_date, work_location",
    )
    .order("start_date", { ascending: false });

  if (error) {
    return { employees: [], error: safeDalError("employees.getVisibleEmployees", error, "Unable to load employees.") };
  }

  const employees = await hydrateEmployeeRows((records ?? []) as EmployeeRecordRow[]);
  return {
    employees: filterEmployees(employees, filters),
    error: null,
  };
}

export async function getPeopleDirectory(
  filters: PeopleDirectoryFilters = {},
): Promise<{ people: PeopleDirectoryRow[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_people_directory");

  if (error) {
    return {
      people: [],
      error: safeDalError(
        "employees.getPeopleDirectory",
        error,
        "Unable to load people.",
      ),
    };
  }

  const people = ((data ?? []) as PeopleDirectoryRpcRow[]).map((person) => ({
    id: person.id,
    displayName: person.display_name ?? person.work_email ?? "Unassigned",
    jobTitle: person.job_title,
    departmentName: person.department_name,
    workEmail: person.work_email,
  }));

  return {
    people: filterPeopleDirectory(people, filters),
    error: null,
  };
}

export async function getVisibleEmployeeById(
  employeeId: string,
): Promise<{ employee: EmployeeDetail | null; error: string | null }> {
  const supabase = await createClient();
  const { data: record, error } = await supabase
    .from("employee_records")
    .select(
      "id, employee_id, department_id, manager_id, job_title, employment_status, employment_type, start_date, end_date, work_location",
    )
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) {
    return { employee: null, error: safeDalError("employees.getVisibleEmployeeById", error, "Unable to load employee.") };
  }

  if (!record) {
    return { employee: null, error: null };
  }

  const [employee] = await hydrateEmployeeRows([record as EmployeeRecordRow]);

  if (!employee) {
    return { employee: null, error: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", employeeId)
    .maybeSingle();

  return {
    employee: {
      ...employee,
      avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
    },
    error: null,
  };
}

// B7 peer view: limited projection for an employee viewing a colleague's
// profile. Bypasses base-table RLS the same way getPeopleDirectory does
// (RPC is SECURITY DEFINER, projection hard-coded in SQL). Returns null for
// terminated/inactive subjects or non-existent ids.
export async function getPeerEmployeeView(
  subjectId: string,
): Promise<{ employee: PeerEmployeeView | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_peer_employee_profile", {
    p_subject_id: subjectId,
  });

  if (error) {
    return {
      employee: null,
      error: safeDalError(
        "employees.getPeerEmployeeView",
        error,
        "Unable to load profile.",
      ),
    };
  }

  const rows = (data ?? []) as PeerEmployeeRpcRow[];
  const row = rows[0];
  if (!row) {
    return { employee: null, error: null };
  }

  return {
    employee: {
      id: row.id,
      displayName: row.display_name ?? row.work_email ?? "Unassigned",
      workEmail: row.work_email,
      phone: row.phone,
      departmentName: row.department_name,
      managerId: row.manager_id,
      managerName: row.manager_name,
    },
    error: null,
  };
}

export async function getDepartmentSummaries(): Promise<{
  departments: DepartmentSummary[];
  error: string | null;
}> {
  const supabase = await createClient();
  const [
    { data: departments, error: departmentError },
    { data: records, error: recordsError },
  ] = await Promise.all([
    supabase.from("departments").select("id, name, manager_id").order("name"),
    supabase
      .from("employee_records")
      .select("department_id, employment_status")
      .neq("employment_status", "terminated"),
  ]);

  if (departmentError || recordsError) {
    return {
      departments: [],
      error: safeDalError(
        "employees.getDepartmentSummaries",
        departmentError ?? recordsError,
        "Unable to load departments.",
      ),
    };
  }

  const departmentRows = (departments ?? []) as DepartmentRow[];
  const managerIds = uniqueStrings(
    departmentRows.map((department) => department.manager_id),
  );
  const profiles = await getProfilesById(managerIds);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const counts = new Map<string, number>();

  for (const record of records ?? []) {
    const departmentId = record.department_id as string | null;
    if (!departmentId) continue;
    counts.set(departmentId, (counts.get(departmentId) ?? 0) + 1);
  }

  return {
    departments: departmentRows.map((department) => ({
      id: department.id,
      name: department.name,
      managerId: department.manager_id,
      managerName: department.manager_id
        ? displayName(profileById.get(department.manager_id))
        : null,
      employeeCount: counts.get(department.id) ?? 0,
    })),
    error: null,
  };
}

export async function getManagerOptions(): Promise<{
  managers: ManagerOption[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, work_email")
    .in("role", ["admin", "manager"])
    .order("display_name");

  if (error) {
    return { managers: [], error: safeDalError("employees.getManagerOptions", error, "Unable to load manager options.") };
  }

  return {
    managers: ((data ?? []) as ProfileRow[]).map((profile) => ({
      id: profile.id,
      label: displayName(profile),
    })),
    error: null,
  };
}

export async function getAllEmployeeOptions(): Promise<{
  employees: EmployeeOption[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, work_email")
    .order("display_name");

  if (error) {
    return { employees: [], error: safeDalError("employees.getAllEmployeeOptions", error, "Unable to load employee options.") };
  }

  return {
    employees: ((data ?? []) as ProfileRow[]).map((profile) => ({
      id: profile.id,
      label: displayName(profile),
    })),
    error: null,
  };
}

// Upload-picker options for a manager: self + direct reports (matches the scope
// `uploadDocument` enforces — managers upload for themselves or a direct report).
// IDs come from the authoritative `getDirectReportIds`; the admin client fetches
// labels for that known-safe set.
export async function getManagerUploadEmployeeOptions(managerId: string): Promise<{
  employees: EmployeeOption[];
  error: string | null;
}> {
  const reportIds = await getDirectReportIds(managerId);
  const ids = [managerId, ...reportIds];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name, work_email")
    .in("id", ids)
    .order("display_name");

  if (error) {
    return { employees: [], error: safeDalError("employees.getManagerUploadEmployeeOptions", error, "Unable to load employee options.") };
  }

  return {
    employees: ((data ?? []) as ProfileRow[]).map((profile) => ({
      id: profile.id,
      label: displayName(profile),
    })),
    error: null,
  };
}

export async function getDepartmentOptions(): Promise<{
  departments: DepartmentOption[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, manager_id")
    .order("name");

  if (error) {
    return { departments: [], error: safeDalError("employees.getDepartmentOptions", error, "Unable to load departments.") };
  }

  return {
    departments: ((data ?? []) as DepartmentRow[]).map((department) => ({
      id: department.id,
      label: department.name,
      managerId: department.manager_id,
    })),
    error: null,
  };
}

async function hydrateEmployeeRows(
  records: EmployeeRecordRow[],
): Promise<EmployeeDirectoryRow[]> {
  const employeeIds = records.map((record) => record.employee_id);
  const managerIds = records.map((record) => record.manager_id);
  const departmentIds = records.map((record) => record.department_id);

  const [profiles, managers, departments] = await Promise.all([
    getProfilesById(employeeIds),
    getProfilesById(managerIds),
    getDepartmentsById(departmentIds),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const managerById = new Map(managers.map((profile) => [profile.id, profile]));
  const departmentById = new Map(
    departments.map((department) => [department.id, department]),
  );

  return records.flatMap((record) => {
    const profile = profileById.get(record.employee_id);
    if (!profile) return [];

    const department = record.department_id
      ? departmentById.get(record.department_id)
      : null;
    const manager = record.manager_id ? managerById.get(record.manager_id) : null;

    return {
      id: profile.id,
      recordId: record.id,
      displayName: displayName(profile),
      workEmail: profile.work_email,
      phone: profile.phone,
      role: profile.role,
      jobTitle: record.job_title,
      employmentStatus: record.employment_status,
      employmentType: record.employment_type,
      startDate: record.start_date,
      endDate: record.end_date,
      workLocation: record.work_location,
      departmentId: record.department_id,
      departmentName: department?.name ?? null,
      managerId: record.manager_id,
      managerName: manager ? displayName(manager) : null,
    };
  });
}

async function getProfilesById(ids: Array<string | null>): Promise<ProfileRow[]> {
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, work_email, phone, avatar_url")
    .in("id", uniqueIds);

  return (data ?? []) as ProfileRow[];
}

async function getDepartmentsById(
  ids: Array<string | null>,
): Promise<DepartmentRow[]> {
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("departments")
    .select("id, name, manager_id")
    .in("id", uniqueIds);

  return (data ?? []) as DepartmentRow[];
}

// Computes "needs attention" rows for active employees only. Reasons:
//  - no_manager: role=employee with manager_id IS NULL (admins/managers
//    legitimately have no upline; only flag plain employees).
//  - no_department: department_id IS NULL.
//  - no_work_email: profile.work_email IS NULL.
//  - missing_phone | missing_passport | missing_nationality: each is a
//    distinct reason so the admin can tell at a glance which surface fixes
//    it (phone lives on `profiles` and is editable on the employee edit
//    page; passport_number and nationality live on `employee_compensation`,
//    admin-only RLS, and are editable on `/payroll`). This helper uses the
//    admin client and is gated to admin callers (Session 118).
//
// Returns only rows with ≥1 reason. The dashboard count is `.length`.
export async function getEmployeesNeedingAttention(): Promise<{
  rows: EmployeeAttentionRow[];
  error: string | null;
}> {
  const admin = createAdminClient();
  const { data: records, error: recordError } = await admin
    .from("employee_records")
    .select(
      "id, employee_id, department_id, manager_id, job_title, employment_status, employment_type, start_date, end_date, work_location",
    )
    .eq("employment_status", "active");

  if (recordError) {
    return {
      rows: [],
      error: safeDalError(
        "employees.getEmployeesNeedingAttention",
        recordError,
        "Unable to load attention list.",
      ),
    };
  }

  const recordRows = (records ?? []) as EmployeeRecordRow[];
  if (recordRows.length === 0) return { rows: [], error: null };

  const employeeIds = recordRows.map((record) => record.employee_id);
  const managerIds = recordRows.map((record) => record.manager_id);
  const departmentIds = recordRows.map((record) => record.department_id);

  const [profiles, managers, departments, compensationRes] = await Promise.all([
    getProfilesById(employeeIds),
    getProfilesById(managerIds),
    getDepartmentsById(departmentIds),
    admin
      .from("employee_compensation")
      .select("employee_id, passport_number, nationality")
      .in("employee_id", employeeIds),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const managerById = new Map(managers.map((profile) => [profile.id, profile]));
  const departmentById = new Map(
    departments.map((department) => [department.id, department]),
  );
  type CompensationGap = { passport: string | null; nationality: string | null };
  const compensationById = new Map<string, CompensationGap>(
    ((compensationRes.data ?? []) as Array<{
      employee_id: string;
      passport_number: string | null;
      nationality: string | null;
    }>).map((row) => [
      row.employee_id,
      { passport: row.passport_number, nationality: row.nationality },
    ]),
  );

  const rows: EmployeeAttentionRow[] = [];
  for (const record of recordRows) {
    const profile = profileById.get(record.employee_id);
    if (!profile) continue;
    // Admins are not surfaced on the "Needs attention" card — they run the
    // platform and their employee_records row intentionally has no manager /
    // department (UAT new-hire-onboarding B1, 2026-06-01).
    if (profile.role === "admin") continue;

    const reasons: AttentionReason[] = [];
    if (profile.role === "employee" && !record.manager_id)
      reasons.push("no_manager");
    if (!record.department_id) reasons.push("no_department");
    if (!profile.work_email) reasons.push("no_work_email");

    const comp = compensationById.get(record.employee_id);
    if (!profile.phone) reasons.push("missing_phone");
    if (!comp || !comp.passport) reasons.push("missing_passport");
    if (!comp || !comp.nationality) reasons.push("missing_nationality");

    if (reasons.length === 0) continue;

    const department = record.department_id
      ? departmentById.get(record.department_id)
      : null;
    const manager = record.manager_id ? managerById.get(record.manager_id) : null;

    rows.push({
      id: profile.id,
      recordId: record.id,
      displayName: displayName(profile),
      workEmail: profile.work_email,
      phone: profile.phone,
      role: profile.role,
      jobTitle: record.job_title,
      employmentStatus: record.employment_status,
      employmentType: record.employment_type,
      startDate: record.start_date,
      endDate: record.end_date,
      workLocation: record.work_location,
      departmentId: record.department_id,
      departmentName: department?.name ?? null,
      managerId: record.manager_id,
      managerName: manager ? displayName(manager) : null,
      attentionReasons: reasons,
    });
  }

  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { rows, error: null };
}

function filterEmployees(
  employees: EmployeeDirectoryRow[],
  filters: EmployeeDirectoryFilters,
): EmployeeDirectoryRow[] {
  const query = filters.query?.trim().toLowerCase();
  const status = filters.status && filters.status !== "all" ? filters.status : null;
  const role = filters.role && filters.role !== "all" ? filters.role : null;
  const departmentId =
    filters.departmentId && filters.departmentId !== "all"
      ? filters.departmentId
      : null;
  // recent=starters: start_date in the last 30 days (inclusive of today).
  // Mirrors the dashboard "Starters, last 30 days" definition.
  const recentStartersThreshold =
    filters.recent === "starters"
      ? (() => {
          const date = new Date();
          date.setUTCHours(0, 0, 0, 0);
          date.setUTCDate(date.getUTCDate() - 30);
          return date.toISOString().slice(0, 10);
        })()
      : null;

  return employees.filter((employee) => {
    if (status && employee.employmentStatus !== status) return false;
    if (role && employee.role !== role) return false;
    if (departmentId && employee.departmentId !== departmentId) return false;
    if (recentStartersThreshold && employee.startDate < recentStartersThreshold)
      return false;
    if (!query) return true;

    return [
      employee.displayName,
      employee.workEmail,
      employee.jobTitle,
      employee.departmentName,
      employee.managerName,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

function filterPeopleDirectory(
  people: PeopleDirectoryRow[],
  filters: PeopleDirectoryFilters,
): PeopleDirectoryRow[] {
  const query = filters.query?.trim().toLowerCase();
  const departmentName = filters.departmentName?.trim() || null;

  return people.filter((person) => {
    if (departmentName && person.departmentName !== departmentName) return false;
    if (!query) return true;
    return [
      person.displayName,
      person.workEmail,
      person.jobTitle,
      person.departmentName,
    ].some((value) => value?.toLowerCase().includes(query));
  });
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function displayName(profile: ProfileRow | undefined): string {
  return profile?.display_name ?? profile?.work_email ?? "Unassigned";
}
