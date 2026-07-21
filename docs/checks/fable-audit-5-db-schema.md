# Fable Audit — Run 5: Schema, Migrations, and RLS Policy Integrity

> **Authorship (verified from session transcripts):** all findings below authored by **Fable 5** on 2026-07-09 — run as a `general-purpose` agent, cleanly on Fable 5 (94 / 94 Fable turns, including the report write). Later passes append findings tagged `[Model · date]`.
> Provenance: `[Fable5 · date]` = Fable 5 · `[Opus · date]` = Opus · untagged = original pass above.

Date: 2026-07-09 · Reviewer: independent AI audit (read-only) · Scope: `supabase/migrations/0000–0054`, `supabase/seed.sql`, data-layer triggers/RPCs, cross-checked against `docs/database-design.md`, `docs/rls-policy-map.md`, `docs/security-model.md`, `docs/systems-thinking.md`, and the relevant Server Actions in `src/server/`. No other reviewer's output was read.

---

## 1. Executive summary

The data layer is **structurally sound and better-disciplined than typical AI-built schemas**: RLS is enabled on every application table in the same migration that creates it, grants are explicit (0039 opts out of auto-grants; 0052 adds an event-trigger safety net that force-enables RLS on any future table), the leave-overlap EXCLUDE constraint (0035) is a genuine race-safety floor, and sensitive payroll columns were progressively walled off (0014 → 0049 → 0050) down to column-grant level.

But the layer does **not** match the app's own written assumptions in several places, and one of those mismatches is a live money-adjacent correctness bug:

1. **The leave-refund trigger does not refund the frozen `deducted_days` it promises to** — it recomputes `working_days()` at cancel time, so any holiday-table change between approval and cancellation silently corrupts the employee's balance. The migration's own header comment, both design docs, and the audit-log metadata all describe behaviour the code does not have (Finding B-1).
2. **The manager compensation RPC diverged from every sibling manager policy**: it checks only `employee_records.manager_id`, not the caller's role, so a demoted manager keeps reading direct-report salaries (Finding N-1).
3. **`docs/rls-policy-map.md` — the declared "planning source of truth" — is wrong about the DB layer in at least five tables** (`app_settings`, `documents`, `onboarding_tasks`, all three `performance_*` tables, `public_holidays`), and its `jwt_role` shorthand describes an enforcement mechanism that does not exist anywhere in the schema (Findings N-2, N-3, N-4).

Nothing found allows cross-tenant reads of bank/tax/national-ID data by employees or managers via the session client. The migration chain itself is linear, replayable, and unusually well-annotated; destructive steps (0032 `drop ... cascade`, 0048 table drop) are guarded by accurate in-file justifications.

---

## 2. Ranked findings

### B-1 · BLOCKER — Refund trigger recomputes working days instead of refunding the frozen `deducted_days`; deduction and refund can diverge

- **Where:** `supabase/migrations/0042_leave_working_days_and_refund.sql:220-251` (`handle_leave_refund()`, modern path).
- **What the code promises:** the same file's header (`0042:8-16`: *"deducted_days: frozen at approval time; cancellation refunds from this column so retroactive holiday additions never re-shuffle balances"*), the column comment (`0042:39-40`: *"Refunded verbatim on cancel"*), `docs/database-design.md:148` (*"cancel-of-approved refunds this exact value"*), and `docs/rls-policy-map.md:150` (*"refund trigger … refunds the frozen deducted_days per-year"*).
- **What the code does:** for non-legacy rows (`old.deducted_days is not null`) it ignores `old.deducted_days` entirely and re-runs `public.working_days(v_segment_from, v_segment_to)` per year segment at cancellation time (`0042:230`), crediting the *recomputed* value.
- **Failure scenario (concrete):** Employee approved for Mon 2026-06-01 → Fri 2026-06-05; trigger debits 5.0 and freezes `deducted_days = 5.00`. Admin later inserts an active `public_holidays` row for Wed 2026-06-03 (routine gazette update — exactly the "retroactive holiday addition" the header names). Employee cancels the approved leave. Refund recomputes `working_days()` = 4 → balance is credited 4, not 5. **The employee permanently loses one day of Local Leave with zero feedback anywhere.** The reverse (deactivating a holiday, or hard-deleting one — admin UI supports toggle; RLS permits delete) over-credits. Compounding it, the `leave.cancelled` audit row written by `src/server/actions/leave.ts:911-912` records `refunded_days: Number(req.deducted_days ?? 0)` — i.e. the audit trail asserts the *frozen* value was refunded while the trigger refunded something else, so the drift is unfindable even in the audit log.
- **Fix:** in the modern path, refund from `old.deducted_days` directly. For single-year requests (the overwhelming case) credit `old.deducted_days` to that year's row verbatim. For multi-year rows, note that a single frozen total cannot be split per-year faithfully — either persist a per-year breakdown at approval (e.g. jsonb column), or apportion the recomputed per-year splits scaled so they sum to `old.deducted_days`. Add a regression test: approve → insert holiday inside range → cancel → assert balance returns to the exact pre-approval value.
- **Verdict: CONFIRMED** (by code read; deterministic behaviour, no runtime needed).

### N-1 · NEEDS-FIX — `get_direct_report_compensation_summaries()` omits the manager-role check every equivalent RLS policy carries; stale `manager_id` leaks salaries after demotion

- **Where:** `supabase/migrations/0050_manager_compensation_summary_rpc.sql:34-48`, re-affirmed in `0051:26-40` (`where auth.uid() is not null and er.manager_id = auth.uid() and er.employment_status != 'terminated'`).
- **The inconsistency:** every base-table manager policy in the schema pairs the direct-report check with a live role check — e.g. `manager_select_leave_requests` (`0006:143-148`), `manager_select_direct_report_documents` (`0014:41-48`), `manager_select_employee_records` (`0003:67-72`) all require `public.get_user_role() = 'manager'`. The SECURITY DEFINER RPC that *replaced* the manager compensation policy (the most sensitive read in the system) checks only `er.manager_id = auth.uid()`. The `employment_status != 'terminated'` predicate filters the *report's* record, not the caller's.
- **Failure scenario:** Manager M has three direct reports. Admin demotes M via `updateEmployee` (`src/server/actions/employees.ts:424` writes `role` with no guard that reassigns or requires reassigning M's reports — no such logic exists in that action). Reports' `employee_records.manager_id` still = M. M, now role `employee`, calls `supabase.rpc('get_direct_report_compensation_summaries')` from any authenticated session (grant: `to authenticated`, `0050:52`) and receives all three reports' `salary_amount / currency / pay_frequency / effective_date`. Base-table RLS would have denied this exact read (`get_user_role() = 'manager'` fails); the RPC twin diverged. Same applies to a *terminated* manager whose session hasn't been revoked.
- **Fix:** add `and public.get_user_role() = 'manager'` to the RPC's WHERE (and consider the same for the caller's own `employment_status`). One-line change, mirrors the documented Direct-Report Scope Definition (`docs/rls-policy-map.md:312-325`), which the RPC also fails to fully implement.
- **Verdict: CONFIRMED** (predicate divergence verified in SQL; demotion-without-reassignment path verified absent in `employees.ts`).

### N-2 · NEEDS-FIX — `rls-policy-map.md` `jwt_role` mechanism is fictional; `sync_role_to_jwt` maintains derived state nothing consumes, and `systems-thinking.md` mis-states the blast radius

- **Where:** `docs/rls-policy-map.md:13-16` defines `jwt_role — (auth.jwt() ->> 'role')::user_role` as policy shorthand; `docs/database-design.md:235-236` says the trigger exists *"so RLS policies can use `(auth.jwt() ->> 'role')` without a cross-table join"*; `docs/systems-thinking.md:101` claims a stale JWT means *"the user has the wrong permissions in every RLS-protected query"*.
- **Reality:** `grep auth.jwt supabase/migrations/ src/` → zero hits. Every role-gated policy calls `public.get_user_role()` (`0002:26-32`), a SECURITY DEFINER live read of `profiles.role`. The app layer likewise reads role from `profiles` (`src/lib/supabase/helpers.ts:43`), and no source file reads `app_metadata`. So: (a) RLS permissions are *never* wrong due to JWT staleness — the systems-thinking blast-radius entry is inverted; (b) `sync_role_to_jwt` (`0013`) is orphan derived state with no consumer — a classic multi-session-AI artifact where the mechanism was designed, documented, and then silently substituted by a different one; (c) incidentally, the doc's shorthand is *also* wrong on its own terms — `auth.jwt() ->> 'role'` returns the Postgres role (`authenticated`), not `app_metadata.role`, so a future developer "aligning code to the doc" would write a policy that casts `'authenticated'` to `user_role` and errors (or worse, one that never matches).
- **Failure scenario:** a performance-minded contributor, trusting `rls-policy-map.md`, rewrites `get_user_role()` calls to the documented `(auth.jwt() ->> 'role')::user_role` — every policy then throws `invalid input value for enum user_role: "authenticated"` (best case) or is rewritten to `-> 'app_metadata' ->> 'role'`, silently converting role checks from live-DB to 1-hour-stale JWT, undoing the current (stronger) behaviour.
- **Fix:** correct the three docs to state that `get_user_role()` (live profiles read) is the enforcement mechanism; either delete `sync_role_to_jwt` + trigger as dead code or document its actual (currently nonexistent) consumer.
- **Verdict: CONFIRMED** (exhaustive grep of migrations + src).

### N-3 · NEEDS-FIX — `app_settings`: rls-policy-map and database-design describe the table dropped in 0032

- **Where:** `docs/rls-policy-map.md:287-298` (employee/manager SELECT = "non-sensitive keys"; admin INSERT/DELETE = "allowed"; note about sensitive-key prefixing) and `docs/database-design.md:204-205` ("Fields: setting key, value, description") both describe migration `0010`'s key-value table. `0032_app_settings.sql:18` executed `drop table if exists public.app_settings cascade` and recreated it as an **admin-only singleton** (policies `admin_select_app_settings` / `admin_update_app_settings` only, `0032:50-57`; no INSERT/DELETE policy or grant; no non-admin SELECT at all). `docs/access-matrix.md:249` also still references "non-sensitive `app_settings` keys".
- **Failure scenario:** rls-policy-map's own preamble (`:5`) declares *"a DB-allows / app-denies (or vice-versa) is a bug"* and the §7 cross-check gate audits *the doc*, not the schema — so the gate is green while the doc says employees can read settings the DB denies. Any feature built to the doc (e.g. showing `company_name` or `timezone` to employees from the session client) returns zero rows with no error, the exact silent-failure mode migration 0043's comment warns about.
- **Fix:** rewrite both doc sections to the 0032 singleton shape (admin-only SELECT/UPDATE, no INSERT/DELETE, columns list). Decide explicitly whether non-admin roles should read display-ish fields (company_name, working_days, timezone) and add a scoped policy if so.
- **Verdict: CONFIRMED.**

### N-4 · NEEDS-FIX — rls-policy-map claims DB-layer write policies that the DB does not have (performance tables, onboarding_tasks post-0017, documents UPDATE/DELETE, profiles INSERT)

- **Where / reality:**
  - `performance_review_cycles` / `performance_goals` / `performance_reviews`: map rows (`rls-policy-map.md:218-266`) show admin INSERT/UPDATE, manager INSERT/UPDATE on direct reports, employee self-review/acknowledge UPDATE as **allowed**. Migration `0018` grants **SELECT only** (`0018:58,87,136`) and creates **zero** INSERT/UPDATE/DELETE policies. All writes ride the service-role client inside Server Actions.
  - `onboarding_tasks`: map (`:207-214`) shows employee UPDATE own status and manager UPDATE direct reports allowed. Migration `0017` revoked the table UPDATE grant from `authenticated` and dropped both update policies — **no session client of any role, including admin, can UPDATE this table**; only service-role writes work.
  - `documents`: map (`:179-180`) shows employee UPDATE "own non-sensitive fields" and admin DELETE "allowed". There is **no employee UPDATE policy** on documents in any migration (0007/0014/0053 create only admin-all, employee select/insert, manager select), and **no DELETE grant** to `authenticated` at all (`0007:26`), so even the admin session client cannot delete. (The map's own §7 note admits the employee-update grant is "latent", but the DB layer lacks even the policy — the row should read *blocked*.)
  - `profiles`: map (`:25`) shows admin INSERT "allowed". `0002:21` grants only SELECT, UPDATE — an admin session cannot INSERT profiles; creation is trigger/service-role only.
- **Why it matters:** every one of these is drift in the *safe* direction (DB stricter than doc), but the map is the declared DB-layer source of truth and the CI gate compares docs to docs, so the errors are self-perpetuating. Concretely: the real enforcement of "managers can only write goals/reviews for direct reports" is **application code running as service-role (RLS bypassed)** — the DB contributes nothing to those write paths. Anyone auditing manager write containment from the map alone reaches the wrong conclusion about *where* the control lives (Server Actions `src/server/actions/performance.ts`, `onboarding.ts`), which is precisely the blind spot rls-policy-map exists to prevent.
- **Fix:** annotate these cells as `blocked at DB (service-role Server Action only)` so the map tells the truth about which layer enforces each write.
- **Verdict: CONFIRMED** (grants/policies enumerated across all 55 migrations).

### N-5 · NEEDS-FIX — leave_requests UPDATE policies constrain the *status transition* but not the *columns*: a manager can rewrite dates/half-day at approval time via direct PostgREST

- **Where:** `0006:99` (`grant select, insert, update on public.leave_requests to authenticated` — full-table, no column list) + `manager_update_direct_report_leave` (`0006:152-163`) whose WITH CHECK requires only `is_direct_report(employee_id) and status in ('approved','rejected')`.
- **Failure scenario:** a manager with a raw session token issues `PATCH /rest/v1/leave_requests?id=eq.<pending-row>` with `{"status":"approved","start_date":"2026-06-01","end_date":"2026-06-19","is_half_day":false}` against a direct report's 2-day request. RLS passes (pending→approved, direct report), the BEFORE-UPDATE approval trigger computes the deduction **from `new.start_date/new.end_date`** (`0042:95-106`) and debits ~15 working days from the employee's balance. The employee's own record now shows a 3-week approved absence they never requested. The Server Action's column discipline (`leave.ts:600-610`) is the only thing preventing this, and 0006's own comment admits it ("enforced by Server Action") — but the project's stated pattern for exactly this problem is column grants (0014 for profiles, 0049 for compensation), which were never applied here. The employee-cancel path is safe by construction (refund trigger reads `OLD.*`), so exposure is the approval path only.
- **Fix:** `revoke update on public.leave_requests from authenticated; grant update (status, approver_id, approved_at, approver_note, updated_by) on public.leave_requests to authenticated;` (covers approve/reject/cancel paths; employee/manager cancel writes only status + updated_by).
- **Verdict: CONFIRMED at DB layer** (policy + grant text); requires a hostile/compromised manager session to exploit.

### N-6 · NEEDS-FIX (low) — Approved→rejected transition deducts without any refund path

- **Where:** `handle_leave_refund` fires only on `old.status = 'approved' and new.status = 'cancelled'` (`0042:186`), while `admin_all_leave_requests` (`0006:107-110`) permits an admin session to move approved→rejected directly (and nothing in the schema forbids a future "revoke approval" action doing the same).
- **Failure scenario:** admin "corrects" a mistaken approval by setting status to `rejected` (dashboard SQL editor or direct API — the app's `rejectLeaveRequest` only touches pending rows, verified `src/server/actions/leave.ts:715,751`). The deduction stands forever; no trigger, warning, or audit entry flags that the balance was never returned.
- **Fix:** either extend the refund trigger's predicate to `new.status in ('cancelled','rejected')`, or add a guard trigger raising an exception on approved→rejected so the only legal exit from `approved` is `cancelled`.
- **Verdict: CONFIRMED** (DB permits the transition; app does not currently expose it).

### NIT-1 — Half-day deduction logic diverged between the SQL trigger and its "lockstep" TS mirror

`0042:102-104` deducts 0.5 unconditionally for `is_half_day`, even when the single day is a Saturday/holiday (a *full-day* request on the same date deducts 0 via the `v_days = 0 → continue` branch). The TS mirror (`src/server/actions/leave.ts:1056-1061`) returns 0 for a non-working-day half-day and blocks submit. The comment at `leave.ts:1009-1012` says the two "MUST be [changed] in lockstep" — they already disagree. Reachable when a holiday is gazetted *after* submission but before approval: approval then debits 0.5 for a non-working day. Fix: add a working-day check before the `v_days := 0.5` branch in the trigger.

### NIT-2 — `public_holidays` SELECT policy exposes inactive rows to all roles, contra the map

`0040:51-53` uses `auth.uid() is not null` with no `is_active` filter; `rls-policy-map.md:159` says employee/manager see "all active" only. Deactivated (historically wrong) holiday rows are visible to every session. Harmless data, but it's a doc/DB disagreement on the map's own terms; either filter the policy (`is_active or get_user_role()='admin'`, the 0006 leave_types pattern the author clearly knew) or fix the map.

### NIT-3 — Missing integrity constraints that let invalid HR data land

- `employee_records` has no `check (end_date is null or end_date >= start_date)` — `leave_requests` (0006:94) and `performance_review_cycles` (0018:50-53) both have the equivalent; this table was skipped. An admin typo produces an employment record that ends before it starts, silently corrupting tenure-derived views.
- `departments.parent_id` has no cycle guard — `A.parent=B, B.parent=A` is insertable; any future recursive department rollup will loop.
- `leave_balances.balance` has no `check (balance >= 0)`; the approval trigger's `balance >= v_days` predicate protects only the trigger path — admin `upsertLeaveBalance` and the refund path can produce/aggravate negative or inflated balances with no DB floor. (Refund-side over-credit is B-1's scenario.)

### NIT-4 — `handle_new_user` idempotency guard covers the wrong conflict

`0011:75` uses `on conflict (id) do nothing`, but `profiles.work_email` is also UNIQUE (`0002:11`). If a profile row already holds the email of a newly signing-up auth user (e.g. an admin re-created a departed employee's account after the old profile's email was reassigned via `updateEmployee`), the trigger raises 23505 on `profiles_work_email_key`, which aborts the `auth.users` insert — GoTrue signup fails with an opaque 500 that nothing maps to a user-facing message. Narrow, but the guard's presence advertises an idempotency the function doesn't fully have.

### NIT-5 — database-design.md structural staleness

- The migration table (`docs/database-design.md:9-39`) stops at 0042 and silently omits 0031, 0032, 0036, 0038, 0043–0054 — fourteen shipped migrations including two policy-shape changes (0043, 0053/0054) that *are* described in rls-policy-map, so the two docs no longer cover the same history.
- The Enums table attributes all ten enums to `0001_enums.sql`; the three `performance_*` enums are actually created in `0018:7-34`.
- `database-design.md:99`: *"`profile_id` FK delete behavior must be decided before Phase 3 ships — document in this file"* — never resolved; the actual behaviour (`on delete restrict`, `0003:10`) is fine but the open TODO has outlived ~10 phases.
- `audit_logs` "append-only. No UPDATE or DELETE for any role including admin" (`:198`) is true only of the RLS layer; the service-role client bypasses RLS and (on the cloud-era grant set) can rewrite audit rows. Worth one honest sentence, since "append-only" is a compliance claim.

### NIT-6 — 0052's superuser requirement quietly forks the migration-apply story

`0052` must run as `supabase_admin` (event trigger), and its header says at cutover *"the whole migration set"* is applied as `supabase_admin`. But `0039`'s default-privilege revoke is scoped `for role postgres` — default privileges are per-creating-role, so tables created in a future migration applied as `supabase_admin` are governed by *supabase_admin's* default ACLs, not the revoked postgres ones. Depending on the image's defaults, a future table could silently regain (or lack) auto-grants that 0039 was written to make impossible, and the 0044 failure class (`42501` on public_holidays) shows this grant surface already bit once. Mitigated in practice by the `rls_auto_enable` event trigger (RLS still lands) — but grants ≠ RLS. Suggest mirroring 0039's revoke `for role supabase_admin`.

---

## 3. RLS coverage table

Effective state after 0054. "svc-only" = no session-client path exists (no grant and/or no policy); writes ride the service-role client in Server Actions, bypassing RLS. ✅ = policy present and matches docs; ⚠ = works but diverges from `rls-policy-map.md` (see finding).

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Verdict |
|---|---|---|---|---|---|---|
| `profiles` | ✅ | admin all · own · mgr-of (DR) · own-manager (0031) | no grant → svc-only (trigger creates) | col-grant (display_name, phone, avatar_url) + own-row policies; admin-all policy | no grant → blocked | ⚠ map says admin INSERT allowed (N-4) |
| `departments` | ✅ | all authenticated | admin | admin | admin | ✅ |
| `employee_records` | ✅ | admin all · own · mgr own+DR | admin | admin | admin | ✅ (missing end_date CHECK — NIT-3) |
| `employee_compensation` | ✅ | admin all · own (role-agnostic); mgr via RPC only | admin policy (grant present) | col-grant 7 non-salary cols, own-row; admin via svc | admin policy | ⚠ RPC missing role check (N-1) |
| `leave_types` | ✅ | active for all; admin all | admin | admin | admin | ✅ |
| `leave_balances` | ✅ | admin all · own · mgr own+DR | admin | admin (+ definer triggers) | admin | ✅ (no ≥0 CHECK — NIT-3) |
| `leave_requests` | ✅ | admin all · own · mgr own+DR | own-pending (emp+mgr) · admin | cancel own pending/approved · mgr approve/reject DR · admin all — **no column restriction** | no grant → blocked | ⚠ N-5, N-6, B-1 (triggers) |
| `public_holidays` | ✅ | all authenticated (**incl. inactive**) | admin (+svc 0044) | admin | admin | ⚠ NIT-2 |
| `documents` | ✅ | admin all · own role-agnostic (0053) · mgr DR minus payslip/id/contract | own non-payslip (emp) · admin | admin policy only — no employee policy | no grant → blocked (soft-delete via svc) | ⚠ map UPDATE/DELETE rows (N-4) |
| `onboarding_templates` | ✅ | active for all; admin all | admin | admin | admin | ✅ |
| `onboarding_template_items` | ✅ | items of active templates; admin all | admin | no grant → svc-only | admin | ✅ (update svc-only, benign) |
| `onboarding_tasks` | ✅ | admin all · own/assignee · mgr own+DR | admin · mgr DR | **grant revoked 0017 → svc-only for every role** | no grant → blocked | ⚠ map shows emp/mgr UPDATE (N-4) |
| `performance_review_cycles` | ✅ | admin · scoped (goals/reviews) · mgr active | svc-only | svc-only | svc-only | ⚠ map shows admin writes (N-4) |
| `performance_goals` | ✅ | admin · own · mgr DR | svc-only | svc-only | svc-only | ⚠ (N-4) |
| `performance_reviews` | ✅ | admin · own · mgr DR | svc-only | svc-only | svc-only | ⚠ (N-4) |
| `audit_logs` | ✅ | admin only | svc-only (`insert_audit_log` execute revoked 0014; app inserts via svc client) | none (append-only at RLS layer) | none | ✅ (svc caveat — NIT-5) |
| `app_settings` (0032 singleton) | ✅ | **admin only** | none (migration-seeded) | admin | none | ⚠ map describes dropped 0010 table (N-3) |
| `storage.objects` (hr-documents) | ✅ (platform) | admin · own-folder role-agnostic (0054) · mgr DR minus payslip/id/contract | admin · employee own-folder | none | admin (FOR ALL) | ✅ mirrors documents (0053/0054 in sync) |

**SECURITY DEFINER surface (all `stable`, `set search_path = public`, execute → authenticated only):** `get_user_role` ✅ · `is_direct_report` ✅ · `is_own_manager` ✅ · `insert_audit_log` (execute revoked — svc path only) ✅ · `get_people_directory` ✅ (documented company-wide projection) · `get_peer_employee_profile` ✅ (documented) · `get_profile_display_names` ✅ (documented disclosure note in 0046) · `get_company_approved_leave` ✅ (documented; includes terminated employees' approved leave — cosmetic) · `get_direct_report_compensation_summaries` ⚠ **N-1**. Triggers: `handle_new_user` ⚠ NIT-4 · `sync_role_to_jwt` ⚠ orphan (N-2) · `handle_leave_approval` ✅ logic / ⚠ NIT-1 · `handle_leave_refund` ✖ **B-1** · `set_updated_at` ✅ (applied to every updated_at table incl. 0018/0032) · `rls_auto_enable` event trigger ✅.

**Migration-chain integrity:** 0000–0054 contiguous, replayable in order; no migration references an object a prior one didn't create (0028's leave-type rename is a no-op on fresh DBs, but `seed.sql:135-157` inserts the post-rename taxonomy directly, so fresh and migrated environments converge ✅). Destructive steps (0032 drop-cascade of an empty-by-design table; 0048 table drop with audit-trail rationale) are guarded by accurate comments. 0052 is the lone superuser-required outlier (NIT-6).

---

## 4. Could not verify (and what confirmation needs)

1. **Live schema ↔ migration parity.** This pass audited the migration files only; no query was run against the running self-host DB (read-only constraint, and MEMORY warns the data volume is precious). The 0052 header documents that cloud-era objects previously drifted from the files, so a `pg_dump --schema-only --no-owner` diff against a scratch DB built from 0000–0054 is the confirming step for everything above.
2. **Default-privilege state on the self-host stack (NIT-6).** Whether tables created by `supabase_admin` receive auto-grants requires `\ddp` on the live instance.
3. **Whether any environment ever executed approval-era triggers between 0019 and 0021** (rows approved into negative balances pre-0021, or 0019-era warn-only silent non-deductions). Pure data question: `select * from leave_balances where balance < 0` and reconciliation of approved requests vs. balance deltas.
4. **Half-day drift reachability (NIT-1)** depends on the admin actually gazetting holidays after requests are submitted — behaviourally certain from code, operationally unobserved.
5. **PostgREST-level exploitability of N-5** assumes the self-host Kong/PostgREST exposes `public` tables to authenticated JWTs as standard Supabase does; config files suggest a stock stack, but I did not probe the running gateway.

---

*Report authored under the run-5 constraint: this file is the only artifact created; no source, migration, config, or doc was modified.*
