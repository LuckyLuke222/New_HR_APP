"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  rolloverLeaveBalances,
  type RolloverActionState,
} from "@/server/actions/leave";

const initial: RolloverActionState = { success: false, message: "" };

export function LeaveRolloverButton({ targetYear }: { targetYear: number }) {
  const [state, action, pending] = useActionState(rolloverLeaveBalances, initial);

  return (
    <section className="rounded-md border bg-card text-card-foreground shadow p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Year rollover
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Seed Local Leave and Sick Leave balances for {targetYear} for every
            active employee using current Settings defaults. Idempotent: existing
            balances are not touched.
          </p>
        </div>
        <form action={action}>
          <Button type="submit" disabled={pending}>
            {pending ? "Rolling over..." : `Roll over to ${targetYear}`}
          </Button>
        </form>
      </div>
      {state.message && (
        <p
          role="alert"
          className={`mt-3 text-xs ${state.success ? "text-emerald-700" : "text-destructive"}`}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
