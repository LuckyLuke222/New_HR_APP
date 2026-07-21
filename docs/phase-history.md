# Current Phase

## Phase 13 — AI-Built App Risk Audit

Status: **Complete; manual human review pending/in progress** — evidence report, Phase 13 remediation, and `/ultrareview` remediation are complete. Current decision: **GO WITH RESIDUAL EXTERNAL WATCH** pending manual human-flow UAT, user-flow comparison, and final multi-AI review evidence. See `docs/ai-built-app-risk-audit.md`, `docs/checks/phase-13.md`, `docs/ultrareview-findings.md`, and `userflow.doc`.

### Checklist

- [x] Use `deep-research-report-summary.md` as the audit source file.
- [x] Produce evidence report: `docs/ai-built-app-risk-audit.md`.
- [x] Fix/confirm Playwright browser auth.
- [x] Restore full authenticated E2E suite to green.
- [x] Make leave-balance decrement failure visible when no matching balance row exists.
- [x] Standardize `auth.access_denied` audit logging for sensitive denied business actions.
- [x] Remove or justify unused form dependencies.
- [x] Continue tracking external Next/PostCSS advisory.
- [x] Prepare manual Admin/Manager/Employee scenario test plan.
- [x] Start independent Claude Code cloud `/ultrareview` using a full-codebase review-only PR.
- [x] Record and remediate all confirmed `/ultrareview` findings.
- [x] Clean Playwright-created dummy records from the manual review environment and add a reusable cleanup utility.
- [x] Fix manual-review performance-cycle blocker so managers can select active admin-created cycles before goals/reviews exist.
- [x] Fix stale employee profile Documents/Leave/Audit tabs so they use real module data instead of placeholder copy.
- [x] Fix manager goal editing discoverability with row-level Edit actions and prefilled audited goal updates.
- [x] Fix employee goal-progress updates with scoped notes, progress percentage, completion, audit logs, and cross-employee guard coverage.
- [x] Fix first-login/password-reset UX with public forgot/reset pages and an admin-generated audited recovery link from employee profiles.
- [x] Fix leave approval failure feedback so managers see missing-balance and insufficient-balance reasons instead of a generic approval error.
- [x] Fix leave balance context so applicants and approvers see relevant balance/requested-day information before submission or approval.
- [x] Fix role/job-title clarity by adding admin form guidance that role controls access and job title is HR profile text.
- [x] Start searchable-select remediation with employee create/edit Department and Manager fields, including server-side typed-label fallback. (Codex, Session 44)
- [x] Continue searchable-select remediation with performance Employee and Review-cycle selectors in `GoalForm` and `ManagerReviewForm`; extract shared `SearchableSelectField`; add scoped server-side label resolution in `savePerformanceGoal` and `submitManagerReview`. (Claude, Session 45)
- [x] Continue searchable-select remediation with `/leave/admin` balance Employee and Leave-type selectors; reuse shared `SearchableSelectField`; add admin-scoped employee label resolution and active leave-type label resolution in `upsertLeaveBalance`. (Codex, Session 47)
- [x] Continue searchable-select remediation with `/documents` admin upload Employee selector; reuse shared `SearchableSelectField`; add admin-scoped employee label resolution in `uploadDocument`. (Codex, Session 48)
- [x] Continue searchable-select remediation with `/payroll` admin employee picker; reuse shared `SearchableSelectField`; resolve typed labels against all employees before loading compensation. (Codex, Session 49)
- [x] Complete searchable-select remediation with onboarding assignment Employee and Template selectors; reuse shared `SearchableSelectField`; add role-scoped employee label resolution and active-template label resolution in onboarding assignment actions. (Codex, Session 50)
- [x] Make dashboard MetricCards navigable to role-appropriate routes (admin: `/employees`, `/leave?status=pending`, `/onboarding/admin`, `/performance`; manager: `/employees`, `/leave?status=pending`, `/leave?status=approved`, `/performance`; employee: `/leave`, `/onboarding`, `/performance`, `/payroll`). UI-only change with composed `aria-label` and hover/focus styling. (Claude, Session 51)
- [x] Surface important pending tasks on manager and employee dashboards. Manager dashboard "Action items" panel lists up to 5 pending direct-report leave requests; employee dashboard "Action items" panel lists up to 5 pending own onboarding tasks sorted by due date. (Claude, Session 52)
- [x] Make create-cycle success obvious. `ReviewCycleForm` shows a Next-steps panel after creation with jump links to Set a goal, Open the review queue, and View all cycles, plus a Draft-state hint that the cycle must be set Active before managers can use it. (Claude, Session 53)
- [x] Reduce employee dashboard payroll exposure: the Payroll summary metric card no longer shows the salary amount. The card is now a navigation entry to `/payroll` with value `Open` (or `—` when no compensation row exists) and a note containing only pay frequency. (Claude, Session 54)
- [x] Convert compensation Currency to a dropdown of MUR/AED/USD. Server-side `upsertCompensation` Zod schema enforces the same allowed set after trim/upcase. (Claude, Session 55)
- [x] Convert compensation Bank name to a Mauritius bank dropdown. Added `src/lib/mauritius-banks.ts`; `CompensationForm` renders the list as `<option>`s; server-side `.refine` rejects values outside the list. Records with a non-listed bank name open the dropdown unselected, forcing an explicit re-pick. (Claude, Session 56)
- [x] Add passport number and nationality to compensation. Migration `0027_compensation_passport_nationality.sql` adds nullable `passport_number` and `nationality` to `employee_compensation`; DAL/action/form updated; RLS unchanged (admin-only sensitive columns; not added to the employee summary projection). Remote migration applied. (Claude, Session 57)
- [x] Localize leave taxonomy and policy. Migration `0028_localize_leave_taxonomy.sql` renames `Annual Leave` → `Local Leave` (FK-safe), updates descriptions to reflect 22 days/year (3 urgent included) for Local Leave and 15 days/year for Sick Leave, and deactivates `Unpaid Leave`. `createEmployee` now seeds default current-year balances of 22 Local + 15 Sick. Seed file aligned to the new defaults; tests renamed "Annual Leave" → "Local Leave". (Claude, Session 58)
- [x] Manual review Round 3 (2026-05-07) — incorporated into `docs/checks/phase-13.md`. All 13 items below are closed.
  - [x] Split employee dashboard leave-balance metric so Local and Sick are visible separately. (Claude, Session 61)
  - [x] Default phone field to `+230 ` (editable) wherever phone is captured. (Claude, Session 62)
  - [x] Default new-employee `workLocation` to `Mauritius`. (Claude, Session 63)
  - [x] Preserve form input on createEmployee failure; audit and fix the same anti-pattern across all other forms. Completed in Session 65: employees, compensation (form + change request + reject), leave (request + decision/approver note + admin types/balances), documents (employee/category/title — file input intentionally not round-tripped), performance (cycle/goal/manager review/self-review/employee progress), onboarding (assign template + individual + template create + item add + completion note). Sensitive `bankAccountNumber` (password input) is intentionally excluded. Regression added in `tests/e2e/admin.spec.ts` for the duplicate-email failure path on the employee form.
  - [x] Investigate / reproduce the residual generic "Employee account could not be created" path Session 59 did not cover. Closed in Session 66: typed Supabase auth-error reason map covers duplicate, invalid email, weak password, signup disabled, email rate limit, email provider disabled; unknown codes fall through to a last-resort message that quotes code/HTTP status/message so the admin sees the actual API response in the toast. Profile / record DB failures now include the Postgres error code in the toast. Toast format unified as "Could not create employee: <reason>".
  - [x] Add mandatory-field validation policy (start with compensation: tax_id, national_id required) and tighten Zod + client `required` consistently. Sessions 67-69 closed compensation, employee form (jobTitle now required + required attrs on displayName/workEmail/jobTitle/startDate; own-profile displayName too), document upload (required attrs on category/title/file), performance forms (cycle/goal/review/self-review/progress required and bounded fields), onboarding forms (template, assignment, item, completion-note attrs), and leave forms (request HTML validation plus leave-balance blank number guards). New Zod-boundary regressions cover compensation, performance goal cycle/progress, leave balance/year, and onboarding individual-task title by bypassing HTML `required`.
  - [x] Document and enforce allowed document upload MIME types + size limits per category. Closed in Session 70: policy documented in `docs/security-model.md`; shared `src/lib/document-upload-policy.ts` drives UI accept hints and Server Action validation; `uploadDocument` rejects over-size, MIME mismatch, and extension mismatch before Storage; migration `0029_document_upload_policy.sql` caps `hr-documents` at 10 MiB and aligns the bucket MIME union; remote migrations aligned through `0029`; targeted admin/employee document upload regressions pass.
  - [x] Make `/performance` summary cards navigable; sweep other modules for the same gap. Closed in Session 71: Active goals / Visible cycles / Submitted reviews are now `next/link` anchors to `#performance-goals`, `#review-cycles`, and `#performance-reviews` with hover/focus affordance. Adjacent pages named in the finding did not have standalone unlinked KPI summary tiles; main dashboard MetricCards were already linked.
  - [x] Make review-cycle list rows clickable to edit (status, window, title). Closed in Session 72: admin-only row-level Edit links open `/performance?cycleId=<id>#cycle-form`, prefill the existing cycle form in edit mode, save via `updateReviewCycle`, and audit `performance.cycle_activated` / `performance.cycle_closed` / `performance.cycle_updated` with previous/new status.
  - [x] Collapse `/performance` "Create cycle" and "Set/update goal" forms by default; sweep other long pages. Closed in Session 73: added shared native `CollapsibleSection`; `/performance` now shows cards -> cycles -> goals before closed create/update forms, while edit links open the relevant form by query state. `/documents` upload, `/onboarding/admin` assignment/templates, and `/leave/admin` add/update forms now follow the same collapsed-by-default pattern where useful lists remain visible.
  - [x] Fix Supabase recovery link "Verify requires a verification type" on `/reset-password`. Closed in Session 74: reset page now verifies `code`, `token_hash&type=recovery`, or access/refresh token URL shapes before enabling password update; admin-generated employee reset links now use the app-owned `token_hash` URL. Regression creates a temporary Auth user, updates the password through `/reset-password`, and signs in with the new password.
  - [x] Fix public forgot-password recovery request after manual review found `AuthPKCECodeVerifierMissingError` and Supabase `email_address_invalid` for demo `@kushhr.dev` accounts. Closed in Session 79: public reset requests now run through a plain Supabase JS implicit-flow client, so Supabase does not issue a verifier-dependent PKCE link; audit evidence is recorded through `/api/auth/password-reset-requested`, and invalid demo/non-deliverable emails get a specific visible message.
  - [x] Make password-reset completion explicit. Closed in Session 80: after `updateUser` succeeds, `/reset-password` signs out the local recovery session and redirects to `/login?message=password-updated`; `/login` shows "Password updated. Sign in with your new password." so users must authenticate with the new password instead of remaining in the recovery session.
  - [x] Remove the forgot-password native-submit hydration gap. Closed in Session 81: `/forgot-password` no longer renders a native form that can submit before React attaches the Supabase reset handler; the email input remains uncontrolled and the action button cannot reload the page before hydration, preventing the first-click page refresh/email wipe seen in manual review.
  - [x] Add full-link copy support and incomplete-link feedback for admin-generated reset links. Closed in Session 82: employee profile reset links now render in a wrapping read-only field with a Copy button that copies the exact full URL, and `/reset-password` explains partial token-hash links instead of attempting verification.
  - [x] Require an actual recovery link on `/reset-password`. Closed in Session 83: a normal signed-in employee session no longer enables password update on `/reset-password` without `code`, `token_hash`, or access/refresh recovery parameters.
  - [x] Add urgent-day remark/justification on the leave request form (Local Leave, 3-day urgent quota). Closed in Session 75: `/leave/new` exposes a Local Leave-only urgent checkbox with required reason, persists the request context on `leave_requests`, includes non-sensitive audit metadata, and shows the urgent reason on approver rows while leaving `leave_balances` and the approval trigger as the balance owners.
  - [x] Add a "Recent updates" panel on the employee dashboard for leave decisions and other status changes. Closed in Session 76: employee dashboard derives recent update rows from `leave_requests`, `onboarding_tasks`, `performance_reviews`, and `documents`, links each row to its owning module, and keeps dashboard state read-only.
- [ ] Complete manual human-flow UAT and record pass/fail evidence. Not complete yet.
- [ ] Build KushHR user-flow inventory and compare against established HRMS products using `userflow.doc`.
- [ ] Run final reviews with multiple AI systems after manual UAT and user-flow comparison.

### Current Priority

1. Complete manual Admin/Manager/Employee human-flow review using `docs/checks/phase-13.md`.
   - **Handover note (2026-05-12, end of Session 99):** Codex completed **Batch 13** E4+F1, closing the 8may26 manual-review remediation queue in `docs/checks/phase-13.md`. Dashboard metric cards now use a centered hero value, subordinate label/note, stable height, and tabular numerals via the shared dashboard `MetricCard`. The Next.js dev overlay is documented as dev-only diagnostics, and `next.config.ts` sets `devIndicators: false` for a quieter local reviewer experience. Strategy remains: user runs the full suite at the final boundary with `lsof -ti:3000 | xargs kill 2>/dev/null`, `npm run cleanup:e2e-data`, then `npx playwright test --reporter=line`.
   - **shadcn/ui adoption — Session 100 (Claude, 2026-05-12):** initialized shadcn/ui on the existing Tailwind v4 + Next 16 + React 19 stack (slate base color, new-york style, light only, Arial preserved via `--font-sans`). Added `button`, `input`, `label`, `card`, `table`, `dialog`, `select`, `alert`, `badge`, `textarea`, `separator`, `tabs`, and `sonner` (replaces deprecated `toast`). Extracted previously file-local `Field` (3 callers) and `MetricCard` (2 callers) into shared `src/components/ui/field.tsx` and `src/components/ui/metric-card.tsx`. Migrated `/forgot-password` and `/reset-password` to shadcn primitives as the proof-of-concept pass. **Constraints respected**: no `react-hook-form`; native `<form action={...}>` + `useActionState` + `state.values` round-trip pattern preserved; no Server Action / Zod / audit / RLS / DAL / schema changes; light mode only (dropped the `prefers-color-scheme` auto-flip); C1 cursor rule preserved. Full Playwright suite 110/110 after the migration.
   - **shadcn/ui adoption — Session 101 (Claude, 2026-05-13):** migrated `/login` to shadcn primitives (`Card`, `Label`, `Input`, `Alert`, `Button`). Inputs intentionally remain uncontrolled to preserve Session 84's autofill compatibility. Suspense fallback shell also moved to shadcn `Card`. All Playwright selectors preserved; targeted smoke suite 11/11. Unauthenticated surface now fully on shadcn primitives.
   - **shadcn/ui adoption — Session 102 (Claude, 2026-05-13):** migrated the three role dashboards (`src/app/(app)/dashboard/page.tsx`). Panel `<section>` + `<h2>` retained (shadcn `Card`/`CardTitle` render `<div>` and would break `section`-filter + `getByRole("heading")` selectors) — Card token classes applied to the existing `<section>` instead. Error block now uses shadcn `Alert`. Token sweep across all panels, lists, empty states, and report items; accent icon colors retained as semantic row-kind discriminators. Targeted `playwright test -g "dashboard"`: 11/11. Recommended a full Playwright run as the next safety net before continuing into the form-heavy pages.
   - **shadcn/ui adoption — Session 103 (Claude, 2026-05-13):** migrated the four big forms (employee, compensation, Settings, performance) in four sequential commits. Native `<select>` retained throughout (Playwright + Phase 13 C6 constraint), styled with a shared `SELECT_CLASS` to match shadcn `Input` visually. Top-of-form messages on compensation + Settings moved to shadcn `Alert`. Compensation `bankAccountNumber` stays native (Session 65 round-trip exclusion). All field `name`/`id`/`defaultValue`/`required` attributes and the C2 inline-near-Save status pattern preserved. Token sweep across all four files. Targeted suites: 9/9 employee, 14/14 compensation, 6/6 Settings, 20/20 performance.
   - **shadcn/ui adoption — Session 104 (Claude, 2026-05-13):** migrated the list/queue pages in four sequential commits: employees + People directories; leave list + leave/new + leave decision/cancel sub-forms; payroll change-requests page + form + queue; audit logs. All filter forms moved to shadcn `Input`/`Label`/`Button` (native `<select>` retained with token classes); error blocks → shadcn `Alert`. Three status-badge components (employees, leave, change-requests) converted to shadcn `Badge` with semantic accent shades retained (emerald = approved/active, amber = inactive/pending/urgent, destructive = rejected, muted = cancelled/terminated). Leave-request form's controlled `value`/`onChange` cross-field validation pattern preserved verbatim. Targeted suites: 9/9 employees, 33/33 leave, 5/5 change requests, 9/9 audit.
   - **UAT-flow remediation — Sessions 106–110 (Claude, 2026-05-14) — ALL BATCHES CLOSED:** new 13May26 triage in `docs/uat-flows/employee-profile-lifecycle.md` recorded 9 findings grouped A1–A3 (correctness), B1–B2 (labels), C1–C3 (pattern consistency), D1–D4 (directory/dashboard product), E1 (acknowledged no-action). All six batches (Batches 1–6) are now ✅ COMPLETE; only E1 remains as an acknowledged non-issue. **Batch 6 (Session 110)** — D4: new client `AppShell` (`src/components/app/app-shell.tsx`) replaces the inline `<aside>` in `(app)/layout.tsx`; slim 64px icon-only collapsed state (logo via existing `iconOnly`, nav links use `sr-only` labels + `title` tooltips), expanded state defaults to 256px and drag-resizes 192–384px via a 1px right-edge handle; effective width mirrored onto `--sidebar-width` CSS var on `<html>` so the main column padding tracks without re-renders. Persistence: `kushhr.sidebar.collapsed` + `kushhr.sidebar.width` in localStorage; hydration deferred until after mount to avoid SSR/CSR mismatch. Greeting `Hi {firstName} 👋` rendered at the top of `DashboardShell` for all three role variants via a server-side `extractFirstName` that splits `display_name` on first whitespace with email local-part fallback. 2 new Playwright pins; admin suite 125 → 127 (+2). Highlights: **Batch 1 (Session 106)** — A1 revalidates `/employees/[id]/edit` and makes Status / End-date controlled with auto-default to fix terminate-save reverting to Active; A2 OR-fallback predicate in `getAdminDashboardData` catches null-end_date rows for Leavers count; A3 separate Entity ID filter on `/audit-logs` (DAL already supported it). **Batch 2 (Session 106)** — B1 `phoneToNull` preprocess strips country-code-only phone saves to null + `displayPhone` helper for legacy "+230" rows; B2 `formatEnum` promoted to shared with capitalisation. **Batch 3 (Session 107)** — C1 inline near-Save status on Settings (last form missing the Phase 13 Batch 8 pattern); C2 operational cards share `MetricCard` via new `tone="subtle"` variant; C3 `formatDateCompact()` for row-dense Start Date column. **Batch 4 (Session 108)** — directory defaults to status=Active; Role + Department filters on admin/manager scope (Role skipped for employees to preserve migration-0033 RPC privacy boundary); Starters MetricCard deep-links to `?recent=starters`. **Batch 5 (Session 109)** — "Incomplete profiles" → **"Needs attention"** with 4 anomaly rules (no manager / no department / no work email / missing identity); new admin-only `/employees?attention=1` drilldown with amber reason badges via `getEmployeesNeedingAttention()` admin-client DAL helper. Admin Playwright suite grew 110 → 127 across the six batches (+17 new pins). All six batches marked ✅ COMPLETE in the UAT doc. (Claude)
   - **Leave-balance adjustment provenance — Session 114 (Claude, 2026-05-15) — COMPLETE:** closed the only scheduled item in `docs/pending-backlog.md` § 2 (UAT-discovered refinements). Migration `0034_leave_balance_adjustment_provenance.sql` adds nullable `adjustment_reason` (≤500 chars, mirrors `urgent_leave_reason`), `adjusted_at`, `adjusted_by` on `leave_balances`; applied to remote via `supabase db push --linked`. `upsertLeaveBalance` requires a 3..500-char reason and sets all three columns on every save; `createEmployee.seedDefaultLeaveBalances` and `rolloverLeaveBalances` intentionally leave them null so `adjusted_at IS NOT NULL` cleanly distinguishes manual overrides. UI: `/leave/admin` table gains a Provenance column ("Manually adjusted" pill + adjuster name + date + reason, or "Auto-seeded"); employee `/leave` balance cards show an amber "Manually adjusted" shadcn `Badge`. State owner unchanged: `leave_balances` still holds truth; `trg_leave_balance_on_approval` (migration 0019) is still the only writer for approval-driven decrements. Audit metadata on `leave_balance.updated` now includes the reason. UAT finding logged under new "Findings — leave allocation" section in `docs/uat-flows/employee-profile-lifecycle.md`. `tsc --noEmit` clean. (Claude)
   - **Security & RBAC UAT — Session 122 (Claude, 2026-05-20) — COMPLETE (forge + data-layer + visual passes):** walked the manual portion of `docs/uat-flows/security-and-rbac-guards.md`. All five forge attempts (B22, B24, B25 UI check, C26, C27) confirmed server-side guards reject crafted Server Action submissions and emit structured `auth.access_denied` audit rows with `reason` metadata. Group E (anon redirects + reset-password no-token) and Group F (audit-log structure + private-bucket signed-URL forge: variant A strips token → `querystring must have required property token`; variant B `/public/` → `bucket not found`; variant C `/authenticated/` → `authorization header required` — all denied) all passed. 15 findings recorded in the UAT doc and triaged: **Critical (3)** — overlapping leave accepted, manager field accepts free-text, audit-observability gap on zod-fail / row-not-found branches; **High (4)** — Chrome 404 vs. Firefox "Access Denied" inconsistency, appraisal/goal still editable after submit, unrouted leave (no manager) has no admin signal, onboarding task comment persists across tasks; **Medium (6)** — no self-profile route from avatar, directory rows not clickable (B30 404), Overview vs. Job tabs identical, date of birth missing everywhere, reset-password stuck on "Checking reset link…" instead of friendly invalid message, "Mark complete" doesn't look like a button; **Low (2)** — audit-log table not horizontally mouse-scrollable, forgot-password validation error rendered twice. Batched into 9 remediation groups (B1 leave integrity, B2 manager field constraint, B3 audit observability, B4 access-denied consistency, B5 submission lock, B6 onboarding UX, B7 profile access & navigation, B8 auth flow polish, B9 audit-log mouse nav) with recommended sequencing B1→B3→B2→B4→B5→B6→B7→B8→B9. Two product questions block B5 and B7 (appraisal/goal lock policy; peer-view fields + Overview/Job merge). Full batch table and questions appended to the UAT doc. No code changes this session. (Claude)
   - **Cross-tab stale-chrome / mixed-identity visual bug — Session 121 (Claude, 2026-05-18) — COMPLETE:** user halted the security-and-rbac-guards UAT after `Screenshots/Critical1.png` showed Alex Admin sidebar + user menu over Alice's dashboard body in Browser 1. Only reproducible in the same browser profile (Chrome+Chrome new tab — shared cookie jar); confirmed not reproducible across separate browser apps (Firefox+Chrome). No data crossed any session boundary — the Server returned Alice's content for Alice's cookie at the moment of partial re-fetch; the bug was that Tab 1's chrome (sidebar + user menu) stayed painted from Alex's earlier render because Next.js had no signal that the auth cookie had changed under it. For an HR app the visual mix is trust-shattering even though it is not a security leak; fixed before resuming UAT. Fix: new `src/components/app/auth-sync.tsx` subscribes to `supabase.auth.onAuthStateChange` on the client and calls `router.refresh()` on `SIGNED_OUT` or on `SIGNED_IN` with a different user id than the server-rendered `serverUserId` prop; mounted once in `(app)/layout.tsx`. `logout` now also calls `revalidatePath("/", "layout")` before redirect, dropping the client Router Cache. Same-browser two-tab manual reproduction step added to `docs/uat-flows/security-and-rbac-guards.md` Group A; durable lesson recorded in `learning.md`. Playwright integration deferred to a follow-up — one `BrowserContext` + two `Page` objects share a cookie jar, so the scenario is testable. `tsc --noEmit` clean. (Claude)
   - **UI polish "cheap 80%" pass — Session 111 (Claude, 2026-05-14) — COMPLETE:** user flagged the dashboard look (hard dark borders, double H1, filler header text, flat grey active-nav, sparse oversized metric cards) as feeling amateurish vs. the Bob reference. Distinguished cheap polish (pure visual, no flow change) from deeper IA (bento, avatars, cmd+k, illustrations) and landed the cheap pass before resuming UAT. Eight items, all documented in `docs/ui-polish.md` with file:line citations and acceptance criteria: (1) base `border-color: var(--border)` reset in `globals.css` — fixes Tailwind v4's `currentColor` default that was inheriting near-black on every bare `border` utility; (2) new `UserMenu` client component (`src/components/app/user-menu.tsx`) — avatar circle with initials → dropdown panel with name/email/role/Sign-out, outside-click + Esc close; (3) header filler removed (`src/app/(app)/layout.tsx`) — `h-16` strip with "Secure HR workspace" + identity line replaced by an `h-14` strip carrying only the avatar; (4) brand teal active-nav state (`bg-teal-50 text-teal-700`) in both Desktop and Mobile nav (`src/components/app/app-shell.tsx`); (5) `DashboardGreeting` promoted to `<h1>` and replaces the role-dashboard title when `firstName` is present, so each dashboard has exactly one H1 (fallback to original title when `firstName` is null); (6) `MetricCard` density — borderless `bg-white shadow-sm` surface, left-aligned label/value/note stacked tightly, `text-4xl → text-3xl`, `min-h-32 → min-h-24`, slate colours swapped for design tokens (`text-muted-foreground`, `text-foreground`); (7) card-container border treatment deferred (item 1 already softened the contrast — kept in plan doc for traceability); (8) sidebar drag-handle hover `bg-primary/30` → `bg-teal-500/30` so the hover preview matches the new accent. `tsc --noEmit` clean; no test selectors changed; admin suite 127/127 expected. Phase 14 (bento dashboards, avatar/photo system, cmd+k palette, illustrations, density toggle) explicitly deferred until after manual UAT closes.
   - **shadcn/ui adoption — Session 105 (Claude, 2026-05-13) — MIGRATION COMPLETE:** four queued stragglers (documents, onboarding, payroll picker, leave admin panels) + chrome leftovers (layout, navigation, kush-logo, access-denied, error, every `loading.tsx` skeleton) + secondary pages previously only partially touched (departments + forms, employees/new, employees/[id], employees/[id]/edit, performance, performance/reviews, settings shell, performance-lists, password-reset-button). Approach: targeted `sed -E` token sweeps with a follow-up artifact pass. Status-pill semantic shades retained on shadcn `Badge`. After this session **zero legacy `slate-*` / `teal-*` / `bg-white` classes remain** anywhere in `src/app/(app)/` or `src/components/` (excluding shadcn `ui/` primitives). All hard constraints preserved across the whole migration: no `react-hook-form`, no shadcn `Form`, native form + `useActionState` + `state.values` round-trip, native `<select>` everywhere (Playwright contract), bankAccountNumber + document file inputs not round-tripped, Mauritius defaults intact, C1 cursor rule preserved. Targeted suites: 6/6 documents, 12/12 onboarding, 11/11 payroll, 7/7 leave admin, 13/13 secondary pages sweep. **Ready for the final full-suite Playwright run** to lock in the migration.
2. Resume the Remaining-Before-Final-Sign-Off list (manual UAT pass, user-flow inventory, multi-AI final review).
3. Build the KushHR user-flow inventory and HRMS comparison matrix using `userflow.doc`.
4. Run final reviews with multiple AI systems.
5. Continue tracking the external Next/PostCSS advisory after compatible releases.

### Pending Backlog

All open items (pre-sign-off, UAT refinements, Phase 14 visual system, post-UAT product backlog, external watch list, final knowledge capture) are consolidated in **[`docs/pending-backlog.md`](pending-backlog.md)**. That file is the single source of truth — add new pending items there and follow the "How to keep this file up to date" rules at the bottom of it.

### Notes

- Manual browser login confirmed by the user on 2026-04-29 for `admin@kushhr.dev`.
- Playwright auth setup now signs in via Supabase Auth and writes role storage states directly.
- Full Playwright suite: PASS — 50/50 on 2026-04-29.
- Added and passed business-flow scenario coverage:
  - Admin creates a new employee, verifies profile/job record/Auth account, assigns onboarding, new employee logs in, and completes the task.
  - Manager approves a direct-report leave request, verifies audit evidence, and confirms the balance decrement trigger.
- Standardized denied-action audit logging for the Phase 13 findings: employee payslip upload, manager document upload, non-employee payroll change request submission, and leave self-rejection.
- Applied migration `0020_leave_approval_missing_balance_error.sql`; missing leave balance now blocks approval and keeps the request pending.
- Removed unused `react-hook-form` and `@hookform/resolvers` dependencies.
- Manual Admin/Manager/Employee runtime script recorded in `docs/checks/phase-13.md`.
- Claude Code cloud `/ultrareview` initiated from review-only PR #1: `ultrareview-full-codebase` compared against orphan `ultrareview-empty-base`. Do not merge this PR; close it after final sign-off if it is still open.
- `/ultrareview` produced 13 confirmed findings, all fixed and tracked in `docs/ultrareview-findings.md`. Remote migrations `0021`, `0022`, and `0023` were applied; full Playwright suite reached 65/65 after the remediation pass.
- Manual review cleanup on 2026-05-06 removed Playwright-created dummy records (`Journey Employee ...`, generated leave types/balances/requests, performance fixtures, test documents/storage objects, and onboarding tasks). Added `scripts/cleanup-playwright-artifacts.mjs` plus `npm run cleanup:e2e-data:dry-run` and `npm run cleanup:e2e-data`; post-cleanup dry run reported 0 targeted artifacts.
- Manual-review performance-cycle blocker fixed on 2026-05-06 with remote migration `0024_manager_active_cycle_visibility.sql`. Managers can now select active empty review cycles for first direct-report goals/appraisals; direct RLS and targeted manager workflow regressions pass.
- Manual-review employee profile tab placeholder bug fixed on 2026-05-06. Documents, Leave, and Audit tabs now render role-scoped summaries from real module data; targeted admin browser regression passes.
- Manual-review manager goal editing friction fixed on 2026-05-06. Managers/admins now get row-level Edit actions in the goals table; selecting a goal preloads the update form, keeps employee reassignment locked, and uses the existing audited `performance_goals` update path. Targeted manager browser regressions pass.
- Manual-review employee goal-progress gap fixed on 2026-05-06 with remote migration `0025_employee_goal_progress.sql`. Employees can now add goal-level progress notes, update progress percentage, and mark their own goals complete; forged cross-employee updates are denied and audited.
- Manual-review first-login/password-reset gap fixed on 2026-05-06. Login now links to `/forgot-password`, `/reset-password` is available for recovery links, and admins can generate an audited employee recovery link from the employee profile for first login or reset support.
- Manual-review forgot-password PKCE recovery blocker fixed on 2026-05-11. Public forgot-password now requests recovery through a plain Supabase JS implicit-flow client, so the emailed reset link no longer depends on a stored PKCE verifier; invalid demo/non-deliverable email responses surface specific UI feedback. Admin-generated reset links remain token-hash based. (Codex, Session 79)
- Manual-review password-reset completion UX fixed on 2026-05-11. Password update now clears the local recovery session and redirects to `/login?message=password-updated`, where the user is told to sign in with the new password. (Codex, Session 80)
- Manual-review forgot-password first-click refresh fixed on 2026-05-11. `/forgot-password` uses a non-native client action with an uncontrolled email field, so a pre-hydration click cannot submit the page to itself, clear the typed email, or mask the real Supabase response. (Codex, Session 81)
- Manual-review admin-generated reset-link copying fixed on 2026-05-11. Employee profile reset links now include a Copy button and the reset page shows a specific incomplete-link message for partial token hashes such as `token_hash=dad19`. (Codex, Session 82)
- Manual-review `/reset-password` invalid-link case fixed on 2026-05-11. The page now requires a recovery parameter from the URL before enabling password update, so a signed-in employee cannot change password from `/reset-password` without a reset link. (Codex, Session 83)
- Manual-review leave approval feedback gap fixed on 2026-05-06. The `leave_balances` trigger remains the atomic state owner, while `approveLeaveRequest` now pre-checks setup and translates trigger race failures into specific manager-facing messages for missing or insufficient balances.
- Manual-review leave balance context gap fixed on 2026-05-06. `/leave/new` shows available balances and selected leave type/year context before submission, while `/leave?status=pending` shows approvers balance context and requested days on actionable rows.
- Manual-review role/job-title clarity gap fixed on 2026-05-06. Admin employee create/edit forms now explain that Role controls app access while Job title is HR profile text, helping reviewers avoid confusing pairings such as Manager role with an engineer title.
- Manual-review searchable-select remediation started on 2026-05-06. Employee create/edit Department and Manager fields now accept search-as-you-type labels and the employee Server Action resolves typed department/manager labels to UUIDs as a progressive-enhancement fallback. (Codex, Session 44)
- Manual-review searchable-select remediation continued on 2026-05-06. Performance `GoalForm` (employee, review cycle) and `ManagerReviewForm` (employee, review cycle) now use a shared `SearchableSelectField` component; `savePerformanceGoal` resolves typed employee labels against the user's assignable employees (admin: all; manager: direct reports) and `submitManagerReview` does the same for cycle titles against non-closed cycles. State ownership unchanged: form contract still posts `employeeId`/`cycleId` UUIDs and `canManageEmployee` continues to gate the mutation. (Claude, Session 45)
- Manual-review searchable-select remediation continued on 2026-05-07. `/leave/admin` balance Employee and Leave-type fields now use the shared `SearchableSelectField`; `upsertLeaveBalance` resolves typed employee labels against all employees and leave-type labels against active leave types before the unchanged Zod schema runs. State ownership unchanged: `leave_balances` remains the owner and the form still posts `employeeId`/`leaveTypeId` UUIDs. Local migration `0026` application was blocked because Docker/local Supabase was not running. (Codex, Session 47)
- Remote Supabase migrations were brought current on 2026-05-07: `supabase db push --linked` applied `0026_onboarding_task_completion_note.sql`, and `supabase migration list --linked` shows local/remote aligned through `0026`.
- Manual-review searchable-select remediation continued on 2026-05-07. `/documents` admin upload Employee field now uses the shared `SearchableSelectField`; `uploadDocument` resolves typed employee labels against all employees before the unchanged Zod schema runs. Employee self-upload still posts the signed-in user's hidden UUID. State ownership unchanged: `documents` metadata and Storage object ownership are unchanged, and the existing upload authorization checks remain the boundary. (Codex, Session 48)
- Manual-review searchable-select remediation continued on 2026-05-07. `/payroll` admin employee picker now uses the shared `SearchableSelectField`; the page resolves `employeeIdSearch` labels against all employees before loading `getCompensation`, and `CompensationForm` still receives/posts the selected employee UUID as a hidden `employeeId`. State ownership unchanged: `employee_compensation` remains the owner and `upsertCompensation` remains the mutation boundary. (Codex, Session 49)
- Manual-review searchable-select remediation completed on 2026-05-07. `/onboarding/admin` assignment Employee and Template selectors now use the shared `SearchableSelectField`; `assignTemplateToEmployee` and `addIndividualTask` resolve typed employee labels against the same assignable scope shown in the form (admin: all employees; manager: direct reports), and template labels resolve against active templates with tasks. State ownership unchanged: `onboarding_tasks` remains the owner and existing manager direct-report guards remain the mutation boundary. (Codex, Session 50)
- Manual-review navigable dashboards delivered on 2026-05-07. `MetricCard` in `src/app/(app)/dashboard/page.tsx` now accepts an optional `href`; admin/manager/employee dashboards link role-appropriate metric cards to their owning module pages, with composed `aria-label` (label + value + note) and hover/focus styling. UI-only change — no schema/RLS/trigger/DAL changes — and existing dashboard E2E tests still pass because the inner `div` structure of `MetricCard` is preserved inside the `next/link` wrapper. (Claude, Session 51)
- Manual-review dashboard action items delivered on 2026-05-07. `getManagerDashboardData` now returns `pendingApprovalRequests` (top 5 pending direct-report leave requests, scoped via RLS-aware `getLeaveRequests({ status: "pending" })` then filtered to direct-report ids) and `getEmployeeDashboardData` returns `pendingTaskItems` (top 5 own pending onboarding tasks via `getMyTasks`, sorted by due date). The dashboard page renders these in new "Action items" panels with empty states; manager rows link to `/leave?status=pending#leave-request-<id>` and employee rows link to `/onboarding`. State ownership unchanged: `leave_requests` and `onboarding_tasks` remain the owners; lists are read-only views. (Claude, Session 52)
- Manual-review create-cycle next-steps feedback delivered on 2026-05-07. After a successful cycle creation, `ReviewCycleForm` renders a "Next steps" panel with jump links to set a goal (`#goal-form`), open the review queue (`/performance/reviews`), and view the cycles list (`#review-cycles`). When the cycle was created in Draft, the panel surfaces that managers cannot use it until it is set Active. Existing `admin creates performance cycle and employee goal` E2E still passes; no Server Action or DAL changes. (Claude, Session 53)
- Manual-review payroll-summary exposure mitigation delivered on 2026-05-07. The employee dashboard Payroll summary metric card no longer renders the salary amount; it now shows `Open` (or `—` when no compensation record exists) and a note containing only the pay frequency followed by "open payroll to view amount". The card remains a link to `/payroll`, where the user can still view their own compensation summary intentionally. UI-only change; `getOwnCompensationSummary` and the underlying minimal DTO are unchanged. (Claude, Session 54)
- Manual-review currency dropdown delivered on 2026-05-07. `CompensationForm` Currency is now a `<select>` (MUR default, AED, USD) and `upsertCompensation` enforces the same enum after trim/upcase via Zod. Existing `admin compensation edit preserves existing bank account number when left blank` E2E still passes; no schema change. (Claude, Session 55)
- Manual-review Mauritius bank dropdown delivered on 2026-05-07. New `src/lib/mauritius-banks.ts` enumerates the v1 list of local commercial banks; `CompensationForm` Bank name is now a `<select>` driven strictly by that list. Records with a non-listed bank name open the dropdown unselected so admins explicitly re-pick before saving. `upsertCompensation` adds a `.refine` that enforces the same set server-side. The compensation E2E seed bank label was changed from `Seed Bank` to `MauBank` to align with the new constraint; the regression still passes. No DB schema change. (Claude, Session 56)
- Manual-review passport/nationality fields delivered on 2026-05-07. Migration `0027_compensation_passport_nationality.sql` (applied to remote) adds nullable `passport_number` and `nationality` columns on `employee_compensation`. RLS unchanged: admin-only mutation/select of sensitive columns via the existing `admin_all_compensation` policy; the `getOwnCompensationSummary` projection deliberately excludes both fields, preserving the employee's minimal-DTO contract. `CompensationRow` and `upsertCompensation` validate `passportNumber` (≤64) and `nationality` (≤80); `CompensationForm` adds matching inputs alongside the existing Tax ID/National ID fields. (Claude, Session 57)
- Manual-review leave taxonomy and policy localization delivered on 2026-05-07. Migration `0028_localize_leave_taxonomy.sql` (applied to remote) renames `Annual Leave` → `Local Leave` (preserving FKs in `leave_balances`/`leave_requests`), refreshes Sick Leave description to call out the 15-day default, and sets `Unpaid Leave` inactive without deletion. `createEmployee` now seeds 22 Local + 15 Sick for the current year via an idempotent upsert. `supabase/seed.sql` defaults updated from 20/10 → 22/15 (and `Annual Leave` → `Local Leave`). Tests that referenced `Annual Leave` were renamed; targeted admin/employee leave regressions and the new-hire journey all still pass. (Claude, Session 58)
- Manual-review urgent Local Leave justification delivered on 2026-05-08. Migration `0030_urgent_local_leave_fields.sql` adds `is_urgent_local_leave` and bounded `urgent_leave_reason` to `leave_requests`. `/leave/new` exposes the flag only for Local Leave, requires a reason when selected, and records non-sensitive audit metadata on `leave.submitted`; approvers see the urgent marker/reason in `/leave?status=pending`. `leave_balances` and the existing approval trigger remain the balance state owners. (Codex, Session 75)
- Manual-review employee dashboard recent updates delivered on 2026-05-08. `getEmployeeDashboardData` now derives a sorted, read-only `recentUpdates` feed from decided leave requests, completed onboarding tasks, manager-submitted performance reviews awaiting acknowledgement, and recent documents. The dashboard panel links each update to the owning module and does not introduce any duplicated status state. (Codex, Session 76)
- `npm audit --audit-level=moderate` still reports the external PostCSS advisory through Next; forced fix would downgrade Next to 9.3.3 and was not applied.
- Static checks after the auth/document-download fixes: lint PASS, TypeScript PASS, production build PASS.

---

## Phase 11 — Performance Appraisals

Status: **Complete** — all checks pass. See `docs/checks/phase-11.md` for full results.

### Checklist

- [x] Research recorded in `docs/research/performance-appraisal-research.md`.
- [x] Product requirements updated.
- [x] Project context updated.
- [x] Phase plan updated.
- [x] Database design updated with performance tables/enums.
- [x] RLS policy map updated.
- [x] Systems-thinking risks updated.
- [x] Migration `0018_performance_appraisals.sql` with enums, tables, RLS, indexes, constraints, and updated-at triggers.
- [x] Performance DAL with minimal DTOs.
- [x] Server Actions with Zod validation, server-side role checks, audit logs, and score validation.
- [x] `/performance` page.
- [x] `/performance/reviews` page.
- [x] Loading states for performance routes.
- [x] Navigation entry for Performance.
- [x] Dashboard performance summary widgets.
- [x] Anonymous protected-route E2E includes performance routes.
- [x] TypeScript: PASS.
- [x] Lint: PASS.
- [x] Build: PASS (22 routes).
- [x] E2E smoke tests: PASS (3/3).
- [x] Remote Supabase migrations applied via CLI `supabase db push`: `0017_onboarding_task_update_hardening.sql`, `0018_performance_appraisals.sql`.
- [x] SQL runtime checks: score constraint (0/6 rejected, 3 accepted), date-order, ack-after-submit, unique review per employee+cycle, progress 0-100 — all PASS.
- [x] RLS runtime checks via `set local role authenticated`: manager sees direct-report only, employee sees own only, admin sees all, direct INSERT denied — all PASS.
- [x] Server Action logic code-review: `requireRole`, scope checks, `canManageEmployee`, ownership checks, audit log calls — all PASS with file/line refs in check file.

### Scope

- Admins create review cycles.
- Admins/managers set goals for employees in scope.
- Managers appraise direct reports with a 1-5 score and written feedback.
- Employees view own goals/reviews, add self-review comments, and acknowledge completed appraisals.
- Admins view all appraisal records.
- No 360 feedback, calibration grids, compensation automation, AI summaries, or reminder engine in v1.

### Browser Runtime Smoke

- [x] Playwright auth setup creates admin, manager, and employee storage states.
- [x] Authenticated route and role-boundary smoke tests pass.
- [x] Performance pages reachable by admin and manager; employee can reach own performance page.

Remaining deep workflow checks, such as form submission/audit-log assertions, are recommended next-work items rather than MVP blockers.

---

## Phase 12 — Hardening

Status: **Complete** — all static and code-review checks pass. See `docs/checks/phase-12.md` for full results.

### Checklist

- [x] Raw DB error messages replaced with generic messages in `onboarding.ts` and `performance.ts` Server Actions.
- [x] Error boundary added: `src/app/(app)/error.tsx` — catches Server Component errors; shows digest ref, no stack trace.
- [x] Loading states added for: `/employees/[id]`, `/leave/admin`, `/onboarding/admin`, `/payroll/change-requests`.
- [x] Dependency audit: `npm audit --audit-level=moderate` — residual PostCSS advisory documented; no acceptable fix available.
- [x] Environment variable review: no secrets in client code; `.env.example` accurate.
- [x] Server Action authorization: all 35 entry points have `requireRole()`.
- [x] Zod validation: all mutation boundaries validated.
- [x] `docs/security-review.md` updated with Phase 12 findings and resolutions.
- [x] `docs/qa-report.md` updated with 22-route build and full coverage summary.
- [x] `docs/final-handover.md` rewritten with complete project state.
- [x] `README.md` updated to reflect Phase 12 completion.
- [x] TypeScript: PASS.
- [x] Lint: PASS.
- [x] Build: PASS (22 routes).
- [x] E2E smoke tests: PASS (3/3).
- [x] Authenticated Playwright fixtures: PASS.
- [x] Authenticated Playwright suite: PASS (47/47).
- [x] Performance mutation workflows: admin creates cycle/goal, manager creates direct-report goal and submits appraisal, employee submits self-review and acknowledges manager review.
- [x] Document mutation workflow: employee upload, signed URL download, raw Storage path denial, signed URL expiry.
- [x] Leave and payroll mutation audit workflows: employee leave submission and payroll change request submission.
- [x] Performance Server Action UUID validation accepts Postgres UUID shape used by deterministic seed users.
- [x] User/profile-id Server Action validators aligned with Postgres UUID shape for deterministic seed users.
- [x] `supabase/seed.sql` hardened with `auth.identities` and GoTrue-compatible Auth token defaults.
- [x] Direct-query RLS tests for non-performance tables: profiles, employee records, payroll tables, audit logs, and forged onboarding task completion.
- [x] Live trigger verification: `handle_new_user` creates profiles and `sync_role_to_jwt` syncs role changes into Auth app metadata.

### Next

MVP and post-Phase-12 quality hardening are complete. Keyboard/focus and responsive passes were completed in Session 31. The only remaining watch item is the external PostCSS advisory through Next.js; re-check after the next compatible Next.js/PostCSS release. See `docs/final-handover.md`.

---

## Phase 10 — Audit Logs And Dashboards

Status: **Complete** — all static checks pass; authenticated runtime metric tests deferred to Phase 12 hardening.

### Checklist

- [x] Admin dashboard with live headcount, pending leave, onboarding progress, recent audit events.
- [x] Manager dashboard with direct-report count, pending approvals, team leave, and open onboarding tasks.
- [x] Employee dashboard with own leave balances, pending tasks, recent documents, and payroll summary link.
- [x] Audit-log viewer is admin-only.
- [x] Audit-log filters for actor UUID, action, entity, and date range.
- [x] Audit-log table includes empty, error, and responsive overflow states.
- [x] Dashboard loading state.
- [x] Audit-log loading state.
- [x] Phase 10 research note recorded.
- [x] TypeScript: PASS.
- [x] Lint: PASS.
- [x] Build: PASS (20 routes).
- [x] E2E smoke tests: PASS (2/2).

### Agent Exit Checks

- [x] QA Agent: PASS — dashboard data wired, filters present, route checks pass.
- [x] Security Agent: PASS — audit log page admin-only; append-only DB model unchanged; safe payroll summary only.
- [x] UI/UX Agent: PASS — scannable dashboards, labeled filters, responsive audit table, empty/error/loading states.
- [x] Review Agent: PASS — no new schema, DTO-based DAL, no obvious N+1 query pattern.

### Runtime Checks Verified In Phase 12

- [x] Authenticated manager E2E: dashboard metrics show direct-report-only data.
- [x] Authenticated employee E2E: dashboard does not expose payroll-sensitive fields.
- [x] RLS: non-admin cannot select audit logs.
- [x] RLS: no role can update or delete audit logs.
- [x] Audit-log filter checks with seeded events completed in post-Phase-12 QA.

### Next

Begin Phase 11 — Performance Appraisals.

---

## Phase 9 — Onboarding

Status: **Complete** — agent findings fixed; static checks pass; key runtime permission-boundary tests verified in Phase 12 hardening.

### Checklist

- [x] Onboarding templates with reusable task items.
- [x] Admin template management.
- [x] Task assignment from template or individual task.
- [x] Admin can assign tasks to any employee.
- [x] Manager can assign tasks only to direct reports.
- [x] Employee task list and own-task completion flow.
- [x] Admin/manager onboarding progress overview.
- [x] Empty states for no tasks and no assignable employees.
- [x] Loading state for onboarding route.
- [x] Audit logs for template creation/toggle/item creation/item deletion/task assignment/task completion/task deletion.
- [x] `auth.access_denied` logs for manager assignment outside reporting line and employee completion attempt on another employee's task.
- [x] RLS hardening: direct authenticated updates to onboarding tasks revoked; assignment inserts use session client and RLS.
- [x] TypeScript: PASS.
- [x] Lint: PASS.
- [x] Build: PASS (20 routes).
- [x] E2E smoke tests: PASS (2/2).

### Agent Exit Checks

- [x] QA Agent: initial FAIL fixed — forged task completion, non-employee completion UI, empty-template UUID edge case.
- [x] Security Agent: initial FAIL fixed — service-role completion IDOR, broad task update grant, assignment write RLS.
- [x] UI/UX Agent: initial FAIL fixed — non-employee completion affordance, empty employee state, template error visibility, selected-state semantics.
- [x] Review Agent: PASS — MVP-sized, scoped migration, no overbuilt onboarding automation.

### Runtime Checks Verified In Phase 12

- [x] E2E/RLS: employee cannot complete another employee's task by forged `taskId`.
- [x] E2E/RLS: direct authenticated update to `onboarding_tasks` is denied.
- [x] Manager forged assignment outside reporting line covered by hardening/QA checks.
- [x] Employee own-task completion happy path covered by hardening/QA checks.

### Next

Begin Phase 10 — Audit Logs And Dashboards.

---

## Phase 8 — Payroll Fields and Change Requests

Status: **Complete** — all agent checks pass; runtime checks deferred.

### Checklist

- [x] Compensation DAL — `getCompensation` (admin, all fields), `getOwnCompensationSummary` (employee, salary/pay freq/date only)
- [x] Change request DAL — `getChangeRequests` with status/employee filters, profile name hydration
- [x] `maskBankAccount` utility in `src/lib/format.ts` (shared, not server-only)
- [x] Server Actions — `upsertCompensation`, `submitChangeRequest`, `approveChangeRequest`, `rejectChangeRequest`, `cancelChangeRequest`
- [x] Admin `upsertCompensation` — upserts via `onConflict: "employee_id"`; audit log `compensation.updated`
- [x] Employee `submitChangeRequest` — admin role blocked; audit log `change_request.submitted`
- [x] Admin approve/reject — status guard (pending-only); audit logs for both decisions
- [x] Employee cancel — ownership check + status guard; audit log on access denied
- [x] `/payroll` page — admin: employee picker + CompensationForm; employee: salary summary + link to change requests
- [x] `/payroll/change-requests` page — admin: queue with inline approve/reject; employee: submit form + own requests
- [x] `CompensationForm` — all fields; bank account shown masked; password input for account number
- [x] `ChangeRequestForm` — request type + notes; form reset on success
- [x] `ChangeRequestQueue` — inline approve (with rejection reason field) + cancel per row
- [x] Nav updated: Payroll visible to admin and employee (manager blocked at requireRole)
- [x] `maskBankAccount` — last-4 masking for non-full display; admin sees current masked value as hint
- [x] Audit logs — `compensation.updated`, `change_request.submitted`, `change_request.approved`, `change_request.rejected`, `change_request.cancelled`, `auth.access_denied`
- [x] TypeScript: PASS
- [x] Lint: PASS
- [x] Build: PASS (18 routes)
- [x] Loading state for `/payroll`

### Security

- All compensation reads use admin client (service-role); `employee_compensation` RLS dropped employee policy in migration 0014 — application layer enforces column filtering
- `getOwnCompensationSummary` selects only: `salary_amount`, `salary_currency`, `pay_frequency`, `effective_date` — no bank, tax, national ID, or notes
- Manager blocked from `/payroll` via `requireRole(["admin", "employee"])` — redirects to access-denied
- `cancelChangeRequest` checks ownership before cancelling; logs `auth.access_denied` on violation

### Exit Checks

- [x] QA Agent: later hardening checks cover route, role, and selected mutation workflows.
- [x] Security Agent: sensitive payroll boundaries verified by direct RLS checks in Phase 12.
- [x] UI/UX Agent: static pass complete; keyboard/responsive polish remains future-quality work.

---

## Phase 7 — Documents

Status: **Complete** — all static checks pass; document upload/download, raw path denial, signed URL expiry, and document RLS checks verified in Phase 12.

### Checklist

- [x] Storage bucket `hr-documents` created — private, 50MB limit, restricted MIME types
- [x] Storage RLS: admin full access; employee read/insert own folder; manager read non-sensitive direct-report documents
- [x] Documents DAL — `getDocuments` (list, with category/employee filters, profile hydration), `getDocumentById`
- [x] Server Actions — `uploadDocument`, `getSignedDownloadUrl`, `softDeleteDocument`
- [x] Upload guard: employee-only-for-self; employee cannot upload payslips; managers blocked from upload
- [x] Signed URL: 60-second expiry, generated via admin client after RLS-enforced visibility check
- [x] Soft delete: admin only; sets `deleted_at`; audit log
- [x] Documents list page (`/documents`) — category filter, upload form (admin/employee), download button, delete (admin)
- [x] Upload form — category restricted by role (employee cannot see payslip option)
- [x] Download button — client component, calls Server Action, opens signed URL in new tab
- [x] Audit logs — `document.uploaded`, `document.downloaded`, `document.deleted`, `auth.access_denied` on upload violations
- [x] Orphaned Storage object cleanup on metadata insert failure
- [x] Storage path convention: `{employee_id}/{category}/{uuid}.{ext}`
- [x] TypeScript check: PASS
- [x] Lint: PASS
- [x] Build: PASS
- [x] Loading state for `/documents`

### Security Notes

- All Storage operations use service-role admin client to bypass Storage auth headers; visibility enforced at application layer (RLS on `documents` table) before signed URL generation.
- Manager Storage policy uses EXISTS subquery joining `documents` table on `storage_path = name` — enforces category restrictions at DB level for any direct authenticated Storage access.
- `payslip` and `id_document` categories blocked for manager Storage reads (mirrors Phase 5 migration 0014 document metadata RLS).

### Runtime Checks Verified In Phase 12

- [x] QA: employee upload, list, download end-to-end flow
- [x] QA: signed URL expires after 60 seconds
- [x] Security: RLS verified on `documents` table — employee sees own only
- [x] Storage: raw object path denied without signed URL
- [x] Delete end-to-end flow and orphaned object cleanup covered by post-Phase-12 QA.
- [x] Manager document category RLS depth covered by post-Phase-12 QA.

---

## Phase 6 — Leave Management

Status: **Complete** — all static checks pass; selected live Auth runtime checks verified in Phase 12.

### Checklist

- [x] Leave request list page (`/leave`) — employee sees own, manager sees direct reports, admin sees all (RLS-scoped)
- [x] Leave request form (`/leave/new`) — employee submits with date validation and note
- [x] Approve / reject flow — inline forms in list; manager for direct reports, admin for anyone
- [x] Cancel own pending request — employee only; non-owner cancel logs auth.access_denied
- [x] Employee cannot approve own leave — Server Action guard + audit log on attempt
- [x] Leave balance display — employee sees own balances as metric cards on `/leave`
- [x] Admin: manage leave types — create and activate/deactivate on `/leave/admin`
- [x] Admin: manage leave balances — upsert per employee/type/year on `/leave/admin`
- [x] Audit-log writes — submit, approve, reject, cancel, createType, toggleType, upsertBalance
- [x] Filter by status and date range
- [x] "Who's out" summary — managers and admins see approved leaves overlapping current week
- [x] TypeScript check: PASS
- [x] Loading state for `/leave`

---

## Phase 5 — Employee Directory

Status: **Complete** — all static checks pass; selected live Auth runtime checks verified in Phase 12.

### Checklist

- [x] Employee list page with search and employment-status filter
- [x] Employee detail page with Overview and Job data; tab structure for Documents, Leave, Audit (placeholders)
- [x] Create employee form — admin only
- [x] Edit employee form — admin for all fields; employee for own display name and phone only
- [x] Department list, create, edit, delete — admin only
- [x] Manager assignment server validation (no self-assignment; must be admin or manager role)
- [x] Audit logs for employee create/update and department create/update/delete
- [x] Audit log for forbidden non-owner self-service edit attempts
- [x] Migration `0014_phase5_security_hardening.sql` — revokes insert_audit_log RPC from authenticated; tightens compensation, profile grant, and contract document manager policy
- [x] Audit writes now use service-role admin client (direct insert); not the revoked RPC
- [x] TypeScript check: PASS
- [x] Lint: PASS
- [x] Build: PASS
- [x] Unauthenticated protected-route E2E: PASS

### Confirmed Static Checks

- `requireRole()` forbidden-route audit write: **STATICALLY VERIFIED** — uses `insertAuditLog()` (service-role admin client → direct INSERT on audit_logs, granted by migration 0014). Chain: non-admin hits `/audit-logs` → role check fails → `insertAuditLog` called → `auth.access_denied` written → redirect to `/access-denied`. ✓
- `insert_audit_log()` RPC revoked from authenticated: verified in migration 0014. ✓
- Employee compensation: employee_select_own_compensation policy dropped in migration 0014; admin-only direct access. ✓
- Profile column grants tightened: only `display_name, phone, avatar_url` updatable by authenticated. ✓
- Manager document policy updated: `contract` added to blocked categories alongside `payslip` and `id_document`. ✓

### Runtime Checks Verified In Phase 12

- [x] Sign-up smoke test: new user gets `profiles` row (`handle_new_user` trigger)
- [x] Role change on profile reflected in Auth `app_metadata` (`sync_role_to_jwt` trigger)
- [x] RLS: manager cannot SELECT from `employee_compensation`
- [x] RLS: employee cannot SELECT another employee's profile, records, or documents
- [x] RLS: no direct INSERT into `audit_logs` from authenticated role
- [x] RLS: migration 0014 compensation and profile grant changes confirmed in live DB
- [x] Runtime: manager visibility scoped to direct reports only
- [x] Runtime: employee visibility scoped to own record only
- [x] Admin employee CRUD smoke covered by post-Phase-12 QA.

---

## Phase 4 — Auth And RBAC

Status: **Complete** — all items done; runtime checks deferred alongside Phase 3/5.

- [x] Login page with KushHR branding
- [x] Logout Server Action
- [x] Protected routes via proxy.ts
- [x] `getSessionUser()` and `requireRole()` helpers
- [x] Access-denied page
- [x] Role-aware navigation and route names
- [x] Role-based dashboard shells
- [x] `auth.access_denied` audit log on forbidden access

---

## Phase 3 — Supabase Schema And RLS

Status: **Complete** — all migrations written; seed applied; static checks passed.
