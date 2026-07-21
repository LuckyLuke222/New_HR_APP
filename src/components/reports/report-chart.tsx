"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportChartSpec, ReportRow } from "@/server/dal/reports";

// Single-series bar chart for the reports that opt in via `meta.chart`. Re-plots
// the same `rows` the table renders (no separate data path) — the DAL owns the
// numbers, this only visualises them. Themed through the shared CSS tokens
// (`--color-chart-1` for the bar, border/muted for axes/grid) so it reads as
// part of the same surface as every other page. Rows render in DTO order.
export function ReportChart({
  spec,
  rows,
}: {
  spec: ReportChartSpec;
  rows: ReportRow[];
}) {
  return (
    <figure
      role="img"
      aria-label={`${spec.valueLabel} chart`}
      className="border-b px-4 py-4"
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey={spec.categoryKey}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)" }}
            contentStyle={{
              backgroundColor: "var(--color-popover)",
              borderColor: "var(--color-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-popover-foreground)",
              fontSize: 12,
            }}
          />
          <Bar
            dataKey={spec.valueKey}
            name={spec.valueLabel}
            fill="var(--color-chart-1)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
