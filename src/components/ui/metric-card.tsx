import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared MetricCard — label / large value / optional note.
 *
 * Restores the Session 99 (Codex) E4 design recorded in
 * `docs/research/dashboard-card-dev-overlay-note.md`: the primary value is the
 * visual anchor — centered 4xl with `tabular-nums`, label above and note below
 * subordinated. Subtle tone uses the same centered alignment as the default
 * but with smaller padding / font / height so it can embed inside denser
 * admin surfaces while still reading as the same card family (Session 117).
 */
export function MetricCard({
  label,
  value,
  note,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  note?: string;
  href?: string;
  tone?: "default" | "subtle";
}) {
  const isLink = Boolean(href);
  const subtle = tone === "subtle";
  const card = (
    <div
      className={cn(
        "flex flex-col items-center justify-between rounded-md bg-white text-center shadow-sm",
        subtle ? "min-h-20 gap-1 p-3" : "min-h-40 gap-2 p-5",
        isLink &&
          "transition hover:border hover:border-teal-300 hover:shadow group-focus-visible:border group-focus-visible:border-teal-500 group-focus-visible:ring-2 group-focus-visible:ring-teal-500",
      )}
    >
      <p
        className={cn(
          "font-medium leading-5 text-muted-foreground",
          subtle ? "text-xs" : "text-sm",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-semibold leading-tight tabular-nums tracking-normal text-foreground",
          subtle ? "text-2xl" : "text-4xl",
        )}
      >
        {value}
      </p>
      {note && (
        <p className="text-xs leading-5 text-muted-foreground">{note}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={note ? `${label}: ${value}. ${note}` : `${label}: ${value}`}
        className="group block rounded-md focus:outline-none focus-visible:outline-none"
      >
        {card}
      </Link>
    );
  }

  return card;
}
