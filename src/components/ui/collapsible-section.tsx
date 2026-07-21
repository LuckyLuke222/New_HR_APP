"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  id,
  title,
  children,
  defaultOpen = false,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  // Controlled `open` so RSC re-renders after a Server Action's
  // `revalidatePath` do not reset the user's expand/collapse state — the
  // previous uncontrolled-via-prop variant slammed the panel shut on every
  // revalidate because React reconciliation re-applies `open={false}`.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group scroll-mt-4 rounded-md border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 [&::-webkit-details-marker]:hidden">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-500 transition group-open:rotate-180"
        />
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
