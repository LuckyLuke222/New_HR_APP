import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/server/authz/roles";
import { safeDalError } from "@/server/dal/errors";

export type TaskStatus = "pending" | "completed";

export type TemplateItem = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  sortOrder: number;
};

export type OnboardingTemplate = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  items: TemplateItem[];
};

export type OnboardingTask = {
  id: string;
  employeeId: string;
  employeeName: string;
  templateId: string | null;
  templateName: string | null;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: string | null;
  completionNote: string | null;
  createdAt: string;
};

export type OnboardingProgress = {
  employeeId: string;
  employeeName: string;
  totalTasks: number;
  completedTasks: number;
  firstTaskId: string | null;
};

export type EmployeeOption = {
  id: string;
  label: string;
};

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(): Promise<{
  templates: OnboardingTemplate[];
  error: string | null;
}> {
  const admin = createAdminClient();
  const { data: templateRows, error: tErr } = await admin
    .from("onboarding_templates")
    .select("id, name, description, is_active")
    .order("name");

  if (tErr) return { templates: [], error: safeDalError("onboarding.getTemplates.templates", tErr, "Unable to load onboarding templates.") };

  const ids = (templateRows ?? []).map((t) => t.id as string);
  if (ids.length === 0) {
    return { templates: [], error: null };
  }

  const { data: itemRows, error: iErr } = await admin
    .from("onboarding_template_items")
    .select("id, template_id, title, description, sort_order")
    .in("template_id", ids)
    .order("sort_order");

  if (iErr) return { templates: [], error: safeDalError("onboarding.getTemplates.items", iErr, "Unable to load onboarding templates.") };

  const itemsByTemplate = new Map<string, TemplateItem[]>();
  for (const item of itemRows ?? []) {
    const tid = item.template_id as string;
    if (!itemsByTemplate.has(tid)) itemsByTemplate.set(tid, []);
    itemsByTemplate.get(tid)!.push({
      id: item.id as string,
      templateId: tid,
      title: item.title as string,
      description: item.description as string | null,
      sortOrder: item.sort_order as number,
    });
  }

  return {
    templates: (templateRows ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      description: t.description as string | null,
      isActive: t.is_active as boolean,
      items: itemsByTemplate.get(t.id as string) ?? [],
    })),
    error: null,
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function getMyTasks(employeeId: string): Promise<{
  tasks: OnboardingTask[];
  error: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("onboarding_tasks")
    .select("id, employee_id, template_id, title, description, due_date, status, completed_at, completion_note, created_at")
    .or(`employee_id.eq.${employeeId},assignee_id.eq.${employeeId}`)
    .order("status")
    .order("created_at");

  if (error) return { tasks: [], error: safeDalError("onboarding.getMyTasks", error, "Unable to load onboarding tasks.") };

  return { tasks: await hydrateTasks(data ?? []), error: null };
}

export async function getAllTasks(filterEmployeeIds?: string[]): Promise<{
  tasks: OnboardingTask[];
  error: string | null;
}> {
  const admin = createAdminClient();
  let query = admin
    .from("onboarding_tasks")
    .select("id, employee_id, template_id, title, description, due_date, status, completed_at, completion_note, created_at")
    .order("status")
    .order("created_at");

  if (filterEmployeeIds && filterEmployeeIds.length > 0) {
    query = query.in("employee_id", filterEmployeeIds);
  }

  const { data, error } = await query;
  if (error) return { tasks: [], error: safeDalError("onboarding.getAllTasks", error, "Unable to load onboarding tasks.") };

  return { tasks: await hydrateTasks(data ?? []), error: null };
}

async function hydrateTasks(
  rows: Array<Record<string, unknown>>,
): Promise<OnboardingTask[]> {
  if (rows.length === 0) return [];

  const admin = createAdminClient();

  const employeeIds = unique(rows.map((r) => r.employee_id as string));
  const templateIds = unique(
    rows.map((r) => r.template_id as string | null).filter(Boolean) as string[],
  );

  const [profiles, templates] = await Promise.all([
    fetchProfileNames(admin, employeeIds),
    templateIds.length > 0
      ? admin
          .from("onboarding_templates")
          .select("id, name")
          .in("id", templateIds)
          .then(({ data }) => {
            const m = new Map<string, string>();
            for (const t of data ?? []) m.set(t.id as string, t.name as string);
            return m;
          })
      : Promise.resolve(new Map<string, string>()),
  ]);

  return rows.map((r) => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    employeeName: profiles.get(r.employee_id as string) ?? "Unknown",
    templateId: (r.template_id as string | null) ?? null,
    templateName: r.template_id ? (templates.get(r.template_id as string) ?? null) : null,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    status: r.status as TaskStatus,
    completedAt: (r.completed_at as string | null) ?? null,
    completionNote: (r.completion_note as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function getOnboardingProgress(filterEmployeeIds?: string[]): Promise<{
  progress: OnboardingProgress[];
  error: string | null;
}> {
  const admin = createAdminClient();
  let query = admin
    .from("onboarding_tasks")
    .select("id, employee_id, status")
    .order("status")
    .order("created_at");

  if (filterEmployeeIds && filterEmployeeIds.length > 0) {
    query = query.in("employee_id", filterEmployeeIds);
  }

  const { data, error } = await query;
  if (error) return { progress: [], error: safeDalError("onboarding.getOnboardingProgress", error, "Unable to load onboarding progress.") };

  const grouped: Record<string, { total: number; completed: number; firstTaskId: string | null }> = {};
  for (const row of data ?? []) {
    const id = row.employee_id as string;
    if (!grouped[id]) {
      grouped[id] = {
        total: 0,
        completed: 0,
        firstTaskId: (row.id as string | undefined) ?? null,
      };
    }
    grouped[id].total++;
    if (row.status === "completed") grouped[id].completed++;
  }

  const employeeIds = Object.keys(grouped);
  const profiles = await fetchProfileNames(admin, employeeIds);

  return {
    progress: employeeIds.map((id) => ({
      employeeId: id,
      employeeName: profiles.get(id) ?? "Unknown",
      totalTasks: grouped[id].total,
      completedTasks: grouped[id].completed,
      firstTaskId: grouped[id].firstTaskId,
    })),
    error: null,
  };
}

// ─── Assignable employees (role-aware) ───────────────────────────────────────

export async function getAssignableEmployees(
  role: UserRole,
  managerId: string,
): Promise<{ employees: EmployeeOption[]; error: string | null }> {
  const admin = createAdminClient();

  if (role === "admin") {
    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name, work_email")
      .order("display_name");
    if (error) return { employees: [], error: safeDalError("onboarding.getAssignableEmployees.admin", error, "Unable to load employee options.") };
    return {
      employees: (data ?? []).map((p) => ({
        id: p.id as string,
        label:
          (p.display_name as string | null) ??
          (p.work_email as string | null) ??
          "Unknown",
      })),
      error: null,
    };
  }

  // Manager: only direct reports.
  const { data: records, error: recErr } = await admin
    .from("employee_records")
    .select("employee_id")
    .eq("manager_id", managerId)
    .neq("employment_status", "terminated");

  if (recErr) return { employees: [], error: safeDalError("onboarding.getAssignableEmployees.manager", recErr, "Unable to load employee options.") };

  const ids = (records ?? []).map((r) => r.employee_id as string);
  if (ids.length === 0) return { employees: [], error: null };

  const profiles = await fetchProfileNames(admin, ids);
  return {
    employees: ids.map((id) => ({
      id,
      label: profiles.get(id) ?? "Unknown",
    })),
    error: null,
  };
}

// ─── Direct report ids ────────────────────────────────────────────────────────

export async function getDirectReportIds(managerId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employee_records")
    .select("employee_id")
    .eq("manager_id", managerId)
    .neq("employment_status", "terminated");
  return (data ?? []).map((r) => r.employee_id as string);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
