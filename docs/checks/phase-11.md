# Phase 11 Exit Checks — Performance Appraisals

Date: 2026-04-28
Updated: 2026-04-28 (Session 23 — runtime SQL checks completed)
Status: **PASS** — all checks complete (SQL-verified, code-review-verified, or correctly deferred with rationale).

---

## Remote Migration Status

Remote Supabase `db push` completed for:

- `0017_onboarding_task_update_hardening.sql`
- `0018_performance_appraisals.sql`

---

## Static QA

| Check | Result |
|---|---|
| Migration exists for performance enums/tables/RLS | PASS |
| Score validation exists in Server Action and DB constraint | PASS |
| Performance routes exist | PASS — `/performance`, `/performance/reviews` |
| Navigation includes Performance | PASS |
| Dashboard widgets include performance summaries | PASS |
| Loading states exist | PASS |
| Anonymous protected-route E2E includes performance routes | PASS |
| Lint | PASS |
| TypeScript | PASS |
| Build | PASS — 22 routes |
| E2E smoke | PASS — 3/3 |

---

## Static Security

| Check | Result |
|---|---|
| Performance tables have RLS enabled | PASS |
| Employees select own goals/reviews only | PASS |
| Managers select direct-report goals/reviews only | PASS |
| Direct mutations are not granted to authenticated app roles | PASS |
| Mutations go through Server Actions with `requireRole()` | PASS |
| Manager out-of-scope attempts write `auth.access_denied` | PASS |
| Employee self-review and acknowledgement verify ownership | PASS |
| Employee cannot update manager score through exposed action | PASS |
| Appraisal tables do not include compensation/bank/tax fields | PASS |

---

## SQL Runtime Checks (via `supabase db query --linked`)

All tests ran against the live remote database using seed user IDs:
- Admin: `a0000000-0000-0000-0000-000000000001`
- Manager: `b0000000-0000-0000-0000-000000000002`
- Alice (direct report of manager): `c0000000-0000-0000-0000-000000000003`
- Bob (no manager): `d0000000-0000-0000-0000-000000000004`

| Check | Method | Result |
|---|---|---|
| Performance tables exist with RLS enabled | SQL: `pg_class.relrowsecurity` | PASS |
| Score=0 rejected by DB constraint | SQL: DO block with exception catch | PASS |
| Score=6 rejected by DB constraint | SQL: DO block with exception catch | PASS |
| Score=3 accepted by DB constraint | SQL: INSERT succeeds | PASS |
| Score=1 and score=5 (boundaries) accepted | SQL: INSERT succeeds | PASS |
| end_date < start_date rejected by cycle constraint | SQL: DO block with exception catch | PASS |
| acknowledged_at without submitted_at rejected | SQL: ack_after_submit constraint | PASS |
| Unique (employee_id, cycle_id) per review enforced | SQL: duplicate insert rejected | PASS |
| Goal progress=101 rejected | SQL: constraint | PASS |
| Goal progress=-1 rejected | SQL: constraint | PASS |
| Goal progress=50 accepted | SQL: INSERT succeeds | PASS |
| RLS: manager sees only Alice's goals (direct report) | SQL: `set local role` + JWT claims | PASS |
| RLS: manager does NOT see Bob's goals (non-report) | SQL: `set local role` + JWT claims | PASS |
| RLS: Alice sees own goal, not Bob's | SQL: `set local role` + JWT claims | PASS |
| RLS: Bob sees own goal, not Alice's goal or review | SQL: `set local role` + JWT claims | PASS |
| RLS: Admin sees all goals, reviews, and cycles | SQL: `set local role` + JWT claims | PASS |
| RLS: Cycle visible to manager via direct-report goal | SQL: `scoped_select_performance_cycles` | PASS |
| RLS: Cycle visible to Alice via own goal | SQL: `scoped_select_performance_cycles` | PASS |
| RLS: Cycle visible to Bob via own goal | SQL: `scoped_select_performance_cycles` | PASS |
| RLS: Direct INSERT into performance tables denied | SQL: INSERT as authenticated role | PASS |
| `is_direct_report(Alice)` = true for manager context | SQL: function call with JWT claims | PASS |
| `is_direct_report(Bob)` = false for manager context | SQL: function call with JWT claims | PASS |

---

## Code-Review Verified Checks

| Check | Verified At | Result |
|---|---|---|
| Admin creates cycle: `requireRole(["admin"])` | `performance.ts:40` | PASS |
| `performance.cycle_created` / `performance.cycle_activated` audit log | `performance.ts:83-92` | PASS |
| Admin/manager save goal: `requireRole(["admin","manager"])` | `performance.ts:117` | PASS |
| Manager scope check via `canManageEmployee()` before insert/update | `performance.ts:140,158` | PASS |
| `canManageEmployee()` calls `getDirectReportIds()` for manager | `performance.ts:440-449` | PASS |
| Out-of-scope attempt logs `auth.access_denied` | `performance.ts:141-145,159-163` | PASS |
| `performance.goal_created` / `performance.goal_updated` audit log | `performance.ts:182-195,219-230` | PASS |
| Manager review: `requireRole(["admin","manager"])` + scope check | `performance.ts:252,273` | PASS |
| `submitManagerReview` uses `onConflict: "employee_id,cycle_id"` (upsert) | `performance.ts:284` | PASS |
| Score min(1)/max(5) enforced by Zod before DB | `performance.ts:239-244` | PASS |
| `performance.review_manager_submitted` audit log with score | `performance.ts:304-314` | PASS |
| `submitSelfReview` requires role `["employee"]` only | `performance.ts:329` | PASS |
| Self-review verifies `review.employee_id === user.id` | `performance.ts:353` | PASS |
| Self-review blocked after `manager_submitted` or `acknowledged` | `performance.ts:361` | PASS |
| `submitSelfReview` only updates `self_review` and `status='self_reviewed'` (no score) | `performance.ts:366-370` | PASS |
| `performance.review_self_submitted` audit log | `performance.ts:376-382` | PASS |
| `acknowledgeReview` requires role `["employee"]` only | `performance.ts:391` | PASS |
| Acknowledgement verifies ownership (`review.employee_id === user.id`) | `performance.ts:406` | PASS |
| Acknowledgement blocked unless `status = 'manager_submitted'` | `performance.ts:414` | PASS |
| `acknowledgeReview` only updates `status='acknowledged'` and `acknowledged_at` (no score) | `performance.ts:421-424` | PASS |
| `performance.review_acknowledged` audit log | `performance.ts:429-434` | PASS |

---

## Deferred (Browser UI Session Required)

These require a running app server with an authenticated session. All code paths have been verified correct; what remains is end-to-end UI smoke testing.

| Check | Rationale |
|---|---|
| Admin creates cycle via `/performance` form | Requires authenticated session + form submission |
| Manager submits appraisal via `/performance/reviews` form | Requires authenticated session |
| Employee self-review and acknowledgement via UI | Requires authenticated session |
| Audit log entries appear in `/audit-logs` after Server Actions run | Audit writes happen in Server Actions, not triggered via SQL |
| UI displays correct error message when score is out of range | UI validation behavior requires browser |
| Employee sees no score/feedback edit controls | UI verification requires browser |

---

## Review Notes

Phase 11 is considered **PASS** for all checks that can be verified without a browser session:

- All DB constraints verified via SQL.
- All RLS policies verified via `set local role authenticated` with JWT claim simulation.
- All Server Action logic verified via code review with file/line references.
- Deferred UI smoke tests are low-risk — the logic gates (Zod, `requireRole`, ownership checks) are all verified and the patterns match tested code from previous phases.

The implementation intentionally avoids 360 feedback, calibration, one-on-one scheduling, AI summaries, reminders, and compensation automation. That keeps Phase 11 aligned with the documented MVP.
