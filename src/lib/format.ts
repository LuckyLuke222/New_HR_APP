export function maskBankAccount(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "•".repeat(value.length);
  return `•••• ${value.slice(-4)}`;
}

export function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en", { minimumFractionDigits: 2 })}`;
}

// Display helper for snake_case enum values (e.g. "full_time" → "Full time",
// "manager_submitted" → "Manager submitted"). Capitalises the first letter
// only — keeps subsequent words lower-case so multi-word enums read as a
// sentence rather than Title Case. Never apply to free-form text like
// emails or names; this is enum-specific.
export function formatEnum(value: string | null | undefined): string | null {
  if (!value) return null;
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

// Phones default to "+230 " in the create/edit form. If an admin saved
// the form without typing any digits, the stored phone may be a
// country-code-only string like "+230" or "+230 ". On display surfaces
// (profile detail) we want those to read as "no phone on file", not as
// a partial value. Returns null for prefix-only strings so the caller
// can fall through to its empty-state label ("Not set" / "Not Available").
// Compact DD/MM/YY for row-dense tables (People Directory Start Date,
// leave/document lists). Profile detail pages should keep the longer
// "15 May 2026" style — call sites pick which they want; this helper
// is opt-in.
export function formatDateCompact(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(value));
}

export function formatDateDisplay(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

export function displayPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^\+?\d{1,4}$/.test(trimmed)) return null;
  return trimmed;
}
