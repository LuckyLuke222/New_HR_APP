import "server-only";

export function safeDalError(
  context: string,
  error: unknown,
  fallback = "Unable to load this data.",
): string {
  console.error(`${context} failed`, error);
  return fallback;
}
