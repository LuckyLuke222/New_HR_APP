"use client";

import { useActionState, useMemo, useState } from "react";
import { SearchableSelectField } from "@/components/ui/searchable-select";
import { upsertLeaveBalance } from "@/server/actions/leave";
import type { LeaveActionState } from "@/server/actions/leave";
import type { LeaveBalance, LeaveType } from "@/server/dal/leave";
import type { EmployeeOption } from "@/server/dal/employees";

const initial: LeaveActionState = { success: false, message: "" };

export function LeaveBalanceAdminPanel({
  balances,
  types,
  employees,
}: {
  balances: LeaveBalance[];
  types: LeaveType[];
  employees: EmployeeOption[];
}) {
  const [state, action, pending] = useActionState(upsertLeaveBalance, initial);
  const currentYear = new Date().getFullYear();
  // F6 — controlled open state so Server Action revalidation doesn't collapse
  // the panel (see public-holidays-admin-panel.tsx for the same pattern).
  const [open, setOpen] = useState(false);

  // F4: year-tab strip — current year + every year that has at least one
  // balance row. Sorted ascending; current year is the default-active tab.
  const years = useMemo(() => {
    const set = new Set<number>([currentYear]);
    for (const b of balances) set.add(b.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [balances, currentYear]);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const visibleBalances = useMemo(
    () => balances.filter((b) => b.year === selectedYear),
    [balances, selectedYear],
  );

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-md border bg-card text-card-foreground shadow"
    >
      <summary className="cursor-pointer border-b px-4 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="inline text-sm font-semibold text-foreground">
          Leave balances
          <span
            aria-hidden="true"
            className="ml-2 inline-block text-xs text-muted-foreground transition-transform group-open:rotate-90"
          >
            ▸
          </span>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Balances are managed manually in v1. Set or update individual employee
          balances per leave type and year.
        </p>
      </summary>

      {/* Upsert form — placed above the list so admins land on the action first (C5). */}
      <div id="leave-balance-form" className="border-b px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Set or update balance
        </h3>
        <form
          action={action}
          className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_120px_auto] lg:[&>[data-reason]]:col-span-full"
        >
          <SearchableSelectField
            id="lb-employee"
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

          {/* C6: plain dropdown, not a searchable free-text field. */}
          <div>
            <label htmlFor="lb-type" className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Leave type
            </label>
            <select
              id="lb-type"
              name="leaveTypeId"
              defaultValue={state.values?.leaveTypeId ?? ""}
              required
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            >
              <option value="">Select leave type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {state.fieldErrors?.leaveTypeId && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {state.fieldErrors.leaveTypeId[0]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lb-balance" className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Balance (days)
            </label>
            <input
              id="lb-balance"
              type="number"
              name="balance"
              min={0}
              max={365}
              step={0.5}
              required
              defaultValue={state.values?.balance ?? ""}
              placeholder="Days"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            />
            {state.fieldErrors?.balance && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {state.fieldErrors.balance[0]}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lb-year" className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Year
            </label>
            <input
              id="lb-year"
              type="number"
              name="year"
              defaultValue={state.values?.year ?? currentYear}
              min={2020}
              max={2100}
              required
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            />
            {state.fieldErrors?.year && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {state.fieldErrors.year[0]}
              </p>
            )}
          </div>

          {/* Save sits in its own cell with an invisible label-row spacer so
              the button top aligns with the input row of the labelled cells
              beside it (Session 119 alignment fix). aria-hidden because the
              spacer carries no semantic content. */}
          <div>
            <div
              aria-hidden="true"
              className="mb-1 text-xs font-medium uppercase tracking-wide"
            >
              &nbsp;
            </div>
            <button
              id="lb-save"
              type="submit"
              disabled={pending}
              className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "…" : "Save"}
            </button>
          </div>

          {/* Reason for the manual adjustment — required so every saved row
              carries a human-readable provenance line alongside the
              structured adjusted_at / adjusted_by columns. */}
          <div data-reason>
            <label
              htmlFor="lb-reason"
              className="mb-1 block text-xs font-medium uppercase text-muted-foreground"
            >
              Reason for adjustment
            </label>
            <textarea
              id="lb-reason"
              name="reason"
              rows={2}
              required
              minLength={3}
              maxLength={500}
              defaultValue={state.values?.reason ?? ""}
              placeholder="e.g. Imported from BambooHR go-live • Correction after audit • Exceptional grant"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
            />
            {state.fieldErrors?.reason && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {state.fieldErrors.reason[0]}
              </p>
            )}
          </div>
        </form>

        {state.message && (
          <p
            role={state.success ? "status" : "alert"}
            className={`mt-2 text-xs ${state.success ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
      </div>

      {/* Year filter (F4) — native <select> matches the leave-type dropdown
          pattern already in this form (C6, Session 119). Current year is the
          default; the option list is current year + every year that has at
          least one balance row, sorted ascending. */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <label htmlFor="lb-year-filter" className="text-xs font-medium uppercase text-muted-foreground">
          Year
        </label>
        <select
          id="lb-year-filter"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* Existing balances list */}
      {visibleBalances.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Leave type</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Balance (days)</th>
                <th className="px-4 py-3">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {visibleBalances.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3 text-foreground">{b.employeeName}</td>
                  <td className="px-4 py-3 text-foreground">{b.leaveTypeName}</td>
                  <td className="px-4 py-3 text-foreground">{b.year}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {b.balance}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {b.adjustedAt ? (
                      <>
                        <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                          Manually adjusted
                        </span>
                        <p className="mt-1">
                          {b.adjustedByName ?? "Admin"} • {formatAdjustedAt(b.adjustedAt)}
                        </p>
                        {b.adjustmentReason && (
                          <p className="mt-0.5 max-w-xs break-words text-muted-foreground/80">
                            {b.adjustmentReason}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground/70">Auto-seeded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No balances configured for {selectedYear}.
        </p>
      )}
    </details>
  );
}

function formatAdjustedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
