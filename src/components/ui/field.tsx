"use client";

import * as React from "react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared form Field — label + input + optional description + optional error.
 *
 * Extracted from three near-duplicate file-local copies (employees, settings,
 * departments forms) during the shadcn/ui migration. Internals use shadcn
 * primitives (`Label`, `Input`); the public surface matches the richest of
 * the prior callers so existing Server Action + `useActionState` round-trip
 * patterns keep working without consumer changes:
 *
 *   - `name` is the FormData key (server reads via `formData.get(name)`).
 *   - `error` renders below the input and wires `aria-invalid` /
 *     `aria-describedby` for assistive tech.
 *   - `description` renders below the input when there is no error.
 *   - All other props pass through to the underlying `<input>` (e.g.
 *     `type`, `defaultValue`, `required`, `min`, `max`, `maxLength`,
 *     `placeholder`, `pattern`, `autoComplete`).
 *
 * Note: the wrapped `<label>` pattern means clicking the visible label
 * focuses the input without an `htmlFor` reference. Settings-form's
 * previous `inputClass` prop is no longer accepted — the field renders
 * with consistent slate/new-york styling across the app.
 */
export type FieldProps = {
  name: string;
  label: string;
  error?: string;
  description?: string;
} & Omit<React.ComponentProps<"input">, "className" | "name">;

export function Field({
  name,
  label,
  error,
  description,
  id,
  ...inputProps
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? `field-${generatedId}`;
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;

  return (
    <div className="block">
      <Label
        htmlFor={fieldId}
        className="text-xs font-medium uppercase text-muted-foreground"
      >
        {label}
      </Label>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? errorId : description ? descriptionId : undefined
        }
        className={cn(
          "mt-1 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        )}
        {...inputProps}
      />
      {description && !error && (
        <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
