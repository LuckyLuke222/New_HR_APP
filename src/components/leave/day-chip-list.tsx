"use client";

import { useState } from "react";
import type { CompanyLeaveEntry } from "@/server/dal/leave";
import { employeePalette } from "./employee-palette";

export const CHIP_CAP = 3;

type DayChipListProps = {
  entries: CompanyLeaveEntry[];
  dayIso: string;
};

export function DayChipList({ entries, dayIso }: DayChipListProps) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) {
    return null;
  }

  const overflow = entries.length - CHIP_CAP;
  const visible = expanded || overflow <= 0 ? entries : entries.slice(0, CHIP_CAP);

  return (
    <ul className="space-y-1">
      {visible.map((e) => {
        const palette = employeePalette(e.employeeId);
        return (
          <li key={`${dayIso}-${e.id}`}>
            <span
              className="block truncate rounded-md border px-1.5 py-0.5 text-[11px]"
              style={{
                backgroundColor: palette.bg,
                borderColor: palette.border,
                color: palette.text,
              }}
              title={`${e.employeeName} — ${e.leaveTypeName}${e.isHalfDay ? " (half day)" : ""}`}
              data-testid="calendar-entry"
              data-employee-id={e.employeeId}
              data-half-day={e.isHalfDay ? "true" : "false"}
            >
              {e.employeeName}
              {e.isHalfDay && (
                <span
                  className="ml-1 text-[10px] opacity-80"
                  aria-label="half day"
                >
                  ½
                </span>
              )}
            </span>
          </li>
        );
      })}
      {overflow > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Show fewer leaves on ${dayIso}`
                : `Show ${overflow} more ${overflow === 1 ? "leave" : "leaves"} on ${dayIso}`
            }
            data-testid="calendar-more-toggle"
            className="block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[past=true]:text-foreground"
          >
            {expanded ? "Show less" : `+${overflow} more`}
          </button>
        </li>
      )}
    </ul>
  );
}
