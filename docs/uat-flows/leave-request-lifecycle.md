# Leave Request Lifecycle

**Time:** 30 minutes  •  **Roles:** employee → manager → admin  •  **Modules:** `/leave`, `/leave/new`, `/leave/admin`, `/audit-logs`

End-to-end ownership of a single leave request — submission, approver scope, balance decrement, urgent path, and the visible feedback loops on every involved dashboard.

## Preconditions

- All four seed users sign in (password `TestPass123!`):
  - `admin@kushhr.dev`  (Alex Admin)
  - `manager@kushhr.dev`  (Morgan Manager, Engineering Lead — Alice's manager)
  - `alice@kushhr.dev`  (Alice Employee — direct report of Morgan)
  - `bob@kushhr.dev`  (Bob Employee — Operations, no direct manager)
- Alice has positive Local Leave + Sick Leave balances for the current year (seed defaults: 22 / 15). If not, set them as admin via `/leave/admin` before starting.
- Note the latest audit timestamp at `/audit-logs` so you can spot the new rows the flow creates.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Alice | Sign in. Dashboard loads. | Lands on `/dashboard` with Local Leave + Sick Leave balance cards visible. |
| 2 | Alice | Open `/leave`. Note her current Local Leave balance — call this **B0**. | Balance shown matches admin-set value. |
| 3 | Alice | Click **Request leave**. Pick Local Leave, choose **Mon–Tue (two consecutive weekdays)** in the current year, add a note "UAT — normal Local Leave", submit. | Form preview reads `2 working days requested`. Success toast appears. Redirected to `/leave` after ~1s. New row visible with status **Pending** and the row shows the date range with no half-day badge. |
| 4 | Alice | Open `/dashboard`. | The new request appears in **Recent updates** (within the last 30 days). |
| 5 | Bob (separate tab) | Sign in, open `/leave`. | Bob does **not** see Alice's request. |
| 6 | Morgan | Sign in, open `/dashboard`. | Alice's request appears in **Action items**. **Pending approvals** metric card is at least 1. |
| 7 | Morgan | Click the action item OR open `/leave?status=pending`. | The pending row shows Alice's name, leave type, date range, and an inline balance context like "Balance context: 2026: B0 days available; 2 working days requested." |
| 8 | Morgan | Approve. Add approver note "Approved for UAT". | Status changes to **Approved**. Row disappears from the pending queue. Inline status row appears with "Approved". |
| 9 | Alice | Refresh `/dashboard`. | Approved request appears in **Recent updates** with the approver note attached. |
| 10 | Alice | Open `/leave`. Local Leave balance is now **B0 − 2**. | Balance card and `Your <year> balances` section both show the decremented value. Row in the list shows `2 days deducted` underneath the date range. |
| 11 | Alice | Submit a second Local Leave request — **flag urgent**, leave the reason blank, attempt submit. | Server-side error explains the urgent reason is required. Form values preserved on failure. |
| 12 | Alice | Fill in the urgent reason ("UAT — urgent illness"), submit. | New pending request created with the urgent flag. |
| 13 | Morgan | Open `/leave?status=pending`. | The urgent request row shows an **Urgent Local Leave** amber callout with the reason. |
| 14 | Morgan | Reject the urgent request with note "UAT — rejecting urgent path". | Status changes to **Rejected**. |
| 15 | Alice | Refresh `/dashboard`. | Rejected request appears in **Recent updates** with the rejection note. Local Leave balance unchanged from step 10 (no decrement on rejection). |
| 16 | Alice | Open `/leave/new`. Pick Sick Leave. Choose a date range that exceeds the Sick Leave balance. Submit. | Request is created as pending (balance check is at approval time). |
| 17 | Morgan | Open `/leave?status=pending`. Approve the Sick Leave request. | Approval fails visibly with an "Insufficient balance" or "no balance" message. Request stays pending. Audit row `auth.access_denied` or a specific leave-approval failure event recorded. |
| 18 | Alice | Cancel the still-pending Sick Leave request from her own `/leave` row. | Status changes to **Cancelled**. Audit row `leave.cancelled` recorded. |
| 19 | Bob | Try `/leave/admin` directly via URL. | Redirected to `/access-denied`. `auth.access_denied` audit row recorded with `attempted_resource: /leave/admin`. |
| 20 | Alice | Submit a Local Leave request that **spans year-end** — pick a Mon–Fri window that straddles the year boundary (e.g. last working week of December through first working week of January). Count the working days on each side of the boundary in advance (e.g. 3 working days in current year + 3 working days in next year). | Form preview shows the correct per-side working-day split (weekend exclusion visible in the "Excluded" line). Auto-seed creates the next-year balance row from Settings defaults if it doesn't exist. Request created as **Pending** with `deducted_days IS NULL` until approved. |
| 21 | Morgan | Open `/leave?status=pending`. The cross-year row shows a multi-year balance context like "Balance context: <year>: X days available; N working days requested; <year+1>: Y days available; M working days requested." Approve. | Both yearly balances decrement by the per-year **working-days** split (migration 0042 trigger). Audit row `leave.approved` references the multi-year request. `deducted_days` on the row equals N+M. |
| 22 | Alice | Open `/leave`. Note Local Leave balance for current year (decremented by N working days from B0 − 2) and next year (decremented by M working days from the auto-seed value). | Both yearly balances show the correct per-year deduction. Row shows `(N+M) days deducted`. |

## Working-days scenarios (W1–W3)

Phase 13 / migration 0042 introduces working-days math: weekends (Sat+Sun) and active Mauritius public holidays are excluded from the leave-day count and balance deduction. Pre-flight: confirm `/leave/admin` Public Holidays panel shows the seeded Mauritius dates for the current + next year.

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| W1 | Alice | Submit a Local Leave request spanning **Fri–Mon** (4 calendar days, 2 working days). | Form preview reads `2 working days requested` with an "Excluded: 2 weekend days." line. After approval, balance decrements by **2**, not 4. |
| W2 | Alice | Attempt to submit a request that falls entirely on a **Sat–Sun**. | Form preview reads `0 days — this range has no working days. Pick a weekday range.` Submit button is blocked or returns a clear server-side error if forced. No row created. |
| W3 | Alice | Submit a Local Leave request spanning a **Mon–Wed** window where one day is a seeded Mauritius public holiday (pick the closest upcoming holiday — e.g. Eid, Independence Day, Labour Day, depending on date). | Form preview shows `2 working days requested` with an "Excluded: 1 public holiday (<holiday name>)" line. After approval, balance decrements by **2**, not 3. |

## Half-day scenarios (H1–H2)

Single-day half-day requests deduct 0.5 from the balance. Multi-day half-day is not supported in v1.

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| H1 | Alice | On `/leave/new`, choose Local Leave, set start = end = a single upcoming **weekday that is not a public holiday**, tick the **Half-day request** checkbox. Submit. | Form preview reads `0.5 days requested (half day)`. New row appears on `/leave` with a `Half day` badge next to the date. After approval, balance decrements by **0.5** — `Your <year> balances` card shows the fractional value correctly. |
| H2 | Alice | On `/leave/new`, pick a multi-day range (e.g. Mon–Wed) and attempt to tick **Half-day request**. | The checkbox is **disabled** with a "Single-day only" helper hint. Toggling start = end re-enables it. |

## Refund-on-cancel scenarios (R1–R3)

Cancelling an approved leave refunds the frozen `deducted_days` back to the per-year balances. Confirmed via balance values + audit metadata.

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| R1 | Alice | Submit + approve a fresh Local Leave for a Mon–Tue window (2 working days). Then on `/leave`, click **Cancel & refund** on her own approved row. | Confirm dialog reads "Cancel and refund 2 days?". Status changes to **Cancelled**. Local Leave balance returns to its pre-approval value. Audit row `leave.cancelled` metadata includes `prior_status: "approved"` and `refunded_days: 2`. |
| R2 | Alice | Submit + approve a half-day request (single weekday). Cancel it. | Confirm dialog reads "Cancel and refund 0.5 days?". Balance refunded by **0.5**. Audit metadata `refunded_days: 0.5`. |
| R3 | Alice | After step 21 (cross-year approval), cancel the cross-year approved request. | Both yearly balances refunded by their per-year working-days split. Audit metadata `refunded_days` equals `deducted_days` total. |. 

## Freeze-at-submission semantics (F1)

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| F1 | Admin | After step 21 (cross-year leave approved), open `/leave/admin` Public Holidays panel and **add a new public holiday inside the approved leave's date range**. Then re-open `/leave?employeeId=<Alice>` and check the approved row. | The approved leave's `deducted_days` is **unchanged**; both yearly balances are unchanged. Only future submissions reflect the new holiday. Audit row `holiday.created` recorded. | NOT YET DONE

## Public holidays admin (C1–C6)

`/leave/admin` exposes a Public Holidays panel: admin CRUD + CSV bulk upload, additive-only. Use the seeded Mauritius list as the starting state; fixtures live at [`docs/uat-flows/fixtures/public-holidays-sample.csv`](fixtures/public-holidays-sample.csv) (5 rows, 2 duplicates of seeded entries) and [`docs/uat-flows/fixtures/public-holidays-bad.csv`](fixtures/public-holidays-bad.csv) (5 rows with various validation errors).

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| C1 | Admin | Open `/leave/admin`. Scroll to **Public holidays** panel. Add one holiday inline (a future weekday + name "UAT — extra holiday"). | Row appears immediately in the active-holidays table, grouped under the correct year. Audit row `holiday.created`. |
| C2 | Admin | Click **Edit** on the row added in C1. Change name to "UAT — renamed", tick **Tentative**. Save. | Row updates inline; the **Tentative** amber badge appears. Audit row `holiday.updated` with the new name + tentative flag. Then click **Deactivate** — the row's "Active" badge changes to "Inactive". Audit row `holiday.deactivated`. |
| C3 | Admin | In the **CSV bulk upload** section, choose `public-holidays-sample.csv`. | Preview table renders 5 rows: 3 marked **Insert** (green), 2 marked **Duplicate in file** or post-commit duplicate-check (amber). Footer summary shows "3 to insert / 2 duplicate". Click **Commit 3 row(s)** — banner reads "Added 3 holiday(s). Skipped 2 duplicate(s)." Audit row `holiday.bulk_uploaded` metadata `{ inserted_count: 3, skipped_count: 2 }`. |
| C4 | Admin | Upload `public-holidays-bad.csv`. | Preview table renders all rows; bad rows are highlighted with per-row error badges (bad date, missing name, malformed date, country too long). Footer shows the breakdown of valid / invalid / duplicate counts. The **Commit** button is disabled until the invalid rows are removed/fixed (label: "Fix invalid rows to commit"). No partial commit happens. |
| C5 | Admin | Generate or compose a CSV with **201 rows** and attempt to upload it. | File picker rejects the file with the message "Max 200 rows per upload — this file has 201. Split into smaller files." No preview rendered. |
| C6 | Bob | Try `/leave/admin` direct URL (already step 19); additionally try POSTing to `createPublicHoliday` server action via a forged form (DevTools → console). | Both denied with `auth.access_denied` audit row, `attempted_resource: "action:holiday.create"` (or `/leave/admin` for the page hit). |

## Audit log events to verify

As admin, open `/audit-logs` and filter by **action** for each of the following — at least one new row per event since the baseline timestamp:

- `leave.submitted` × multiple (covers steps 3, 12, 16, 20, W1, W3, H1, R1, R2). Metadata includes `working_days` and `is_half_day`.
- `leave.approved` × multiple (steps 8, 21, W1, W3, H1, R1, R2). Trigger writes `deducted_days` on the row.
- `leave.rejected` × 1 (step 14).
- `leave.cancelled` × multiple. **New metadata**: `prior_status` (`pending` or `approved`) and `refunded_days`. R1 = 2, R2 = 0.5, R3 = sum of cross-year split.
- Insufficient-balance approval failure (step 17 — action name depends on implementation; usually `leave.approval_failed` or similar).
- `auth.access_denied` × 2 (step 19 page-level, C6 server-action-level).
- `holiday.created` × multiple (C1, F1, plus the 3 CSV inserts as individual rows if the implementation logs per-row; otherwise a single `holiday.bulk_uploaded`).
- `holiday.updated` × 1 (C2 rename).
- `holiday.deactivated` × 1 (C2 toggle off).
- `holiday.bulk_uploaded` × 1 (C3) with metadata `{ inserted_count: 3, skipped_count: 2 }`.

## What to check on the next dashboard refresh

After completing the flow, log back in as each role and confirm the dashboards reflect the closed lifecycle:

- **Alice's dashboard:** Local Leave balance card shows **B0 − 2**. Recent updates panel shows the approval and the rejection. Action items has nothing leave-related.
- **Morgan's dashboard:** Pending approvals count down to where it was at the start of the flow. Recent updates shows the approval / rejection decisions Morgan took.
- **Admin's dashboard:** Pending leave count unchanged from before the flow if the suite was clean to start (admin sees company-wide pending). Recent updates includes leave decisions.

## Cleanup

UAT requests submitted with the literal note "UAT — …" are easy to find. As admin via `/leave/admin` (or as the request owner via `/leave`):

- Cancel any UAT requests still in **Pending**.
- The Local Leave balance decrement from step 8 is now part of the seed state. If you need to restore Alice's balance, edit it in `/leave/admin` before running the flow again.

To clear any Playwright artifacts the suite may have left in the environment: `npm run cleanup:e2e-data`. (Note: this only matches the Playwright-named prefixes documented in `scripts/cleanup-playwright-artifacts.mjs`; it does **not** remove manually-typed UAT records named `UAT — …`.)

## Notes for the reviewer

If step 7's balance context line is missing, that's a Phase 13 Session 38 regression — file it. If the urgent-leave amber callout in step 13 is grey or has no reason text, that's a Session 75 regression. If the rejected request in step 15 doesn't surface in Recent updates within 1 minute, that's a Session 76 / Session 89 regression.


## Findings
1. On Admin leave management, We need a filter on Employee and leave type.  Perhaps a section collapsed: Select employee and leave type.  Align with other used filters in the product.  I hope this is a simple change. — Routed to `docs/follow-ups.md` (post-pilot scope).
2. R1.  Cancel and refund shows another window.  see cancelrefund.png in folder screenshots.  This behaviour is not accepted, as we corrected i think three other similar issues in the past.  Let it work directly, if i click cancel and refund, it just cancels and refunds.  When confirmed, cancelled status appears.  However, the balance does not change! — **Fixed Session 143** (see Remediation log below).
3. On the leave administration, can we move it from the bottom and add it under Request Leave for the admin?  Slightly different colour if it looks better?  Let me know. — Routed to `docs/follow-ups.md`.
4.  It gets tool long below Out this week for the admin and manager  the individual records, can we consider collapsing it?  and ensure there is a limited number of rows shown? 25 rows? — Routed to `docs/follow-ups.md`.
5. Public holiday inline-add form returned generic `"Holiday could not be created."` with no detail when add failed (screenshot during R1 walkthrough). — **Fixed Session 143** (see Remediation log).
6. Leave Admin:  Too long!  Propose collapsing.  What can be done to make it more user friendly?
7. C2: After saving row with tentative, it does update (message displayed), but it still looks like it is being edited, with the save still appearing.  see tentative.png in screenshots.
8. We need to allow everyone to see who is on leave (like the leave calender.  requests, approval stay with admin, manager), even employees.
9. | 4 | Alice | Open `/dashboard`. | The new request appears in **Recent updates** (within the last 30 days).  The new pending request does not appear in the recent updates.
10. In general, add some more colour and icon behaviour to the recent updates, for example, currently, local leave rejected and local leave approved have the same colour, look the same.  Try to differentiate the different actions for better readability everywhere
11.  16 behaviour needs to be changed.  The balance check needs to happen at request stage.  Employee should not be able to apply above his balance.
12. Step 21–22 (cross-year request): admin `/leave/admin` does not surface 2027 (or any non-current-year) leave balances, so admins can't visually verify the next-year deduction even though the DB shows it correctly. Need a year selector / per-year balance view on `/leave/admin` so admins can audit balances for any year — at minimum the current year and any year with a balance row.
13.  In general, i think i already mentioned.  Look into how to make ux better, in terms of long tables.  look into collapsing.


## Severity ranking and remediation batches (2026-05-28)

Captured after the full 22-step + W/H/R/F/C UAT rotation completed. Raw findings 1–5 are already closed (Fixed Sessions 143–144) or routed to `docs/follow-ups.md` (post-pilot scope); F-numbers below cover the 8 open findings (raw 6–13). F-numbers are stable — referenced in handover and remediation log going forward.

### Severity tiers

**Critical** — data integrity / security
- _(none)_

**High** — incorrect guard behavior / lifecycle / process
- **F1** ✅ (raw #11): Sick Leave step 16 — submission accepts requests above balance; insufficient-balance check happens only at approval time. Employee should be blocked at request stage. **Closed B1 (Session 145).**
- **F2** ✅ (raw #9): Step 4 — newly-submitted pending request does not appear in employee dashboard "Recent updates" (pass criterion fails). **Closed B2 (Session 146).**

**Medium** — UX gaps / missing affordances / confusing states
- **F3** ✅ (raw #8): No cross-role leave calendar view — employees should see who's on leave (read-only); requests/approvals stay role-gated. **Closed B4 (Session 148).**
- **F4** ✅ (raw #12): `/leave/admin` does not surface non-current-year leave balances; admins cannot visually verify cross-year deductions (DB is correct). **Closed B3 (Session 147).**
- **F5** ✅ (raw #7): C2 — after saving a Public Holiday row edit, success toast renders but the row stays in edit mode with the Save button still showing (no auto-exit on success). **Closed B3 (Session 147).**
- **F6** ✅ (raw #6): `/leave/admin` overall page is too long; sections need collapse-by-default treatment. **Closed B3 (Session 147).** Scope expanded mid-session: all 3 panels (Leave types, Leave balances, Public Holidays) default-closed, not only Public Holidays.

**Low** — polish
- **F7** ✅ (raw #10): Dashboard "Recent updates" lacks color/icon differentiation between actions (e.g. leave-approved vs leave-rejected look identical). **Closed B2 (Session 146).**
- **F8** (raw #13): Cross-product UX — long tables in multiple modules need a consistent collapse/limit pattern.

**Already closed (no F-number assigned):**
- Raw #2 (R1 cancel-refund silent failure) — Fixed Session 143 (migration 0043 + action-layer rowsAffected guard).
- Raw #5 (Holiday-add generic error message) — Fixed Session 143.
- Raw #1, #3, #4 — Routed to `docs/follow-ups.md` (post-pilot UX scope).

### Remediation batches

| Batch | Findings | Surface area | Severity | Notes |
|---|---|---|---|---|
| **B1** Leave submission gating | F1 ✅ | [`submitLeaveRequest`](../../src/server/actions/leave.ts), [`leave-request-form.tsx`](../../src/components/leave/leave-request-form.tsx) | High | **Closed Session 145.** Reused `getLeaveBalanceSetupError` (renamed from `getLeaveApprovalSetupError`) from both submit and approve paths so semantics cannot drift. Client disables submit + shows red hint for single-year exceeds; cross-year falls through to server's per-year check. Pinned by Playwright. |
| **B2** Dashboard Recent updates | F2 ✅, F7 ✅ | [`src/server/dal/dashboard.ts`](../../src/server/dal/dashboard.ts) (recentUpdates query), [`RecentUpdateIcon`](../../src/app/(app)/dashboard/page.tsx) | High | **Closed Session 146.** F2: added third pending-leave query branch in `getEmployeeRecentUpdates` (keyed off `created_at`, distinct `leave-pending-` id prefix, `tone: "pending"`). F7: optional `tone` field on `DashboardRecentUpdate`; tones added on employee/admin/manager leave-decision rows and admin payroll-change rows; `RecentUpdateIcon` switches on `kind + tone` (CheckCircle2 green / XCircle red / Clock amber). Pinned by Playwright. |
| **B3** Leave admin UX & visibility | F4 ✅, F5 ✅, F6 ✅ | [`leave/admin/page.tsx`](../../src/app/(app)/leave/admin/page.tsx), [`public-holidays-admin-panel.tsx`](../../src/components/leave/public-holidays-admin-panel.tsx), [`leave-balance-admin-panel.tsx`](../../src/components/leave/leave-balance-admin-panel.tsx), [`leave-type-admin-panel.tsx`](../../src/components/leave/leave-type-admin-panel.tsx), [`src/server/dal/leave.ts`](../../src/server/dal/leave.ts) | Medium | **Closed Session 147.** F4: `getMyLeaveBalances` widened to accept `"all"`; admin page passes `"all"`; year filter rendered as native `<select>` (current year default, options = current + every year with a row) — swap from initial `role="tablist"` button strip resolves ARIA contract + touch-target + focus-ring follow-ups in one move. F5: `setEditing(false)` triggered via React 19 "storing info from previous renders" pattern (`prevUpdateState` state + render-time setState; useEffect+setState would trip `react-hooks/set-state-in-effect`). Success confirmation persists in read view as `role="status"`. F6 (expanded scope): all 3 panels default-closed via controlled `<details>` (`open` + `onToggle` useState pair) — needed because uncontrolled `<details>` collapses on Server Action revalidation. Pinned by Playwright (B3/F5 + 2 retrofitted existing tests). |
| **B4** Cross-role leave calendar | F3 ✅ | [`/leave/calendar/page.tsx`](../../src/app/(app)/leave/calendar/page.tsx), [`leave-calendar-view.tsx`](../../src/components/leave/leave-calendar-view.tsx), [`day-chip-list.tsx`](../../src/components/leave/day-chip-list.tsx), [`employee-palette.ts`](../../src/components/leave/employee-palette.ts), [`getCompanyApprovedLeave`](../../src/server/dal/leave.ts) + migration [`0045_company_leave_calendar.sql`](../../supabase/migrations/0045_company_leave_calendar.sql), [`dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx) (`leaveCalendarHref` + View calendar CTA button) | Medium | **Closed Session 148; cap-and-spill + View calendar CTA polish Session 149.** New `SECURITY DEFINER` RPC `get_company_approved_leave(date, date)` returns minimal projection (id, employee id+name, leave-type id+name, dates, half-day flag) for `status='approved'` rows overlapping the window — leaves existing RLS on `leave_requests` untouched. Server-component month grid (sm+) + day list (<sm), Mon-first weekdays, holiday pills, half-day hatched chips. Dashboard "Team leave calendar" row links land at `/leave/calendar?month=<startMonth>`. Session 149: desktop cells with >3 approved leaves cap at 3 chips + `+N more` inline-expand client island; dashboard panel-header "View calendar" link promoted to a primary Button with calendar icon. Pinned by Playwright (employee.spec.ts: company-wide read + prev/next nav; manager.spec.ts: dashboard link-in). |
| **B5** Cross-product table collapsing | F8 | Design-system level — multiple consumers (`/leave`, `/leave/admin`, `/performance`, others) | Low | **Decision: parked post-pilot.** Routed to `docs/follow-ups.md`. Not in scope for Phase 13. |

### Recommended sequencing

1. **B1 (High, server-side correctness)** — block requests above balance at submission. Closes the silent-divergence path between request and approval semantics.
2. **B2 (High, data fidelity)** — Recent updates must show what the pass criteria assume; couple F7 polish into the same render-path PR.
3. **B3 (Medium, real bug + UX)** — F5 is the only "real" UI bug in the batch; F4 and F6 ride along because they all touch `/leave/admin`.
4. **B4 (Medium, new scope)** — defer until product questions answered; significant design effort.
5. **B5 (Low, cross-product)** — last; treat as a pattern library effort post-pilot.

### Product decisions (2026-05-28)

All open questions answered by the user. Decisions binding for the batch work; if scope changes mid-execution, re-confirm before drifting.

- **B1 (F1)** — **Hard block at submission.** Server rejects with clear "you have X days, requested Y" message; form submit button disabled when preview exceeds balance. Half-day requests allowed when balance ≥ 0.5 (not more). Cross-year: check **each year independently** — block if either side is short, regardless of total.
- **B3 (F4)** — **Year-tab strip above the per-employee balance table.** Minimum: current year + any year with a balance row. Current year is the default-selected tab.
- **B3 (F6)** — **Only the Public Holidays panel default-closed.** All other `/leave/admin` sections stay open (Pending approvals, Out this week, Leave types, Per-employee balances).
- **B4 (F3)** — **Month grid calendar at a new route**, visible to all roles (employees included) company-wide. The dashboard "Out this week" panel keeps its current rows but each row links into the new calendar (probably anchored to that week / employee).
- **B5 (F8)** — **Parked post-pilot.** Out of scope for Phase 13. Route to `docs/follow-ups.md`.

### Remediation log

_(closures written below as batches are fixed during execution sessions)_

---

## Remediation log

### Session 149 — B4 cap-and-spill + View calendar CTA polish (2026-05-29)

**Scope:** Final open item on the lifecycle UAT — when a `/leave/calendar` desktop cell has >3 approved leaves, the cell expands vertically and breaks row rhythm. Picked option (a) inline expand client island over (b) per-day drilldown popover. Mid-session, user flagged the dashboard "View calendar" link as not prominent enough; the panel-action link was promoted to a CTA button.

**Fixes:**
- New [`src/components/leave/employee-palette.ts`](../../src/components/leave/employee-palette.ts) — pure util extracted from the calendar view; same deterministic `hsl(hue 70% 92% / 55% 70% / 55% 28%)` per-employee palette. Both the server view and the new client island import it so the hash → hue mapping cannot drift across surfaces.
- New [`src/components/leave/day-chip-list.tsx`](../../src/components/leave/day-chip-list.tsx) — `"use client"`; `useState` for expand/collapse; `CHIP_CAP = 3`; renders first 3 chips + a `+N more` toggle button when overflow > 0; expanded state swaps button copy to `Show less`. `aria-expanded` + `aria-label` correctly toggled. Empty-entries case returns `null` (auto-applied from `/user-uiux` NEEDS-FIX — empty `<ul>` was triggering "list, 0 items" SR noise on every empty grid cell). New `data-testid="calendar-more-toggle"` planted for future Playwright pin.
- [`src/components/leave/leave-calendar-view.tsx`](../../src/components/leave/leave-calendar-view.tsx) — local `<ul>` chip rendering inside the desktop grid replaced with `<DayChipList entries={d.entries} dayIso={d.iso} />`. Cell `<div>` gains `group` class so descendant Tailwind `group-data-[past=true]:*` modifiers can scope on the existing `data-past` attribute. Local `employeePalette` function deleted (moved to the util). Mobile day-list (`<ol>`) untouched.
- Past-day toggle button contrast — `group-data-[past=true]:text-foreground` on the toggle button compensates for the parent cell's `opacity-70` dim (CSS opacity multiplies on descendants, so `opacity-100` on the button itself doesn't undo the fade — colour shift was the correct override). User-confirmed approach.
- [`src/app/(app)/dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx) — all 3 panel header `View calendar` links upgraded from `<Link className="text-sm font-medium text-primary hover:underline">` to `<Button asChild size="sm" variant="default">` wrapping the same `<Link>` with a `<Calendar>` icon. Visual weight now reads as a CTA, not a footnote. Same href, prefetch semantics preserved.
- Sidebar nav entry for `/leave/calendar` — added mid-session, then reverted at user request (not asked for; scope drift on my part).

**Verification:** Pre-smoke gate (`tsc --noEmit` + `eslint` on changed files) clean across all three rounds. Manual smoke MS1–MS5 + RS1–RS3 confirmed by user. No new Playwright pin added this session — a >3-overlap seed is test-infra work routed to follow-ups; existing B4 pins (employee.spec.ts:1153–1228) re-run green since they assert `.first()` chip visible and the first 3 chips are always rendered.

**`/user-check` follow-on:** Review went first (4 NITs, all routed to [`docs/follow-ups.md`](../follow-ups.md)). UIUX flagged the empty-`<ul>` issue as NEEDS-FIX (auto-applied) and the past-day button contrast as NEEDS-FIX-but-ambiguous (stashed → user picked option (a) `data-past`-scoped override → applied as `group-data-[past=true]:text-foreground`). Three UIUX NITs routed to follow-ups (toggle touch target ~22px, `Show less` vs accessible-label divergence, today-ring proportion on narrow viewports).

### Session 148 — B4 Cross-role leave calendar (UAT F3) (2026-05-29)

**Decision recap (pre-execution):** RLS approach = security-definer RPC (surgical, no widening of existing `leave_requests` policies). Visibility = approved-only, company-wide for all roles. Public holidays overlaid. Entry point = dashboard "Team leave calendar" rows link in (no nav-bar entry, no `/leave` tab) — handover explicitly defers those.

**Fixes:**
- [`0045_company_leave_calendar.sql`](../../supabase/migrations/0045_company_leave_calendar.sql) — `create or replace function public.get_company_approved_leave(p_from date, p_to date) returns table (...)` as `language sql security definer stable set search_path = public`. Joins `leave_requests` → `profiles` (display_name fallback to work_email) → `leave_types`. `where auth.uid() is not null and status = 'approved' and overlap`. `revoke all from public; grant execute to authenticated`. Returns only the minimal projection — no notes/approver/balances — so the function cannot leak sensitive columns even if downstream code stringifies the row.
- [`getCompanyApprovedLeave(from, to)`](../../src/server/dal/leave.ts) — new DAL function calling the RPC via `supabase.rpc`, returning `{ entries: CompanyLeaveEntry[]; error }`. New exported type `CompanyLeaveEntry` (id, employeeId, employeeName, leaveTypeId, leaveTypeName, startDate, endDate, isHalfDay). Errors routed through existing `safeDalError("leave.getCompanyApprovedLeave", ...)`.
- [`/leave/calendar/page.tsx`](../../src/app/(app)/leave/calendar/page.tsx) — new Server Component. `requireRole(["admin","manager","employee"])`. Reads `?month=YYYY-MM` (regex-validated; defaults to current month). Computes month range, fetches `getCompanyApprovedLeave(from, to)` + `getPublicHolidays({fromYear, toYear})` in parallel. Passes through to `<LeaveCalendarView>`.
- [`leave-calendar-view.tsx`](../../src/components/leave/leave-calendar-view.tsx) — new Server Component. Header with month label + Prev/Today/Next `<Link>` (href-based; no client interactivity). Desktop: 7-col Mon-first grid with leading blanks; each cell shows day number + holiday pill (amber) + employee chips (indigo). Half-day chips use a diagonal repeating-linear-gradient background + "½" trailing marker. Mobile (<sm): vertical day-list, skips empty days, with empty-month line. `data-testid` seams: `calendar-month-label`, `calendar-day[data-date]`, `calendar-entry[data-employee-id][data-half-day]`, `calendar-holiday`.
- [`dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx) — `WhoIsOutList` row `<Link>` swapped from `leaveDashboardDrilldownHref(employeeId)` → `leaveCalendarHref(request.startDate)`. Old helper removed (no remaining callers). New helper returns `/leave/calendar?month=<YYYY-MM>` from the leave's start date. The `Team leave calendar` panel heading was already in place; only the row href changed.
- Playwright pins: `tests/e2e/employee.spec.ts` "B4/F3 — leave calendar shows company-wide approved leave for the current month" (seeds Bob's approved leave 2030-06-10..12 and asserts visibility from Alice's session — vanilla RLS would deny this) + "B4/F3 — leave calendar prev/next links navigate by month". `tests/e2e/manager.spec.ts` "B4/F3 — manager dashboard 'Out this week' row links into leave calendar" (asserts `href` + URL after click).

**Pre-smoke gate:** `npx tsc --noEmit` and `npx eslint <changed files>` — both clean.

**B4-bis (mid-session follow-on, post-smoke):** Manual smoke surfaced two real gaps the original B4 plan missed — (1) only the manager dashboard had a `Team leave calendar` panel, so Alice and admin had no entry point into `/leave/calendar`; (2) the manager dashboard's existing panel was sourced from `getWhoIsOut` (RLS-scoped to own + direct reports) but the product goal is "global view — anyone on leave." Fixes:
- [`src/server/dal/dashboard.ts`](../../src/server/dal/dashboard.ts) — dropped `getWhoIsOut` import; added `getCompanyApprovedLeave` + `CompanyLeaveEntry`. `AdminDashboardData` + `EmployeeDashboardData` gained `whoIsOut: CompanyLeaveEntry[]`. `ManagerDashboardData.whoIsOut` retyped `LeaveRequest[]` → `CompanyLeaveEntry[]`. All three `get*DashboardData` functions now call `getCompanyApprovedLeave(today, +7d)` and `collectError` the result. One source of truth for the panel across all four surfaces (3 dashboards + `/leave/calendar`).
- [`src/app/(app)/dashboard/page.tsx`](../../src/app/(app)/dashboard/page.tsx) — `WhoIsOutList` prop renamed `requests: LeaveRequest[]` → `entries: CompanyLeaveEntry[]`; row caption now includes half-day marker (`· ½`). Panel added to `AdminDashboard` (below the operational/audit row) and `EmployeeDashboard` (above Payroll). Manager dashboard's existing panel updated to new prop. `LeaveRequest` type import dropped from this file (no longer referenced).
- Playwright pins: `tests/e2e/employee.spec.ts` "B4-bis — employee dashboard shows Team leave calendar panel with company-wide approved leave" + `tests/e2e/admin.spec.ts` "B4-bis — admin dashboard shows Team leave calendar panel with company-wide approved leave". Both seed Bob-approved leave in the next 7 days and assert panel + `/leave/calendar?month=...` link target.
- Pre-smoke gate (B4-bis): `npx tsc --noEmit` + `npx eslint <changed files>` — clean.
- Note: manager dashboard's `Team out this week` MetricCard count widened from own + directs → company-wide. Intentional. `/leave/page.tsx`'s "Out this week" panel still uses `getWhoIsOut` (out of scope this turn).

**B4-bis polish round (MS1 follow-on):** Dashboard panel + calendar visual feedback per user smoke pass.
- `Team leave calendar` panel: capped at 5 visible rows; "Show N more" button toggles inline expand (client component [`src/components/dashboard/who-is-out-panel.tsx`](../../src/components/dashboard/who-is-out-panel.tsx)). Panel header gains a `View calendar` action link to `/leave/calendar`. Empty state inlined into the client component (no longer relies on the page-level `EmptyState`).
- Calendar grid ([`leave-calendar-view.tsx`](../../src/components/leave/leave-calendar-view.tsx)): past days dimmed (`bg-muted/40` + `opacity-70`, muted day-number colour); today highlighted with `ring-2 ring-primary/60`; public-holiday cells tinted (`bg-amber-50/70`) with a stronger pill (`bg-amber-100`); employee chips drop the half-day hatched gradient in favour of a stable per-employee hue (deterministic `hsl` palette hashed from `employeeId` — `bg 92% lightness`, `border 70%`, `text 28%`). Half-day shown by a trailing `½` glyph with `aria-label="half day"`. Mobile day-list unchanged.

### Session 147 — B3 Leave admin UX & visibility (UAT F4 + F5 + F6) (2026-05-29)

**Decision recap (mid-session):** F4 control swapped from a `role="tablist"` button strip to a native `<select>` (user call after `/user-uiux` flagged the tablist Arrow-key contract gap). F6 scope expanded from "Public Holidays only" to all 3 admin panels (Leave types, Leave balances, Public Holidays) default-closed (user call to reduce page length further).

**Fixes:**
- [`getMyLeaveBalances`](../../src/server/dal/leave.ts) — accepts `number | number[] | "all"`; when `"all"`, year filter is skipped. Existing callers (`/leave/new`, `/leave`, `/employees/[id]`, `dashboard.ts`) all unchanged.
- [`leave/admin/page.tsx`](../../src/app/(app)/leave/admin/page.tsx) — calls `getMyLeaveBalances("all")`.
- [`leave-balance-admin-panel.tsx`](../../src/components/leave/leave-balance-admin-panel.tsx) — outer `<details>` (controlled `open` + `onToggle` useState); native `<select>` year filter (current year default, options = current + every year with a row); empty-state "No balances configured for {year}." when the selected year has no rows. UIUX follow-on auto-fixes: success message `role` gated on `state.success` (`status` for success, `alert` for failure).
- [`leave-type-admin-panel.tsx`](../../src/components/leave/leave-type-admin-panel.tsx) — outer `<details>` (controlled). Same `role` gate on the success message.
- [`public-holidays-admin-panel.tsx`](../../src/components/leave/public-holidays-admin-panel.tsx) — outer `<details>` (controlled). F5: `PublicHolidayRow` auto-exits edit mode on save success via React 19 "storing info from previous renders" pattern — `useState(prevUpdateState)` + render-time setState comparing `prevUpdateState !== updateState`. Chosen over `useEffect` (would trip `react-hooks/set-state-in-effect`) and over render-time ref mutation (would trip `react-hooks/refs`). Success confirmation persists in read view as `role="status"`.

**Why controlled `<details>` is needed:** uncontrolled `<details>` collapses on Next.js Server Action `revalidatePath` re-renders. Surfaced in Run 3 of `/smoke-done` Playwright — `Add` button success path failed because the panel re-collapsed before the success toast could render. Controlled `open` state preserved across re-renders.

**Pinned by Playwright:**
- `tests/e2e/admin.spec.ts` → new "B3/F5 — Public Holiday row auto-exits edit mode after successful save" — seeds a holiday on a far-future date, opens panel + year group, edits, saves, asserts Save button gone + renamed visible + "Holiday updated." in read view, cleans up.
- 4 existing `/leave/admin` tests updated to expand the `<details>` panel before interacting with `#lb-*` / `#ph-*` selectors (3 from initial F6 sweep + 1 caught by `/user-qa` at line 344 — "admin employee pickers include regular employees").

**`/user-check` follow-on (same session):**
- QA BLOCKER: missing summary-click on the "admin employee pickers" test (auto-applied).
- UIUX NEEDS-FIX: year-tab `focus-visible` ring + `role="status"` for success messages on Leave types/Balances panels (auto-applied; year-tab focus-ring became moot when control swapped to `<select>`).
- UIUX stashed → user decision → swap tablist for `<select>` (applied).
- 6 NITs routed to [`docs/follow-ups.md`](../follow-ups.md): year-tab discoverability on new-year save (still applies as `<select>`), empty `.in("year", [])` round-trip, panel summary focus-rings, leave-type empty-state copy, inner year-group summary marker suppression.

**Verification:** `tsc --noEmit` clean. `eslint` clean across all 6 changed files (pre-smoke gate caught + fixed an initial useEffect+setState lint violation on F5 mid-gate). Playwright targeted run green after 3 cycles — Run 1+2 false reds from a stale dev server, Run 3 green after kill + Playwright restart.

### Session 146 — B2 Dashboard Recent updates (UAT F2 + F7) (2026-05-28)

**Decision recap:** F2 fix is employee-only (admin/manager Action items panels already surface pending leave — adding to their Recent updates would duplicate). F7 polish applies across all three roles since they share `RecentUpdateIcon`. Onboarding/document/performance kinds stay tone-less (no ambiguous-state distinction to make).

**Fixes:**
- [`DashboardRecentUpdate`](../../src/server/dal/dashboard.ts) — added optional `tone?: "success" | "danger" | "pending" | "info"` field; renderer falls back to the previous neutral mapping when `tone` is absent (backwards-compatible).
- [`getEmployeeRecentUpdates`](../../src/server/dal/dashboard.ts) — third parallel query for `status = 'pending'` rows keyed on `created_at >= sinceIso`. Pending rows render as `Sick Leave pending` / `… · Pending approval` with `tone: "pending"`. Distinct id prefix `leave-pending-${id}` so React keys cannot collide with `leave-${id}` if the same row later transitions to approved within the same 30-day window. Approved/rejected leave rows get `tone: success | danger`.
- [`buildAdminRecentUpdates`](../../src/server/dal/dashboard.ts) — tones on leave decisions; payroll-change updates get `tone: success | danger` from `row.status`.
- [`buildManagerRecentUpdates`](../../src/server/dal/dashboard.ts) — tones on leave decisions; appraisal acknowledgement gets `tone: "info"`.
- [`RecentUpdateIcon`](../../src/app/(app)/dashboard/page.tsx) — switches on `kind + tone`. `leave + success` → `CheckCircle2` emerald; `leave + danger` → `XCircle` destructive; `leave + pending` → `Clock` amber. `payroll_change + success | danger` reuse the same check/X mapping. Icon span carries `data-testid="recent-update-icon"` + `data-tone` + `data-kind` hooks for Playwright assertions.

**Pinned by Playwright:** `tests/e2e/employee.spec.ts` → "B2/F2 — employee dashboard recent updates surfaces pending leave with pending tone". Seeds a disjoint Sick Leave 2027-04-12 pending row for Alice (separate from the Local Leave 2027-02 + half-day/refund fixtures), asserts the row text + `data-tone="pending"` icon, cleans up in `finally`.

**`/user-check` follow-on (same session):**
- `RecentUpdateIcon` pending-leave Clock retoned `text-amber-500` → `text-amber-600` to avoid token collision with the PendingTaskList ClipboardList on the same employee dashboard (source: /user-uiux NEEDS-FIX).
- `getEmployeeRecentUpdates` return shape `{ error: string | null }` → `{ errors: string[] }` so all three partial-failure error strings reach the dashboard banner (was silently dropping 2nd/3rd). Aligns with the `errors: string[]` pattern already used by `getAdminDashboardData` / `getManagerDashboardData` (source: /user-review NEEDS-FIX).

**Verification:** `npx tsc --noEmit` clean. `npm run lint` reports only pre-existing errors in `sidebar.tsx`, `employee-form.tsx`, `leave-request-form.tsx`, `actions/leave.ts` — none in B2's surface.

### Session 143 — R1 fix + holiday-add error feedback fix (2026-05-28)

**R1 root cause (two bugs in one symptom):**

- **`window.confirm()` dialog wasn't wanted** — `CancelLeaveForm` had a `window.confirm` guard added during the original change. The product has previously eliminated similar native confirms. Removed.
- **Balance didn't refund (real bug, RLS layer):** `employee_cancel_own_leave` and `manager_cancel_own_leave` policies (migrations 0006 + 0022) were authored when cancel was pending-only — `using (... status = 'pending')`. With cancel-of-approved introduced this session, RLS silently rejected the UPDATE: PostgREST returned success with 0 rows affected, no error surfaced, the action wrote a misleading `leave.cancelled` audit row (with `refunded_days: 2`) even though the row stayed `approved` and the refund trigger never fired. Systems-thinking gap — the plan asked "does the user see the refund prompt?" but not "if the cancel silently fails, will anyone notice?". Pattern logged in [`learning.md`](../../learning.md) § "State-transition expansions".

**Fixes:**
- Migration `0043_leave_cancel_approved_rls.sql` — relaxes both cancel policies' `using` clause to `status IN ('pending', 'approved')`. `with check (... status = 'cancelled')` unchanged so the target state is still pinned.
- [`cancelLeaveRequest`](../../src/server/actions/leave.ts) now does `.select("id").maybeSingle()` on the UPDATE so a 0-row outcome is visible. Zero rows now returns a real error and writes an `auth.access_denied` audit row (`reason: "cancel_rls_rejected"`) instead of a fabricated success.
- [`CancelLeaveForm`](../../src/components/leave/cancel-leave-form.tsx) — removed `window.confirm` and the unused `deductedDays` prop.

**Pinned by Playwright:** `tests/e2e/employee.spec.ts` → "employee cancels approved leave and balance is refunded".

**Holiday-add screenshot fix:**

The Public Holidays admin form on `/leave/admin` returned the generic `"Holiday could not be created."` on any non-duplicate failure — couldn't self-diagnose. Three fixes:
- [`createPublicHoliday`](../../src/server/actions/leave.ts) now surfaces the actual Postgres error code + message in the response.
- Form `values` returned on failure so [`PublicHolidaysAdminPanel`](../../src/components/leave/public-holidays-admin-panel.tsx) can restore the user's input (no retyping after an error).
- Stray `<input type="hidden" name="countryCode" value="MU">` was *outside* the `</form>` element — moved inside (was silently dropped from submission; fallback `?? "MU"` in the action had been masking the issue).

**Playwright additions (this session):**
- `tests/e2e/employee.spec.ts` — W2 (zero-working-day submit block), H1 (half-day decrement = 0.5), R1 (refund-on-cancel).
- `tests/e2e/admin.spec.ts` — C1 (admin creates holiday inline), C3 (CSV bulk upload with mid-file + DB duplicates skipped).

### Session 145 — B1 leave submission gating (UAT F1) (2026-05-28)

**Decision recap:** hard block at submission; half-day allowed if balance ≥ 0.5; per-year independent check for cross-year. Approval-time check kept as defense-in-depth (admin-edit-balance-between-submit-and-approve race).

**Fixes:**
- [`getLeaveApprovalSetupError`](../../src/server/actions/leave.ts) → **renamed `getLeaveBalanceSetupError`** since it now serves both submit and approve paths. Same helper, same per-year logic, half-day-aware — drift between the two checks is structurally impossible.
- [`submitLeaveRequest`](../../src/server/actions/leave.ts) — new call to `getLeaveBalanceSetupError` after the zero-working-days guard and before the overlap check. Returns `fieldErrors.leaveTypeId` with the same per-year insufficient message the approval path uses. No new audit event (matches existing convention — submission rejections aren't audited except for the overlap-conflict case, which pins a real conflicting record).
- [`leave-request-form.tsx`](../../src/components/leave/leave-request-form.tsx) — new `wouldExceedBalance` computed for the single-year case (`startYear === endYear` AND `preview.totalDays > selectedBalance.balance`). Disables the Submit button and switches `LeaveBalanceHint` to a destructive-tone variant with "Requested days exceed your <year> balance" message. Cross-year submissions still fall through to the server's authoritative per-year check (form does not split per year).

**Pinned by Playwright:** `tests/e2e/employee.spec.ts` → "employee submit blocked when request exceeds balance" — asserts client disable + red hint AND force-bypass server rejection with `Insufficient 2027 Local Leave balance`.

### Session 144 — C1 grant fix + C3 DB-dup preview + admin year filter + collapsible years (2026-05-28)

Mid-walk fixes surfaced during the H/R/F/C scenario passes; all UAT R2 → C6 completed cleanly afterward.

- **C1 — `42501 permission denied for table public_holidays`** during inline-add. Root cause: migration 0040 granted SELECT/INSERT/UPDATE/DELETE to `authenticated` but not `service_role`; migration 0039 had revoked Supabase's default new-table grants, so the admin client (service_role) had nothing. Fix: `supabase/migrations/0044_public_holidays_service_role_grants.sql` — explicit grants. Mirrors the rule already logged for admin-client-written tables.
- **C3 — CSV preview marked DB duplicates as `Insert`** instead of `Skip`. Bulk-upload preview only checked within-file duplicates. Fix: [`PublicHolidaysAdminPanel`](../../src/components/leave/public-holidays-admin-panel.tsx) `BulkUploadSection` now accepts `existingHolidays` and builds a Set of `date|country|name` keys checked during parse.
- **2028 holidays not showing post-CSV-commit** — admin page was filtering `getPublicHolidays({ fromYear: currentYear, toYear: currentYear + 1 })`. Fix: [`/leave/admin/page.tsx`](../../src/app/(app)/leave/admin/page.tsx) drops the year filter (admin needs full visibility); panel still groups by year.
- **Year-grouped lists too long** — opened by default, panel exceeded a screen. Fix: `<details open>` → `<details>` in `PublicHolidaysAdminPanel` so each year collapses by default. Active and inactive sections both default-closed.