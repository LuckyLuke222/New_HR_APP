# Leave Admin And Year Rollover

**Time:** 30 minutes  •  **Role:** admin (with employee verification)  •  **Modules:** `/settings`, `/leave/admin`, `/leave/new`, `/audit-logs`

The admin side of the leave system: Settings policy defaults → leave type lifecycle → balance management → year rollover → per-request auto-seed (employee verification). Covers Sessions 91 (Batch 5 E3), 92 (Batch 6 E2/C5/C6).

## Preconditions

- `admin@kushhr.dev` and `alice@kushhr.dev` can sign in.
- `/settings` shows the typed singleton row exists (migration 0032 applied).
- Note the latest audit timestamp.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Admin | Open `/settings`. | Three sections visible: Company, Leave policy defaults, Working week / timezone / currency. Current values readable (Session 91). |
| 2 | Admin | Note current Local Leave default + Sick Leave default. Call them **L0** and **S0**. | Numbers visible. |
| 3 | Admin | Edit Local Leave days to **L0 + 1**. Save. | Success. Audit row `app_settings.updated` with `metadata.diff` showing the change (Session 91). |
| 4 | Admin | Revert Local Leave days to **L0**. Save. | Success. Second `app_settings.updated` audit row. |
| 5 | Admin | Edit currency to a 4-letter invalid string (e.g. "DOLR"). Save. | Validation error: "Currency must be a 3-letter ISO code (e.g. MUR)." No update. |
| 6 | Admin | Edit company logo URL to "not-a-url". Save. | Validation error: "Logo URL must start with http:// or https://." No update. |
| 7 | Admin | Open `/leave/admin`. | Page shows: Year rollover banner at top, Leave types list with **Add leave type** form **above** the existing list (Session 92 / C5), Leave balances list with **Set or update balance** form **above** the table (Session 92 / C5). |
| 8 | Admin | In the Add leave type form, create "UAT Compassionate" with description "UAT — three-day compassionate". Submit. | New type appears in the list as Active. Audit row `leave_type.created`. |
| 9 | Admin | Use the balance form (Session 92 / C6 — leave type is a **native dropdown**, not free-text). Pick Alice, **UAT Compassionate**, balance 3, year current year. Save. | New row appears in the balances table for Alice. Audit row `leave_balance.upserted`. |
| 10 | Admin | On the new leave type, click **Deactivate**. | Status flips to Inactive. Audit row `leave_type.toggled`. |
| 11 | Alice | Sign in. Open `/leave/new`. | Leave type dropdown does **not** include the now-inactive UAT Compassionate. |
| 12 | Admin | Reactivate UAT Compassionate. | Active again. |
| 13 | Alice | Refresh `/leave/new`. Pick UAT Compassionate. Choose dates **in the current year**, submit. | Request created as Pending. |
| 14 | Alice | On `/leave/new`, pick UAT Compassionate again. Choose dates in **(current year + 1)** (e.g. Jan next year). Submit. | Request created — **for a custom leave type, the auto-seed does NOT fire** (Session 92 decision: only Local + Sick are auto-seeded). So if no `(alice, UAT Compassionate, year + 1)` balance row exists yet, this attempt should fail with a clear error "No balance set for UAT Compassionate in <next year>. Ask admin to set one first." |
| 15 | Alice | On `/leave/new`, pick **Local Leave**. Choose dates in **(current year + 1)**. Submit. | Auto-seed fires: `(alice, Local Leave, year + 1)` balance row created using Settings default (**L0**). Request created as Pending. Audit log shows the balance row creation event (action name depends on impl — verify via `/leave/admin` that the row appears for year + 1). |
| 16 | Alice | On `/leave/new`, pick Local Leave with dates in **(current year + 2)**. Submit. | Submission rejected with "Leave can only be requested up to <current year + 1>. Rollover for later years happens at year end." (Session 92 horizon rule.) |
| 17 | Admin | Open `/leave/admin`. Click **Roll over to <next year>**. | Success message: "Rolled over N balances for <next year>. Skipped M (already present)." Audit row `leave.balances_rolled_over` with `{ year, created_count, skipped_count }` in metadata. |
| 18 | Admin | Click **Roll over to <next year>** a second time. | Success message: created_count is now 0, skipped_count = previous created_count + previous skipped (idempotent — Session 92). |
| 19 | Admin | Open `/leave/admin` and verify Alice has Local Leave + Sick Leave balances for current year, current year + 1 (some seeded from step 15, others from rollover step 17). | All visible in the balances table. UAT Compassionate balance is **only** for current year (rollover skips custom types). |

## Audit log events to verify

- `app_settings.updated` × 2 (modify + revert in steps 3, 4)
- `leave_type.created` × 1 (UAT Compassionate)
- `leave_type.toggled` × 2 (deactivate + reactivate)
- `leave_balance.upserted` × 1 (manual set in step 9)
- `leave.submitted` × 2 (current year + next year Local Leave). Note: step 14's custom-type next-year attempt fails so no submission audit row.
- `leave.balances_rolled_over` × 2 (the two rollover clicks; second one shows created_count=0)

## What to check on the next dashboard refresh

- **Admin's dashboard:** Pending leave metric increments by 2 (Alice's two new pending requests from steps 13, 15).
- **Alice's dashboard:** Local Leave + Sick Leave balance cards for current year unchanged (no decrement yet — pending only). When she navigates to `/leave` she sees **two pending rows** + multi-year balance context.

## Cleanup

- Cancel Alice's two pending UAT requests via the admin or owner cancel UI (or approve them and observe the balance decrement — your call for the rotation).
- The UAT Compassionate leave type can stay as a long-lived test type, or admin-deactivate + admin-delete-via-SQL if you want a tidy seed. Note: `/leave/admin` does not expose a hard delete on leave types intentionally.
- Settings values were restored in step 4. Verify before signing out.

`npm run cleanup:e2e-data` removes Playwright-prefixed leave types (e.g. "Admin Approves Manager Leave") but not "UAT Compassionate" — manual cleanup needed.

## Notes for the reviewer

If step 7's `/leave/admin` shows the forms **below** the lists, that's a C5 regression (Session 92). If step 9's leave-type field is a free-text searchable input, that's a C6 regression (Session 92). If step 14's custom-type next-year submission silently succeeds, that's a Session 92 decision-violation — the auto-seed should be restricted to Local + Sick only. If step 16's far-future request submits, that's a Session 92 horizon-rule regression. If step 18's second click resets existing balances (instead of skipping), that's an idempotence regression — the rollover must `ignoreDuplicates: true` on `(employee_id, leave_type_id, year)`.



## Findings
1. The leave admin button should also be found below "Request Leave" on the leave page for the admin.  Perhaps a different color slightly.
2.  After deactivating UAT compassionate, a card still appears for alice: 3 leaves with UNKNOWN.  Since this was deactivated, it should not appear at all.  Unknown also appears in Request Leave.  But in the dropdown, only local and sick leaves appear, which is good.  See screenshots 1.,2.,3.,4.png in the folder screenshots.

## Severity ranking and remediation batches (2026-05-29)

Captured after the full UAT rotation completed. Findings above are grouped into severity tiers and batched by file/area to minimise churn.

### Severity tiers

**Critical** — data integrity / security
- (none)

**High** — incorrect guard behavior / lifecycle / process
- (none)

**Medium** — UX gaps / missing affordances
- F1 ✅: Inactive-type balance still rendered as "Unknown" on `/leave` balance cards and `/leave/new` balance context for employees (root cause: `leave_types` RLS `authenticated_select_active_leave_types` filters inactive rows for non-admins → `fetchTypeNames` lookup misses → `?? "Unknown"` fallback in `getMyLeaveBalances`; admins are unaffected because the policy lets them read inactive rows). Confusing label + zombie card after admin deactivates a type.
- F2 ✅: `/leave` admin-link is a small text-link buried at the bottom of the page ([src/app/(app)/leave/page.tsx:285-296](src/app/(app)/leave/page.tsx#L285-L296)); should be a button near the top "Request leave" CTA for admins, with a slightly different colour so it doesn't compete visually.

**Low** — polish
- (none)

### Remediation batches

| Batch | Findings | Surface area | Severity | Notes |
|---|---|---|---|---|
| **B1** Inactive-type balance hygiene | F1 | [src/server/dal/leave.ts](src/server/dal/leave.ts), [src/app/(app)/leave/page.tsx](src/app/(app)/leave/page.tsx), [src/app/(app)/leave/new/page.tsx](src/app/(app)/leave/new/page.tsx), [src/server/dal/dashboard.ts](src/server/dal/dashboard.ts) | Medium | ✅ Closed Session 150 (Claude) — `fetchTypeNames` returns `{name, isActive}`; `LeaveBalance.leaveTypeIsActive` field added with `?? false` default (RLS-hidden = inactive for viewer); 3 employee-facing surfaces filter on it (/leave, /leave/new, dashboard). Admin /leave/admin and /employees/[id] intentionally untouched. |
| **B2** Admin CTA on `/leave` | F2 | [src/app/(app)/leave/page.tsx](src/app/(app)/leave/page.tsx) | Medium | ✅ Closed Session 150 (Claude) — `<Button asChild variant="outline">` with `Settings` lucide icon, rendered only when `user.role === "admin"` inside a `flex flex-wrap items-start justify-start gap-2` wrapper before the primary "Request leave" CTA. Trailing buried admin paragraph deleted. |

### Recommended sequencing

1. **B1 → B2** — B1 needs a product decision before code lands; B2 is pure UI polish and can ship independently or in the same PR if B1 unblocks quickly. If B1's question lingers, ship B2 first to avoid stalling closure.

### Open product questions

- **B1** — ~~Three handling options for balance rows whose leave type was deactivated.~~ **Resolved 2026-05-29: option (a) Hide the card.** Balance rows preserved in DB; admin `/leave/admin` still shows them. Employee `/leave` and `/leave/new` filter out balances whose leave type is currently inactive. Reversible — re-activating the type restores the card. No RLS change.

### Remediation log

**Session 150 (Claude, 2026-05-30) — B1 + B2 closed**

- **B1 — Inactive-type balance hygiene.** `fetchTypeNames` helper in [src/server/dal/leave.ts:421](src/server/dal/leave.ts#L421) now returns `Map<string, {name, isActive}>` (selects `is_active` from `leave_types`). Four callers (`getLeaveRequests`, `getLeavesForApproval`, `getWhoIsOut`, `getMyLeaveBalances`) updated to `.name` accessor. `LeaveBalance` type gained `leaveTypeIsActive: boolean`, populated only by `getMyLeaveBalances` with `?? false` default — because `leave_types` RLS hides inactive types from non-admins, a missing lookup *is* the inactive case for the viewer. Three employee-facing filters added: [/leave page.tsx:90](src/app/(app)/leave/page.tsx#L90) `myBalances`, [/leave/new page.tsx:32](src/app/(app)/leave/new/page.tsx#L32) `balances`, [dashboard.ts:545](src/server/dal/dashboard.ts#L545) `data.balances`. Mid-session bug fix: initial `?? true` default missed the RLS-filtered case (employee couldn't see the inactive row, so `types.get(id)` returned undefined → defaulted to active → card still rendered); flipped to `?? false` after user-flagged MS3 failure.
- **B2 — Admin CTA on /leave.** [src/app/(app)/leave/page.tsx](src/app/(app)/leave/page.tsx) header now renders a second `<Button asChild variant="outline">` with `Settings` lucide icon → `/leave/admin`, only when `user.role === "admin"`, inside a `flex flex-wrap items-start justify-start gap-2` wrapper before the primary "Request leave" CTA. Trailing `/* Admin link */` paragraph deleted. One canonical entry point.
- **UIUX-driven follow-on (auto-applied via /user-check):** `/leave` "Your <year> balances" section no longer silently disappears when `myBalances` is empty; renders the heading + empty-state paragraph ("No active leave types assigned. Contact your admin if this seems wrong.") instead. Same fix lights up the existing zero-balance employee case that pre-dated this session.
- **Auto-routed NITs** to [docs/follow-ups.md](docs/follow-ups.md) under "Auto-routed NITs from /user-check 2026-05-29 (B1 inactive balance + B2 admin CTA)": JSDoc / narrowed type on `LeaveBalance.leaveTypeIsActive`, inline comment on the `leaveTypeIsActive` predicate, pre-existing silent-error pattern in `fetchTypeNames` / `fetchProfileNames`.
- **Pre-smoke gate** clean across both rounds (`tsc --noEmit` + `eslint` on the 4 changed files).


