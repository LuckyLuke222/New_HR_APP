# New-Hire Onboarding

**Time:** 35 minutes  •  **Roles:** admin → employee (new hire)  •  **Modules:** `/employees`, `/employees/new`, `/onboarding`, `/onboarding/admin`, `/audit-logs`

End-to-end onboarding of one new employee: admin creates the account → generates a first-login reset link → assigns an onboarding template → new hire signs in → completes tasks. Verifies the People Directory, leave-balance auto-seed (Session 91 + 92), and the cross-role dashboard feedback.

## Preconditions

- `admin@kushhr.dev` can sign in.
- A second browser (or private window) ready for the new-hire login.
- `/settings` shows valid Leave policy defaults (e.g. Local Leave 22, Sick Leave 15). If not, set them first — this flow asserts the new hire is seeded with those defaults.
- At least one active onboarding template with ≥ 2 tasks. If absent, the admin will create one in step 3.
- Note the latest audit timestamp.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Admin | Open `/employees`. Note current headcount. | People Directory loads. |
| 2 | Admin | Open `/employees/new`. Fill: Full name "UAT New Hire", work email `uat-newhire-<date>@kushhr.dev`, role **Employee**, job title "UAT Engineer", start date today, work location "Mauritius" (default), select Engineering department. | The Manager field auto-prefills to Morgan (Engineering's manager — Phase 13 E1 / Session 93). |
| 3 | Admin | Override the Manager prefill with a different active manager if any exist, then revert back to Morgan. | Manager field accepts both selections cleanly. |
| 4 | Admin | Submit. | Success message: "Employee created. Generate a password reset link before first login." Employee appears in `/employees` directory with role Employee. Audit row `employee.created`. |
| 5 | Admin | Open the new employee's profile. Generate password reset link. Copy the full link. | Reset link field shows a full URL containing `token_hash=` and `type=recovery`. Audit row `auth.password_reset_link_generated`. |
| 6 | Admin | Open `/onboarding/admin`. If no active template with tasks exists, create a "UAT Onboarding" template with two items: "UAT — Read welcome doc" and "UAT — Set up laptop". | Template visible and Active. |
| 7 | Admin | Use the **Assign tasks** panel → **From template** → pick the new hire + the template. Submit. | Success message includes task count assigned. Audit row `onboarding.tasks_assigned`. |
| 8 | Admin | Open the new hire's profile → **Leave** tab (or `/leave/admin`). | Their Local Leave (22) and Sick Leave (15) balances exist for the current year. (Session 91 + auto-seed in `createEmployee`.) |
| 9 | New hire (other browser) | Open the reset link copied in step 5. Set a strong new password. Submit. | Success page redirects to `/login?message=password-updated`. Login page shows "Password updated. Sign in with your new password." Audit row `auth.password_reset_completed`. |
| 10 | New hire | Sign in with the new password. | Lands on `/dashboard` as an employee. Sees Leave balance cards (Local 22 / Sick 15) and the **Action items** panel listing both onboarding tasks. |
| 11 | New hire | Click the first action item ("UAT — Read welcome doc"). | Navigates into `/onboarding` with the task highlighted. |
| 12 | New hire | Mark complete with note "UAT — done". | Task moves to Completed. Audit row `onboarding.task_completed`. |
| 13 | New hire | Refresh `/dashboard`. | Completed task appears in **Recent updates**. Action items panel shows 1 remaining task. |
| 14 | Admin | Open `/dashboard`. | The **Onboarding progress** metric card shows the new hire's progress contribution (1 of 2 tasks for that hire). |
| 15 | Admin | Open `/onboarding`. | Progress overview shows the new hire with 50% completion. |
| 16 | New hire | Try `/employees/new` via URL. | Redirected to `/access-denied`. Audit row `auth.access_denied` with `attempted_resource: /employees/new`. |
| 17 | New hire | Try `/employees` (the People Directory). | Loads the **employee-scoped** People Directory (Session 96 / Batch 10). Sees a limited list of colleagues with name + job title + department + work email only. Does **not** see role, employment status, salary, phone, or manager column. |
| 18 | New hire | Open own profile via `/employees/<own id>`. | Sees own job/role/manager. Manager field shows "Morgan Manager" (Session 90 / Batch 4 A2). |

## Audit log events to verify

Filter `/audit-logs` for events created since the baseline:

- `employee.created` × 1
- `auth.password_reset_link_generated` × 1
- `onboarding.tasks_assigned` × 1
- `auth.password_reset_completed` × 1 (Session 80)
- `onboarding.task_completed` × 1
- `auth.access_denied` × 1 (new hire trying `/employees/new`)

## What to check on the next dashboard refresh

- **New hire's dashboard:** Local Leave 22 + Sick Leave 15 cards. 1 remaining task in Action items. Recent updates shows the completed task.
- **Admin's dashboard:** Headcount metric +1. Onboarding progress percentage shifted to reflect the new pending task.
- **Morgan's dashboard:** New hire is now in the manager's Direct reports count (since they were assigned Morgan). Morgan should see them in `/employees`.

## Cleanup

The new hire account is real. Decide before the next rotation:

- **Keep** if you want the new hire to persist between rotations as a UAT regression baseline. Document in this folder's README.
- **Terminate** via admin: edit the new hire's employee record, set employment status to **terminated**, set end date to today. This preserves audit history.
- **Delete** is not exposed via UI (intentional). For a hard cleanup, use the admin client / SQL directly — out of scope for routine UAT.

UAT-prefixed onboarding template + tasks: delete them from `/onboarding/admin` if you don't want them showing in the active templates list.

`npm run cleanup:e2e-data` does **not** remove UAT-prefixed records — it targets Playwright-suite prefixes only.

## Notes for the reviewer

If step 2's manager auto-prefill doesn't happen, that's an E1 regression (Session 93). If step 8's leave balances are 0 or missing, that's an E3 / Session 91 regression (createEmployee no longer reading from `app_settings`). If step 17 shows full directory fields to the new hire (role, salary, etc.), **stop immediately** and file as a critical RLS regression — Session 96 / migration 0033 explicitly limits this surface.


1. As admin - Headcount should include Admin as well, /employees, should display name of admin as well.
2. As manager, I can't see all other employees, on the /employees tab.  Should it default to own employees in the filter?  Then if manager wants to see other employees, he can clear filter?  I can only see my direct reports. Can you look into this?
3. As admin - admin dashboard "Unrouted pending leave" panel shows Alex Admin rows ("no manager assigned"), and Action items panel surfaces admin's own Local Leave entries. Admin shouldn't appear as an unrouted-leave subject — admin has no upline by design (B1, 2026-06-01). Surfaced after B1 seeded admin into `employee_records`.

## Severity ranking and remediation batches (2026-06-01)

Captured after the full UAT rotation completed. Findings above are grouped into severity tiers and batched by file/area to minimise churn.

### Severity tiers

**Critical** — data integrity / security
- (none)

**High** — incorrect guard behavior / lifecycle / process
- (none)

**Medium** — UX gaps / missing affordances ✅ **Closed Session 153 (2026-06-01)**
- F1: ✅ Admin user missing from `/employees` directory and from the dashboard Headcount metric.
- F2: ✅ Manager's `/employees` view is restricted to direct reports only — no way to browse the wider org.
- F3: ✅ Admin dashboard "Unrouted pending leave" + "Action items" panels surface admin's own leave (surfaced after B1 seeded admin into `employee_records` with `manager_id=null`).

**Low** — polish
- (none)

### Remediation batches

| Batch | Findings | Surface area | Severity | Notes |
|---|---|---|---|---|
| **B1** Admin in directory + headcount ✅ | F1 | `supabase/migrations/0047_seed_admin_employee_records.sql`, `supabase/seed.sql`, `src/server/dal/employees.ts` (`getEmployeesNeedingAttention`) | Medium | **Closed Session 153 / Claude.** Path (a) chosen: admin gets a real `employee_records` row (Administrator / null department / null manager / active). Backfill migration is idempotent; seed.sql updated for fresh resets. `getEmployeesNeedingAttention` skips role=admin so admin isn't flagged on the Needs-attention card. |
| **B2** Manager directory scope ✅ | F2 | `src/app/(app)/employees/page.tsx` (scope param + branch + UI) | Medium | **Closed Session 153 / Claude.** `?scope=all-staff` param routes managers through `get_people_directory` RPC and renders the 3-column `PeopleTable` (Name / Department / Work email). Default is direct-reports; a banner offers "View all staff" / "Show only my direct reports" toggle. No RLS or migration change. |
| **B3** Admin dashboard leave filter ✅ | F3 | `src/server/dal/dashboard.ts` (`getUnroutedPendingLeave`, `buildAdminActionItems` feed) | Medium | **Closed Session 153 / Claude.** After B1 seeded admin with `manager_id=null`, admin's own leave started surfacing in two admin-dashboard panels. Fix fetches admin profile ids once and filters them out of both reads. QA NEEDS-FIX auto-applied: admin-IDs fetch error now piped through `collectError(errors, safeDashboardError("dashboard.admin.adminIds", …))`. |

### Recommended sequencing

1. **B1 → B2 → B3** — actual execution order. B1 product question answered "seed admin"; B2 answered projection (b) limited; B3 was surfaced by B1 (admin in unrouted panel) and fixed inline.

### Open product questions

- **B1** ✅ — Answered: seed admin into `employee_records`.
- **B2** ✅ — Answered: default direct-reports + Clear-filter to all-staff (projection b).

### Remediation log

- **2026-06-01 / Session 153 / Claude** — B1 closed via [`supabase/migrations/0047_seed_admin_employee_records.sql`](../../supabase/migrations/0047_seed_admin_employee_records.sql) + [`supabase/seed.sql`](../../supabase/seed.sql) + admin-skip in [`src/server/dal/employees.ts`](../../src/server/dal/employees.ts) `getEmployeesNeedingAttention`. Admin row uses Administrator job title, null department, null manager, active full_time, start_date = profile created_at.
- **2026-06-01 / Session 153 / Claude** — B2 closed via `?scope=all-staff` param + manager scope banner + Clear-filter affordance in [`src/app/(app)/employees/page.tsx`](../../src/app/(app)/employees/page.tsx). All-staff routes managers through the existing `get_people_directory` RPC (no RLS change). Status/Role filters hide in all-staff mode; the form preserves scope via a hidden input.
- **2026-06-01 / Session 153 / Claude** — B3 closed via admin-IDs prefetch + filter on `getUnroutedPendingLeave(adminIds)` + filter on the `buildAdminActionItems` leave feed in [`src/server/dal/dashboard.ts`](../../src/server/dal/dashboard.ts). Admin can still manage own leave from `/leave`. QA NEEDS-FIX auto-applied: admin-IDs fetch error piped through `collectError`.
