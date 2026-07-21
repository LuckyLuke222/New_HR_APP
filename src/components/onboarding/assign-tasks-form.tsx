"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelectField } from "@/components/ui/searchable-select";
import {
  assignTemplateToEmployee,
  addIndividualTask,
  type OnboardingActionState,
} from "@/server/actions/onboarding";
import type { EmployeeOption, OnboardingTemplate } from "@/server/dal/onboarding";

const initial: OnboardingActionState = { success: false, message: "" };

type Props = {
  employees: EmployeeOption[];
  templates: OnboardingTemplate[];
};

export function AssignTasksForm({ employees, templates }: Props) {
  const [mode, setMode] = useState<"template" | "individual">("template");
  const activeTemplates = templates.filter((t) => t.isActive && t.items.length > 0);

  return (
    <div className="rounded-md border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Assign tasks</h3>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            aria-pressed={mode === "template"}
            onClick={() => setMode("template")}
            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
              mode === "template"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            From template
          </button>
          <button
            type="button"
            aria-pressed={mode === "individual"}
            onClick={() => setMode("individual")}
            className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
              mode === "individual"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Individual task
          </button>
        </div>
      </div>

      <div className="p-4">
        {mode === "template" ? (
          <AssignTemplateForm employees={employees} templates={activeTemplates} />
        ) : (
          <AssignIndividualForm employees={employees} />
        )}
      </div>
    </div>
  );
}

function AssignTemplateForm({
  employees,
  templates,
}: {
  employees: EmployeeOption[];
  templates: OnboardingTemplate[];
}) {
  const [state, action, pending] = useActionState(assignTemplateToEmployee, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (employees.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-foreground">No assignable employees</p>
        <p className="mt-1 text-sm text-muted-foreground">There are no employees available for task assignment.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SearchableSelectField
          id="at-employee"
          name="employeeId"
          label="Employee"
          options={employees.map((employee) => ({
            value: employee.id,
            label: employee.label,
          }))}
          defaultValue={state.values?.employeeId ?? ""}
          emptyLabel="Select employee"
          error={state.fieldErrors?.employeeId?.[0]}
          required
        />

        <div>
          <SearchableSelectField
            id="at-template"
            name="templateId"
            label="Template"
            options={templates.map((template) => ({
              value: template.id,
              label: templateLabel(template),
            }))}
            defaultValue={state.values?.templateId ?? ""}
            emptyLabel="Select template"
            error={state.fieldErrors?.templateId?.[0]}
            required
          />
          {templates.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground/70">No active templates with tasks. Create one above.</p>
          )}
        </div>

        <div>
          <label htmlFor="at-due" className="mb-1 block text-sm font-medium text-foreground">
            Due date <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <input
            id="at-due"
            name="dueDate"
            type="date"
            defaultValue={state.values?.dueDate ?? ""}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={pending || templates.length === 0}>
          {pending ? "Assigning…" : "Assign template"}
        </Button>
        {state.message && (
          <p
            role={state.success ? "status" : "alert"}
            className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

function templateLabel(template: OnboardingTemplate): string {
  return `${template.name} (${template.items.length} task${template.items.length === 1 ? "" : "s"})`;
}

function AssignIndividualForm({ employees }: { employees: EmployeeOption[] }) {
  const [state, action, pending] = useActionState(addIndividualTask, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (employees.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-foreground">No assignable employees</p>
        <p className="mt-1 text-sm text-muted-foreground">There are no employees available for task assignment.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.success
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelectField
          id="it-employee"
          name="employeeId"
          label="Employee"
          options={employees.map((employee) => ({
            value: employee.id,
            label: employee.label,
          }))}
          defaultValue={state.values?.employeeId ?? ""}
          emptyLabel="Select employee"
          error={state.fieldErrors?.employeeId?.[0]}
          required
        />

        <div>
          <label htmlFor="it-due" className="mb-1 block text-sm font-medium text-foreground">
            Due date <span className="text-muted-foreground/70">(optional)</span>
          </label>
          <input
            id="it-due"
            name="dueDate"
            type="date"
            defaultValue={state.values?.dueDate ?? ""}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div>
        <label htmlFor="it-title" className="mb-1 block text-sm font-medium text-foreground">
          Task title
        </label>
        <input
          id="it-title"
          name="title"
          type="text"
          defaultValue={state.values?.title ?? ""}
          placeholder="e.g. Complete IT setup form"
          required
          maxLength={200}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
        />
        {state.fieldErrors?.title && (
          <p className="mt-1 text-xs text-destructive">{state.fieldErrors.title[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="it-desc" className="mb-1 block text-sm font-medium text-foreground">
          Description <span className="text-muted-foreground/70">(optional)</span>
        </label>
        <textarea
          id="it-desc"
          name="description"
          rows={2}
          defaultValue={state.values?.description ?? ""}
          placeholder="Additional context or instructions…"
          maxLength={500}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus:outline-none focus:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Assigning…" : "Assign task"}
        </Button>
        {state.message && (
          <p
            role={state.success ? "status" : "alert"}
            className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
