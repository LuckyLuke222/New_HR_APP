import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatDateCompact } from "@/lib/format";
import { requireRole } from "@/lib/supabase/helpers";
import { USER_ROLES, type UserRole } from "@/server/authz/roles";
import {
  getDepartmentOptions,
  getEmployeesNeedingAttention,
  getPeopleDirectory,
  getVisibleEmployees,
  type AttentionReason,
  type EmploymentStatus,
  type EmployeeAttentionRow,
  type EmployeeDirectoryRow,
  type PeopleDirectoryRow,
} from "@/server/dal/employees";

type EmployeesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    role?: string;
    departmentId?: string;
    recent?: string;
    attention?: string;
    scope?: string;
  }>;
};

type ManagerScope = "direct-reports" | "all-staff";

const ATTENTION_LABELS: Record<AttentionReason, string> = {
  no_manager: "No manager",
  no_department: "No department",
  no_work_email: "No work email",
  missing_phone: "Missing phone",
  missing_passport: "Missing passport",
  missing_nationality: "Missing nationality",
};

const statusOptions: Array<{ value: EmploymentStatus | "all"; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "terminated", label: "Terminated" },
  { value: "all", label: "All statuses" },
];

const roleOptions: Array<{ value: UserRole | "all"; label: string }> = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
];

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/employees",
  });
  const params = await searchParams;
  const isEmployeeViewer = user.role === "employee";
  // B2 (UAT new-hire-onboarding, 2026-06-01): managers default to a
  // direct-reports-only view and can widen to the employee-style limited
  // projection via a "View all staff" link. Param ignored for other roles.
  const managerScope: ManagerScope =
    user.role === "manager" && params.scope === "all-staff"
      ? "all-staff"
      : "direct-reports";
  const isManagerAllStaff = user.role === "manager" && managerScope === "all-staff";
  const useLimitedProjection = isEmployeeViewer || isManagerAllStaff;
  const recent = params.recent === "starters" ? "starters" : null;
  // D3 (Batch 5): admin-only drilldown from the "Needs attention" card.
  // Non-admin requests with ?attention=1 are silently dropped (they keep
  // the standard directory). Avoids leaking the existence of the flag.
  const attentionMode = user.role === "admin" && params.attention === "1";
  // D1: default status = Active. The `recent=starters` preset implies an
  // active-status drilldown, so we keep the default in that path too.
  const status = parseStatus(params.status);
  const role = parseRole(params.role);
  const departmentIdFilter =
    typeof params.departmentId === "string" && params.departmentId !== "all"
      ? params.departmentId
      : "all";

  const { departments } = await getDepartmentOptions();
  const selectedDepartment =
    departmentIdFilter !== "all"
      ? departments.find((department) => department.id === departmentIdFilter)
      : undefined;

  let employeeRows: EmployeeDirectoryRow[] = [];
  let peopleRows: PeopleDirectoryRow[] = [];
  let attentionRows: EmployeeAttentionRow[] = [];
  let error: string | null = null;

  if (attentionMode) {
    const result = await getEmployeesNeedingAttention();
    attentionRows = result.rows;
    error = result.error;
  } else if (useLimitedProjection) {
    const result = await getPeopleDirectory({
      query: params.q,
      departmentName: selectedDepartment?.label ?? null,
    });
    peopleRows = result.people;
    error = result.error;
  } else {
    const result = await getVisibleEmployees({
      query: params.q,
      status,
      role,
      departmentId: departmentIdFilter,
      recent,
    });
    employeeRows = result.employees;
    error = result.error;
  }

  const rowCount = attentionMode
    ? attentionRows.length
    : useLimitedProjection
      ? peopleRows.length
      : employeeRows.length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            People Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {getScopeCopy(user.role)}
          </p>
        </div>

        {user.role === "admin" && (
          <Button asChild>
            <Link href="/employees/new">
              <UserPlus aria-hidden="true" className="size-4" />
              Add employee
            </Link>
          </Button>
        )}
      </div>

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        {attentionMode && (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            Showing active employees with at least one data-quality flag (no
            manager, no department, no work email, or missing phone /
            passport / nationality).{" "}
            <Link href="/employees" className="underline">
              Clear preset
            </Link>
          </div>
        )}
        {!attentionMode && (
        <form
          action="/employees"
          className={cn(
            "grid gap-3 border-b p-4",
            useLimitedProjection
              ? "md:grid-cols-[1fr_220px_auto]"
              : "md:grid-cols-[1fr_160px_160px_220px_auto]",
          )}
        >
          {recent === "starters" && (
            <input type="hidden" name="recent" value="starters" />
          )}
          {isManagerAllStaff && (
            <input type="hidden" name="scope" value="all-staff" />
          )}
          <label className="relative block">
            <span className="sr-only">Search people</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder={
                useLimitedProjection
                  ? "Search name, email, job title, team"
                  : "Search name, email, role, team"
              }
              className="pl-9"
            />
          </label>

          {!useLimitedProjection && (
            <>
              <label>
                <span className="sr-only">Filter by employment status</span>
                <select name="status" defaultValue={status} className={SELECT_CLASS}>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by role</span>
                <select name="role" defaultValue={role} className={SELECT_CLASS}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            <span className="sr-only">Filter by department</span>
            <select
              name="departmentId"
              defaultValue={departmentIdFilter}
              className={SELECT_CLASS}
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.label}
                </option>
              ))}
            </select>
          </label>

          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
        )}

        {recent === "starters" && !isEmployeeViewer && !attentionMode && (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            Showing people who started in the last 30 days.{" "}
            <Link href="/employees" className="underline">
              Clear preset
            </Link>
          </div>
        )}

        {user.role === "manager" && !attentionMode && (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            {isManagerAllStaff ? (
              <>
                Showing all active staff with limited details.{" "}
                <Link href="/employees" className="underline">
                  Show only my direct reports
                </Link>
              </>
            ) : (
              <>
                Showing your active direct reports.{" "}
                <Link href="/employees?scope=all-staff" className="underline">
                  View all staff
                </Link>
              </>
            )}
          </div>
        )}

        {error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>Unable to load people. {error}</AlertDescription>
            </Alert>
          </div>
        ) : rowCount === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-sm font-semibold">
              {attentionMode ? "Nothing to review" : "No people found"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {attentionMode
                ? "All active employees have a manager, department, work email, and complete identity fields."
                : "Try a different search or status filter."}
            </p>
          </div>
        ) : attentionMode ? (
          <AttentionTable rows={attentionRows} />
        ) : useLimitedProjection ? (
          <PeopleTable people={peopleRows} />
        ) : (
          <EmployeeTable employees={employeeRows} />
        )}
      </section>
    </div>
  );
}

function EmployeeTable({ employees }: { employees: EmployeeDirectoryRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">
              Name
            </th>
            <th scope="col" className="px-4 py-3">
              Department
            </th>
            <th scope="col" className="px-4 py-3">
              Manager
            </th>
            <th scope="col" className="px-4 py-3">
              Role
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="px-4 py-3">
              Start date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {employees.map((employee) => (
            <tr key={employee.id} className="hover:bg-muted/40">
              <td className="px-4 py-4">
                <Link
                  href={`/employees/${employee.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {employee.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {employee.jobTitle ?? "No job title"} ·{" "}
                  {employee.workEmail ?? "No work email"}
                </p>
              </td>
              <td className="px-4 py-4 text-foreground">
                {employee.departmentName ?? "Unassigned"}
              </td>
              <td className="px-4 py-4 text-foreground">
                {employee.managerName ?? "Unassigned"}
              </td>
              <td className="px-4 py-4 text-foreground capitalize">
                {employee.role}
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={employee.employmentStatus} />
              </td>
              <td className="px-4 py-4 tabular-nums text-foreground">
                {formatDateCompact(employee.startDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttentionTable({ rows }: { rows: EmployeeAttentionRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Name</th>
            <th scope="col" className="px-4 py-3">Department</th>
            <th scope="col" className="px-4 py-3">Manager</th>
            <th scope="col" className="px-4 py-3">Role</th>
            <th scope="col" className="px-4 py-3">Reasons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/40">
              <td className="px-4 py-4">
                <Link
                  href={`/employees/${row.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {row.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.jobTitle ?? "No job title"} ·{" "}
                  {row.workEmail ?? "No work email"}
                </p>
              </td>
              <td className="px-4 py-4 text-foreground">
                {row.departmentName ?? "Unassigned"}
              </td>
              <td className="px-4 py-4 text-foreground">
                {row.managerName ?? "Unassigned"}
              </td>
              <td className="px-4 py-4 text-foreground capitalize">
                {row.role}
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1">
                  {row.attentionReasons.map((reason) => (
                    <Badge
                      key={reason}
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
                    >
                      {ATTENTION_LABELS[reason]}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeopleTable({ people }: { people: PeopleDirectoryRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">
              Name
            </th>
            <th scope="col" className="px-4 py-3">
              Department
            </th>
            <th scope="col" className="px-4 py-3">
              Work email
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {people.map((person) => (
            <tr key={person.id} className="hover:bg-muted/40">
              <td className="px-4 py-4">
                <Link
                  href={`/employees/${person.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {person.displayName}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {person.jobTitle ?? "No job title"}
                </p>
              </td>
              <td className="px-4 py-4 text-foreground">
                {person.departmentName ?? "Unassigned"}
              </td>
              <td className="px-4 py-4 text-foreground">
                {person.workEmail ?? "Not set"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: EmploymentStatus }) {
  // Semantic accent colors retained (active=emerald, inactive=amber,
  // terminated=muted) — shadcn `Badge` variants give us default/
  // secondary/destructive/outline but not these specific semantic
  // shades, so we pass custom classes alongside the outline base.
  const className =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
      : status === "inactive"
        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50"
        : "border-border bg-muted text-foreground hover:bg-muted";

  return (
    <Badge variant="outline" className={cn("capitalize", className)}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function parseStatus(value: string | undefined): EmploymentStatus | "all" {
  if (value === "active" || value === "inactive" || value === "terminated") {
    return value;
  }
  if (value === "all") return "all";
  // D1 (Batch 4): default to Active when no status param is present —
  // admins/managers see the live roster first.
  return "active";
}

function parseRole(value: string | undefined): UserRole | "all" {
  if (value && (USER_ROLES as readonly string[]).includes(value)) {
    return value as UserRole;
  }
  return "all";
}

function getScopeCopy(role: "admin" | "manager" | "employee"): string {
  if (role === "admin") return "Company people directory with admin-only controls.";
  if (role === "manager") return "Your profile and active direct reports.";
  return "Searchable colleague directory with limited work details.";
}
