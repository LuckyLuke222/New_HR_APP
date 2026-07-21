"use client";

import { useActionState } from "react";
import { approveLeaveRequest, rejectLeaveRequest } from "@/server/actions/leave";
import type { LeaveActionState } from "@/server/actions/leave";

const initial: LeaveActionState = { success: false, message: "" };

export function LeaveDecisionForm({ requestId }: { requestId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveLeaveRequest,
    initial,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectLeaveRequest,
    initial,
  );

  if (approveState.success) {
    return <p className="text-xs text-emerald-700">Approved</p>;
  }
  if (rejectState.success) {
    return <p className="text-xs text-destructive">Rejected</p>;
  }

  return (
    <form className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input
        type="text"
        name="approverNote"
        aria-label="Approver note"
        placeholder="Optional note"
        maxLength={500}
        defaultValue={
          rejectState.values?.approverNote ?? approveState.values?.approverNote ?? ""
        }
        className="h-8 w-48 rounded-md border border-input bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex gap-2">
        {/* Approve / Reject buttons retain semantic emerald / destructive
            accents — they're the meaning of the action, not generic
            primary/outline pairs. */}
        <button
          type="submit"
          formAction={approveAction}
          disabled={approvePending}
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-50"
        >
          {approvePending ? "…" : "Approve"}
        </button>
        <button
          type="submit"
          formAction={rejectAction}
          disabled={rejectPending}
          className="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-1 disabled:opacity-50"
        >
          {rejectPending ? "…" : "Reject"}
        </button>
      </div>
      {(approveState.message || rejectState.message) && !approveState.success && !rejectState.success && (
        <p role="alert" className="text-xs text-destructive">
          {approveState.message || rejectState.message}
        </p>
      )}
    </form>
  );
}
