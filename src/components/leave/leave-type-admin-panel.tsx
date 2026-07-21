"use client";

import { useActionState, useState } from "react";
import { createLeaveType, toggleLeaveType } from "@/server/actions/leave";
import type { LeaveActionState } from "@/server/actions/leave";
import type { LeaveType } from "@/server/dal/leave";

const initial: LeaveActionState = { success: false, message: "" };

export function LeaveTypeAdminPanel({ types }: { types: LeaveType[] }) {
  const [createState, createAction, createPending] = useActionState(
    createLeaveType,
    initial,
  );
  // F6 — controlled open state so Server Action revalidation doesn't collapse
  // the panel (see public-holidays-admin-panel.tsx for the same pattern).
  const [open, setOpen] = useState(false);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-md border bg-card text-card-foreground shadow"
    >
      <summary className="cursor-pointer border-b px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="inline text-sm font-semibold text-foreground">
          Leave types
          <span
            aria-hidden="true"
            className="ml-2 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90"
          >
            ▸
          </span>
        </h2>
      </summary>

      {/* Add form — placed above the list (C5). */}
      <div id="leave-type-form" className="border-b px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Add leave type
        </h3>
        <div>
          <form action={createAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label htmlFor="lt-name" className="sr-only">
                Name
              </label>
              <input
                id="lt-name"
                name="name"
                required
                defaultValue={createState.values?.name ?? ""}
                placeholder="e.g. Compassionate leave"
                maxLength={80}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
              />
              {createState.fieldErrors?.name && (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  {createState.fieldErrors.name[0]}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="lt-description" className="sr-only">
                Description
              </label>
              <input
                id="lt-description"
                name="description"
                defaultValue={createState.values?.description ?? ""}
                placeholder="Description (optional)"
                maxLength={300}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={createPending}
              className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {createPending ? "…" : "Add"}
            </button>
          </form>
          {createState.message && (
            <p
              role={createState.success ? "status" : "alert"}
              className={`mt-2 text-xs ${createState.success ? "text-emerald-700" : "text-destructive"}`}
            >
              {createState.message}
            </p>
          )}
        </div>
      </div>

      {/* Existing types list */}
      {types.length > 0 && (
        <ul className="divide-y divide-border">
          {types.map((t) => (
            <LeaveTypeRow key={t.id} type={t} />
          ))}
        </ul>
      )}
    </details>
  );
}

function LeaveTypeRow({ type }: { type: LeaveType }) {
  const [state, action, pending] = useActionState(toggleLeaveType, {
    success: false,
    message: "",
  });

  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{type.name}</p>
        {type.description && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {type.description}
          </p>
        )}
      </div>
      <span
        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
          type.isActive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border bg-muted text-muted-foreground"
        }`}
      >
        {type.isActive ? "Active" : "Inactive"}
      </span>
      <form action={action}>
        <input type="hidden" name="id" value={type.id} />
        <input type="hidden" name="isActive" value={String(type.isActive)} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-input px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {pending ? "…" : type.isActive ? "Deactivate" : "Activate"}
        </button>
      </form>
      {state.message && !state.success && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </li>
  );
}
