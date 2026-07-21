"use client";

import { useId, useMemo, useState } from "react";

export type SearchableOption = { value: string; label: string };

export function SearchableSelectField({
  id,
  name,
  label,
  options,
  error,
  emptyLabel = "Unassigned",
  defaultValue,
  disabled = false,
  required = false,
  placeholder,
  hint,
  onValueChange,
}: {
  id?: string;
  name: string;
  label: string;
  options: ReadonlyArray<SearchableOption>;
  error?: string;
  emptyLabel?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  onValueChange?: (value: string) => void;
}) {
  const errorId = useId();
  const listId = useId();
  const initialOption = options.find((option) => option.value === defaultValue);
  const [manualValue, setManualValue] = useState(defaultValue ?? "");
  const [query, setQuery] = useState(initialOption?.label ?? "");

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchedOption = normalizedQuery
    ? options.find((option) => option.label.toLowerCase() === normalizedQuery) ??
      options.find((option) => option.label.toLowerCase().includes(normalizedQuery))
    : null;
  const selectedValue = matchedOption?.value ?? (normalizedQuery ? "" : manualValue);

  const handleSearchInput = (nextQuery: string) => {
    const normalizedNextQuery = nextQuery.trim().toLowerCase();
    const matchingOption =
      options.find(
        (option) => option.label.toLowerCase() === normalizedNextQuery,
      ) ??
      options.find((option) =>
        option.label.toLowerCase().includes(normalizedNextQuery),
      );
    setQuery(nextQuery);
    setManualValue(matchingOption?.value ?? "");
    onValueChange?.(matchingOption?.value ?? "");
  };

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <input
        id={id}
        name={disabled ? undefined : `${name}Search`}
        type="text"
        value={query}
        disabled={disabled}
        onChange={(event) => handleSearchInput(event.currentTarget.value)}
        onInput={(event) => handleSearchInput(event.currentTarget.value)}
        onBlur={() => {
          // B2 (F2): strict-match on blur. If the query resolves to an option,
          // lock to it. If the query is empty, leave the field empty. If the
          // query is non-empty but matches nothing, clear it — otherwise the
          // input visually shows typed text while the hidden <select> carries
          // "", which is a lie about what will be submitted.
          const normalizedCurrentQuery = query.trim().toLowerCase();
          const matchingOption =
            options.find(
              (option) => option.label.toLowerCase() === normalizedCurrentQuery,
            ) ??
            options.find((option) =>
              option.label.toLowerCase().includes(normalizedCurrentQuery),
            );
          if (matchingOption) {
            setQuery(matchingOption.label);
            setManualValue(matchingOption.value);
            onValueChange?.(matchingOption.value);
          } else {
            setQuery("");
            setManualValue("");
            onValueChange?.("");
          }
        }}
        list={disabled ? undefined : listId}
        placeholder={placeholder ?? `Search ${label.toLowerCase()}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        required={required && !disabled}
        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground focus-visible:border-ring focus:outline-none focus:ring-1 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20"
      />
      {!disabled && (
        <datalist id={listId}>
          {filteredOptions.map((option) => (
            <option key={option.value} value={option.label} />
          ))}
        </datalist>
      )}
      <select
        name={disabled ? undefined : name}
        value={selectedValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          const option = options.find((candidate) => candidate.value === nextValue);
          setManualValue(nextValue);
          setQuery(option?.label ?? "");
          onValueChange?.(nextValue);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {/* When empty with no hint we deliberately render nothing — the input's
          own placeholder ("Search {label}") already conveys the empty state,
          and a duplicate caption made this cell taller than other fields in
          the same grid row, pushing the input out of alignment with its
          neighbours (Session 119c). `emptyLabel` is still used as the option
          label inside the sr-only `<select>` below. */}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : selectedValue ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Selected:{" "}
          {options.find((option) => option.value === selectedValue)?.label}
        </p>
      ) : null}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </label>
  );
}
