import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function insertAuditLog({
  actorId,
  action,
  entity,
  entityId = null,
  metadata = {},
}: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor: actorId,
    action,
    entity,
    entity_id: entityId,
    metadata,
  });

  if (error) {
    console.error("audit log insert failed", error);
  }
}

type ZodLikeError = {
  flatten: () => { fieldErrors: unknown };
  issues?: ReadonlyArray<{ code?: string; path?: ReadonlyArray<PropertyKey> }>;
};

export async function logValidationFailed({
  actorId,
  resource,
  zodError,
}: {
  actorId: string | null;
  resource: string;
  zodError: ZodLikeError;
}) {
  // When zod parses an object schema, flatten().fieldErrors is Record<string, string[]>.
  // When zod parses a primitive (e.g. z.string().uuid()), it's a string. Handle both.
  const flat = zodError.flatten().fieldErrors;
  let fields: string[] = [];
  if (flat && typeof flat === "object") {
    const map = flat as Record<string, string[] | undefined>;
    fields = Object.keys(map).filter((k) => (map[k] ?? []).length > 0);
  } else {
    // Primitive zod target — fall back to issue paths.
    fields = Array.from(
      new Set(
        (zodError.issues ?? [])
          .map((i) => (i.path ?? []).map((p) => String(p)).join("."))
          .filter((p) => p.length > 0),
      ),
    );
  }
  const issueCodes = Array.from(
    new Set((zodError.issues ?? []).map((i) => i.code).filter(Boolean) as string[]),
  );
  await insertAuditLog({
    actorId,
    action: "input.validation_failed",
    entity: "server_action",
    entityId: null,
    metadata: { resource, fields, issue_codes: issueCodes },
  });
}

export async function logEntityNotFound({
  actorId,
  resource,
  entity,
  entityId,
  reason,
}: {
  actorId: string | null;
  resource: string;
  entity: string;
  entityId: string;
  reason?: string;
}) {
  await insertAuditLog({
    actorId,
    action: "entity.not_found",
    entity,
    entityId,
    metadata: reason ? { resource, reason } : { resource },
  });
}
