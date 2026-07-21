import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditEmployeeForm } from "@/components/employees/employee-form";
import { AccessDeniedError, requireRole } from "@/lib/supabase/helpers";
import { insertAuditLog } from "@/server/audit";
import {
  getDepartmentOptions,
  getManagerOptions,
  getVisibleEmployeeById,
} from "@/server/dal/employees";

type EditEmployeePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const { id } = await params;
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: `/employees/${id}/edit`,
  });
  // B7 (UAT 2026-05-25): profile edits are admin-only. Managers and
  // employees no longer self-serve display name / phone — those changes
  // route through admin. The "Edit personal details" affordance has
  // been removed from the profile page header; this guard backs it up
  // for anyone who URL-types the edit path.
  if (user.role !== "admin") {
    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "route",
      metadata: {
        attempted_resource: `/employees/${id}/edit`,
        target_employee_id: id,
        role: user.role,
      },
    });
    throw new AccessDeniedError();
  }

  const [
    { employee, error: employeeError },
    { departments, error: departmentsError },
    { managers, error: managersError },
  ] = await Promise.all([
    getVisibleEmployeeById(id),
    getDepartmentOptions(),
    getManagerOptions(),
  ]);
  const error = employeeError ?? departmentsError ?? managersError;

  if (!employee && !error) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/employees/${id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        People profile
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          Edit employee
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update profile, role, manager, department, and job details.
        </p>
      </div>

      {error || !employee ? (
        <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load employee form. {error}
        </div>
      ) : (
        <EditEmployeeForm
          employee={employee}
          departments={departments}
          managers={managers}
        />
      )}
    </div>
  );
}
