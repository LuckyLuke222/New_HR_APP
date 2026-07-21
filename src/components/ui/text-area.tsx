"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Shared `TextArea` — htmlFor label + shadcn `Textarea` + optional error.
 *
 * Extracted from `performance/performance-forms.tsx` during the shadcn
 * migration. Public API matches the prior file-local component:
 *   - `id` is required.
 *   - `optional` appends a muted "(optional)" suffix.
 *   - All other props pass through to the underlying `<textarea>`,
 *     including the default `rows={3}` from the prior component
 *     (callers can override).
 */
export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
};

export function TextArea({
  id,
  name,
  label,
  error,
  optional,
  className,
  rows = 3,
  ...textareaProps
}: TextAreaProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <Label
        htmlFor={id}
        className="text-xs font-medium uppercase text-muted-foreground"
      >
        {label}{" "}
        {optional && (
          <span className="font-normal normal-case text-muted-foreground/70">
            (optional)
          </span>
        )}
      </Label>
      <Textarea
        id={id}
        name={name}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...textareaProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
