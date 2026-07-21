# Security Review

Date: 2026-04-28
Phase: 12 — Hardening

## Result

Status: **PASS**.

Static checks pass, authenticated Playwright fixtures are stable, high-risk browser workflows have runtime coverage, direct RLS checks pass, and Auth trigger checks pass.

---

## Verified — Environment and Secrets

| Check | Result |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` not prefixed `NEXT_PUBLIC_` | PASS |
| `src/lib/supabase/admin.ts` imports `server-only` | PASS |
| `src/lib/env.ts` `getServerEnv()` only called server-side | PASS |
| `.env.example` lists all required vars with no actual secrets | PASS |
| No service-role key usage in `src/components/` or `src/app/` client code | PASS |

---

## Verified — Route Protection

| Check | Result |
|---|---|
| All `(app)` routes guarded by middleware proxy (`src/proxy.ts`) | PASS |
| `requireRole()` called at top of every protected Server Action | PASS |
| Forbidden access writes `auth.access_denied` audit log before redirect | PASS |
| E2E anonymous redirect test covers all 15+ protected routes | PASS |

---

## Verified — Server Action Authorization

All 35 Server Action entry points across 7 action files:

| File | Actions | Role Check |
|---|---|---|
| `onboarding.ts` | 8 | `requireRole` on every action |
| `performance.ts` | 5 | `requireRole` on every action |
| `leave.ts` | 7 | `requireRole` on every action |
| `employees.ts` | 3 | `requireRole` on every action |
| `compensation.ts` | 5 | `requireRole` on every action |
| `departments.ts` | 3 | `requireRole` on every action |
| `documents.ts` | 3 | `requireRole` on every action |

In-scope checks beyond role: `canManageEmployee()` for manager→employee scope in performance; `getDirectReportIds()` scope check in onboarding; `cancelChangeRequest` ownership check; employee self-review and acknowledge ownership checks.

---

## Verified — Input Validation

| Check | Result |
|---|---|
| All mutation boundaries have Zod schemas | PASS — 90+ `z.object/z.string/z.coerce` usages |
| Score enforced 1–5 by Zod before DB insert | PASS — `performance.ts` managerReviewSchema |
| Progress enforced 0–100 by Zod | PASS — `goalSchema` |
| DB constraints duplicate Zod bounds (defense in depth) | PASS — `0018_performance_appraisals.sql` |
| Date ordering validated before DB insert | PASS — `cycleSchema` + Server Action guard |

---

## Verified — Error Handling (Phase 12 Fix)

**Finding**: `onboarding.ts` and `performance.ts` were returning raw Supabase `PostgrestError.message` to the client on unexpected DB errors. These messages can reveal table names, constraint names, and schema details.

**Resolution**: Replaced all `error.message` / `itemErr.message` / `taskError.message` returns in both files with a generic `"An unexpected error occurred. Please try again."` message. `console.error` with the full error is retained for server-side log visibility. Other action files (`leave.ts`, `employees.ts`, `compensation.ts`, `departments.ts`, `documents.ts`) already used generic messages.

**Files changed**: `src/server/actions/onboarding.ts`, `src/server/actions/performance.ts`

---

## Verified — Audit Logs

| Check | Result |
|---|---|
| `audit_logs` insert path is service-role admin client only | PASS |
| `insert_audit_log()` RPC revoked from `authenticated` in migration 0014 | PASS |
| No app-layer code calls the revoked RPC | PASS |
| `audit_logs` has no update/delete grant to `authenticated` | PASS |
| `auth.access_denied` logged for all out-of-scope attempts | PASS — code-review verified |

---

## Verified — RLS (SQL runtime checks, Phase 11)

Performance tables verified via `supabase db query --linked`:

| Table | Admin | Manager | Employee | Direct INSERT |
|---|---|---|---|---|
| `performance_review_cycles` | all rows | via goal/review exist | via own goal/review | denied |
| `performance_goals` | all rows | direct-report only | own only | denied |
| `performance_reviews` | all rows | direct-report only | own only | denied |

Phase 13 follow-up: employee goal progress updates are exposed only through the audited `updateOwnGoalProgress` Server Action. Direct table mutation remains blocked; targeted E2E verifies Alice can update her own goal and cannot craft an update against another employee's goal.

Phase 13 follow-up: admin employee profiles can generate Supabase recovery links for first login/password reset support. The link is shown only in the current admin session and every generation writes `auth.password_reset_link_generated` to `audit_logs`. Public `/forgot-password` uses Supabase's normal recovery-email flow and returns non-enumerating success copy.

Direct-query RLS checks now also cover non-performance sensitive boundaries:

| Check | Result |
|---|---|
| Manager sees own + direct-report profiles only | PASS |
| Employee sees own profile only | PASS |
| Manager sees own + direct-report employee records only | PASS |
| Employee sees own employee record only | PASS |
| Manager and employee cannot select `employee_compensation` rows | PASS |
| Manager cannot select payroll change requests | PASS |
| Employee cannot select audit logs | PASS |
| Employee cannot insert audit logs directly | PASS |
| Admin cannot update/delete audit logs directly | PASS |
| Employee cannot view or complete another employee's onboarding task by forged ID | PASS |
| Employee cannot select another employee's document metadata | PASS |

## Verified — Authenticated Browser Runtime

| Check | Result |
|---|---|
| Admin, manager, employee login fixtures | PASS |
| Role route allow/deny smoke tests | PASS |
| Performance mutation workflows and audit assertions | PASS |
| Document upload and signed URL download | PASS |
| Raw Storage path denied without signed token | PASS |
| Signed URL expires after 60 seconds | PASS |
| Leave submit audit assertion | PASS |
| Payroll change request audit assertion | PASS |
| `handle_new_user` profile creation trigger | PASS |
| `sync_role_to_jwt` role metadata trigger | PASS |

---

## Verified — Sensitive Data

| Check | Result |
|---|---|
| Employee dashboard sourced from `getOwnCompensationSummary()` (salary/pay-freq/date only) | PASS |
| Manager dashboard has no compensation/bank/tax queries | PASS |
| Documents signed URL uses 60s expiry | PASS — `documents.ts` |
| Manager Storage policy blocks `payslip`, `id_document`, `contract` categories | PASS — migration `0014` |
| Performance tables have no compensation/bank/tax columns | PASS |

---

## Dependency Audit

Command: `npm audit --audit-level=moderate`

Result: **Residual advisory — cannot remediate without breaking change**.

Finding: `postcss <8.5.10` moderate advisory via `next@16.2.4`'s nested dependency tree.

Resolution: `npm audit fix --force` proposes downgrading Next to `9.3.3`. Do not apply. Track the upstream Next.js release for a compatible PostCSS fix and retest on upgrade.

---

## Remaining Checks

None open for the v1 MVP. Session 31 completed the keyboard/focus pass and responsive visual regression pass.

External watch item: re-run `npm audit --audit-level=moderate` after the next compatible Next.js/PostCSS update.
