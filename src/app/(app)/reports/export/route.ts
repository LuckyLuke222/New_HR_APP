import { AccessDeniedError, requireRole } from "@/lib/supabase/helpers";
import { insertAuditLog } from "@/server/audit";
import {
  cleanDate,
  getReport,
  isReportKey,
  parseGrain,
  parseStatuses,
  reportDefaults,
  reportMeta,
} from "@/server/dal/reports";

// Reads auth cookies → never prerender/cache.
export const dynamic = "force-dynamic";

// CSV export for the admin reporting module. Reads the SAME getReport DTO the
// table renders (no second data path, no recompute) and serialises it. The PII
// boundary is structural: the CSV is built only from result.columns, which the
// DTO already restricts to safe columns — there is no separate allowlist to drift.
export async function GET(request: Request) {
  let user;
  try {
    user = await requireRole(["admin"], { attemptedResource: "/reports/export" });
  } catch (error) {
    // requireRole already wrote the auth.access_denied audit before throwing.
    // Route handlers aren't wrapped by (app)/error.tsx, so translate the throw
    // into a plain 403 instead of a 500.
    if (error instanceof AccessDeniedError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  const key = params.get("report") ?? undefined;
  if (!isReportKey(key)) {
    return new Response("Unknown report", { status: 400 });
  }

  const meta = reportMeta(key);
  // Resolve filters exactly as the page does, so the same URL exports the same
  // rows it renders. Status defaults to the report's default when none picked.
  const defaults = reportDefaults(key);
  const selectedStatuses = parseStatuses(params.getAll("status"));
  const checkedStatuses = selectedStatuses.length
    ? selectedStatuses
    : defaults.statuses ?? [];
  const filters = {
    from: cleanDate(params.get("from") ?? undefined),
    to: cleanDate(params.get("to") ?? undefined),
    asOf: cleanDate(params.get("asOf") ?? undefined),
    grain: parseGrain(params.get("grain") ?? undefined),
    statuses: checkedStatuses,
  };

  const result = await getReport(key, filters);
  if (result.error) {
    // Surface the cause server-side — the 500 status is the only signal the
    // client gets; without this the failure is invisible in production logs.
    console.error("[reports/export] getReport failed:", result.error);
    return new Response("Unable to generate report", { status: 500 });
  }

  await insertAuditLog({
    actorId: user.id,
    action: "report.exported",
    entity: "report",
    metadata: {
      report: key,
      from: filters.from ?? null,
      to: filters.to ?? null,
      asOf: filters.asOf ?? null,
      grain: filters.grain ?? null,
      statuses: meta.statusFilter ? filters.statuses ?? null : null,
    },
  });

  const header = result.columns.map((column) => csvCell(column.label));
  const body = result.rows.map((row) =>
    result.columns.map((column) => csvCell(row[column.key] ?? null)),
  );
  const csv = [header, ...body].map((cells) => cells.join(",")).join("\r\n");

  // Label the file with the date the export describes (as-of for snapshots, the
  // range end/start for range reports), falling back to today for reports with
  // no date control — not the server wall-clock, which would mislabel a
  // historical snapshot.
  const labelDate =
    filters.asOf ?? filters.to ?? filters.from ?? new Date().toISOString().slice(0, 10);
  const filename = `${key}-${labelDate}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// RFC-4180-style escaping: empty for null, and wrap in double-quotes (doubling
// embedded quotes) only when the value contains a delimiter, quote, or newline.
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
