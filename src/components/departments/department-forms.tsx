"use client";

import { useActionState, useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  createDepartment,
  deleteDepartment,
  updateDepartment,
  type DepartmentActionState,
} from "@/server/actions/departments";
import type {
  DepartmentSummary,
  ManagerOption,
} from "@/server/dal/employees";

const initialState: DepartmentActionState = {
  success: false,
  message: "",
};

export function CreateDepartmentForm({
  managers,
}: {
  managers: ManagerOption[];
}) {
  const [state, formAction, pending] = useActionState(
    createDepartment,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
      <Field
        name="name"
        label="Department name"
        placeholder="People Operations"
        error={state.fieldErrors?.name?.[0]}
      />
      <ManagerSelect
        name="managerId"
        label="Department manager"
        managers={managers}
        error={state.fieldErrors?.managerId?.[0]}
      />
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full md:w-auto">
          {pending ? "Adding..." : "Add department"}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

export function EditDepartmentForm({
  department,
  managers,
}: {
  department: DepartmentSummary;
  managers: ManagerOption[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(
    updateDepartment,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDepartment,
    initialState,
  );

  return (
    <div className="space-y-3">
      <form
        action={updateAction}
        className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="id" value={department.id} />
        <Field
          name="name"
          label="Department name"
          defaultValue={department.name}
          error={updateState.fieldErrors?.name?.[0]}
        />
        <ManagerSelect
          name="managerId"
          label="Department manager"
          managers={managers}
          defaultValue={department.managerId ?? ""}
          error={updateState.fieldErrors?.managerId?.[0]}
        />
        <div className="flex items-end">
          <Button
            type="submit"
            variant="outline"
            disabled={updatePending}
            className="w-full lg:w-auto"
          >
            {updatePending ? "Saving..." : "Save"}
          </Button>
        </div>
        <ActionMessage state={updateState} />
      </form>

      <form
        action={deleteAction}
        className="space-y-3"
      >
        <input type="hidden" name="id" value={department.id} />
        {confirmDelete && (
          <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Delete {department.name}? Employees must be reassigned first.
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <ActionMessage state={deleteState} />
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={deletePending}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {deletePending ? "Deleting..." : "Confirm delete"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}


function ManagerSelect({
  name,
  label,
  managers,
  error,
  defaultValue = "",
}: {
  name: string;
  label: string;
  managers: ManagerOption[];
  error?: string;
  defaultValue?: string;
}) {
  const errorId = useId();

  return (
    <label className="block">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20"
      >
        <option value="">Unassigned</option>
        {managers.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </label>
  );
}

function ActionMessage({ state }: { state: DepartmentActionState }) {
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
