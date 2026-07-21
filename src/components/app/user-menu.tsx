"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/server/actions/auth";

interface UserMenuProps {
  userId: string;
  displayName: string | null;
  email: string;
  role: string;
}

function initialsFor(displayName: string | null, email: string): string {
  const name = (displayName ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join("");
  }
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

export function UserMenu({ userId, displayName, email, role }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click or Escape — keeps the menu unobtrusive without
  // pulling in a full popover primitive.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = initialsFor(displayName, email);
  const label = displayName ?? email;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${label}`}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex size-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b px-3 py-3">
            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{role}</p>
          </div>
          <Link
            href={`/employees/${userId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            View my profile
          </Link>
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center border-t px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
