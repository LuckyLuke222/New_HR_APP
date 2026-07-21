"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitLeaveRequest } from "@/server/actions/leave";
import type { LeaveActionState } from "@/server/actions/leave";
import type { LeaveBalance, LeaveType } from "@/server/dal/leave";

const initial: LeaveActionState = { success: false, message: "" };

const SELECT_CLASS =
  "mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type HolidayProp = { date: string; name: string };

type LeaveRequestFormProps = {
  types: LeaveType[];
  balances: LeaveBalance[];
  balanceError: string | null;
  holidays: HolidayProp[];
};

export function LeaveRequestForm({
  types,
  balances,
  balanceError,
  holidays,
}: LeaveRequestFormProps) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitLeaveRequest, initial);
  // `selectedLeaveTypeId`, `startDate`, `endDate` are controlled via useState and
  // therefore persist across re-renders naturally; the uncontrolled `employeeNote`
  // textarea below reads `state.values?.employeeNote` so it survives a failed submit.
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isHalfDayInput, setIsHalfDayInput] = useState(false);
  const [urgentLocalLeaveOverride, setUrgentLocalLeaveOverride] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => router.push("/leave"), 1200);
      return () => clearTimeout(timer);
    }
  }, [state.success, router]);

  const today = new Date().toISOString().slice(0, 10);
  const effectiveLeaveTypeId =
    selectedLeaveTypeId || state.values?.leaveTypeId || "";
  const effectiveStartDate = startDate || state.values?.startDate || "";
  const effectiveEndDate = endDate || state.values?.endDate || "";
  const urgentLocalLeave =
    urgentLocalLeaveOverride ?? (state.values?.urgentLocalLeave === "on");
  const selectedYear = Number((effectiveStartDate || today).slice(0, 4));
  const selectedBalance = useMemo(
    () =>
      balances.find(
        (balance) =>
          balance.leaveTypeId === effectiveLeaveTypeId &&
          balance.year === selectedYear,
      ) ?? null,
    [balances, effectiveLeaveTypeId, selectedYear],
  );

  // Working-days preview mirrors the SQL trigger logic in migration 0042.
  // Holidays passed in as a prop from the page (read once at render); for
  // current + next year only — long-range submissions are blocked by the
  // year-cap validation in submitLeaveRequest. Same source of truth on both
  // sides; drift risk lives in this match between TS and SQL math.
  const holidayMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const h of holidays) {
      const list = map.get(h.date) ?? [];
      list.push(h.name);
      map.set(h.date, list);
    }
    return map;
  }, [holidays]);

  const isSingleDay =
    Boolean(effectiveStartDate) && effectiveStartDate === effectiveEndDate;
  // Derived: checkbox-input value is only honoured when the range is single-day.
  // Avoids a set-state-in-effect that ESLint flags as an anti-pattern.
  const isHalfDay = isSingleDay && isHalfDayInput;

  const preview = useMemo(() => {
    if (
      !effectiveStartDate ||
      !effectiveEndDate ||
      effectiveEndDate < effectiveStartDate
    ) {
      return null;
    }
    let weekendCount = 0;
    const holidaysHit: Array<{ date: string; name: string }> = [];
    let workingDays = 0;
    const d = new Date(`${effectiveStartDate}T00:00:00Z`);
    const end = new Date(`${effectiveEndDate}T00:00:00Z`);
    while (d.getTime() <= end.getTime()) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) {
        weekendCount += 1;
      } else if (holidayMap.has(iso)) {
        for (const name of holidayMap.get(iso)!) {
          holidaysHit.push({ date: iso, name });
        }
      } else {
        workingDays += 1;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const totalDays = isHalfDay
      ? workingDays === 0
        ? 0
        : 0.5
      : workingDays;
    return { totalDays, workingDays, weekendCount, holidaysHit };
  }, [effectiveStartDate, effectiveEndDate, isHalfDayInput, holidayMap]);

  const selectedLeaveType =
    types.find((type) => type.id === effectiveLeaveTypeId) ?? null;
  const canFlagUrgent = selectedLeaveType?.name === "Local Leave";

  // Hard balance gate at submission (UAT F1 / B1). Single-year only — the
  // form does not split per-year; cross-year requests fall through to the
  // server's authoritative per-year check.
  const isSingleYear =
    Boolean(effectiveStartDate) &&
    Boolean(effectiveEndDate) &&
    effectiveStartDate.slice(0, 4) === effectiveEndDate.slice(0, 4);
  const wouldExceedBalance =
    isSingleYear &&
    selectedBalance !== null &&
    preview !== null &&
    preview.totalDays > 0 &&
    preview.totalDays > selectedBalance.balance;

  return (
    <section className="rounded-xl border bg-card p-6 text-card-foreground shadow">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="leaveTypeId">Leave type</Label>
          <select
            id="leaveTypeId"
            name="leaveTypeId"
            required
            value={effectiveLeaveTypeId}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSelectedLeaveTypeId(nextValue);
              const nextType = types.find((type) => type.id === nextValue);
              if (nextType?.name !== "Local Leave") {
                setUrgentLocalLeaveOverride(false);
              }
            }}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              Select a leave type
            </option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {state.fieldErrors?.leaveTypeId && (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.leaveTypeId[0]}
            </p>
          )}
          <LeaveBalanceHint
            balance={selectedBalance}
            balanceError={balanceError}
            balances={balances}
            hasSelection={Boolean(effectiveLeaveTypeId)}
            requestedDays={preview?.totalDays ?? null}
            year={selectedYear}
            exceedsBalance={wouldExceedBalance}
          />
          {state.fieldErrors?.urgentLocalLeave && (
            <p role="alert" className="text-xs text-destructive">
              {state.fieldErrors.urgentLocalLeave[0]}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="startDate">Start date</Label>
            <Input
              id="startDate"
              type="date"
              name="startDate"
              min={today}
              required
              value={effectiveStartDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            {state.fieldErrors?.startDate && (
              <p role="alert" className="text-xs text-destructive">
                {state.fieldErrors.startDate[0]}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate">End date</Label>
            <Input
              id="endDate"
              type="date"
              name="endDate"
              min={today}
              required
              value={effectiveEndDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
            {state.fieldErrors?.endDate && (
              <p role="alert" className="text-xs text-destructive">
                {state.fieldErrors.endDate[0]}
              </p>
            )}
          </div>
        </div>

        {/* Working-days preview + half-day toggle */}
        {preview && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              preview.totalDays === 0
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-muted bg-muted/40 text-foreground",
            )}
          >
            <p>
              <span className="font-semibold">
                {formatDays(preview.totalDays)}
              </span>{" "}
              {preview.totalDays === 0 ? (
                <>— this range has no working days. Pick a weekday range.</>
              ) : isHalfDay ? (
                <>requested (half day)</>
              ) : (
                <>working days requested</>
              )}
            </p>
            {(preview.weekendCount > 0 || preview.holidaysHit.length > 0) && (
              <p className="mt-1 text-muted-foreground">
                Excluded:{" "}
                {preview.weekendCount > 0 && (
                  <>
                    {preview.weekendCount} weekend day
                    {preview.weekendCount === 1 ? "" : "s"}
                  </>
                )}
                {preview.weekendCount > 0 && preview.holidaysHit.length > 0 && ", "}
                {preview.holidaysHit.length > 0 && (
                  <>
                    {preview.holidaysHit.length} public holiday
                    {preview.holidaysHit.length === 1 ? "" : "s"} (
                    {preview.holidaysHit.map((h) => h.name).join(", ")})
                  </>
                )}
                .
              </p>
            )}
          </div>
        )}

        <div>
          <label
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
              isSingleDay
                ? "border-input has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                : "cursor-not-allowed border-muted bg-muted/40 text-muted-foreground",
            )}
          >
            <input
              type="checkbox"
              name="isHalfDay"
              checked={isHalfDay}
              disabled={!isSingleDay}
              onChange={(event) => setIsHalfDayInput(event.target.checked)}
              className="size-4"
            />
            <span>Half-day request</span>
            {!isSingleDay && (
              <span className="ml-auto text-xs text-muted-foreground">
                Single-day only
              </span>
            )}
          </label>
          {state.fieldErrors?.isHalfDay && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {state.fieldErrors.isHalfDay[0]}
            </p>
          )}
        </div>

        {canFlagUrgent && (
          // Amber semantic surface intentional — flagging Local Leave as
          // urgent has higher consequence; the warning color is the
          // visual signal.
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
            <label className="flex items-start gap-2 text-sm font-medium text-amber-950">
              <input
                type="checkbox"
                name="urgentLocalLeave"
                checked={urgentLocalLeave}
                onChange={(event) =>
                  setUrgentLocalLeaveOverride(event.target.checked)
                }
                className="mt-0.5 size-4 rounded border-amber-300 text-primary focus:ring-ring"
              />
              <span>Flag as urgent Local Leave</span>
            </label>
            {urgentLocalLeave && (
              <div className="mt-3 space-y-1.5">
                <Label
                  htmlFor="urgentLeaveReason"
                  className="text-amber-950"
                >
                  Urgent reason
                </Label>
                <Textarea
                  id="urgentLeaveReason"
                  name="urgentLeaveReason"
                  rows={3}
                  required
                  maxLength={500}
                  defaultValue={state.values?.urgentLeaveReason ?? ""}
                  className="bg-card"
                />
                {state.fieldErrors?.urgentLeaveReason && (
                  <p role="alert" className="text-xs text-destructive">
                    {state.fieldErrors.urgentLeaveReason[0]}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="employeeNote">
            Note{" "}
            <span className="font-normal text-muted-foreground/70">(optional)</span>
          </Label>
          <Textarea
            id="employeeNote"
            name="employeeNote"
            rows={3}
            maxLength={500}
            defaultValue={state.values?.employeeNote ?? ""}
            placeholder="Any context for your manager or admin…"
          />
        </div>

        {state.message && (
          <p
            role="alert"
            className={cn(
              "text-sm",
              state.success ? "text-emerald-700" : "text-destructive",
            )}
          >
            {state.message}
          </p>
        )}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={pending || wouldExceedBalance}
            title={
              wouldExceedBalance
                ? "Requested days exceed your balance"
                : undefined
            }
          >
            {pending ? "Submitting…" : "Submit request"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/leave">Cancel</Link>
          </Button>
        </div>
      </form>
    </section>
  );
}

function LeaveBalanceHint({
  balance,
  balanceError,
  balances,
  hasSelection,
  requestedDays,
  year,
  exceedsBalance,
}: {
  balance: LeaveBalance | null;
  balanceError: string | null;
  balances: LeaveBalance[];
  hasSelection: boolean;
  requestedDays: number | null;
  year: number;
  exceedsBalance: boolean;
}) {
  if (balanceError) {
    return (
      <Alert variant="destructive" className="mt-2">
        <AlertDescription>
          Unable to load balance context. {balanceError}
        </AlertDescription>
      </Alert>
    );
  }

  if (!hasSelection) {
    const currentBalances = balances.filter((balance) => balance.year === year);
    if (currentBalances.length > 0) {
      return (
        <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-foreground">
          <p className="font-medium">Available {year} balances</p>
          <ul className="mt-1 space-y-0.5">
            {currentBalances.map((balance) => (
              <li key={balance.id}>
                {balance.leaveTypeName}: {formatDays(balance.balance)}
              </li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Select a leave type to see your available balance.
      </p>
    );
  }

  if (!balance) {
    return (
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No {year} balance exists for this leave type. Contact HR before submitting.
      </p>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "mt-2 rounded-md border px-3 py-2 text-xs",
        exceedsBalance
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "bg-muted/40 text-foreground",
      )}
    >
      {balance.year} balance:{" "}
      <span className="font-semibold">
        {formatDays(balance.balance)} available
      </span>
      {requestedDays ? <>; {formatDays(requestedDays)} requested.</> : "."}
      {exceedsBalance && (
        <span className="mt-1 block font-medium">
          Requested days exceed your {balance.year} balance — adjust the dates
          or shorten the request.
        </span>
      )}
    </p>
  );
}

function formatDays(days: number): string {
  // Working-days math admits fractional values (half-day = 0.5).
  const formatted =
    Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${days === 1 ? "day" : "days"}`;
}
