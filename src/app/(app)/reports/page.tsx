import Link from "next/link";
import { Download, FileBarChart } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/supabase/helpers";
import { insertAuditLog } from "@/server/audit";
import {
  LEAVE_STATUSES,
  REPORTS,
  cleanDate,
  getReport,
  isReportKey,
  parseGrain,
  parseStatuses,
  reportDefaults,
  reportMeta,
  type ReportFilters,
} from "@/server/dal/reports";
import { ReportChart } from "@/components/reports/report-chart";
import { ReportTable } from "@/components/reports/report-table";

type PageProps = {
  searchParams: Promise<{
    report?: string;
    from?: string;
    to?: string;
    asOf?: string;
    grain?: string;
    status?: string | string[];
    generate?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const user = await requireRole(["admin"], { attemptedResource: "/reports" });
  const params = await searchParams;

  const activeKey = isReportKey(params.report) ? params.report : undefined;
  const meta = activeKey ? reportMeta(activeKey) : null;
  // Pre-fill the date inputs with each report's defaults (today / previous
  // calendar month) — same values the DAL falls back to, so they never drift.
  const defaults: ReportFilters = activeKey ? reportDefaults(activeKey) : {};
  const selectedStatuses = parseStatuses(params.status);
  // Resolve the status selection ONCE here: explicit selection, else the
  // report's default (approved). This single value drives the checkboxes, the
  // DAL query, AND the audit metadata, so what we log always equals what we ran.
  const checkedStatuses = selectedStatuses.length
    ? selectedStatuses
    : defaults.statuses ?? [];
  const filters: ReportFilters = {
    from: cleanDate(params.from),
    to: cleanDate(params.to),
    asOf: cleanDate(params.asOf),
    grain: parseGrain(params.grain),
    statuses: checkedStatuses,
  };

  // Two-step: selecting a report shows its controls (prefetch-safe, no query,
  // no audit). The report only "generates" — fetches data and writes the
  // report.generated audit — on the explicit Run submit (`generate=1`), which
  // the selector links deliberately never carry. This keeps the audit a signal
  // of deliberate runs, not passive renders/refresh/prefetch.
  const generated = activeKey != null && params.generate === "1";
  const result = generated ? await getReport(activeKey!, filters) : null;

  // Export CSV link target: the same resolved filters that produced this view,
  // so the file matches the table. Only meaningful once a non-empty report has
  // been generated — otherwise there is nothing to export.
  const exportHref = buildExportHref(activeKey, filters);
  const canExport = generated && !!result && !result.error && result.rows.length > 0;

  if (generated && result && !result.error) {
    await insertAuditLog({
      actorId: user.id,
      action: "report.generated",
      entity: "report",
      metadata: {
        report: activeKey,
        from: filters.from ?? null,
        to: filters.to ?? null,
        asOf: filters.asOf ?? null,
        grain: filters.grain ?? null,
        statuses: meta!.statusFilter ? filters.statuses ?? null : null,
      },
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin-only operational reports drawn from live records.
        </p>
      </div>

      <nav aria-label="Report selector" className="flex flex-wrap gap-2">
        {REPORTS.map((report) => {
          const isActive = report.key === activeKey;
          return (
            <Button
              key={report.key}
              asChild
              size="sm"
              variant={isActive ? "default" : "outline"}
            >
              <Link
                href={`/reports?report=${report.key}`}
                aria-current={isActive ? "true" : undefined}
              >
                {report.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {!activeKey ? (
        <section className="rounded-xl border bg-card p-8 text-center text-card-foreground shadow">
          <FileBarChart
            aria-hidden="true"
            className="mx-auto size-6 text-muted-foreground/70"
          />
          <h2 className="mt-2 text-sm font-semibold">Select a report</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a report above to view it.
          </p>
        </section>
      ) : (
        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{meta!.label}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {meta!.description}
            </p>
          </div>

          <form
            action="/reports"
            className="flex flex-wrap items-end gap-3 border-b p-4"
          >
            <input type="hidden" name="report" value={activeKey} />
            <input type="hidden" name="generate" value="1" />
            {meta!.dateControl === "range" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="from" className="text-xs font-medium text-muted-foreground">
                    From
                  </Label>
                  <Input
                    id="from"
                    name="from"
                    type="date"
                    className="sm:w-44"
                    defaultValue={filters.from ?? defaults.from ?? ""}
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
                    className="sm:w-44"
                    defaultValue={filters.to ?? defaults.to ?? ""}
                  />
                </div>
              </>
            )}
            {meta!.dateControl === "asOf" && (
              <div className="space-y-1">
                <Label htmlFor="asOf" className="text-xs font-medium text-muted-foreground">
                  As of
                </Label>
                <Input
                  id="asOf"
                  name="asOf"
                  type="date"
                  className="sm:w-44"
                  defaultValue={filters.asOf ?? defaults.asOf ?? ""}
                />
              </div>
            )}
            {meta!.grain && (
              <div className="space-y-1">
                <Label htmlFor="grain" className="text-xs font-medium text-muted-foreground">
                  Group by
                </Label>
                <select
                  id="grain"
                  name="grain"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-44 md:text-sm"
                  defaultValue={filters.grain ?? defaults.grain ?? "month"}
                >
                  <option value="day">Day</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            )}
            {meta!.statusFilter && (
              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-muted-foreground">
                  Status
                </legend>
                <div className="flex min-h-9 flex-wrap items-center gap-3">
                  {LEAVE_STATUSES.map((status) => (
                    <label
                      key={status}
                      className="flex items-center gap-1.5 text-sm capitalize"
                    >
                      <input
                        type="checkbox"
                        name="status"
                        value={status}
                        defaultChecked={checkedStatuses.includes(status)}
                        className="size-4 rounded border-input"
                      />
                      {status}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Button type="submit" variant="outline">Run report</Button>
            {canExport && (
              <Button asChild variant="outline">
                {/* `download` makes the browser save the file (and tells Next's
                    Link to defer to the browser), so intent doesn't rely on the
                    response Content-Disposition alone; the icon signals it's a
                    download, not navigation — matching document-download-button. */}
                <Link href={exportHref} prefetch={false} download>
                  <Download aria-hidden="true" />
                  Export CSV
                </Link>
              </Button>
            )}
            {generated && (
              <Button asChild variant="ghost">
                <Link href={`/reports?report=${activeKey}`}>Clear</Link>
              </Button>
            )}
          </form>

          {!generated ? (
            <div className="p-8 text-center">
              <FileBarChart
                aria-hidden="true"
                className="mx-auto size-6 text-muted-foreground/70"
              />
              <h2 className="mt-2 text-sm font-semibold">Ready to run</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {meta!.dateControl === "none"
                  ? "Select Run report to generate this report."
                  : "Set your options and select Run report."}
              </p>
            </div>
          ) : result!.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>
                  Unable to load report. {result!.error}
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              {result!.summary.length > 0 && (
                <div className="flex flex-wrap gap-6 border-b px-4 py-3">
                  {result!.summary.map((item) => (
                    <div key={item.label}>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {result!.rows.length === 0 ? (
                <div className="p-8 text-center">
                  <FileBarChart
                    aria-hidden="true"
                    className="mx-auto size-6 text-muted-foreground/70"
                  />
                  <h2 className="mt-2 text-sm font-semibold">No data for this report</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {meta!.dateControl === "range"
                      ? "Try a different date range."
                      : meta!.dateControl === "asOf"
                        ? "Try a different date."
                        : "Nothing to show right now."}
                  </p>
                </div>
              ) : (
                <>
                  {meta!.chart && (
                    <>
                      <p className="px-4 pt-4 text-xs text-muted-foreground">
                        {meta!.chart.valueLabel}
                      </p>
                      <ReportChart spec={meta!.chart} rows={result!.rows} />
                    </>
                  )}
                  <ReportTable columns={result!.columns} rows={result!.rows} />
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

// Build the /reports/export query string from the resolved filters. `generate`
// is omitted (the export route doesn't gate on it); statuses repeat as `status`,
// matching the route's getAll("status") parsing.
function buildExportHref(
  activeKey: string | undefined,
  filters: ReportFilters,
): string {
  const query = new URLSearchParams();
  if (activeKey) query.set("report", activeKey);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.asOf) query.set("asOf", filters.asOf);
  if (filters.grain) query.set("grain", filters.grain);
  for (const status of filters.statuses ?? []) query.append("status", status);
  return `/reports/export?${query.toString()}`;
}
