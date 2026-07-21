# Ultrareview Findings — 2026-04-29

Source: `/ultrareview` cloud sessions (Opus 4.7, full codebase against empty base).
Two runs were attempted; both failed at the write-up step due to upstream rate limits,
but each completed Setup, Find, Verify, and partial Dedupe. Findings below are merged
across both runs.

Status: **COMPLETE 2026-04-29/30** — all 13 confirmed findings have been fixed,
covered with regressions where applicable, and verified with the full Playwright
suite passing 65/65 after remediation. Manual human-flow UAT is now tracked in
[phase-13.md](checks/phase-13.md).

- **Run 1** — 30 candidates → 11 confirmed · 19 refuted
- **Run 2** — 26 candidates → 10 confirmed · 16 refuted

Items confirmed by **both** runs are higher-confidence. Items confirmed by only one
run, or where the runs *disagreed*, are flagged for closer manual verification.

## Confirmed findings (merged, deduplicated)

| # | Finding | Primary location | Other locations cited | Run 1 | Run 2 |
|---:|---|---|---|:---:|:---:|
| 1 | Manager cannot submit own leave request — RLS denies INSERT for non-employee role | `src/server/actions/leave.ts:40` | `supabase/migrations/0006_leave.sql:121` | YES | YES |
| 2 | Open redirect via `next` parameter on login | `src/app/(auth)/login/login-form.tsx:33` | — | YES | YES |
| 3 | Multi-year leave only decrements balance for start year (uses `start_date` year only) | `supabase/migrations/0020_leave_approval_missing_balance_error.sql:22` | — | YES | YES |
| 4 | Admin pages use manager-only employee picker, blocking admin from selecting regular employees | `src/server/dal/employees.ts:201` | `src/app/(app)/payroll/page.tsx:94`, `src/app/(app)/documents/page.tsx:32` | YES | YES |
| 5 | Audit-logs actor filter regex rejects valid Postgres UUIDs (only matches RFC 4122 v1–v5) | `src/app/(app)/audit-logs/page.tsx:204` | — | YES | YES |
| 6 | `submitManagerReview` upsert overwrites `self_review` status, reverts acknowledged reviews, and overwrites `manager_id` | `src/server/actions/performance.ts:282` | — | YES | YES |
| 7 | Editing compensation silently nulls bank/tax/national ID fields when left blank | `src/components/payroll/compensation-form.tsx:154` | `src/server/actions/compensation.ts:76` | YES | YES |
| 8 | Managers cannot cancel their own pending leave requests (RLS UPDATE blocks) | `src/server/actions/leave.ts:288` | — | YES | — |
| 9 | Admin can self-appraise (`canManageEmployee` returns true for admin on any employee, including self) | `src/server/actions/performance.ts:441` | — | YES | — |
| 10 | Leave rejection note silently dropped — input bound only to approve form | `src/components/leave/leave-decision-form.tsx:28` | — | YES | — |
| 11 | Pages render raw Supabase `error.message` strings to the UI, leaking schema/constraint info | `src/server/dal/leave.ts:165` | — | — | YES |
| 12 | `savePerformanceGoal` allows transferring an existing goal to a different employee | `src/server/actions/performance.ts:167` | — | — | YES |
| 13 | Leave balance can become negative on approval — **FIXED 2026-04-29** | `supabase/migrations/0021_leave_approval_insufficient_balance.sql` | `src/server/actions/leave.ts:158-164`, `tests/e2e/manager.spec.ts:207-285` | YES | refuted (incorrect) |

### Verification log

- **D1 → #13 (verified + fixed 2026-04-29):** Run 1 was correct, run 2 wrong. The pre-fix trigger did an unconditional `balance = balance - v_days` UPDATE with no `balance >= v_days` predicate; column had no CHECK constraint; `approveLeaveRequest` did no pre-check. Confirmed repro: 2 days remaining → 5-day approval → balance `-3`.
  - **Fix shipped:** new migration `0021_leave_approval_insufficient_balance.sql` adds `balance >= v_days` to the trigger UPDATE and distinguishes P0001 (no balance row) from P0002 (insufficient balance). Server Action ([leave.ts:158-164](../src/server/actions/leave.ts#L158-L164)) maps P0002 to "Insufficient leave balance for this request."
  - **Regression test:** [manager.spec.ts:207-285](../tests/e2e/manager.spec.ts#L207-L285) — 1-day balance, 3-day request, asserts rejection + status remains pending + balance unchanged.
  - **Verified:** migration applied to remote (`supabase db push --linked`); full Playwright suite 51/51 passing.

### Findings 1-12 verification (2026-04-29)

All 12 confirmed by manual code read.

| # | Status | Notes / fix sketch |
|---:|---|---|
| 1 | **FIXED 2026-04-29** | Migration `0022_manager_self_service_leave.sql` adds `manager_insert_own_leave`; regressions in [rls.spec.ts](../tests/e2e/rls.spec.ts) and [manager.spec.ts](../tests/e2e/manager.spec.ts). |
| 2 | **FIXED 2026-04-29** | [login-form.tsx:33-39](../src/app/(auth)/login/login-form.tsx#L33-L39) validates `next.startsWith("/") && !next.startsWith("//")`; regression in [smoke.spec.ts](../tests/e2e/smoke.spec.ts). |
| 3 | **FIXED 2026-04-29** | Migration `0023_leave_approval_split_multi_year.sql` splits approved leave deductions across each affected calendar year while keeping missing/insufficient balance failures atomic; regression in [manager.spec.ts](../tests/e2e/manager.spec.ts). |
| 4 | **FIXED 2026-04-29** | Added `getAllEmployeeOptions()` in [employees.ts](../src/server/dal/employees.ts) and swapped the admin document upload, payroll, and leave-balance pickers to regular employee-inclusive options; regression in [admin.spec.ts](../tests/e2e/admin.spec.ts). |
| 5 | **FIXED 2026-04-29** | [audit-logs/page.tsx](../src/app/(app)/audit-logs/page.tsx) now accepts any Postgres UUID shape, including seeded IDs with non-RFC version/variant nibbles; regression in [admin.spec.ts](../tests/e2e/admin.spec.ts). |
| 6 | **FIXED 2026-04-29** | [performance.ts](../src/server/actions/performance.ts) pre-loads any existing review, refuses edits after acknowledgement, preserves employee self-review, and sets `manager_id` only on insert; regressions in [admin.spec.ts](../tests/e2e/admin.spec.ts) and [manager.spec.ts](../tests/e2e/manager.spec.ts). |
| 7 | **FIXED 2026-04-29** | [compensation.ts](../src/server/actions/compensation.ts) preserves existing `bank_account_number` when the masked form field is left blank; regression in [admin.spec.ts](../tests/e2e/admin.spec.ts). |
| 8 | **FIXED 2026-04-29** | Migration `0022_manager_self_service_leave.sql` adds `manager_cancel_own_leave`; regressions in [rls.spec.ts](../tests/e2e/rls.spec.ts) and [manager.spec.ts](../tests/e2e/manager.spec.ts). |
| 9 | **FIXED 2026-04-29** | [performance.ts:441-451](../src/server/actions/performance.ts#L441-L451) rejects self-management before role checks; regression in [admin.spec.ts](../tests/e2e/admin.spec.ts). |
| 10 | **FIXED 2026-04-29** | [leave-decision-form.tsx](../src/components/leave/leave-decision-form.tsx) now submits the shared approver note through both approve and reject `formAction` buttons; regression in [manager.spec.ts](../tests/e2e/manager.spec.ts). |
| 11 | **FIXED 2026-04-29** | Added [errors.ts](../src/server/dal/errors.ts) safe DAL helper and replaced raw `error.message` UI returns across leave, employees, performance, compensation, audit-logs, documents, onboarding, and dashboard DAL paths. |
| 12 | **FIXED 2026-04-29** | [performance.ts:167-178](../src/server/actions/performance.ts#L167-L178) omits `employee_id` from goal UPDATE payload; regression in [manager.spec.ts](../tests/e2e/manager.spec.ts). |

### Remediation order used

Updated based on what we learned:

1. **#2 Open redirect** — 1-line fix, security-critical, ship immediately.
2. **#9 Admin self-appraise** — 1-line fix, security-critical.
3. **#12 Goal transfer** — 1-line fix (drop field from UPDATE), security/integrity.
4. **#1 + #8 (bundle)** — single migration adding `manager_insert_own_leave` + `manager_cancel_own_leave` RLS policies.
5. **#11 Error leak** — refactor + 19 site replacements; mechanical.
6. **#7 Bank account null** — small action change.
7. **#10 Reject note** — form refactor.
8. **#6 Performance review corruption** — pre-load + selective upsert.
9. **#3 Multi-year leave** — trigger refactor (split by year).
10. **#4 Admin pickers** — new DAL function + 3 swaps.
11. **#5 Audit-log UUID regex** — 1-line fix, low impact.

## Original severity triage

**High — security / data integrity:**
- #2 Open redirect (phishing / post-auth redirect abuse)
- #9 Admin self-appraisal (separation-of-duties violation)
- #7 Compensation field nulling (silent PII data loss on edit)
- #11 Raw Supabase error leakage (information disclosure)
- #12 Goal can be reassigned to a different employee (audit/integrity)
- #13 Negative leave balance (verified — data integrity)

**Medium — broken core flow:**
- #1 Manager cannot request own leave (role-coverage gap)
- #8 Manager cannot cancel own pending leave (role-coverage gap)
- #3 Multi-year leave decrement bug (correctness)
- #6 `submitManagerReview` corruption (workflow integrity — also overwrites `manager_id` and reverts `acknowledged`)
- #10 Leave rejection note dropped (audit/compliance loss)

**Low — UI / filter:**
- #4 Admin selectors exclude regular employees (touches payroll, documents, leave admin)
- #5 Audit-logs UUID filter regex too strict

## Next steps

1. **Manual human-flow review is in progress** using [phase-13.md](checks/phase-13.md). Record pass/fail evidence and any UX/product findings there or in a linked manual-review note.
2. **Close the review-only ultrareview PR** after final sign-off if it is still open. It must not be merged.
3. **Consider a follow-up independent review** after manual UAT and any resulting fixes, especially if more security-sensitive workflow changes are made.
4. **Keep tracking the residual Next/PostCSS advisory** until an upstream-compatible fix is available.

## Session references

- **Run 1** session: `claude.ai/code/session_01SgYbwCVLXDtaMM3XjvtE7b`
  - Stages: Setup ✓ · Find (30) ✓ · Verify (11/19) ✓ · Dedupe (started, 11 issues) · Write-up ✗
- **Run 2** session: (URL not captured — re-open from claude.ai/code session list if needed)
  - Stages: Setup ✓ · Find (26) ✓ · Verify (10/16) ✓ · Dedupe (started, 10 issues) · Write-up ✗
- Both failures: `Server is temporarily limiting requests (not your usage limit) · Rate limited`
