import { z } from "zod";

export function postgresUuid(message = "Invalid selection.") {
  return z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    message,
  );
}
