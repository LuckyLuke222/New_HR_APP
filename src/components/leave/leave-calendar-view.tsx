import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompanyLeaveEntry, PublicHoliday } from "@/server/dal/leave";
import { DayChipList } from "./day-chip-list";

type LeaveCalendarViewProps = {
  month: string; // YYYY-MM
  entries: CompanyLeaveEntry[];
  holidays: PublicHoliday[];
  errors: string[];
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function LeaveCalendarView({
  month,
  entries,
  holidays,
  errors,
}: LeaveCalendarViewProps) {
  const year = Number(month.slice(0, 4));
  const mIdx = Number(month.slice(5, 7)) - 1;
  const daysInMonth = new Date(Date.UTC(year, mIdx + 1, 0)).getUTCDate();
  const firstWeekday = mondayIndex(new Date(Date.UTC(year, mIdx, 1)).getUTCDay());

  const days: Array<{
    iso: string;
    day: number;
    holidayName: string | null;
    entries: CompanyLeaveEntry[];
  }> = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const holiday = holidays.find((h) => h.date === iso) ?? null;
    const dayEntries = entries.filter(
      (e) => e.startDate <= iso && iso <= e.endDate,
    );
    days.push({
      iso,
      day: d,
      holidayName: holiday?.name ?? null,
      entries: dayEntries,
    });
  }

  const leadingBlanks = Array.from({ length: firstWeekday });

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const thisMonth = currentMonth();
  const todayIso = todayISO();
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, mIdx, 1)));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Leave calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approved leave across the company, plus public holidays.
          </p>
        </div>
        <nav
          aria-label="Month navigation"
          className="flex items-center gap-2"
        >
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/leave/calendar?month=${prevMonth}`}
              aria-label="Previous month"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Prev
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={month === thisMonth}>
            <Link href={`/leave/calendar?month=${thisMonth}`} aria-label="Today">
              Today
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/leave/calendar?month=${nextMonth}`}
              aria-label="Next month"
            >
              Next
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </nav>
      </div>

      <h2
        className="text-lg font-semibold"
        data-testid="calendar-month-label"
      >
        {monthLabel}
      </h2>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{errors.join(" ")}</AlertDescription>
        </Alert>
      )}

      {/* Desktop / tablet grid */}
      <div
        role="grid"
        aria-label={`${monthLabel} leave calendar`}
        className="hidden rounded-xl border bg-card text-card-foreground shadow sm:block"
      >
        <div className="grid grid-cols-7 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-3 py-2 text-center">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {leadingBlanks.map((_, idx) => (
            <div
              key={`pad-${idx}`}
              className="min-h-24 border-b border-r bg-muted/30"
              aria-hidden="true"
            />
          ))}
          {days.map((d, idx) => {
            const col = (firstWeekday + idx) % 7;
            const isPast = d.iso < todayIso;
            const isToday = d.iso === todayIso;
            return (
              <div
                key={d.iso}
                role="gridcell"
                data-testid="calendar-day"
                data-date={d.iso}
                data-past={isPast ? "true" : "false"}
                data-today={isToday ? "true" : "false"}
                data-holiday={d.holidayName ? "true" : "false"}
                className={cn(
                  "group min-h-24 border-b border-r p-2 text-xs",
                  col === 6 && !d.holidayName && "bg-muted/20",
                  d.holidayName && "bg-amber-50/70",
                  isPast && !d.holidayName && "bg-muted/40",
                  isPast && "opacity-70",
                  isToday && "ring-2 ring-inset ring-primary/60",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isPast ? "text-muted-foreground" : "text-foreground",
                      isToday && "text-primary",
                    )}
                  >
                    {d.day}
                  </span>
                  {d.holidayName && (
                    <span
                      className="ml-1 truncate rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900"
                      title={d.holidayName}
                      data-testid="calendar-holiday"
                    >
                      {d.holidayName}
                    </span>
                  )}
                </div>
                <DayChipList entries={d.entries} dayIso={d.iso} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile day-list */}
      <ol
        aria-label={`${monthLabel} leave list`}
        className="space-y-2 sm:hidden"
      >
        {days
          .filter((d) => d.entries.length > 0 || d.holidayName)
          .map((d) => (
            <li
              key={d.iso}
              className="rounded-xl border bg-card p-3 shadow"
              data-testid="calendar-day-mobile"
              data-date={d.iso}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {new Intl.DateTimeFormat("en", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  }).format(new Date(`${d.iso}T00:00:00Z`))}
                </span>
                {d.holidayName && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    {d.holidayName}
                  </span>
                )}
              </div>
              {d.entries.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {d.entries.map((e) => (
                    <li
                      key={`${d.iso}-mb-${e.id}`}
                      className="flex items-center justify-between gap-2 text-foreground"
                    >
                      <span className="truncate">{e.employeeName}</span>
                      <span className="text-muted-foreground/80">
                        {e.leaveTypeName}
                        {e.isHalfDay && " · ½"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        {days.every((d) => d.entries.length === 0 && !d.holidayName) && (
          <li className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            No approved leave or public holidays this month.
          </li>
        )}
      </ol>

      {/* Desktop empty-month message */}
      {entries.length === 0 && holidays.length === 0 && (
        <p className="hidden text-sm text-muted-foreground sm:block">
          No approved leave or public holidays this month.
        </p>
      )}
    </div>
  );
}

function mondayIndex(jsDay: number): number {
  // JS: 0=Sun..6=Sat. We want 0=Mon..6=Sun.
  return (jsDay + 6) % 7;
}

function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const mIdx = Number(month.slice(5, 7)) - 1 + delta;
  const targetYear = year + Math.floor(mIdx / 12);
  const targetMonth = ((mIdx % 12) + 12) % 12;
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

