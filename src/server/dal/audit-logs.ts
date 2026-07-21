import "server-only";

import { createClient } from "@/lib/supabase/server";
import { safeDalError } from "@/server/dal/errors";

export type AuditLogFilters = {
  actor?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
};

export type AuditLogRow = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function getAuditLogs(
  filters: AuditLogFilters = {},
): Promise<{ logs: AuditLogRow[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("id, actor, action, entity, entity_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.actor) query = query.eq("actor", filters.actor);
  if (filters.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters.entity) query = query.ilike("entity", `%${filters.entity}%`);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) return { logs: [], error: safeDalError("auditLogs.getAuditLogs", error, "Unable to load audit logs.") };

  const rows = data ?? [];
  const actors = await fetchProfileNames(
    rows.map((row) => row.actor as string | null),
  );

  return {
    logs: rows.map((row) => {
      const actorId = row.actor as string | null;
      return {
        id: row.id as string,
        actorId,
        actorName: actorId ? (actors.get(actorId) ?? "Unknown user") : "System",
        action: row.action as string,
        entity: row.entity as string,
        entityId: row.entity_id as string | null,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        createdAt: row.created_at as string,
      };
    }),
    error: null,
  };
}

async function fetchProfileNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, work_email")
    .in("id", uniqueIds);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(
      row.id as string,
      (row.display_name as string | null) ??
        (row.work_email as string | null) ??
        "Unknown user",
    );
  }
  return map;
}
