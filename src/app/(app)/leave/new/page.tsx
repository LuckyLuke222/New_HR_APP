import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getActiveLeaveTypes,
  getMyLeaveBalances,
  getPublicHolidays,
} from "@/server/dal/leave";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";

export default async function NewLeavePage() {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/leave/new",
  });

  const currentYear = new Date().getFullYear();
  const [
    { types, error },
    { balances: allBalances, error: balancesError },
    { holidays },
  ] = await Promise.all([
    getActiveLeaveTypes(),
    getMyLeaveBalances([currentYear, currentYear + 1]),
    getPublicHolidays({ fromYear: currentYear, toYear: currentYear + 1 }),
  ]);
  // getMyLeaveBalances is RLS-scoped, which for admin/manager returns balances
  // visible to them across employees. The leave-request form is always for the
  // signed-in user, so scope explicitly to their own balances. Older / future
  // years belong in the future reporting module, not on this form.
  const balances = allBalances.filter(
    (b) => b.employeeId === user.id && b.leaveTypeIsActive,
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/leave"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Leave
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-normal">
          Request leave
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a leave request for admin or manager approval.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>Unable to load leave types. {error}</AlertDescription>
        </Alert>
      ) : types.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground text-card-foreground shadow">
          No active leave types are configured. Contact your administrator.
        </div>
      ) : (
        <LeaveRequestForm
          types={types}
          balances={balances}
          balanceError={balancesError}
          holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
        />
      )}
    </div>
  );
}
