# UI Polish — "Cheap 80%" Pass

**Created:** 2026-05-14 (Session 111)
**Status:** ✅ COMPLETE (Session 111, 2026-05-14)
**Scope:** Visual polish only — no flow changes, no IA changes, no new pages. The eight items below are the "cheap 80%" of the perceived-quality gap identified during the 2026-05-14 chat review of the Employee dashboard screenshot vs. the Bob reference (`Screenshots/Bob_sidebar and Hello Message.png`).

UAT remains the next priority after this pass closes — the IA-level work (bento dashboards, avatar system, command palette, illustrations) is deliberately deferred to a future "Phase 14 — Visual System" so it doesn't invalidate the in-flight UAT screenshots.

## Why now

Doing the cheap polish in parallel with the remaining UAT is safe because **none of these items change any user flow, any URL, any form field, any data**. They change borders, spacing, type scale, the top-right identity treatment, and the active-nav affordance. UAT findings against the polished surfaces remain valid; only the screenshots look more finished.

## The eight items

### 1. Soften the global border colour

**Problem:** Tailwind v4 ships with `border-color: currentColor` as the default, which means any `className="border"` without an explicit colour inherits `--foreground` (near-black). The KushHR codebase has dozens of these bare `border` utilities, producing the hard dark lines visible around the sidebar, cards, and tables in the screenshot.

**Fix:** add a single base layer rule in `src/app/globals.css` that resets the default border colour to `var(--border)`. This is the canonical shadcn pattern and fixes every site at once without touching individual files.

**File:** `src/app/globals.css` — append `@layer base { * { border-color: var(--border); } }`.

**Acceptance:** the sidebar's right edge, every card border, every `divide-y divide-border` table separator, and every `loading.tsx` skeleton now uses the light slate border token (~92% lightness) instead of near-black currentColor.

### 2. Avatar dropdown menu replaces the "Sign out" button + identity line

**Problem:** the top-right currently shows a `<form action={logout}>` rendering a bordered "Sign out" button next to "Alice Employee · employee" plain text. That treatment competes with real page actions and looks like a debug header.

**Fix:** new client component `src/components/app/user-menu.tsx` — circular avatar button (initials, teal-700 surface) that opens a small floating panel containing the display name, email, role, and a single "Sign out" action. Closes on outside click, Escape, or focus loss. The sign-out form lives inside the panel.

**File:** `src/components/app/user-menu.tsx` (NEW), `src/app/(app)/layout.tsx` (replace the inline `<form action={logout}>` + identity line with `<UserMenu user={user} />`).

**Acceptance:** the top-right strip shows just an avatar circle on hover; click reveals the menu with identity + Sign out.

### 3. Header filler removed

**Problem:** the left side of the top header shows "Secure HR workspace" and "Alice Employee · employee" — both are visual noise. The sidebar already gives navigation context; the avatar menu now carries identity. Nothing belongs on the left of that strip in v1.

**Fix:** drop the filler text. The header bar shrinks to a thin strip with the avatar on the right; can be revisited in Phase 14 with breadcrumbs or page-aware context.

**File:** `src/app/(app)/layout.tsx`.

**Acceptance:** the top strip is empty on the left and the avatar sits on the right at the same vertical centre.

### 4. Active sidebar nav state gets a brand accent

**Problem:** the active nav item ("Dashboard" in the screenshot) just gets `bg-muted` — a flat grey block. No teal, no brand expression, no left accent. It looks like a non-interactive disabled state.

**Fix:** active nav state in `src/components/app/app-shell.tsx` switches to a `bg-teal-50 text-teal-700` pill with `font-semibold`, and the icon inherits the teal-700 colour. Hover state on inactive items stays `bg-muted` (unchanged).

**File:** `src/components/app/app-shell.tsx` — `DesktopNav` and `MobileNav` `isActive` className branches.

**Acceptance:** the current route's nav item shows in teal-tinted background + teal-700 text/icon. Inactive items unchanged.

### 5. Single H1 per dashboard — greeting absorbs the title

**Problem:** the dashboard renders two competing h1-scale headings — "Hi Alice 👋" (Session 110 greeting) and "Employee dashboard" (original H1) — stacked. Either has to win, and the greeting is the warmer of the two.

**Fix:** when `firstName` is present, the greeting renders at H1 scale (text-2xl semibold tracking-normal) and the "Employee/Admin/Manager dashboard" H1 line is removed. The `description` line ("Your personal HR workspace.") stays as a muted-foreground subhead beneath the greeting. When `firstName` is null (edge case: no display_name AND no email), the original title still renders so the page never goes title-less.

**File:** `src/app/(app)/dashboard/page.tsx` — `DashboardShell` and `DashboardGreeting`.

**Acceptance:** dashboard top reads "Hi Alice 👋" + muted description, no double-H1.

### 6. MetricCard density pass

**Problem:** each metric card is `min-h-32` (128px) with a 4xl-text value centred both vertically and horizontally. Looking at the screenshot, the value `20` floats alone in a tall sparse white box — 80% whitespace, 20% content. Enterprise dashboards run denser and left-align value/label.

**Fix:** in `src/components/ui/metric-card.tsx`:
  - Drop the visible border (`border border-slate-200` → no border)
  - Add `shadow-sm` for depth
  - Reduce default `min-h-32` → `min-h-24`, `min-h-24` → `min-h-20` (subtle tone)
  - Left-align label + value (was centered)
  - Reduce value type scale: default `text-4xl` → `text-3xl`; subtle stays `text-2xl`
  - Stack label / value / note tightly with `gap-1` instead of `flex-1`-centered fill
  - Hover affordance keeps the teal-300 border-on-hover treatment (re-uses the same border token) — the card grows a border on hover only, so the resting state is borderless

**File:** `src/components/ui/metric-card.tsx`.

**Acceptance:** the metric grid reads denser and ledger-like — label top-left, large left-aligned value, optional note in muted text below; no resting border, subtle shadow, teal accent on hover.

### 7. Card containers swap visible border for shadow

**Problem:** the `<section>`s used by `Panel`, `audit-logs`, `departments`, `documents`, `payroll`, `performance`, and the dashboard top-level containers all use `rounded-xl border bg-card shadow`. Bare `border` was harsh (fixed by item 1), but even with the softer border the look is dated — modern card surfaces lean on shadow + subtle background tint rather than a visible 1px outline.

**Fix:** retained — the global border softening from item 1 already reduces the contrast to slate-200-equivalent. The card surfaces themselves keep their `border` + `shadow` to preserve the existing visual rhythm. Revisit in Phase 14 if the user wants to push further (e.g. drop the border entirely on cards, increase shadow).

**No file change in this batch** — item kept on the list so a future review knows it was considered and intentionally deferred.

### 8. Sidebar resize handle visibility

**Problem:** the drag-resize handle on the expanded sidebar's right edge is `bg-transparent hover:bg-primary/30`. The "primary" token in this codebase is near-black slate (oklch 0.21), so the hover preview is a dark stripe — readable but not on-brand.

**Fix:** change the handle hover to `hover:bg-teal-500/30` so it matches the brand accent introduced in item 4.

**File:** `src/components/app/app-shell.tsx`.

**Acceptance:** hovering near the right edge of the expanded sidebar shows a teal 1px hover stripe.

## What is deliberately NOT in this pass

Moved to the consolidated pending backlog under "Phase 14 — Visual System": **[`docs/pending-backlog.md`](pending-backlog.md)**. Update that file when adding or removing deferred items — do not re-fork the list back into this doc.

## Verification

- `npx tsc --noEmit` — clean
- Targeted Playwright admin run — `127/127` expected (no test selectors changed since Batch 6)
- Manual visual check: dashboard, people directory, leave admin, audit logs, settings, performance, payroll

## Cross-references

- Session 111 in `handover.md`
- Row 72 in `MainProjectSteps.md`
- Phase 13 entry in `docs/current-phase.md`
- Reference design: `Screenshots/Bob_sidebar and Hello Message.png`
