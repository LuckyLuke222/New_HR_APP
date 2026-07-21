"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SearchableSelectField } from "@/components/ui/searchable-select";
import { SelectField } from "@/components/ui/select-field";
import {
  createEmployee,
  updateEmployee,
  type EmployeeActionState,
} from "@/server/actions/employees";
import type {
  DepartmentOption,
  EmployeeDetail,
  ManagerOption,
} from "@/server/dal/employees";

const initialState: EmployeeActionState = {
  success: false,
  message: "",
};

const roleOptions = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "terminated", label: "Terminated" },
];

const employmentTypeOptions = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contractor", label: "Contractor" },
  { value: "intern", label: "Intern" },
];

type EmployeeFormProps = {
  departments: DepartmentOption[];
  managers: ManagerOption[];
  employee?: EmployeeDetail;
};

export function CreateEmployeeForm({
  departments,
  managers,
}: EmployeeFormProps) {
  const [state, formAction, pending] = useActionState(
    createEmployee,
    initialState,
  );

  return (
    <EmployeeFormShell
      action={formAction}
      state={state}
      pending={pending}
      departments={departments}
      managers={managers}
      submitLabel="Create employee"
      pendingLabel="Creating..."
      includeAccountFields
    />
  );
}

export function EditEmployeeForm({
  departments,
  managers,
  employee,
}: EmployeeFormProps) {
  const [state, formAction, pending] = useActionState(
    updateEmployee,
    initialState,
  );

  if (!employee) return null;

  return (
    <EmployeeFormShell
      action={formAction}
      state={state}
      pending={pending}
      departments={departments}
      managers={managers.filter((manager) => manager.id !== employee.id)}
      employee={employee}
      submitLabel="Save changes"
      pendingLabel="Saving..."
      preserveFormAfterSubmit
    />
  );
}

function EmployeeFormShell({
  action,
  state,
  pending,
  departments,
  managers,
  employee,
  submitLabel,
  pendingLabel,
  includeAccountFields = false,
  preserveFormAfterSubmit = false,
}: EmployeeFormProps & {
  action: (payload: FormData) => void;
  state: EmployeeActionState;
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  includeAccountFields?: boolean;
  preserveFormAfterSubmit?: boolean;
}) {
  const submitted = state.values;
  // E1: when the department changes, prefill the manager field with that
  // department's manager (but always overridable). Implemented by tracking
  // the dept selection in client state and re-keying the manager
  // SearchableSelectField so its internal state is reset to the new default.
  const departmentManagerMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const d of departments) map.set(d.id, d.managerId);
    return map;
  }, [departments]);
  const initialDeptId = submitted?.departmentId ?? employee?.departmentId ?? "";
  const initialManagerId =
    submitted?.managerId ??
    employee?.managerId ??
    (initialDeptId ? departmentManagerMap.get(initialDeptId) ?? "" : "");
  const [prefilledManagerId, setPrefilledManagerId] = useState<string>(initialManagerId);

  // A1: Status + End date are controlled by one client owner, then synced from
  // the Server Action's canonical saved echo after submit. Do not resync this
  // pair from `employee` after save: under useActionState + revalidatePath that
  // prop can still be stale for the in-place post-save render.
  const initialStatus =
    submitted?.employmentStatus ?? employee?.employmentStatus ?? "active";
  const initialEndDate = submitted?.endDate ?? employee?.endDate ?? "";
  const [employmentStatus, setEmploymentStatus] = useState<string>(initialStatus);
  const [endDate, setEndDate] = useState<string>(initialEndDate);

  // Intentional setState-in-effect: prop->state reconciliation, syncing local fields
  // from the server-action `submitted` result after a save.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (submitted?.employmentStatus !== undefined) {
      setEmploymentStatus(submitted.employmentStatus);
    }
    if (submitted?.endDate !== undefined) {
      setEndDate(submitted.endDate);
    }
  }, [submitted?.employmentStatus, submitted?.endDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setEmploymentStatus(next);
    if (next === "terminated") {
      if (!endDate) {
        setEndDate(new Date().toISOString().slice(0, 10));
      }
    } else if (next === "active") {
      setEndDate("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!preserveFormAfterSubmit) return;
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      action(formData);
    });
  };

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-6">
      {employee && (
        <>
          <input type="hidden" name="id" value={employee.id} />
          <input type="hidden" name="recordId" value={employee.recordId} />
        </>
      )}

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <SectionHeader title="Profile" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field
            name="displayName"
            label="Full name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={submitted?.displayName ?? employee?.displayName}
            error={state.fieldErrors?.displayName?.[0]}
          />
          <Field
            name="workEmail"
            label="Work email"
            type="email"
            required={includeAccountFields}
            defaultValue={submitted?.workEmail ?? employee?.workEmail ?? ""}
            disabled={!includeAccountFields}
            error={state.fieldErrors?.workEmail?.[0]}
          />
          <Field
            name="phone"
            label="Phone"
            defaultValue={submitted?.phone ?? employee?.phone ?? "+230 "}
            error={state.fieldErrors?.phone?.[0]}
            description="Defaults to +230 (Mauritius). Replace the prefix if entering another country code."
          />
          <SelectField
            name="role"
            label="Role"
            options={roleOptions}
            defaultValue={submitted?.role ?? employee?.role ?? "employee"}
            error={state.fieldErrors?.role?.[0]}
          />
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground md:col-span-2">
            Role controls app permissions. Use Manager only for people who should
            approve direct-report workflows; keep the job title aligned so the
            profile is easy to review.
          </div>
          {includeAccountFields && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground md:col-span-2">
              A random password is generated server-side and is not shown.
              Generate a password reset link before the employee signs in.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <SectionHeader title="Job" />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field
            name="jobTitle"
            label="Job title"
            required
            maxLength={120}
            defaultValue={submitted?.jobTitle ?? employee?.jobTitle ?? ""}
            error={state.fieldErrors?.jobTitle?.[0]}
          />
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground md:col-span-2">
            Job title is HR profile text. It does not grant access by itself;
            access changes only when the Role field changes.
          </div>
          <SelectField
            name="employmentStatus"
            label="Employment status"
            options={statusOptions}
            value={employmentStatus}
            onChange={handleStatusChange}
            error={state.fieldErrors?.employmentStatus?.[0]}
          />
          <SelectField
            name="employmentType"
            label="Employment type"
            options={employmentTypeOptions}
            defaultValue={
              submitted?.employmentType ?? employee?.employmentType ?? "full_time"
            }
            error={state.fieldErrors?.employmentType?.[0]}
          />
          <Field
            name="startDate"
            label="Start date"
            type="date"
            required
            defaultValue={
              submitted?.startDate ??
              employee?.startDate ??
              new Date().toISOString().slice(0, 10)
            }
            error={state.fieldErrors?.startDate?.[0]}
          />
          <Field
            name="endDate"
            label="End date"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            error={state.fieldErrors?.endDate?.[0]}
          />
          <Field
            name="workLocation"
            label="Work location"
            defaultValue={
              submitted?.workLocation ?? employee?.workLocation ?? "Mauritius"
            }
            error={state.fieldErrors?.workLocation?.[0]}
            description="Defaults to Mauritius for new hires. Change if the role is based elsewhere."
          />
          <SearchableSelectField
            name="departmentId"
            label="Department"
            options={departments.map((department) => ({
              value: department.id,
              label: department.label,
            }))}
            defaultValue={initialDeptId}
            emptyLabel="Unassigned"
            error={state.fieldErrors?.departmentId?.[0]}
            onValueChange={(value) => {
              setPrefilledManagerId(
                value ? departmentManagerMap.get(value) ?? "" : "",
              );
            }}
          />
          <SearchableSelectField
            // Re-key on prefill change so the SearchableSelectField's internal
            // state resets to the new manager. Admin can still type/pick a
            // different manager after the prefill lands.
            key={`manager-${prefilledManagerId}`}
            name="managerId"
            label="Manager"
            options={managers.map((manager) => ({
              value: manager.id,
              label: manager.label,
            }))}
            defaultValue={prefilledManagerId}
            emptyLabel="Unassigned"
            error={state.fieldErrors?.managerId?.[0]}
            hint="Prefilled from the selected department's manager. You can override it."
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function ActionMessage({ state }: { state: EmployeeActionState }) {
  if (!state.message) return null;

  return (
    <p
      role={state.success ? "status" : "alert"}
      aria-live={state.success ? "polite" : "assertive"}
      className={`text-sm ${
        state.success ? "text-emerald-700" : "text-destructive"
      }`}
    >
      {state.message}
    </p>
  );
}
