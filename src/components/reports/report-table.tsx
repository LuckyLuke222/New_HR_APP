import type { ReportColumn, ReportRow } from "@/server/dal/reports";

// Generic renderer for any report's tabular DTO. One component serves every
// report in the catalogue (rule-of-three across 8 reports) — the DAL owns the
// column/row shape, this owns the presentation. Mirrors the audit-logs table
// styling so /reports feels identical to the rest of the app.
export function ReportTable({
  columns,
  rows,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-4 py-3">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows.map((row, index) => (
            <tr key={index} className="align-top hover:bg-muted/40">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-foreground">
                  {formatCell(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: ReportRow[string]): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
