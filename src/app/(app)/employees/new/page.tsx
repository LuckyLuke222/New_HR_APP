import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateEmployeeForm } from "@/components/employees/employee-form";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getDepartmentOptions,
  getManagerOptions,
} from "@/server/dal/employees";

export default async function NewEmployeePage() {
  await requireRole(["admin"], {
    attemptedResource: "/employees/new",
  });
  const [
    { departments, error: departmentsError },
    { managers, error: managersError },
  ] = await Promise.all([getDepartmentOptions(), getManagerOptions()]);
  const error = departmentsError ?? managersError;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/employees"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        People
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          Add employee
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create the Auth account, profile, and job record in one admin workflow.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load form options. {error}
        </div>
      ) : (
        <CreateEmployeeForm departments={departments} managers={managers} />
      )}
    </div>
  );
}
