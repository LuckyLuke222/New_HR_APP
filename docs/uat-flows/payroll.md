# Payroll

**Time:** 20 minutes  •  **Roles:** employee → manager → admin  •  **Modules:** `/payroll`, `/audit-logs`

Replaces the retired `payroll-change-request` UAT. Verifies the Session 154 reshape:
- Change-request workflow removed (table dropped in migration 0048).
- Employee can directly edit own non-salary fields (bank, tax, national-id, passport, nationality) at `/payroll`.
- Manager has a new view-only summary of own + direct-report compensation.
- Salary remains admin-only via column-grant + Server Action enforcement.
- Employee can see **only own** row at any layer.

## Preconditions

- `alice@kushhr.dev`, `manager@kushhr.dev`, `admin@kushhr.dev` can sign in.
- Bob's `manager_id` is null in `employee_records` (seed state). If a prior manual UAT changed it, restore via admin UI or `update employee_records set manager_id = null where employee_id = '<bob>'` before walking step 5.
- Note the latest audit timestamp.
- Alice has an `employee_compensation` row (true in seed).

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Alice | Sign in. Open `/payroll`. | Heading "My payroll". Sees salary, currency, pay frequency, effective date as **read-only** (no inputs for these). Bank name select, account holder, account number (password input), tax ID, national ID, passport number, nationality are **editable**. No "Submit a change request" CTA. No Notes field. |
| 2 | Alice | Change bank name → "MCB", account holder → "Alice Employee", tax ID → a new unique value like `TAX-UAT-001`, national ID → existing value. Save my details. | "Your details were saved." success banner. Reload `/payroll` — new values persist. Audit row `compensation.self_updated` with `fields_updated` listing the changed keys. |
| 2a | Alice | While editing the Account number field in step 2, watch the input as you type. Then click the **Show** link next to "(current: ****…)". Click **Hide**. | Account number input shows typed characters in clear text (not dots). Stored value is masked by default; **Show** reveals the full value; **Hide** re-masks. (F1 closure.) |
| 3 | Alice | DevTools → inspect the form, inject a hidden `<input name="salaryAmount" value="999999">`, submit. | Form rejects with "Salary and pay details can only be updated by an admin." Audit row `auth.access_denied` with `metadata.reason = "salary_field_in_self_update"` and `metadata.fields` listing `salaryAmount`. DB salary unchanged. |
| 3a | Alice | DevTools → edit the visible salary `<dd>` text directly (e.g. change `MUR 60,000.00` → `MUR 30,000.00`), then submit any non-salary change (e.g. tweak nationality + Save my details). After save, observe the salary display. Verify DB truth via admin: sign in as admin, open `/payroll`, pick Alice. | After save, the salary display snaps back to the real DB value (the tampered text is gone). Admin view confirms `salary_amount` matches the pre-test value. (F2 closure.) If the tampered amount persists in the employee view after save, that is the F2 regression — display only; admin view shows DB truth. |
| 4 | Alice | Open `/payroll` again. | Salary / currency / pay frequency / effective date match the admin's `employee_compensation` row. Display values, no inputs. |
| 5 | Alice | **(a)** Visit `/employees/<bob-id>` in the browser. **(b)** In DevTools console, run the raw supabase-js script in *Notes for the reviewer → step 5(b) script* below, signed in as Alice. | **(a)** Page renders Bob's *peer card only* — display name, work email, phone, department, manager. **No** salary / bank / tax / national-id / passport / employment status / leave / documents / performance / Edit button. Peer projection is intentional (migration 0037 `get_peer_employee_profile` RPC). **(b)** All three queries — `employee_compensation`, `leave_requests`, `documents` filtered by Bob's id — return `rows: 0` and no error. Empty array + null error is the correct RLS-denied shape (Postgres RLS silently filters rather than throwing). If any of (a)'s forbidden fields appear, or any of (b)'s rows > 0, that is a critical RLS regression — stop the UAT. |
| 6 | Manager | Sign in. Open `/payroll`. | Heading "Payroll". "My compensation" card shows manager's own salary / pay frequency / effective date summary. "Direct reports" table lists Alice (salary, currency, pay frequency, effective date). Bob does NOT appear (no direct-report relation). No bank / tax / national-id / passport columns anywhere. No edit affordance — no "Save my details" or "Save compensation" button visible. |
| 7 | Reviewer | **(a) Code inspection.** Open [src/server/actions/compensation.ts:268-401](src/server/actions/compensation.ts#L268) and verify: `selfUpdateSchema` has **no** `employeeId` field, and the action's `.update(...).eq("employee_id", user.id)` line is hard-coded to the session user (`auth.uid()`). **(b) Live forge attempt (optional belt-and-suspenders).** As Manager, sign in. As admin in another tab, snapshot Alice's `bank_account_holder` from `/payroll`. Then run the console snippet in *Notes for the reviewer → step 7 script* below as Manager. Re-check Alice's row. | **(a)** Schema source confirms there is no input pathway for a target `employee_id`. The Server Action is structurally incapable of targeting another user's row regardless of FormData contents — this is the real guarantee. **(b)** Alice's row unchanged after the forged POST. (The forged POST is also expected to be silently dropped because Next Server Actions require a `Next-Action` header that a raw `fetch` does not provide — a true forge requires capturing a legitimate action call from the Network tab and replaying it with edited FormData.) |
| 8 | Manager | **(a) Base-table SELECT.** As manager, raw supabase-js `select * from employee_compensation where employee_id = '<alice-id>'`. **(b) RPC.** `await sb.rpc("get_direct_report_compensation_summaries")`. | **(a)** Returns `data: []` (and only manager's own row if you broaden the filter to include `manager_id`). The `manager_select_direct_report_compensation` policy was dropped in migration 0050; manager has no base-table access to any direct-report row. Bank/tax/national-id columns are physically unreachable on the base table for managers. **(b)** Returns one row per **direct report**, regardless of whether that direct report has a compensation row on file. Each row has `employee_id, employee_name, salary_amount, salary_currency, pay_frequency, effective_date`. Direct reports without a compensation row come through with all four summary fields null (migration 0051); the manager UI renders these as `—` placeholders. No bank/tax/national-id/passport in the return type — the SECURITY DEFINER projection enforces it. If (a) returns Alice's row OR (b) exposes any sensitive column OR (b) omits a direct report who has no compensation set up, that's a regression. |
| 9 | Admin | Sign in. Open `/payroll`. Pick Alice. Edit salary → 5500 MUR. Save compensation. | Save succeeds; banner shows "Compensation saved." Audit row `compensation.updated` with `fields_updated` including `salary_amount`. |
| 10 | Admin | On Alice's row, edit bank name → "SBM". Save compensation. | Save succeeds. Audit row `compensation.updated` includes `bank_name`. (Distinct from `compensation.self_updated` — admin edits and self edits are tracked as different audit families.) |
| 11 | Anyone | Visit `/payroll/change-requests`. | 404 (route deleted). |
| 12 | Admin | Open `/dashboard`. | Action items panel no longer lists payroll-change rows. Recent updates no longer includes payroll-change decisions. (Only leave + performance rows remain.) |

## Audit log events to verify

- `compensation.self_updated` × 1 (Alice's self-edit in step 2)
- `auth.access_denied` × 1 with `reason: "salary_field_in_self_update"` (step 3)
- `compensation.updated` × 2 (admin steps 9 and 10)

## What to check on the next dashboard refresh

- **Admin's dashboard:** Action items panel no longer has any "Payroll change · <name>" rows. Recent updates does not include any "Payroll change approved/rejected" rows. The dashboard still shows pending leave + performance items.
- **Manager's dashboard:** Unchanged — no payroll widget was added.
- **Alice's dashboard:** Compensation summary card still shows salary / pay frequency / effective date (read via `getCompensationSummary`, not by the now-deleted change-request feed).

## Cleanup

- Restore Alice's seed `tax_id` / `bank_name` / `bank_account_holder` if you changed them in step 2 — Playwright employee specs assume seed values. The Playwright auth setup itself does not depend on these fields, but `tests/e2e/employee.spec.ts` may.
- Restore Alice's salary if you changed it in step 9 (the rest of the suite is salary-tolerant; admin spec doesn't assert a particular number, but lower-impact to restore).
- Audit log entries are intentionally retained.

`npm run cleanup:e2e-data` is not relevant here — this flow only touches `employee_compensation` and `audit_logs`.

## Notes for the reviewer

- If step 3's salary-injection succeeds (salary actually changes), **stop immediately** — that's a critical regression in the self-update guard (both the Server Action defence and the migration 0049 column grant must hold).
- If step 6 shows ANY of bank / tax / national-id / passport in the manager view, that's a Phase 8 / Phase 13 columnar-projection regression in `getManagerVisibleCompensation`.
- If step 5(b)'s direct query lets Alice read Bob's compensation / leave / document row, that's an RLS regression in migration 0049 + 0006 + 0007 — the `employee_select_own_*` policies must scope by `employee_id = auth.uid()`.
- If step 11 still renders `/payroll/change-requests` instead of 404, the deletion in Session 154 is incomplete.

### Step 5(b) script

Paste this into the DevTools console while signed in as Alice. Replace the two `<paste …>` placeholders with the values from your local `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

```js
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient(
  "<paste NEXT_PUBLIC_SUPABASE_URL>",
  "<paste NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>",
);
await sb.auth.signInWithPassword({ email: "alice@kushhr.dev", password: "TestPass123!" });

const BOB = "d0000000-0000-0000-0000-000000000004";
const [comp, leave, docs] = await Promise.all([
  sb.from("employee_compensation").select("*").eq("employee_id", BOB),
  sb.from("leave_requests").select("*").eq("employee_id", BOB),
  sb.from("documents").select("*").eq("employee_id", BOB),
]);
console.table([
  { table: "employee_compensation", rows: comp.data?.length ?? 0, error: comp.error?.message ?? null },
  { table: "leave_requests",        rows: leave.data?.length ?? 0, error: leave.error?.message ?? null },
  { table: "documents",             rows: docs.data?.length ?? 0,  error: docs.error?.message ?? null },
]);
```

Expected output: all three rows show `rows: 0` and `error: null`. Anything else fails the step.

### Step 7 script

Optional belt-and-suspenders forge attempt. Signed in as Manager, paste in DevTools console:

```js
const ALICE = "c0000000-0000-0000-0000-000000000003";
const fd = new FormData();
fd.set("employee_id", ALICE);
fd.set("employeeId", ALICE);
fd.set("bankAccountHolder", "FORGED BY MANAGER");
fd.set("taxId", "TAX-FORGED-001");
fd.set("nationalId", "NID-FORGED-001");
const res = await fetch("/payroll", { method: "POST", body: fd });
console.log("HTTP status:", res.status, "url:", res.url);
```

This is expected to do nothing observable — Next.js Server Actions require a `Next-Action: <action-id>` header that this raw `fetch` does not provide, so the POST falls through and no action runs. The real guarantee is the code inspection in step 7(a): the action takes no client-supplied target id. If you want a live forge that actually exercises the action, use Network tab → find a legitimate `selfUpdateCompensation` call, "Edit and Resend" with `employee_id` added to the body.


## Findings & remediation log

| ID | Finding | Severity | Status | Closure |
|---|---|---|---|---|
| F1 | Account number input was `type="password"`, hidden while typing. User wanted visible-while-entering with mask-at-rest + reveal toggle. | Polish | ✅ Closed (Session 154) | `compensation-form.tsx` — input switched to `type="text"`; added `AccountNumberRevealHint` client subcomponent (mask by default, Show/Hide toggle). Full account number was already in the page payload for the row owner — toggle is presentational, no security boundary change. UAT pinned by new step 2a. |
| F2 | DevTools edit of the read-only salary `<dd>` text persisted visually after a successful self-save, even though DB salary was unchanged. React reconciliation gap: server re-rendered identical text, vdom diff did not touch the tampered DOM. Trust failure on a payroll surface. | Critical | ✅ Closed (Session 154) | `compensation-form.tsx` — added `key={c?.updatedAt}` on the read-only salary `<dl>` (forces unmount/remount when row UPDATE bumps `updated_at` via the existing migration 0011 trigger); added `useEffect` calling `router.refresh()` on `state.success` (forces fresh RSC fetch). Belt-and-suspenders. UAT pinned by new step 3a + admin-view DB-truth verification. |
| F3 | Payroll tab was missing from the manager sidebar. Route guard in `requireRole(["admin", "manager", "employee"])` was updated for the new manager view but the navigation `NAV_ITEMS` visibility array still gated `/payroll` to `["admin", "employee"]` only. Manager could reach `/payroll` by typing the URL but had no affordance. | Polish | ✅ Closed (Session 154) | [`src/components/app/app-shell.tsx:39`](src/components/app/app-shell.tsx#L39) — added `"manager"` to the Payroll item's `roles` array so the sidebar surfaces the link to all three roles. Surfaced during UAT step 6 walk. |
| F4 | Manager session could read `bank_account_number`, `tax_id`, `national_id`, `passport_number` for direct reports via raw supabase-js query. The application UI hid these via DAL projection but the DB layer was permissive. Migration 0049's column-grant only restricted UPDATE; the `manager_select_direct_report_compensation` SELECT policy allowed the full row to be read. Real PII gap. | Critical | ✅ Closed (Session 154) | Migration 0050: dropped `manager_select_direct_report_compensation` policy; added SECURITY DEFINER RPC `get_direct_report_compensation_summaries()` returning only summary columns; manager has no base-table SELECT path to direct-report rows. DAL `getManagerVisibleCompensation` switched to the RPC via session client. `rls.spec.ts` strengthened to pin (a) base-table SELECT returns only manager's own row and (b) RPC returns summaries without sensitive columns. Pattern mirrors `get_peer_employee_profile` (0037) and `get_people_directory` (0033). |
| F5 | After F4, the manager Direct reports table hid direct reports who didn't have an `employee_compensation` row, because the RPC's body used an inner join from `employee_compensation`. Manager lost visibility into "this direct report still needs HR to set up payroll". UX regression vs. pre-F4 behaviour. | Polish | ✅ Closed (Session 154) | Migration 0051: `create or replace` the RPC with the join driven from `employee_records` and a `left join` on `employee_compensation`. Direct reports without a comp row come through with null summary fields. DAL `getManagerVisibleCompensation` row mapper sets `summary: null` when `salary_currency` is null (a real comp row always has a currency, default 'USD'). UI's existing null-tolerant `formatSalary` / `formatFrequency` / `effectiveDate ?? "—"` render the row with `—` placeholders. No security boundary change — F4's column projection guarantee preserved. |


## Findings 2
1. 3 - when i edited the amount in "inspector" dev tools, and clicked save, it shows successful save, but the amount did not show the changed amount (35000), but showed the old amount which is good.  But it shouldn't show successful save, should it?
2. 3a - salary does not change even if i changed it in inspect.  I also changed other fields on the UI, then saved, the other changes were successfull.  Shows successful save, but only reflects the true db amount.