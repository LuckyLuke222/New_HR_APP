"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Shared `SelectField` — htmlFor label + native `<select>` + optional error.
 *
 * Kept as a **native `<select>`** (not shadcn's Radix-based Select)
 * deliberately:
 *   - Playwright specs across the suite use `page.locator('select[name="…"]')`
 *     and `selectOption(...)` — switching to Radix would change the
 *     underlying element type and break those selectors.
 *   - The leave admin "Leave type" dropdown (Phase 13 C6) is the
 *     documented exception that explicitly wanted a proper dropdown.
 *
 * Two consumer shapes are supported via a discriminated API:
 *   1. `{ children }` — same as the prior performance-forms variant.
 *      Caller renders `<option>` elements directly.
 *   2. `{ options, emptyLabel? }` — same as the prior employee-form
 *      variant. The component renders the options for you and prepends
 *      an empty option labelled `emptyLabel` when provided.
 *
 * Visual style matches the shared `Field` component (uppercase muted
 * label) for consistency across the app.
 */

type SelectOption = { value: string; label: string };

type BaseSelectFieldProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  id?: string;
  name: string;
  label: string;
  error?: string;
};

type ChildrenSelectFieldProps = BaseSelectFieldProps & {
  children: React.ReactNode;
  options?: never;
  emptyLabel?: never;
};

type OptionsSelectFieldProps = BaseSelectFieldProps & {
  options: ReadonlyArray<SelectOption>;
  emptyLabel?: string;
  children?: never;
};

export type SelectFieldProps = ChildrenSelectFieldProps | OptionsSelectFieldProps;

export function SelectField(props: SelectFieldProps) {
  const {
    id,
    name,
    label,
    error,
    className,
    ...rest
  } = props as BaseSelectFieldProps;
  const generatedId = React.useId();
  const fieldId = id ?? `select-${generatedId}`;
  const errorId = `${fieldId}-error`;

  const selectClassName = cn(
    "mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    className,
  );

  return (
    <div>
      <Label
        htmlFor={fieldId}
        className="text-xs font-medium uppercase text-muted-foreground"
      >
        {label}
      </Label>
      <select
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={selectClassName}
        {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {"options" in props && props.options
          ? (
            <>
              {props.emptyLabel !== undefined && (
                <option value="">{props.emptyLabel}</option>
              )}
              {props.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </>
          )
          : props.children}
      </select>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
