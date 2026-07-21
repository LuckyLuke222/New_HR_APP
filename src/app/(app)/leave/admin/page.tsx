import { requireRole } from "@/lib/supabase/helpers";
import {
  getLeaveTypes,
  getMyLeaveBalances,
  getPublicHolidays,
} from "@/server/dal/leave";
import { getAllEmployeeOptions } from "@/server/dal/employees";
import { LeaveTypeAdminPanel } from "@/components/leave/leave-type-admin-panel";
import { LeaveBalanceAdminPanel } from "@/components/leave/leave-balance-admin-panel";
import { LeaveRolloverButton } from "@/components/leave/leave-rollover-button";
import { PublicHolidaysAdminPanel } from "@/components/leave/public-holidays-admin-panel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function LeaveAdminPage() {
  await requireRole(["admin"], { attemptedResource: "/leave/admin" });

  const [
    { types, error: typesError },
    { balances, error: balancesError },
    { employees },
    { holidays, error: holidaysError },
  ] = await Promise.all([
    getLeaveTypes(),
    getMyLeaveBalances("all"),
    getAllEmployeeOptions(),
    // Admin CRUD: show all configured holidays across all years (incl. inactive)
    // so the admin sees the full picture. The component groups by year.
    getPublicHolidays({ includeInactive: true }),
  ]);
  const targetYear = new Date().getFullYear() + 1;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/leave"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Leave
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          Leave admin
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage leave types, set employee balances, and roll over balances to
          the next year.
        </p>
      </div>

      <LeaveRolloverButton targetYear={targetYear} />

      {typesError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load leave types. {typesError}
        </div>
      ) : (
        <LeaveTypeAdminPanel types={types} />
      )}

      {balancesError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load balances. {balancesError}
        </div>
      ) : (
        <LeaveBalanceAdminPanel
          balances={balances}
          types={types.filter((type) => type.isActive)}
          employees={employees}
        />
      )}

      {holidaysError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load public holidays. {holidaysError}
        </div>
      ) : (
        <PublicHolidaysAdminPanel holidays={holidays} />
      )}
    </div>
  );
}
