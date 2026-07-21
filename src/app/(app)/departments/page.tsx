import { Building2 } from "lucide-react";
import {
  CreateDepartmentForm,
  EditDepartmentForm,
} from "@/components/departments/department-forms";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getDepartmentSummaries,
  getManagerOptions,
} from "@/server/dal/employees";

export default async function DepartmentsPage() {
  await requireRole(["admin"], {
    attemptedResource: "/departments",
  });

  const [
    { departments, error: departmentsError },
    { managers, error: managersError },
  ] = await Promise.all([getDepartmentSummaries(), getManagerOptions()]);
  const error = departmentsError ?? managersError;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          Departments
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin-only department structure and manager ownership.
        </p>
      </div>

      <section className="rounded-xl border bg-card text-card-foreground shadow p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Add department
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create departments before assigning employees and reporting lines.
          </p>
        </div>
        <div className="mt-4">
          <CreateDepartmentForm managers={managers} />
        </div>
      </section>

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Department list
          </h2>
        </div>

        {error ? (
          <div className="p-6">
            <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Unable to load departments. {error}
            </div>
          </div>
        ) : departments.length === 0 ? (
          <div className="p-8 text-center">
            <Building2
              aria-hidden="true"
              className="mx-auto size-8 text-muted-foreground/70"
            />
            <h2 className="mt-3 text-sm font-semibold text-foreground">
              No departments yet
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the first department before assigning employees.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Department
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Manager
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Active employees
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {departments.map((department) => (
                  <tr key={department.id} className="hover:bg-muted/40">
                    <td className="px-4 py-4 font-medium text-foreground">
                      {department.name}
                    </td>
                    <td className="px-4 py-4 text-foreground">
                      {department.managerName ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-4 text-foreground">
                      {department.employeeCount}
                    </td>
                    <td className="px-4 py-4">
                      <EditDepartmentForm
                        department={department}
                        managers={managers}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
