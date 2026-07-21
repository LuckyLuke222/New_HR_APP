"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { softDeleteDocument, type DocumentActionState } from "@/server/actions/documents";
import { cn } from "@/lib/utils";

const initial: DocumentActionState = { success: false, message: "" };

export function SoftDeleteDocumentForm({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(softDeleteDocument, initial);
  const [armed, setArmed] = useState(false);

  // Reset the armed state on server-action error so the user has to re-arm
  // before retrying — staying armed across an error would let a second click
  // immediately resubmit the failed action without a fresh confirmation.
  // Intentional setState-in-effect: reset confirm-arm in response to a server-action
  // error from useActionState; the trigger isn't render-derivable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (state.message && !state.success) {
      setArmed(false);
    }
  }, [state.message, state.success]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (state.success) return null;

  return (
    <form action={action}>
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={armed ? "Confirm delete document" : "Delete document"}
        className={cn(
          "inline-flex items-center gap-1 text-sm disabled:opacity-50",
          armed
            ? "rounded-md border border-destructive bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
            : "text-destructive hover:underline",
        )}
        onClick={(event) => {
          if (!armed) {
            event.preventDefault();
            setArmed(true);
          }
        }}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        {pending ? "Deleting…" : armed ? "Click again to confirm" : "Delete"}
      </button>
      {state.message && !state.success && (
        <p className="mt-0.5 text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
