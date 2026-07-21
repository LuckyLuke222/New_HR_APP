// Pure deadline-lock rule shared by DAL, Server Actions, and client UI.
// Lives outside `server-only` so client forms can render the locked-state
// badge without round-tripping. Compared as a calendar date (YYYY-MM-DD) so
// the transition lines up with the admin's chosen day rather than a UTC instant.

export type CycleDeadlineInputs = {
  submissionDeadline: string | null;
  submissionLockEnabled: boolean;
};

export const FALLBACK_PERFORMANCE_TIMEZONE = "Indian/Mauritius";

export function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolvePerformanceTimeZone(
  configuredTimeZone: string | null | undefined,
): string {
  return configuredTimeZone && isValidIanaTimeZone(configuredTimeZone)
    ? configuredTimeZone
    : FALLBACK_PERFORMANCE_TIMEZONE;
}

export function isCycleDeadlineLocked(
  cycle: CycleDeadlineInputs,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!cycle.submissionLockEnabled) return false;
  if (!cycle.submissionDeadline) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return today > cycle.submissionDeadline;
}
