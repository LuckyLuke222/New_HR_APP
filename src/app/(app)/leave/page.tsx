import Link from "next/link";
import { CalendarPlus, Settings } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getLeaveRequests,
  getMyLeaveBalances,
  getPublicHolidays,
  getWhoIsOut,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveBalance,
} from "@/server/dal/leave";
import { LeaveDecisionForm } from "@/components/leave/leave-decision-form";
import { CancelLeaveForm } from "@/components/leave/cancel-leave-form";

type LeavePageProps = {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    employeeId?: string;
  }>;
};

const STATUS_OPTIONS: Array<{ value: LeaveStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function LeavePage({ searchParams }: LeavePageProps) {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/leave",
  });
  const params = await searchParams;
  const status = parseStatus(params.status);
  const from = params.from ?? "";
  const to = params.to ?? "";
  const employeeId = params.employeeId ?? "";

  const nowDate = new Date();
  const today = nowDate.toISOString().slice(0, 10);
  const weekEndDate = new Date(nowDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const [
    { requests, error: requestsError },
    { requests: whoIsOut, error: whoIsOutError },
  ] = await Promise.all([
    getLeaveRequests({
      status,
      from: from || undefined,
      to: to || undefined,
      employeeId: employeeId || undefined,
    }),
    user.role !== "employee"
      ? getWhoIsOut(today, weekEnd)
      : Promise.resolve({ requests: [], error: null }),
  ]);

  const isApprover = user.role === "admin" || user.role === "manager";
  const currentYear = new Date().getFullYear();
  const balanceYears = unique([
    currentYear,
    ...requests.flatMap((request) => requestYears(request)),
  ]);
  const minYear = Math.min(...balanceYears);
  const maxYear = Math.max(...balanceYears);
  const [{ balances }, { holidays }] = await Promise.all([
    getMyLeaveBalances(balanceYears),
    getPublicHolidays({ fromYear: minYear, toYear: maxYear }),
  ]);
  const holidayDates = new Set(holidays.map((h) => h.date));
  // "Your <year> balances" cards must show only the current year for the
  // signed-in user. Historical years are excluded from the live module and
  // belong in the planned reporting module. `balances` (unfiltered) is still
  // available below for approver-side cross-year context.
  const myBalances = balances.filter(
    (b) =>
      b.employeeId === user.id &&
      b.year === currentYear &&
      b.leaveTypeIsActive,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">
            Leave
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.role === "admin"
              ? "All leave requests across the company."
              : user.role === "manager"
                ? "Your leave and your direct reports' requests."
                : "Your leave requests and balances."}
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-start gap-2">
          {user.role === "admin" && (
            <Button asChild variant="outline">
              <Link href="/leave/admin">
                <Settings aria-hidden="true" className="size-4" />
                Leave admin
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/leave/new">
              <CalendarPlus aria-hidden="true" className="size-4" />
              Request leave
            </Link>
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      <section aria-label="Your leave balances">
        <h2 className="mb-3 text-sm font-semibold">
          Your {currentYear} balances
        </h2>
        {myBalances.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {myBalances.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border bg-card p-4 text-card-foreground shadow"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {b.leaveTypeName}
                </p>
                <p className="mt-1 text-3xl font-semibold">
                  {Number.isInteger(b.balance)
                    ? b.balance
                    : b.balance.toFixed(1).replace(/\.0$/, "")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/70">days remaining</p>
                {b.adjustedAt && (
                  <Badge
                    variant="outline"
                    className="mt-2 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50"
                  >
                    Manually adjusted
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No active leave types assigned. Contact your admin if this seems wrong.
          </p>
        )}
      </section>

      {/* Who's out this week — managers and admins only */}
      {isApprover && !whoIsOutError && whoIsOut.length > 0 && (
        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Out this week
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {whoIsOut.map((r) => {
              const content = (
                <>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">
                    {r.employeeName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </span>
                  <span className="text-xs text-muted-foreground/70">{r.leaveTypeName}</span>
                </>
              );
              return (
                <li key={r.id}>
                  <Link
                    href={leaveEmployeeDrilldownHref(r.employeeId, r.id, nowDate, weekEnd)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                    aria-label={`View leave requests for ${r.employeeName}`}
                  >
                    {content}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Requests table */}
      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <form
          action="/leave"
          className="grid gap-3 border-b p-4 sm:grid-cols-2 md:grid-cols-[1fr_160px_160px_auto]"
        >
          <div>
            <label htmlFor="status" className="sr-only">
              Filter by status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
          </div>
          <div>
            <label htmlFor="from" className="sr-only">
              From date
            </label>
            <Input id="from" type="date" name="from" defaultValue={from} />
          </div>
          <div>
            <label htmlFor="to" className="sr-only">
              To date
            </label>
            <Input id="to" type="date" name="to" defaultValue={to} />
          </div>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>

        {requestsError ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>Unable to load requests. {requestsError}</AlertDescription>
            </Alert>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center">
            <h2 className="text-sm font-semibold">
              No leave requests found
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different filter or submit a new request.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  {user.role !== "employee" && (
                    <th scope="col" className="px-4 py-3">
                      Employee
                    </th>
                  )}
                  <th scope="col" className="px-4 py-3">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Dates
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {requests.map((req) => (
                  <LeaveRow
                    key={req.id}
                    request={req}
                    currentUserId={user.id}
                    currentUserRole={user.role}
                    isApprover={isApprover}
                    showEmployee={user.role !== "employee"}
                    balances={balances}
                    holidayDates={holidayDates}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}

function LeaveRow({
  request,
  currentUserId,
  currentUserRole,
  isApprover,
  showEmployee,
  balances,
  holidayDates,
}: {
  request: LeaveRequest;
  currentUserId: string;
  currentUserRole: "admin" | "manager" | "employee";
  isApprover: boolean;
  showEmployee: boolean;
  balances: LeaveBalance[];
  holidayDates: Set<string>;
}) {
  const isOwn = request.employeeId === currentUserId;
  const canApprove = isApprover && request.status === "pending" && !isOwn;
  // Allow cancel of pending OR approved. The refund trigger (migration 0042)
  // auto-refunds approved cancellations. Admins can cancel anyone's;
  // employees/managers can only cancel their own.
  const canCancel =
    (isOwn || currentUserRole === "admin") &&
    (request.status === "pending" || request.status === "approved");
  const balanceContext = leaveBalanceContext(request, balances, holidayDates);

  return (
    <tr
      id={`leave-request-${request.id}`}
      className="scroll-mt-24 align-top target:bg-amber-50 hover:bg-muted/40"
    >
      {showEmployee && (
        <td className="px-4 py-4 font-medium text-foreground">
          <Link
            href={`/employees/${request.employeeId}`}
            className="text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {request.employeeName}
          </Link>
        </td>
      )}
      <td className="px-4 py-4 text-foreground">{request.leaveTypeName}</td>
      <td className="px-4 py-4 text-foreground">
        {formatDate(request.startDate)}
        {request.endDate !== request.startDate && (
          <> – {formatDate(request.endDate)}</>
        )}
        {request.isHalfDay && (
          <span className="ml-2 rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
            Half day
          </span>
        )}
        {request.deductedDays !== null && request.status === "approved" && (
          <p className="mt-1 text-xs text-muted-foreground/70">
            {formatDays(request.deductedDays)} deducted
          </p>
        )}
        {request.employeeNote && (
          <p className="mt-1 text-xs text-muted-foreground/70 max-w-xs truncate">
            {request.employeeNote}
          </p>
        )}
        {request.isUrgentLocalLeave && (
          <div className="mt-2 max-w-xs rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <p className="font-medium">Urgent Local Leave</p>
            {request.urgentLeaveReason && (
              <p className="mt-0.5 break-words">
                {request.urgentLeaveReason}
              </p>
            )}
          </div>
        )}
        {canApprove && (
          <p className={cn(
            "mt-2 text-xs",
            balanceContext.isWarning ? "text-amber-700" : "text-muted-foreground",
          )}>
            {balanceContext.text}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={request.status} />
        {request.approverNote && (
          <p className="mt-1 text-xs text-muted-foreground/70 max-w-xs truncate">
            {request.approverNote}
          </p>
        )}
      </td>
      <td className="px-4 py-4">
        {canApprove && (
          <LeaveDecisionForm requestId={request.id} />
        )}
        {canCancel && (
          <CancelLeaveForm
            requestId={request.id}
            isApproved={request.status === "approved"}
          />
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  // Semantic accent shades retained — emerald/amber/red/muted carry
  // meaning beyond the four shadcn Badge variants.
  const cls =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
      : status === "rejected"
        ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/5"
        : status === "cancelled"
          ? "border-border bg-muted text-muted-foreground hover:bg-muted"
          : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";

  return (
    <Badge variant="outline" className={cn("capitalize", cls)}>
      {status}
    </Badge>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value + "T00:00:00"));
}

function parseStatus(value: string | undefined): LeaveStatus | "all" {
  const valid: LeaveStatus[] = ["pending", "approved", "rejected", "cancelled"];
  return valid.includes(value as LeaveStatus) ? (value as LeaveStatus) : "all";
}

function leaveEmployeeDrilldownHref(
  employeeId: string,
  requestId: string,
  today: Date,
  to: string,
): string {
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 2);
  const from = fromDate.toISOString().slice(0, 10);
  return `/leave?status=all&employeeId=${employeeId}&from=${from}&to=${to}#leave-request-${requestId}`;
}

function leaveBalanceContext(
  request: LeaveRequest,
  balances: LeaveBalance[],
  holidayDates: Set<string>,
): { text: string; isWarning: boolean } {
  const segments = requestYearSegments(request, holidayDates);
  const summaries = segments.map((segment) => {
    const balance = balances.find(
      (candidate) =>
        candidate.employeeId === request.employeeId &&
        candidate.leaveTypeId === request.leaveTypeId &&
        candidate.year === segment.year,
    );
    if (!balance) {
      return {
        text: `${segment.year}: no balance found; ${formatDays(segment.days)} requested`,
        isWarning: true,
      };
    }

    const warning = balance.balance < segment.days;
    return {
      text: `${segment.year}: ${formatDays(balance.balance)} available; ${formatWorkingDays(segment.days)} requested`,
      isWarning: warning,
    };
  });

  return {
    text: `Balance context: ${summaries.map((summary) => summary.text).join("; ")}.`,
    isWarning: summaries.some((summary) => summary.isWarning),
  };
}

function requestYears(request: LeaveRequest): number[] {
  const startYear = Number(request.startDate.slice(0, 4));
  const endYear = Number(request.endDate.slice(0, 4));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y += 1) years.push(y);
  return years;
}

function requestYearSegments(request: LeaveRequest, holidayDates: Set<string>) {
  const startYear = Number(request.startDate.slice(0, 4));
  const endYear = Number(request.endDate.slice(0, 4));
  const segments: Array<{ year: number; days: number }> = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const from = request.startDate > `${year}-01-01` ? request.startDate : `${year}-01-01`;
    const to = request.endDate < `${year}-12-31` ? request.endDate : `${year}-12-31`;
    let days = workingDaysInRange(from, to, holidayDates);
    if (request.isHalfDay && segments.length === 0 && days > 0) {
      // Half-day is enforced single-day; collapse the one working day to 0.5.
      days = 0.5;
    }
    segments.push({ year, days });
  }

  return segments;
}

function workingDaysInRange(
  startDate: string,
  endDate: string,
  holidayDates: Set<string>,
): number {
  let count = 0;
  const d = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (d.getTime() <= end.getTime()) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const iso = d.toISOString().slice(0, 10);
      if (!holidayDates.has(iso)) count += 1;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

function formatDays(days: number): string {
  const formatted =
    Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${days === 1 ? "day" : "days"}`;
}

function formatWorkingDays(days: number): string {
  const formatted =
    Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, "");
  return `${formatted} working ${days === 1 ? "day" : "days"}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
