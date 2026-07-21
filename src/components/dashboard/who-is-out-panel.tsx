"use client";

import { useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { CompanyLeaveEntry } from "@/server/dal/leave";

const VISIBLE_DEFAULT = 5;

export function WhoIsOutPanelBody({ entries }: { entries: CompanyLeaveEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Users aria-hidden="true" className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No one out this week</p>
        <p className="text-xs text-muted-foreground">Approved team leave will appear here.</p>
      </div>
    );
  }

  const visible = expanded ? entries : entries.slice(0, VISIBLE_DEFAULT);
  const overflow = entries.length - VISIBLE_DEFAULT;

  return (
    <>
      <ul className="divide-y divide-border">
        {visible.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <Users aria-hidden="true" className="size-4 text-muted-foreground/70" />
            <div className="min-w-0 flex-1">
              <Link
                href={leaveCalendarHref(entry.startDate)}
                className="truncate text-sm font-medium text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {entry.employeeName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {formatDate(entry.startDate)} to {formatDate(entry.endDate)} · {entry.leaveTypeName}
                {entry.isHalfDay && " · ½"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="who-is-out-toggle"
        >
          {expanded ? "Show fewer" : `Show ${overflow} more`}
        </button>
      )}
    </>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

function leaveCalendarHref(startDate: string): string {
  return `/leave/calendar?month=${startDate.slice(0, 7)}`;
}
