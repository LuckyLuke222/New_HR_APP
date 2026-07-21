"use client";

import { useActionState } from "react";
import { cancelLeaveRequest } from "@/server/actions/leave";
import type { LeaveActionState } from "@/server/actions/leave";

const initial: LeaveActionState = { success: false, message: "" };

export function CancelLeaveForm({
  requestId,
  isApproved,
}: {
  requestId: string;
  isApproved?: boolean;
}) {
  const [state, action, pending] = useActionState(cancelLeaveRequest, initial);

  if (state.success) {
    return <p className="text-xs text-muted-foreground">Cancelled</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-input bg-transparent px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        {pending ? "…" : isApproved ? "Cancel & refund" : "Cancel request"}
      </button>
      {state.message && !state.success && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
