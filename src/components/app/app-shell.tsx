"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileBarChart,
  FileText,
  LayoutDashboard,
  Settings,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import { KushLogo } from "@/components/app/kush-logo";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/server/authz/roles";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "People", icon: Users },
  { href: "/departments", label: "Departments", icon: Building2, roles: ["admin"] },
  { href: "/leave", label: "Leave", icon: CalendarDays },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/performance", label: "Performance", icon: Target },
  { href: "/payroll", label: "Payroll", icon: WalletCards, roles: ["admin", "manager", "employee"] },
  { href: "/reports", label: "Reports", icon: FileBarChart, roles: ["admin"] },
  { href: "/audit-logs", label: "Audit Logs", icon: BarChart3, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

const COLLAPSED_WIDTH = 64; // px — slim icon-only column
const DEFAULT_EXPANDED_WIDTH = 256;
const MIN_EXPANDED_WIDTH = 192;
const MAX_EXPANDED_WIDTH = 384;
const STORAGE_COLLAPSED = "kushhr.sidebar.collapsed";
const STORAGE_WIDTH = "kushhr.sidebar.width";

function visibleItems(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

interface AppShellProps {
  role: UserRole;
  children: React.ReactNode;
  header: React.ReactNode;
}

export function AppShell({ role, children, header }: AppShellProps) {
  const items = visibleItems(role);
  const [mounted, setMounted] = useState(false);
  // Default: collapsed. Users opt into the expanded labeled state, which then
  // sticks via localStorage. Keeps first-visit chrome minimal.
  const [collapsed, setCollapsed] = useState(true);
  const [expandedWidth, setExpandedWidth] = useState(DEFAULT_EXPANDED_WIDTH);
  const dragging = useRef(false);

  // Hydrate persisted prefs after mount — avoids SSR/CSR mismatch. Intentional
  // setState-in-effect: a one-time mount flip + localStorage read ([] deps) is the
  // canonical legitimate use the rule false-positives on.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
    try {
      const c = window.localStorage.getItem(STORAGE_COLLAPSED);
      // Only override the collapsed default when an explicit pref is present.
      if (c === "0") setCollapsed(false);
      else if (c === "1") setCollapsed(true);
      const w = Number(window.localStorage.getItem(STORAGE_WIDTH));
      if (Number.isFinite(w) && w >= MIN_EXPANDED_WIDTH && w <= MAX_EXPANDED_WIDTH) {
        setExpandedWidth(w);
      }
    } catch {
      /* localStorage unavailable — fall back to defaults */
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const width = collapsed ? COLLAPSED_WIDTH : expandedWidth;

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_COLLAPSED, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  // Drag-to-resize while expanded. Listeners attached on pointerdown of the
  // handle and removed on pointerup so we don't leak global listeners.
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_EXPANDED_WIDTH, Math.max(MIN_EXPANDED_WIDTH, ev.clientX));
      setExpandedWidth(next);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        // Read once on commit — avoids stale-closure write of initial value.
        const finalWidth = parseInt(
          document.documentElement.style.getPropertyValue("--sidebar-width") || "0",
          10,
        );
        if (finalWidth) window.localStorage.setItem(STORAGE_WIDTH, String(finalWidth));
      } catch {}
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Mirror width to a CSS var on the root so the main column's padding tracks
  // it without re-rendering the children tree on every drag tick.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [width]);

  // Persist the width once dragging settles, via the final width effect above.
  useEffect(() => {
    if (collapsed) return;
    try {
      window.localStorage.setItem(STORAGE_WIDTH, String(expandedWidth));
    } catch {}
  }, [expandedWidth, collapsed]);

  return (
    <div className="min-h-screen bg-muted/40 text-foreground">
      <aside
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-20 hidden border-r bg-card lg:flex lg:flex-col"
        style={mounted ? { width } : { width: COLLAPSED_WIDTH }}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b",
            collapsed ? "justify-center" : "gap-2 px-3",
          )}
        >
          <Link
            href="/dashboard"
            aria-label="KushHR home"
            className={cn("flex shrink-0 items-center", !collapsed && "flex-1 px-2")}
          >
            <KushLogo iconOnly={collapsed} />
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronsLeft aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center px-3 pt-2">
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronsRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        <DesktopNav items={items} collapsed={collapsed} />

        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={onDragStart}
            className="absolute inset-y-0 right-0 w-1 cursor-col-resize bg-transparent hover:bg-teal-500/30"
          />
        )}
      </aside>

      <div
        // Tailwind fallback matches the SSR sidebar width (collapsed/64px = 4rem)
        // so we don't need an inline `style` override during SSR — which would
        // otherwise leak the desktop padding to <lg viewports (where the sidebar
        // is hidden) and produce a spurious left indent on mobile/tablet first
        // paint.
        className="lg:[padding-left:var(--sidebar-width,4rem)]"
      >
        {header}
        <main className="px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-6">{children}</main>
      </div>

      <MobileNav items={items} />
    </div>
  );
}

function DesktopNav({ items, collapsed }: { items: NavItem[]; collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground",
              isActive && "bg-teal-50 font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-700",
              collapsed && "justify-center px-0",
            )}
          >
            <item.icon
              aria-hidden="true"
              className={cn("size-4 shrink-0", isActive && "text-teal-700")}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {collapsed && <span className="sr-only">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border bg-card lg:hidden"
    >
      <div className="flex overflow-x-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-20 flex-col items-center justify-center gap-1 px-2 text-xs font-medium text-muted-foreground",
                isActive && "font-semibold text-teal-700",
              )}
            >
              <item.icon
                aria-hidden="true"
                className={cn("size-4", isActive && "text-teal-700")}
              />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
