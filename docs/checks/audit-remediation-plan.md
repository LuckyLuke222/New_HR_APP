# KushHR Audit — Combined Remediation Plan (Codex + Fable + Sol)

Authoritative, engineer-facing action list derived from **three independent AI audits** run as
Phase-13 exit-check-3 evidence:

- **Codex (GPT-5, xhigh)** — 5-part audit, 2026-07-08. Files `codex-audit-1..5-*.md`. Claude triage: `codex-audit-review.md`.
- **Fable 5 / Opus** — 5-part audit, 2026-07-08 → 07-11. Files `fable-audit-1..5-*.md`. (Runs 1/2/4 were majority-Opus with a Fable-5 second pass; runs 3/5 were clean Fable 5 — provenance headers in each file.)
- **Sol (GPT-5.6, Codex)** — one-shot 6-part audit, 2026-07-13. Files `codex-sol-audit-1..6-*.md`. Parts 1–5 mirror the surfaces above; **part 6 is a program-level production-readiness assessment** (folded into Tier P below).

All three audits were run **blind to each other**. Attribution tags on each item: **[CONVERGED]** =
found independently by ≥2 systems (strongest confidence); **[Codex+Fable]**, **[Fable+Sol]**, **[all three]**
name the specific corroboration; **[Sol-only]** / **[Fable-only]** / **[Codex-only]** = single-system.

**The three-system result is decisive on the items Codex GPT-5 missed.** The three highest-severity
integrity items — open self-registration, the leave refund-recompute BLOCKER, and the column-ungated
leave `UPDATE` — were each found by **both** Fable **and** Sol, independently, while the first (Codex)
pass missed all three. Sol also escalates **audit fail-open** to a release BLOCKER. That is the multi-AI
gate working as designed: convergence = confidence, divergence = coverage.

This plan supersedes `codex-audit-review.md §6` as the working remediation queue. That file remains the
historical Codex-only triage.

---

## 0. Headline

**Good result for an AI-built app, now confirmed three times.** No system found a cross-tenant data breach, an
authentication bypass, a client-bundled secret, or a confirmed injection-to-RCE. The core security spine holds
in all three audits: RLS on every table, role read from `profiles` (never the JWT — all three grep-confirmed
no policy reads `auth.jwt()`), service-role key `server-only`-fenced, private storage with trusted-ID key
derivation, compensation projected through a fixed RPC.

What surfaced is **a thin band of real integrity/correctness gaps** — mostly below the UI (forged POSTs, direct
PostgREST/Storage writes, service-role bypass, missing DB constraints, one config default) — plus defense-in-
depth hardening, doc drift, and (from Sol) **program-level production-readiness gaps** (CI doesn't build/run
E2E, backups are same-host with fail-open restore verification, no centralized telemetry). The convergent
architectural root cause all three name: **browser-facing `authenticated` grants + service-role writes together
make the Server Action the sole integrity boundary — the DB provides no backstop** on those paths.

Phase-13 code status is unchanged: **GO WITH RESIDUAL EXTERNAL WATCH** — the confirmed issues need a
privileged/forged path or a specific admin action and cause bounded damage, not breach. **But Sol's
production-readiness verdict is `2.5/5` — pilot-grade, not production-grade** for real HR/payroll PII until the
Tier P table-stakes land. Recommendation: land **Tier A** (+ the Tier P P0 items) before declaring
exit-check-3 closed and before pointing real staff data at it.

---

## Tier A — Fix first (correctness / security, plan-mode changes)

Each is a plan-mode change; several touch high-risk surfaces (auth trigger, leave balance trigger, RLS
policies) → Systems Thinking required per `CLAUDE.md`.

### A1 · Public self-registration is enabled — anyone network-reachable can self-provision an `employee` account · **[Fable+Sol]** · HIGH
- **Sources:** `fable-audit-2-auth-audit.md` F1 + `codex-sol-audit-2-auth-audit.md` BLOCKER (independent corroboration — Codex GPT-5 missed it; two systems now confirm). Sol adds the concrete post-signup reach: a self-provisioned session calls `get_people_directory()` (`0033`) and reads active employees' names/titles/departments/work-emails, plus company leave visibility. Sol recommends a **deployment preflight** that attempts a disposable signup and fails the release if it succeeds.
- **Where:** `infra/supabase/.env:159` (`DISABLE_SIGNUP=false`), `:168` (`ENABLE_EMAIL_SIGNUP=true`); wired at `docker-compose.yml:145,161`. Same insecure default also ships in `infra/supabase/.env.example:168,184,185` (every fresh deploy inherits it). Trigger `handle_new_user()` (`0011_triggers.sql:61-82`) fires on the `auth.users` INSERT and writes a `role='employee'` profile **before** email confirmation.
- **Impact:** Defeats admin-only provisioning + deny-by-default. An unprovisioned actor on the LAN/VPN POSTs `/auth/v1/signup` (same public origin that serves `signInWithPassword`) and lands an authenticated account into `/dashboard`, the people directory, leave, etc. Even unconfirmed signups pollute `profiles` (orphan rows with no `employee_records`, visible in admin listings/counts). No email-domain allowlist.
- **Fix:** Set `DISABLE_SIGNUP=true` in the deployed `.env` **and** `.env.example`. Defense-in-depth: a proxy/app check so a brand-new `profiles` row with no `employee_records` cannot reach app data. If self-signup is ever wanted, gate on `GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES` (domain allowlist), autoconfirm off.
- **Effort:** Trivial (config) + small (defense-in-depth check). **Verify:** confirm `/auth/v1/signup` is rejected after the change (live curl through Caddy).
- **Note:** Cheapest, highest-leverage item in the entire audit. Do this first.

### A2 · Refund trigger recomputes working days instead of refunding the frozen `deducted_days` · **[Fable+Sol]** · BLOCKER
- **Sources:** `fable-audit-5-db-schema.md` B-1 + `codex-sol-audit-5-db-schema.md` BLOCKER (+ `codex-sol-audit-3` Pattern D). **CONFIRMED by code read (deterministic), two systems independently.**
- **Where:** `0042_leave_working_days_and_refund.sql:220-251` (`handle_leave_refund()`). For non-legacy rows it ignores `old.deducted_days` and re-runs `working_days()` at cancel time (`:230`).
- **Impact:** Money-adjacent silent corruption. Approve Mon–Fri (debit 5.0, freeze `deducted_days=5`). Admin later gazettes a holiday inside the range. Employee cancels → refund credits the **recomputed** 4, not the frozen 5 → employee permanently loses a day, no feedback. Reverse (deactivating/deleting a holiday) over-credits. The `leave.cancelled` audit row records `refunded_days = deducted_days` (`leave.ts:911-912`), so it asserts the frozen value was refunded while the trigger refunded a different one — drift is invisible even in the audit log. Directly violates the file's own header comment and `database-design.md:148`.
- **Sol adds two edges:** (1) **multi-year** leave — a single frozen total can't tell which year's balance to restore; (2) the trigger only `RAISE WARNING`s and still commits the cancellation when a required balance row is missing (`0042:245-250`) → silently drops that year's refund ("never warn-and-commit financial loss").
- **Fix:** Store an immutable **per-year debit ledger** at approval (child rows or validated jsonb) and refund exactly those rows; single-year fast path can refund `old.deducted_days` verbatim. Make a missing refund target **abort the cancellation** or open a durable reconciliation item — do not warn-and-commit. Regression tests: retroactive holiday activate/deactivate, multi-year segments, half-day, missing balance.
- **Effort:** Medium (migration + trigger logic + tests).

### A3 · `working_days` admin setting is a decoy — leave deductions ignore the configured working week · **[Fable-only]** · BLOCKER
- **Source:** `fable-audit-3-ai-quality.md` B1.
- **Where:** setting written `app-settings.ts:124`, edited `settings-form.tsx:144-155`; every consumer hardcodes Sat+Sun — `leave.ts:1038`, `leave/page.tsx:519-521`, `leave-request-form.tsx:110-112`, and the authoritative SQL `0042:55` (`extract(dow from d) in (0,6)`).
- **Impact:** Silent leave-ledger corruption driven by an admin control that appears fully functional (validated, saved, audit-logged). Admin sets Mon–Sat working week; every request touching a Saturday deducts one day too few across submit gate, client preview, balance panel, and approval trigger. `systems-thinking.md §1` violation: state with a writer but no reader.
- **Fix (choose one, not the current lie):** (a) thread `app_settings.working_days` into `working_days()` (SQL) and its TS mirrors — one change in five places, which is why **C-DEDUP** (unify working-days math) should land first; or (b) remove the checkboxes and document Mon–Fri as fixed.
- **Effort:** Medium (a) / Trivial (b). Product decision on whether configurable working week is a real requirement.

### A4 · Performance module — forge writes into closed/draft cycles (write) + draft appraisal readable by employee (read) + audit/deadline integrity (Sol) · **[all three]** · BLOCKER
- **Sources:** `codex-audit-1-authz.md` BLOCKER (write side) + `fable-audit-1-authz.md` F1 (read side) + `codex-sol-audit-1-authz.md` (three additional NEEDS-FIX in the same module). All CONFIRMED in source. The convergent root cause all systems independently named: **`performance_*` tables grant only SELECT to sessions; all writes go through the service-role client, so the Server Action is the *sole* authz layer — no DB backstop.**
- **Write side (Codex):** `savePerformanceGoal()` / `submitManagerReview()` scope the employee via `canManageEmployee()` and check the deadline, but `resolveCycleId()` (`performance.ts:1496`) returns the hidden `cycleId` verbatim with no cycle status/visibility check. `assertCycleNotDeadlineLocked()` reads only deadline columns, never `status`. → a manager can forge a review/goal into a **closed or draft** cycle for a direct report. Covers goal + review, insert + update, and reopen paths.
- **Read side (Fable):** `employee_select_own_performance_reviews` (`0018:147`) is `using (employee_id = auth.uid())` with **no status predicate**; draft manager fields (`score`, `manager_*`) are populated at draft time (`performance.ts:974-983`). → the subject employee can read their not-yet-submitted score/feedback via a direct PostgREST call. **Sibling:** `employee_select_own_performance_goals` (`0018:98-100`) likewise exposes unsubmitted draft goal definitions.
- **Sol's three additional NEEDS-FIX in the same module** (fix alongside):
  - **Goal audit names the wrong employee** (`performance.ts:513-529`): the existing-goal update scopes the *actual* row owner but writes the audit `employee_id` from the redundant caller form field. Manager submits Alice's `goalId` with Bob's `employeeId` → both scope checks pass, Alice's goal updates, but the audit says Bob → corrupt accountability trail. Fix: reject when `parsed.employeeId !== current.employee_id`, or derive all audit/ownership fields from the loaded row, never from caller input.
  - **Deadline lock doesn't cover employee goal progress** (`performance.ts:788-825`): `updateOwnGoalProgress` has no cycle/deadline check while every other write calls `assertCycleNotDeadlineLocked` — so a "frozen" (hard-deadline) cycle is not frozen for progress edits, contradicting `0038`'s "rejects all writes." Fix: load `cycle_id`, call the guard, put the lock state in the update predicate (or document the exemption in migration/UI/access docs).
  - **`assertCycleNotDeadlineLocked` fails open** (`performance.ts:1422-1445`): returns "allowed" on a lookup error / not-found because the query error is ignored → the guard silently passes when it can't read cycle state.
  - **Goal creation returns success after the dependent review bootstrap fails** (`performance.ts:569-607`): the goal insert commits, a failed review-row bootstrap is only `console.error`'d, then success + audit are written → manager sees "goal created" but the appraisal workspace has no review row. Fix: make goal+review+audit one transaction, or an explicit idempotent outbox with surfaced retry state.
- **Fix:** (1) Write side — add a cycle-authorization helper: manager writes require `status='active'` + manager-visible cycle; block draft/closed; verify both the existing row's cycle and the target cycle on updates. (2) Read side — route employee review/goal reads through a SECURITY DEFINER projection RPC that nulls manager-authored columns unless `status in ('manager_submitted','acknowledged')` (mirror the compensation 0050 pattern). (3) Fix the four Sol items above. (4) Consider DB write policies / a status-guard trigger on the performance tables so the DB re-checks — fix the *pattern*, not just the instance. Add forge-test cases.
- **Effort:** Medium–High.

### A5 · Approved leave can be inserted without balance deduction · **[Codex-only]** · BLOCKER (admin/service-role reachable)
- **Source:** `codex-audit-5-db-schema.md` BLOCKER. CONFIRMED; reachability bounded to admin/service-role (employee/manager inserts are correctly pinned to `status='pending'`, `0006:126,135`).
- **Where:** `trg_leave_balance_on_approval` is `BEFORE UPDATE` only (`0042:161-164`) — no insert trigger. The admin `for all` policy (`0006:107-110`) has no `status` pin on its `with check`.
- **Impact:** An admin (or future service-role path) inserts `status='approved'` directly → row shows as approved leave while `leave_balances.balance` is untouched and `deducted_days` is null. Violates the approval↔deduction atomicity rule.
- **Fix:** Constrain the admin insert path to `status='pending'` (split admin insert from admin update), **or** a `BEFORE INSERT OR UPDATE` trigger that routes initial-approved rows through the same deduction path. Add CHECK `status='approved' ⇒ approver_id IS NOT NULL AND approved_at IS NOT NULL`.
- **Effort:** Medium.

### A6 · `leave_requests` UPDATE has no column grant — manager can rewrite dates/half-day at approval · **[Fable+Sol]** · BLOCKER (Sol) / NEEDS-FIX (hostile/compromised manager session)
- **Sources:** `fable-audit-5-db-schema.md` N-5 + `codex-sol-audit-1-authz.md` BLOCKER + `codex-sol-audit-5-db-schema.md` NEEDS-FIX. CONFIRMED at DB layer, two systems. Sol ranks it a BLOCKER (the second-highest authz item in its report).
- **Where:** `0006:99` grants full-table `update` to authenticated (no column list); `manager_update_direct_report_leave` (`0006:152-163`) WITH CHECK gates only `is_direct_report + status in ('approved','rejected')` — not which columns change, and does not freeze `employee_id`, `leave_type_id`, dates, half-day, or approver identity.
- **Impact:** A manager with a raw session token `PATCH`es a direct report's pending row to `{status:'approved', leave_type_id, start_date, end_date, is_half_day, approver_id}`. RLS passes; the BEFORE-UPDATE trigger computes deduction from the **attacker-supplied** dates (`0042:95-106`) and debits an arbitrary span. Sol notes the manager can even retarget `employee_id` to another report. The Server Action's column discipline (`leave.ts:600-610`) is the only guard — but the project's stated pattern for exactly this is column grants (used for profiles 0014, compensation 0049), never applied here.
- **Fix:** `revoke update on leave_requests from authenticated; grant update (status, approver_id, approved_at, approver_note, updated_by) on leave_requests to authenticated;` (covers approve/reject/cancel; employee/manager cancel writes only status + updated_by). Better still per both systems: a narrow `SECURITY DEFINER` transition RPC that re-checks actor, scope, immutable columns, and status atomically — see B10.
- **Effort:** Low (column-grant migration) / Medium (transition RPC).

### A7 · `updateEmployee` — non-atomic role write + failure with no audit; no distinct `role.changed` event · **[all three]** · HIGH
- **Sources:** `codex-audit-2-auth-audit.md` HIGH + `fable-audit-2-auth-audit.md` F5 + `codex-sol-audit-1-authz.md` / `-3-ai-quality.md` NEEDS-FIX.
- **Where:** `employees.ts:419-458`. Profile (incl. `role`) is written via service-role **before** the session-client `employee_records` update and **before** the audit row. `profiles.role` write fires `sync_role_to_jwt` (`0013:27`).
- **Impact:** A stale/forged `recordId` that doesn't match `employee_id` makes the record update match zero rows and error → function returns failure, but the **role change already committed** with **no `employee.updated` and no role-change audit row** ("action failed, but authority changed"). Separately, role changes are folded into `employee.updated` with only the new value — you cannot reconstruct "who was promoted to admin and when."
- **Fix:** Make profile + record changes atomic (DB RPC/transaction that writes both-or-neither and the audit row in the same transaction), or reorder so the job record updates before `profiles.role`. Emit a dedicated `role.changed {from,to}` event only when the role actually changes.
- **Effort:** Medium.

---

## Tier B — Hardening / defense-in-depth (batch)

### B1 · Audit logging fails open AND is outside the business transaction · **[all three]** · Sol ranks BLOCKER
- **Sources:** Codex Run 2 + Fable Run 2 F3 + `codex-sol-audit-2-auth-audit.md` **BLOCKER**. `audit.ts:5-30` swallows insert errors and returns normally; deny paths and privileged mutations proceed with no row, though `security-model.md:24` calls the audit row "the authoritative guard signal."
- **Sol's escalation + key insight:** the business write and the audit write are **separate service-role requests**, so this is not just fail-open — it's non-atomic. **Making the helper throw is not enough**: the mutation has already committed, so you'd still have a committed-but-unaudited privileged change (salary/role/leave/settings). For real payroll/PII accountability the transition + audit must commit together.
- **Fix:** move each privileged state transition + its audit append into **one Postgres transaction/RPC**. For operations spanning Auth/Storage (employee create, document upload/delete) use a durable **outbox** with idempotent reconciliation and surface unhealthy backlog as an alert. At minimum, fail-closed + high-priority metric on `audit log insert failed` — but treat that as interim, not the fix.
- **Effort:** Medium–High (this is the atomic-audit item on the Tier P P0 list).

### B2 · Compensation summary RPC omits the manager-role check · **[CONVERGED]** · NEEDS-FIX
- **Sources:** Codex Run 5 + Fable Run 5 N-1 (CONFIRMED). `get_direct_report_compensation_summaries()` (`0050:34-48`, `0051:26-40`) scopes only by `er.manager_id = auth.uid()` — no `get_user_role()='manager'`, unlike every sibling manager policy. A **demoted or terminated** manager whose reports' `manager_id` still points at them keeps reading salaries (the `updateEmployee` demotion path does not reassign reports).
- **Fix:** add `and public.get_user_role() = 'manager'` to the RPC predicate. Consider a trigger rejecting `manager_id` values whose profile role isn't manager/admin, or auto-clearing subordinate `manager_id` on demotion.

### B3 · Missing DB CHECK constraints — payroll/leave numeric invariants are app-only · **[all three]** · NEEDS-FIX
- **Sources:** Codex Run 5 + Fable Run 5 NIT-3 + `codex-sol-audit-5-db-schema.md` NEEDS-FIX. App enforces salary `0..9,999,999`, currency `MUR|AED|USD`, balance `0..365`, year `2020..2100` in Zod; the tables have no CHECK, so an admin session via the public API can write `salary_amount=-1000`, `currency='DOGE'`, `balance=-5`.
- **Fix:** add CHECKs at the owning tables — salary non-negative+bounded, currency constrained, `leave_balances.balance >= 0`, year bounded, `employee_records` `end_date >= start_date` (Fable NIT-3: skipped while leave_requests/cycles have it), **plus `documents.file_size >= 0`** and trimmed non-empty names/titles (Sol). Use `NOT VALID` → backfill → `VALIDATE` if existing rows may violate.

### B4 · Service-role existence oracles leak out-of-scope row IDs · **[Codex-only]** · NEEDS-FIX
- **Source:** Codex Run 1. `completeTask()`, goal/review reopen paths return distinguishable "not found" vs "not yours" for arbitrary UUIDs, confirming existence of other employees' onboarding/performance rows outside RLS.
- **Fix:** first lookup through the session client/RLS (or include ownership predicate in the admin query) and return one uniform "not found or access denied" for both cases.

### B5 · Password-reset audit route trusts caller-controlled headers; `:3100` is directly reachable · **[Codex-only]** · NEEDS-FIX
- **Source:** Codex Run 2. `isSameOrigin()` compares to `Host`, `clientIp()` trusts first `X-Forwarded-For`; the web container still publishes `3100:3100`. A direct caller spoofs `Host`/`Origin`/`X-Forwarded-For` to flood admin-visible audit rows.
- **Fix:** bind `:3100` to loopback / proxy-only; compare `Origin` to configured `APP_URL`, not `Host`; honor `X-Forwarded-For` only from the trusted proxy. Overlaps the existing deploy-hardening backlog.

### B6 · PostgREST `.or()`/`.ilike()` filter-string injection from user search text · **[CONVERGED]** · NEEDS-FIX (admin-gated today)
- **Sources:** Codex Run 3 + Fable Run 1 F3 / Run 3 N3. Raw `search` interpolated into `.or(\`display_name.ilike.%${search}%,...\`)` at `employees.ts:639`, `leave.ts:1332`, `documents.ts:333`. All admin-gated → no escalation today, but a comma/paren in a legal name (`Doe, Jane`) already breaks the filter, and the pattern is one copy-paste away from a non-admin path against the RLS-bypassing admin client.
- **Fix:** structured builders (chained `.ilike()`) or escape/strip PostgREST metacharacters; grep-gate the pattern in CI. Fold into the shared resolver (C1).

### B7 · Password-change completion writes no audit row · **[Fable-only]** · LOW–MEDIUM
- **Source:** Fable Run 2 F4. `supabase.auth.updateUser({password})` runs client-side; a completed credential change on any account (incl. admin) leaves no `audit_logs` row — only the request half is logged (actor null, domain only).
- **Fix:** a small same-origin-gated Route Handler the reset form calls post-update that writes `auth.password_changed` (actor = recovery-session user id).

### B8 · CSV formula injection in report export · **[Fable-only]** · LOW–MEDIUM
- **Source:** Fable Run 2 F6 / Run 4. `csvCell` (`reports/export/route.ts:104-108`) escapes RFC-4180 delimiters but not leading `= + - @`. User-controlled PII fields (`display_name`, `bank_account_holder`, `notes`, `job_title`) can carry `=HYPERLINK(...)`/`=cmd|...` that executes when an admin opens the export in Excel/Sheets.
- **Fix:** prefix cells starting with `= + - @ \t \r` with a single quote before the existing quote logic.

### B9 · Approved→rejected transition deducts with no refund path · **[Fable-only]** · NEEDS-FIX (low)
- **Source:** Fable Run 5 N-6. `handle_leave_refund` fires only on approved→cancelled; `admin_all_leave_requests` permits approved→rejected directly. An admin "correcting" an approval via dashboard/API leaves the deduction stranded with no trigger/audit flag.
- **Fix:** extend the refund trigger predicate to `new.status in ('cancelled','rejected')`, or add a guard trigger forbidding approved→rejected (only legal exit from `approved` is `cancelled`).

### B10 · Browser-facing direct grants are broader than the Server Actions (documents/Storage + onboarding task insert) · **[Sol-only]** · NEEDS-FIX
- **Sources:** `codex-sol-audit-1-authz.md` (2× NEEDS-FIX) + `codex-sol-audit-5-db-schema.md`. Same root cause as A6, two more instances.
- **Documents/Storage:** employee `INSERT` is granted directly on `documents` (`0007:52-59`) and `storage.objects` (`0015:44-52`); the bucket only checks a union MIME/size (`0029`). So an employee can upload any bucket-allowed MIME to any category-looking path and insert their own non-payslip metadata **directly**, bypassing the action's per-category MIME/extension rules, server-generated path, file/metadata atomicity, and `document.uploaded` audit (`documents.ts:103-265`). The admin/manager UI then treats an unvalidated, unaudited row as an application-validated document.
- **Onboarding:** manager `INSERT` on `onboarding_tasks` is granted directly (`0008:51-53,95-100`, only `employee_id` scope checked); `0017` revoked direct *update* but left insert. A manager can insert a task with an unrelated `assignee_id`, `status='completed'`, arbitrary title/timestamps — no validation, no audit.
- **Fix:** revoke the direct browser `INSERT` grants and route these writes through the existing Server Actions / narrow RPCs, or encode the immutable/default/provenance/category rules in a trigger + column privileges so the DB enforces them. RLS is row filtering, not column/transition integrity.
- **Effort:** Medium.

### B11 · `previewWorkingDays` accepts unbounded date ranges — authenticated CPU/DoS · **[Sol-only]** · NEEDS-FIX
- **Source:** `codex-sol-audit-4-performance.md` #1 (ranked its most urgent item). Note **Fable/Codex flagged this same function as dead code** (no UI caller) — Sol found it is still POST-able by any authenticated user and unbounded.
- **Where:** `leave.ts:1515-1579` validates only string shape/order, then allocates one entry per year and loops every day. Input `0001-01-01 → 9999-12-31` ≈ 3.65M date iterations + a 9,999-entry result; repeated calls occupy the Node worker → timeouts for others.
- **Fix:** since it has no UI caller (C4), **delete it** — or, if kept, apply the submission Zod date/year bounds + a max span (e.g. 366) and reject impossible dates; ideally expose the SQL `working_days()` instead of a JS day-loop.
- **Effort:** XS.

### B12 · Logout ignores `signOut()` failure — can leave a live session · **[Sol-only]** · NEEDS-FIX
- **Source:** `codex-sol-audit-2-auth-audit.md`. `auth.ts:9-15` awaits `signOut()`, discards its error, clears the router cache, and redirects. On a GoTrue outage the refresh cookie stays valid → a shared-computer user believes they logged out; the next navigation restores access.
- **Fix:** inspect the return error, clear local auth cookies when safe, render an explicit failure, add an E2E case simulating upstream sign-out failure. Decide whether logout must revoke all refresh tokens or only this session.
- **Effort:** Low.

### B13 · Upload validation trusts declared MIME/extension, not file content · **[Sol-only]** · NEEDS-FIX
- **Source:** `codex-sol-audit-2-auth-audit.md`. `documents.ts:272-289` checks size + `File.type` + filename extension; no magic-byte sniff, parser isolation, AV scan, or quarantine. A polyglot/executable named `policy.pdf` with `type=application/pdf` passes and is later delivered to an HR user via signed URL (private storage stops public browsing, not malicious content to the downloader).
- **Fix:** verify magic bytes/parseability, quarantine on upload, scan asynchronously, expose the signed download only after a clean result; keep browser MIME as a hint. Pairs with B10 (close the direct-Storage bypass so this can't be skipped). Also a Tier P **P1** item.
- **Effort:** Medium (needs an AV/scan dependency).

### B14 · No-op mutations write false-success audits (approve/reject race + admin toggles/deletes) · **[Fable+Sol]** · NEEDS-FIX
- **Sources:** `codex-sol-audit-2-auth-audit.md` (2 findings) + `fable-audit-3-ai-quality.md` N6. The `cancelLeaveRequest` select-back fix (`leave.ts:873-900`) was **not** propagated to its twins.
- **Approve/reject race:** `approveLeaveRequest`/`rejectLeaveRequest` (`leave.ts:600-633,711-764`) update with a `status='pending'` predicate but no select-back. If two approvers act, the loser's update matches zero rows, PostgREST returns no error → the action writes `leave.approved`/`leave.rejected`, **sends decision emails**, and returns success though nothing changed.
- **Admin toggles/deletes:** `toggleTemplate`, `deleteTemplateItem`, `deleteTask`, leave-type/holiday toggles update/delete with no returned-row check → a valid-but-nonexistent UUID yields "success" + a fabricated `*.deleted`/`*.toggled` audit event.
- **Fix:** standardize on `.select('id').maybeSingle()` + require one row (the pattern `cancelLeaveRequest` already uses); zero rows → `logEntityNotFound`, not a success audit. Best: move transition + audit into an atomic RPC that derives the event from the row actually changed (ties into B1).
- **Effort:** Low–Medium.

### B15 · Future-table RLS event trigger (0052) fails open · **[Sol-only]** · NEEDS-FIX
- **Source:** `codex-sol-audit-5-db-schema.md`. `0052:24-52` auto-enables RLS on new public tables but **catches every failure and only `RAISE LOG`s it** — so a future migration whose `ALTER TABLE ... ENABLE RLS` fails still commits, and default API grants were revoked in `0039`, so a later grant could expose a table with no RLS. (Related to Fable NIT-6 on 0039/0052 default-privilege scoping.)
- **Fix:** re-raise so table creation fails closed. Add a CI schema assertion over `pg_class.relrowsecurity` for every exposed public table after migrations — don't treat logs as enforcement.
- **Effort:** Low.

---

## Tier C — Quality / maintainability (low-risk cleanup)

### C-DEDUP · Collapse copy-paste twins (prerequisite for A3) · **[CONVERGED]**
- **Sources:** Codex Run 3 + Fable Run 3 P2. Working-days math exists in 5 divergent copies; searchable-select resolvers in 5 (3 behaviors); `fetchProfileNames`×4, `unique`×4, `emptyToNull`×4. Fix landed in one twin only (`cancelLeaveRequest` select-back-before-audit) and not `deleteTask`/`deleteTemplateItem`.
- **Fix:** one `lib/working-days.ts` (unblocks A3), one `resolveSearchSelection()` (unblocks B6 + N8 divergence + `resolveManagerId` returning `selectedValue` on error, `employees.ts:645`), a `dal/shared.ts` for the micro-helpers. Est. −250 to −350 LOC.

### C1 · Partial-selector first-match → require exact/unique match · **[CONVERGED]**
- Codex Run 3 + Fable Run 3 N8. First-partial fallback can write to the wrong entity (`Morgan Manager` vs `Morgane Lead`); the twins even disagree on the same input (label-contains vs `data[0]`). Make the hidden UUID authoritative; for partial labels require exactly one match or return an ambiguous-field error. Folds into C-DEDUP.

### C2 · Move email off the response path + add a timeout · **[CONVERGED]**
- Codex Run 3 + Fable Run 3 / Run 4 F1. "Fire-and-forget" comments but every caller `await`s two sequential `sendEmail` (`fetch` with **no `AbortSignal`**) after the mutation+audit commit; a stalled Resend hangs the action indefinitely, and the onboarding retry can double-insert tasks. Use `next/server` `after()` for post-commit notification and add `signal: AbortSignal.timeout(5000)` to the fetch (verify `after()` against `node_modules/next/dist/docs/`).

### C3 · Consistent validation-failure auditing · **[CONVERGED]**
- Codex Run 2/3 + Fable Run 3 P3. `logValidationFailed` fires in 4 of 9 action files (leave/performance/documents/compensation) and never in employees/onboarding/departments/app-settings. Introduce one `parseAuditedActionInput({action,actorId,schema,formData})` wrapper so a missing audit event becomes impossible to omit.

### C4 · Remove dead code / unused dependencies · **[all three]**
- Codex Run 3 + Fable Run 3 §4 + Sol Audit 3. `previewWorkingDays`+`WorkingDaysPreview` (dead exported Server Action, ~85 LOC, `leave.ts:1508-1595` — also the B11 DoS surface, so deleting closes both); `dialog.tsx`/`select.tsx`/`separator.tsx`/`sonner.tsx` wrappers + deps `@radix-ui/react-dialog|select|separator`, `next-themes`, `sonner` (~343 LOC + 5 deps — verify importers first, systems disagreed on which are live); `isAdminRole`/`isManagerOrAbove` (0 callers); `getOwnCompensationForSelfEdit` alias; `Database` type stub. **Sol adds:** default `public/*.svg` starter assets (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`) with no source references.

### C5 · Fix `expectAudit` stale-row false-pass · **[CONVERGED]** (test)
- Codex Run 2/3 + Fable Run 3 N7. 42/44 `expectAudit` calls omit the `since` bound the helper documents; a regressed audit write stays green against last week's rows. Capture `since = nowIso()` before each action (pattern proven in `reports.spec.ts:65,165`) or make `since` required. (Fable Run 2 verified the *forge* deny-audit specs in `access-matrix.spec.ts` already scope by actor+`since`+target — clean; the gap is the broad `expectAudit("X")` callers.)

### C6 · Generate Supabase types (remove the decoy type layer) · **[Fable+Sol]**
- Fable Run 3 P1 + Sol Audit 3 NEEDS-FIX. `src/types/database.ts` is a one-line stub nothing imports; Sol counted **338 `as string` casts** (Fable ~310) across `src/server/` verifying nothing — a renamed/nullable column compiles clean and fails at runtime as `undefined as string`. Run `supabase gen types typescript` into `database.ts`, pass `Database` to the three client factories, type RPC results; the casts become deletable. Sol: treat generated-type diffs as migration-review artifacts (regen in CI).

### C7 · Correctness NITs from Fable Run 3 · **[Fable-only]**
- **N1** — leave submit auto-seeds next-year balances *before* validation; rollover `ignoreDuplicates` then freezes them at a stale default → per-employee drift. Move the seed after validation, or tag auto-seed rows so rollover can overwrite.
- **N2** — onboarding tasks assigned to a manager/admin are invisible & uncompletable (`/onboarding` never shows a manager their own tasks; `completeTask` is employee-only). Fix assignment surface or completion guard, coherently.
- **N4** — bootstrapped `performance_reviews.manager_id` never corrected on submit → acknowledgment email misroutes to the admin who created the goal, not the manager who wrote the review. Set `manager_id = user.id` on submit-intent update.
- **N5** — admin dashboard "leave usage" sums calendar days while ledger/reports sum working `deducted_days` → two contradictory numbers. Sum `deducted_days` in the dashboard card.
- **N6** — `deleteTask`/`deleteTemplateItem`/`toggleTemplate` skip Zod, DELETE with no `.select()` check, and write audit rows for no-ops. Mirror the `cancelLeaveRequest` select-back pattern + postgresUuid-validate.

### C8 · Documentation drift (no code change) · **[all three]**
All three systems flagged the docs as the real artifact behind several "findings" (Sol Audit 5 NIT independently reproduced the holidays / documents-UPDATE / app-settings drift). Fix these so future reviewers (and the CI cross-check gate) aren't misled. **Sol's structural recommendation:** generate the RLS/grant/policy inventory from a migrated scratch DB and diff it against an expected manifest — keep prose for intent, executable assertions for reality (kills this whole class; see Tier P):
- **`rls-policy-map.md` + `security-model.md` + `systems-thinking.md` — `jwt_role` fiction.** Both audits (Codex Run 5 NIT, Fable Run 1 F6 / Run 2 F2 / Run 5 N-2) grep-confirmed **zero** policies read the JWT; every one calls `get_user_role()` (live `profiles` read). Rewrite the `rls-policy-map.md:12-16` shorthand to `get_user_role()='…'`; correct `security-model.md:133` and `systems-thinking.md:20,33,75,101` (the stale-JWT blast-radius story is inverted — demotion is immediate). Either delete `sync_role_to_jwt` (0013) as dead code or document its actual (nonexistent) consumer.
- **`rls-policy-map.md` overstates DB write policies** (Codex Run 5 + Fable Run 5 N-4): performance_* / onboarding_tasks (post-0017) / documents UPDATE-DELETE / profiles INSERT are **service-role-only, no session policy**. Annotate each cell `blocked at DB (service-role Server Action only)` so the map says which layer enforces the control.
- **`app_settings`** (Fable Run 5 N-3): docs describe the key-value table dropped in 0032; rewrite to the admin-only singleton shape.
- **`security-model.md:34` manager compensation** (Codex Run 1, reclassified in `codex-audit-review.md`; Fable Run 1 confirms the feature is intended + closed): update to state managers see direct-report salary *summaries* (amount/currency/frequency/effective date) while blocked from bank/tax/national-ID/notes. Do **not** remove the RPC.
- **`access-matrix.md:99`** manager review scope is `manager_id===user.id` in the doc but current-direct-report in code/RLS (Codex Run 1 NIT). Decide the rule (historical vs current manager ownership) and align doc + code.
- **`database-design.md`** structural staleness (Fable Run 5 NIT-5): migration table stops at 0042 (omits 14 shipped migrations); enum attribution wrong; unresolved Phase-3 FK TODO; "audit_logs append-only" is an RLS-only claim (service-role can rewrite).

### C9 · Schema-hygiene NITs · **[Fable-only]**
- Fable Run 5 NIT-1 (half-day trigger deducts 0.5 for a non-working day vs TS mirror returns 0), NIT-2 (`public_holidays` SELECT exposes inactive rows — Sol Audit 1 NIT corroborates), NIT-4 (`handle_new_user` `on conflict (id)` misses the `work_email` UNIQUE → opaque signup 500), NIT-6 (0039 default-privilege revoke scoped to `postgres` but 0052 applies as `supabase_admin`). Low; batch when touching the relevant migrations.

### C10 · Split the oversized action files · **[Sol-only]**
- Sol Audit 3. `leave.ts` is 1,914 lines, `performance.ts` 1,526, `employees.ts` 834, `onboarding.ts` 644, `dal/dashboard.ts` 899 — unrelated invariants concentrated so a fix (e.g. the cancel select-back) lands in one path and misses siblings hundreds of lines away (the current B14 state). Split by capability (leave request lifecycle / balance admin / holiday admin / working-day service; performance cycles / goals / reviews); keep shared transition helpers adjacent and tested once. Do incrementally alongside C-DEDUP.

### C11 · Fresh bootstrap is non-atomic with a weak init probe · **[Sol-only]**
- Sol Audit 5 NEEDS-FIX. `scripts/db-bootstrap.mjs:82-115` concatenates all migrations+seed without `--single-transaction` (says so itself: DB "may be half-applied" on error), and the "already initialized" probe (`:54-79`) checks only whether `public.profiles` exists → a mid-chain failure + rerun reports success on a partial schema. Fix: run the fresh bundle in one transaction (if every migration is transaction-safe) + initialize the ledger in that flow; probe the complete migration ledger / latest migration, not one early table; fail on partial state. (`scripts/db-migrate.mjs` incremental runner is fine — per-file transactional with checksums.)

---

## Tier D — Performance (no correctness risk; do not speculate — profile first)

All three performance passes converged heavily. **[CONVERGED / all three]** unless noted. (Sol's #1 perf item — the unbounded `previewWorkingDays` — is promoted to **B11** since it's a reachable DoS, not just a perf tweak.)
1. **Memoize `getSessionUser()` with React `cache()`** (`helpers.ts:33`) — removes 1 GoTrue round-trip + 1 `profiles` query from every protected render (layout+page duplication). Top win, trivial. (All three ranked this the top low-risk win; Sol notes verify `cache()` behavior on this modified Next build and don't persist across Server Action requests.)
2. **Kill duplicate same-request queries:** `/performance` fetches cycles twice (`getActiveOrVisibleCycles` just re-calls `getPerformanceCycles`); manager `/onboarding` fetches direct-report IDs twice; `submitLeaveRequest` re-fetches `leave_types` ×3 and `public_holidays` ×2 (Fable Run 4 F2).
3. **Delete orphan fetches** — Fable Run 4 F5: manager `openTasks` count and employee `getCompensationSummary` are fetched but never rendered (the compensation one is a needless service-role salary read on a hot path).
4. **Bound fetch-all-then-slice reads** before HR history accumulates: dashboard panels (pending leave, audit 100→5, onboarding counts, performance-reviews full-table→count), employee directory (`getVisibleEmployees` loads whole table), reports (Node-side aggregation → SQL/RPC `GROUP BY`).
5. **Email no-timeout** (Fable Run 4 F1) — see C2; also a perf win (200–1000 ms per mutation).
6. **RLS initplan** (Fable Run 4 F7, **[Fable-only]**): wrap bare `get_user_role()`/`auth.uid()` in policy quals as `(select …)` so they evaluate once per statement, not per row. One migration, no behavior change; touches every policy → coordinate with security-model docs. **Needs `EXPLAIN (ANALYZE)` on seeded volume first.**
7. **`recharts` dynamic import** on `/reports` (static today for 6 of 8 chartless reports).
8. **Composite/partial indexes** (Codex Run 4, Fable §3) — `(status, created_at desc)` etc. **Only after `EXPLAIN`; do not add speculatively.**
9. **Exact-match audit quick filters** (Codex Run 4) — leading-wildcard `ILIKE` bypasses the action/entity index; use `.eq()` for known filters.
10. **Page-level sequential awaits** (Fable Run 4 F8) — a few one-wave waterfalls on `/employees`, `/payroll`, both dashboards; move the leading fetch into the existing `Promise.all`.

---

## Appendix — Non-issues / verified-safe (do not "fix")

All three systems confirmed these are **not** defects:
- **Manager salary visibility** is the intentional, UAT'd Session-154 feature (employee self-service + manager view-only RPC). The stale `security-model.md:34` is the artifact — see C8. Fable Run 1 + Sol Audit 1 both independently verified the compensation manager-leak is *closed* (base-table SELECT dropped 0050; RPC hard-projects a summary; no bank/tax reachable).
- **JWT role desync → RLS mis-scope** is not exploitable — RLS reads `profiles.role`, never the JWT (**all three** grep-verified no `auth.jwt()` role read anywhere). The "DB wins on conflict" narrative describes a conflict RLS can never see.
- **Signed-URL IDOR, peer/self employee-detail IDOR, employee salary self-write** — all verified blocked (Fable Run 1 + Sol Audit 1 non-findings). Sol confirms the signed-URL path loads the row via the session client (RLS) before signing.
- **Storage RLS** — latent defense-in-depth only (every real path signs via service-role), acceptable and candidly documented in `0054`. *(Note: this is the same architecture that makes B10 exploitable on the direct-insert path — the read side is fine, the write grants are the gap.)*
- No hallucinated Next.js APIs (all three verified `src/proxy.ts` etc. against `node_modules/next/dist/docs/`); zero `any` in `src/`; migration runner uses per-file transactions + checksums; the forge/RLS E2E suite asserts real properties.

---

## Suggested execution order

1. **A1** + **Tier P P0** signup preflight (config, minutes) → close the open front door.
2. **A5, A6, A2** (leave-ledger integrity: insert-deduction, column grant, refund) — all DB/migration, land together with regression tests. Fold **B10** (revoke the other broad browser grants) into the same migration batch.
3. **A3** after **C-DEDUP** (working-days unification is the prerequisite).
4. **A4** (performance write+read guards + Sol's 4 audit/deadline items) + **A7** (`updateEmployee` atomicity).
5. **B1** audit atomicity (Sol BLOCKER — the anchor of Tier P's atomic-audit P0; do early, it's architectural).
6. **Tier B** remainder as one hardening batch (B2 comp-RPC; B3 constraints; B4–B9; B11 delete previewWorkingDays; B12–B15).
7. **Tier C** doc drift (C8) can go anytime — it unblocks the CI cross-check gate and the third-AI-review sign-off.
8. **Tier D** as a separate perf pass, gated on `EXPLAIN` where noted.
9. **Tier P** (below) as the production-hardening track before real staff data — some items (backups/restore, CI-that-builds, telemetry) are independent of the code fixes and can run in parallel.

After Tier A (+ the Tier P P0 items) land, this + all three audit sets close **Phase-13 exit-check 3** (pending-backlog §1 multi-AI review). Note the code gate and the *production-readiness* gate are distinct: exit-check-3 is satisfied by the multi-AI review + Tier-A remediation; **Tier P is what moves KushHR from Sol's `2.5/5` pilot-grade to production-grade for real HR/payroll PII.**

---

## Tier P — Production-readiness & operations · **[Sol Audit 6]**

Program-level assessment from Sol's sixth (production-readiness) pass — the dimension the Codex/Fable passes
didn't cover. **Verdict: `2.5/5` — pilot-grade, not production-grade** (1 prototype · 2 MVP · 3 controlled
internal production · 4 mature · 5 continuously-assured). More professional than a typical solo MVP (coherent
layout, extensive threat/access docs, real RLS tests, pinned migrations, health checks, deploy runbook, human
approval discipline) — but operational assurance doesn't yet match HR/payroll sensitivity.

**Honest scoping caveat (Sol's, kept):** a 15–20-user LAN/VPN tool does **not** need microservices, Kubernetes,
multi-region, Kafka, or an SRE team. One Next app + one Postgres + one object store + Docker Compose is a
legitimate professional architecture. Process-local rate limiting, synchronous notifications, and manual deploy
approval are proportionate *while internal and single-worker*, provided the limits are documented and the
ingress assumption is enforced. The gaps below are the ones that actually matter at this scale.

### P0 — table stakes before pointing real staff data at it
| # | Item | Ties to | Effort |
|---|---|---|---|
| P0-1 | Disable + **preflight** public signup (fail the release if a disposable signup succeeds); remove demo accounts/seed from the production bootstrap; close the direct `:3100`/`:8000` publishes so ingress is Caddy-only; finalize TLS/FQDN. | A1 | 1–2 d + IT decision |
| P0-2 | Land the code-correctness BLOCKERs: frozen-refund (A2), broad leave UPDATE (A6), partial role update (A7), leave-decision zero-row races (B14). | Tier A + B14 | 4–7 d |
| P0-3 | Make privileged mutation + audit **atomic** (transaction/RPC) or a durable outbox; alert on audit-write health. | B1 | 1–2 wk |
| P0-4 | **Off-host** encrypted backups; make `restore.sh` **fail closed** (it currently suppresses `pg_restore` failure with `|| true` and can print "Verification done" after a partial restore) and compare source-vs-restore; run + document a full DB+Storage recovery drill. | new (ops) | 2–4 d + storage |
| P0-5 | CI must run `next build` **and** a migrated disposable-DB job with the RLS/security/critical E2E suites, required on protected `main`. Today CI runs only type-check + lint + the doc/access gates — green CI does **not** prove the app builds, migrations apply, or RLS holds. | new (CI) + C5 | 3–5 d |

### P1 — needed soon after
| # | Item | Ties to | Effort |
|---|---|---|---|
| P1-1 | Centralized structured logs + error tracker + request correlation; a small alert set (5xx rate, audit-write failure, signup anomaly, DB/disk, backup status). App errors currently go only to `console.error`. | — | 2–4 d |
| P1-2 | Concise privacy/security operating pack: data owner + escalation, data inventory/classification, access review, retention/deletion, incident-response playbook, export/backup handling, MFA decision (esp. admins). Bank/tax/national-ID are plaintext — decide field-encryption/key-ownership deliberately (Sol: don't cargo-cult field encryption if keys sit beside the app; start with disk/backup encryption + minimized projections). | — | 3–5 d w/ business owner |
| P1-3 | File signature/parse validation + quarantine/AV scan; close the direct Storage/metadata insert bypass. | B13 + B10 | 3–7 d |

### P2 — professional hardening / maintainability
- Generate Supabase types + refactor toward viewer-aware domain services / transaction RPCs; split the oversized action files. (C6 + C10 + the architecture recommendation all three systems converge on.)
- Make audit E2E assertions run-scoped; add fast unit/property tests for leave math, transitions, CSV safety, mappers. (C5)
- Dependabot / advisory ownership, dependency-review + `npm audit`/OSV + container scan, SBOM, pin images/actions by digest where practical, remove orphan deps/assets. (No Dependabot/SBOM/scan config today; caret ranges safe only via the lockfile; `node:22-alpine`/`caddy:2-alpine`/Action major tags are mutable.)
- Generate the RLS/grant/schema inventory from a migrated DB and diff against an expected manifest — kills the C8 doc-drift class permanently.

### P-misc — noted operational leak
- `infra/supabase/run.sh` has a `secrets` command that **prints passwords/API keys to the terminal** (scrollback/log-leak risk). Gate it or remove it.

### Sol's "what the best software in this class does differently" (the target picture)
Invite-only identity with lifecycle ownership (+ admin MFA) · transaction-owned audit · one authorization
boundary (session-RLS reads, narrow typed RPC writes, service-role exceptional + reviewed) · disposable-
environment CI proving a *newly created* event · recoverability with independent failure domains + rehearsed
restore · actionable telemetry · privacy operations · supply-chain gates. None of these require FAANG scale —
they're "boring, verifiable controls."
