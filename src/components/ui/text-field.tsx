"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared `TextField` — htmlFor label + Input + optional error.
 *
 * Extracted from `performance/performance-forms.tsx` during the shadcn
 * migration. Public API matches the prior file-local component:
 *   - `id` is required (the label is wired via `htmlFor`).
 *   - `optional` appends a muted "(optional)" suffix to the label.
 *   - All other props pass through to the underlying `<input>`.
 *
 * Visual style matches the shared `Field` component (uppercase muted
 * label) so callers across the app render with a consistent label
 * convention.
 */
export type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
};

export function TextField({
  id,
  name,
  label,
  error,
  optional,
  className,
  ...inputProps
}: TextFieldProps) {
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
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
