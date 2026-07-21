import Link from "next/link";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/supabase/helpers";
import { getAuditLogs, type AuditLogRow } from "@/server/dal/audit-logs";
import { AuditLogTableScroller } from "./audit-log-table-scroller";

// Mirrors the .limit() in src/server/dal/audit-logs.ts. Presentation echo only —
// DAL stays the single source of truth for the cap.
const RESULT_CAP = 100;

type PageProps = {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    entity?: string;
    entityId?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AuditLogsPage({ searchParams }: PageProps) {
  await requireRole(["admin"], { attemptedResource: "/audit-logs" });
  const params = await searchParams;
  const filters = {
    actor: cleanUuid(params.actor),
    action: cleanText(params.action),
    entity: cleanText(params.entity),
    entityId: cleanUuid(params.entityId),
    from: cleanDate(params.from),
    to: cleanDate(params.to),
  };
  const hasFilters = Object.values(filters).some(Boolean);
  const { logs, error } = await getAuditLogs(filters);

  // Default From for the collapsible quick-filter panel. Today-scoped so first-time
  // openers see fresh probing activity, not historical typo noise. The user can
  // override via the date inputs inside the panel before submitting.
  const today = new Date().toISOString().slice(0, 10);
  const QUICK_FILTER_ACTIONS = ["input.validation_failed", "entity.not_found"] as const;
  const quickFilterActive = QUICK_FILTER_ACTIONS.includes(
    filters.action as (typeof QUICK_FILTER_ACTIONS)[number],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Audit logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin-only event history for sensitive actions and authorization failures.
        </p>
      </div>

      <section className="rounded-xl border bg-card text-card-foreground shadow">
        <details open={quickFilterActive} className="group border-b">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium uppercase text-muted-foreground">
              SECURITY CONTROLS (FUTURE USE)
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
            />
          </summary>
          <form
            action="/audit-logs"
            className="grid gap-3 border-t p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          >
            <div className="space-y-1">
              <Label htmlFor="qf-from" className="text-xs font-medium text-muted-foreground">
                From
              </Label>
              <Input
                id="qf-from"
                name="from"
                type="date"
                defaultValue={filters.from ?? today}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qf-to" className="text-xs font-medium text-muted-foreground">
                To
              </Label>
              <Input
                id="qf-to"
                name="to"
                type="date"
                defaultValue={filters.to ?? ""}
              />
            </div>
            <Button
              type="submit"
              name="action"
              value="input.validation_failed"
              size="sm"
              variant={
                filters.action === "input.validation_failed" ? "default" : "outline"
              }
              title="Server Actions where Zod input parsing rejected the submission. Often legitimate typos; useful for spotting forge probing when one actor produces many in a short window."
              data-quick-filter={
                filters.action === "input.validation_failed" ? "active" : undefined
              }
            >
              Suspicious input
            </Button>
            <Button
              type="submit"
              name="action"
              value="entity.not_found"
              size="sm"
              variant={
                filters.action === "entity.not_found" ? "default" : "outline"
              }
              title="Server Actions where a UUID lookup returned no row. Often manual URL typos; useful for spotting actors probing for entities they don't own."
              data-quick-filter={
                filters.action === "entity.not_found" ? "active" : undefined
              }
            >
              Missing-entity probes
            </Button>
          </form>
        </details>
        <form
          action="/audit-logs"
          className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div className="space-y-1">
            <Label htmlFor="actor" className="text-xs font-medium text-muted-foreground">
              Actor ID
            </Label>
            <Input
              id="actor"
              name="actor"
              defaultValue={filters.actor ?? params.actor ?? ""}
              placeholder="UUID of the user who performed the action"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entityId" className="text-xs font-medium text-muted-foreground">
              Entity ID
            </Label>
            <Input
              id="entityId"
              name="entityId"
              defaultValue={filters.entityId ?? params.entityId ?? ""}
              placeholder="UUID of the affected record"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="action" className="text-xs font-medium text-muted-foreground">
              Action
            </Label>
            <Input
              id="action"
              name="action"
              defaultValue={filters.action ?? ""}
              placeholder="leave.approved"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="entity" className="text-xs font-medium text-muted-foreground">
              Entity
            </Label>
            <Input
              id="entity"
              name="entity"
              defaultValue={filters.entity ?? ""}
              placeholder="leave_requests"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              From
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={filters.from ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              To
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={filters.to ?? ""}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="outline">Apply</Button>
            {hasFilters && (
              <Button asChild variant="ghost">
                <Link href="/audit-logs">Clear</Link>
              </Button>
            )}
          </div>
        </form>

        {params.actor && !filters.actor && (
          // Amber surface is the intentional warning signal for ignored
          // input. Retained verbatim so its alert text stays grep-stable.
          <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Actor filter ignored because it is not a valid UUID.
          </div>
        )}

        {params.entityId && !filters.entityId && (
          <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Entity ID filter ignored because it is not a valid UUID.
          </div>
        )}

        {error ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>Unable to load audit logs. {error}</AlertDescription>
            </Alert>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck aria-hidden="true" className="mx-auto size-6 text-muted-foreground/70" />
            <h2 className="mt-2 text-sm font-semibold">No audit events found</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters ? "Try a different filter set." : "Sensitive actions will appear here."}
            </p>
          </div>
        ) : (
          <>
            <AuditLogTable logs={logs} />
            {logs.length === RESULT_CAP && (
              <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                Showing the most recent {RESULT_CAP} events. Narrow filters to see older records.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  return (
    <AuditLogTableScroller>
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Time</th>
            <th scope="col" className="px-4 py-3">Actor</th>
            <th scope="col" className="px-4 py-3">Action</th>
            <th scope="col" className="px-4 py-3">Entity</th>
            <th scope="col" className="px-4 py-3">Metadata</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {logs.map((log) => (
            <tr key={log.id} className="align-top hover:bg-muted/40">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{log.actorName}</p>
                {log.actorId && (
                  <p className="mt-0.5 max-w-44 truncate text-xs text-muted-foreground/70" title={log.actorId}>
                    {log.actorId}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="font-medium">
                  {log.action}
                </Badge>
              </td>
              <td className="px-4 py-3 text-foreground">
                <p>{log.entity}</p>
                {log.entityId && (
                  <p className="mt-0.5 max-w-44 truncate text-xs text-muted-foreground/70" title={log.entityId}>
                    {log.entityId}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <pre className="max-w-sm overflow-x-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  {formatMetadata(log.metadata)}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AuditLogTableScroller>
  );
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

function cleanDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function cleanUuid(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : undefined;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  const text = JSON.stringify(metadata, null, 2);
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
