import { requireRole } from "@/lib/supabase/helpers";
import {
  getCompanyApprovedLeave,
  getPublicHolidays,
} from "@/server/dal/leave";
import { LeaveCalendarView } from "@/components/leave/leave-calendar-view";

type LeaveCalendarPageProps = {
  searchParams: Promise<{
    month?: string;
  }>;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function LeaveCalendarPage({
  searchParams,
}: LeaveCalendarPageProps) {
  await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/leave/calendar",
  });

  const params = await searchParams;
  const month = normalizeMonth(params.month);
  const { from, to } = monthRange(month);
  const year = Number(month.slice(0, 4));

  const [
    { entries, error: leaveError },
    { holidays, error: holidayError },
  ] = await Promise.all([
    getCompanyApprovedLeave(from, to),
    getPublicHolidays({ fromYear: year, toYear: year }),
  ]);

  const errors = [leaveError, holidayError].filter(
    (e): e is string => Boolean(e),
  );

  return (
    <LeaveCalendarView
      month={month}
      entries={entries}
      holidays={holidays}
      errors={errors}
    />
  );
}

function normalizeMonth(input: string | undefined): string {
  if (input && MONTH_PATTERN.test(input)) return input;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const mIdx = Number(month.slice(5, 7)) - 1;
  const last = new Date(Date.UTC(year, mIdx + 1, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}
