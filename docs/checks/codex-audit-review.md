# Codex Audit — Independent Review & Triage (Claude)

Meta-review of the five Codex xhigh audit reports (`codex-audit-1..5`) run 2026-07-08 as
Phase-13 exit-check-3 evidence. Purpose: separate real bugs from doc-drift and design
choices, sanity-check severity, and answer whether UAT already covers these. Two BLOCKER-
class claims were spot-checked against source (confirmed — see §4).

## 1. Headline verdict

**Good result for an AI-built app.** No cross-tenant data breach, no authentication bypass,
no secret in the client bundle, no confirmed injection, no self-service role escalation. The
security *core* is sound: RLS is enabled on every application table, storage is private with
key derivation from trusted IDs, the service-role key is `server-only`-fenced, and role is
read from `profiles` (DB source of truth), not the JWT.

What the audit found is a **thin band of real integrity gaps concentrated in one
architectural pattern**, plus a layer of defense-in-depth hardening and doc drift. Two items
are genuine and code-confirmed; the rest are NEEDS-FIX/NIT. Total genuine security/integrity
work is small and well-scoped.

## 2. The one finding that matters most (convergent root cause)

Three independent passes (Run 1 authz, Run 3 quality, Run 5 schema) landed on the **same
structural fact without coordinating**:

> The `performance_*` and `onboarding_tasks` tables grant only `SELECT` to sessions. **Every
> write goes through the service-role client (`createAdminClient()`), which bypasses RLS
> entirely.** That makes the Server Action the *sole* authorization layer for those tables —
> there is no DB policy backstop. Any gap in the app-side check is therefore a live gap, not
> a defense-in-depth nicety.

That convergence is the strongest signal in the whole audit. The BLOCKER below is a direct
consequence: the app check reimplements *employee* scope and *deadline* but forgot *cycle
status/visibility*, and there is no RLS to catch the miss. **Fix the pattern, not just the
instance** — either (a) add DB write policies / a status-guard trigger on the performance
tables so the DB re-checks, or (b) route every performance/onboarding write through one
audited authorization helper that checks actor + object + cycle-state in one place.

## 3. Does UAT already cover these? — Mostly no

Your instinct was that manual UAT probably hit many of these. It didn't, and here's why:

- **Manual UAT is UI-driven.** It exercises the happy path and UI-level negative cases (a
  button that should be disabled, a page that should 403). **Every material finding here is
  *below* the UI** — forged direct Server Action POSTs with hand-set hidden fields, raw
  Supabase/admin-API writes, service-role bypass, missing DB CHECK constraints. A human
  clicking the app cannot reach these states, so UAT structurally cannot have covered them.
- **The E2E forge suite (`security-rbac-guards.spec.ts`, `forge.ts`) *does* cover some
  forged-POST authz** — hidden `goalId`/`employeeId` swaps, out-of-scope denials. The audit
  acknowledges this and deliberately reports the **residual gaps those forge tests miss**
  (closed/draft cycle IDs, existence oracles, partial-selector ambiguity). So the findings
  are the complement of your existing negative tests, not a re-run of them.

Bottom line: don't discount these as "already tested." The two confirmed items in particular
are new surface. The right response is to add forge-test cases for them alongside the fix.

## 4. Spot-checks I ran (not just relaying Codex)

| Claim | Verified? | Note |
|---|---|---|
| Run 1 BLOCKER — manager can write a review/goal into a **closed/draft cycle** via forged hidden `cycleId` | **CONFIRMED** | `resolveCycleId()` returns the hidden `selectedValue` verbatim; the `.neq("status","closed")` filter only guards the *search* fallback, not the selected value. `assertCycleNotDeadlineLocked()` selects only `submission_deadline`/`submission_lock_enabled` — never checks `status`. `canManageEmployee()` gates the employee, nothing gates the cycle. Impact bounded: own direct reports + needs a leaked cycle UUID; it's integrity/workflow corruption, not data theft. |
| Run 5 BLOCKER — **approved leave inserted without balance deduction** | **CONFIRMED (bounded to admin/service-role)** | `trg_leave_balance_on_approval` is `before update` only — no insert trigger. Employee/manager insert policies are correctly pinned to `status='pending'` (`0006_leave.sql:126,135`), so **only the admin `for all` policy (unconstrained `with check`) can insert `status='approved'` directly.** So the actor must be an admin or a future service-role path, not any authenticated user. Real latent gap, lower reachability than the report's framing implies. |

## 5. Reclassifications (where I disagree with Codex's framing)

- **Manager salary visibility "leak" (Run 1 NEEDS-FIX / Run 5) is doc drift, not a bug.** The
  manager view-only compensation RPC + `/payroll` summary is an **intentional, UAT'd product
  decision** (payroll flow reshaped in Session 154: employee self-service + manager view-only
  RPC). `security-model.md:34` ("managers cannot see salary") is the *stale* artifact. Fix =
  update the doc to state managers see direct-report salary *summaries* (amount/currency/
  frequency/effective date) while still blocked from bank/tax/national-ID/notes. Do **not**
  remove the RPC.
- **Audit fail-open (Run 2 NEEDS-FIX) is a design choice to revisit, not a defect.** Best-
  effort audit is a legitimate pattern; failing closed means a transient `audit_logs` hiccup
  blocks all mutations. Worth deciding deliberately for HR/payroll (fail-closed on *deny* and
  *privileged mutation* paths, best-effort elsewhere) — but it's a policy call, medium.
- **Existence oracles (Run 1) and RLS-map overstatement (Run 5 NIT)** are real but low —
  info-disclosure of "does this UUID exist" and doc-vs-migration drift respectively.

## 6. Triage — recommended sequencing

**Tier A — real, fix first (plan-mode changes):**
1. **Performance cycle-status/visibility guard** (Run 1 BLOCKER). Add a cycle-authorization
   helper: manager writes require `status='active'` + manager-visible; block draft/closed.
   Cover goal + review, insert + update, and the reopen paths. Add forge-test cases.
2. **Approved-leave-insert integrity** (Run 5 BLOCKER). Constrain the admin insert path to
   `status='pending'` (or a `BEFORE INSERT OR UPDATE` trigger that routes initial-approved
   rows through deduction) + a `status='approved' ⇒ approver_id/approved_at NOT NULL` CHECK.
3. **`updateEmployee` atomicity + role-change audit** (Run 2 HIGH). Reorder so the job-record
   update precedes the `profiles.role` write, or wrap both + audit in one RPC/transaction;
   emit an explicit `role.changed {from,to}` row.

**Tier B — hardening / defense-in-depth (batch):**
4. DB CHECK constraints for salary/currency/leave-balance/year bounds (Run 5).
5. Compensation RPC: add `get_user_role() = 'manager'` to the predicate (Run 5).
6. Audit fail-closed decision for deny + privileged-mutation paths (Run 2).
7. Password-reset route: bind `:3100` to loopback / proxy-only, trust `X-Forwarded-For` only
   from Caddy, compare `Origin` to configured `APP_URL` (Run 2). Overlaps existing deploy
   hardening backlog.
8. Uniform "not found or access denied" on the onboarding/performance existence oracles (Run 1).

**Tier C — quality / doc (low-risk cleanup):**
9. Partial-selector first-match → require exact/unique match, one resolver (Run 3). Verify the
   progressive-enhancement path actually reaches the fallback before investing.
10. `after()`-based post-commit email so notifications stop blocking committed mutations +
    add a `fetch` timeout (Run 3). Also removes an onboarding double-insert retry risk.
11. Consistent validation-failure auditing via one audited-parse wrapper (Run 2/Run 3).
12. Dead-dep/scaffold removal: radix dialog/select/separator, next-themes, sonner (~343 LOC +
    5 deps) (Run 3).
13. Doc-drift fixes: `security-model.md:34` (manager comp), `rls-policy-map.md` performance/
    app-settings/public-holidays overstatement, `access-matrix.md:99` manager_id scope.

**Tier D — performance backlog (no correctness risk):** memoize `getSessionUser()` via React
`cache()`; de-dup the `/performance` and `/onboarding` double queries; bound the fetch-all-
then-slice dashboard/directory/report reads before HR history accumulates; dynamic-import
recharts; exact-match audit quick filters (Run 4). All legitimate, none urgent.

## 7. What this does NOT change

Phase-13 status stays **GO WITH RESIDUAL EXTERNAL WATCH**. Nothing here is a reason to pull
the app; the two confirmed integrity gaps require a privileged/forged path and cause bounded
damage, not breach. Recommend: land Tier A before declaring exit-check-3 closed, pair this
Codex pass with the second independent AI review, then archive both.
