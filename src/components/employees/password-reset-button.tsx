"use client";

import { Clipboard, Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  sendEmployeePasswordReset,
  type EmployeeActionState,
} from "@/server/actions/employees";

const initial: EmployeeActionState = { success: false, message: "" };

export function EmployeePasswordResetButton({
  employeeId,
}: {
  employeeId: string;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [state, action, pending] = useActionState(
    sendEmployeePasswordReset,
    initial,
  );

  async function copyResetLink() {
    if (!state.resetLink) return;

    try {
      await navigator.clipboard.writeText(state.resetLink);
      setCopyMessage("Copied.");
    } catch (error) {
      console.error("employees.password_reset_copy failed", error);
      setCopyMessage("Copy failed. Select the full link below.");
    }
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="employeeId" value={employeeId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Generating..." : "Generate password reset"}
      </Button>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`max-w-xs text-sm ${
            state.success ? "text-emerald-700" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}
      {state.resetLink && (
        <div className="space-y-2">
          <div className="flex max-w-md gap-2">
            <textarea
              aria-label="Password reset link"
              readOnly
              value={state.resetLink}
              rows={3}
              className="block min-h-20 flex-1 resize-none rounded-md border border-input bg-muted/40 px-3 py-2 text-xs text-foreground"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyResetLink()}
              aria-label="Copy password reset link"
              title="Copy password reset link"
            >
              {copyMessage === "Copied." ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Clipboard aria-hidden="true" className="size-4" />
              )}
              Copy
            </Button>
          </div>
          {copyMessage && (
            <p
              role={copyMessage === "Copied." ? "status" : "alert"}
              className={`text-xs ${
                copyMessage === "Copied." ? "text-emerald-700" : "text-destructive"
              }`}
            >
              {copyMessage}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
