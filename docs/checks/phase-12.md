# Phase 12 Exit Checks — Hardening

Date: 2026-04-28
Status: **PASS** — static, code-review, authenticated route/role smoke checks, mutation workflows, direct RLS checks, and trigger checks complete.

---

## Static Checks

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 22 routes |
| `npm run test:e2e` | PASS — 3/3 |
| `npx playwright test --reporter=list` | PASS — 47/47 |
| `npm audit --audit-level=moderate` | Residual — PostCSS advisory via Next (do not force-fix) |

---

## Security Hardening

| Check | Result |
|---|---|
| Raw DB error messages not returned to client | PASS — fixed in `onboarding.ts` and `performance.ts` |
| All 35 Server Action entry points have `requireRole()` | PASS |
| Service-role client guarded by `server-only` | PASS |
| No `NEXT_PUBLIC_` prefix on secrets | PASS |
| `.env.example` accurate and complete | PASS |

### Fix Applied

**Finding**: `src/server/actions/onboarding.ts` and `src/server/actions/performance.ts` returned raw `PostgrestError.message` to the client on unexpected DB errors. This can expose table names, constraint names, and schema details.

**Resolution**: All `error.message` / `itemErr.message` / `taskError.message` returns in both files replaced with `"An unexpected error occurred. Please try again."`. Full error object logged server-side via `console.error`.

Lines changed:
- `onboarding.ts`: 10 instances (L50, L90, L139, L170, L226, L246, L318, L356, L384, L416)
- `performance.ts`: 6 instances (L81, L180, L217, L302, L374, L427)

---

## Error Boundary

| Check | Result |
|---|---|
| `src/app/(app)/error.tsx` created | PASS |
| Shows digest reference only (no stack trace) | PASS |
| Has retry button using `unstable_retry` | PASS |
| Is a Client Component (`"use client"`) | PASS |

---

## Loading States

| Route | Loading State | Status |
|---|---|---|
| `/dashboard` | `dashboard/loading.tsx` | Pre-existing |
| `/audit-logs` | `audit-logs/loading.tsx` | Pre-existing |
| `/employees` | `employees/loading.tsx` | Pre-existing |
| `/employees/[id]` | `employees/[id]/loading.tsx` | Added Phase 12 |
| `/departments` | `departments/loading.tsx` | Pre-existing |
| `/documents` | `documents/loading.tsx` | Pre-existing |
| `/leave` | `leave/loading.tsx` | Pre-existing |
| `/leave/admin` | `leave/admin/loading.tsx` | Added Phase 12 |
| `/onboarding` | `onboarding/loading.tsx` | Pre-existing |
| `/onboarding/admin` | `onboarding/admin/loading.tsx` | Added Phase 12 |
| `/payroll` | `payroll/loading.tsx` | Pre-existing |
| `/payroll/change-requests` | `payroll/change-requests/loading.tsx` | Added Phase 12 |
| `/performance` | `performance/loading.tsx` | Pre-existing |
| `/performance/reviews` | `performance/reviews/loading.tsx` | Pre-existing |

---

## Documentation Delivered

| File | Status |
|---|---|
| `docs/security-review.md` | Rewritten — Phase 12 findings, resolutions, deferred list |
| `docs/qa-report.md` | Rewritten — 22-route build, loading/empty state coverage, phase summary |
| `docs/final-handover.md` | Rewritten — complete project state, all modules, next steps |
| `README.md` | Updated — Phase 12 complete, MVP description |
| `handover.md` | Session 24 appended |
| `docs/current-phase.md` | Phase 12 marked Complete |

---

## Authenticated Browser Runtime

| Check | Rationale |
|---|---|
| Playwright auth fixtures for admin, manager, employee | PASS |
| Admin route access and employee directory visibility | PASS |
| Manager route access/denial and direct-report scope smoke | PASS |
| Employee route access/denial, own profile, leave balance smoke | PASS |
| Performance route smoke for admin, manager, employee | PASS |
| Admin creates performance review cycle and employee goal | PASS |
| Manager creates direct-report goal and submits appraisal | PASS |
| Employee submits self-review and acknowledges manager review | PASS |
| Performance audit-log assertions after mutations | PASS |
| Employee uploads document | PASS |
| Signed document URL downloads successfully | PASS |
| Raw Storage path is denied | PASS |
| Signed document URL expires after 60 seconds | PASS |
| Employee submits leave request with audit assertion | PASS |
| Employee submits payroll change request with audit assertion | PASS |
| Direct RLS: manager/employee profile and employee-record scope | PASS |
| Direct RLS: payroll compensation and change-request sensitivity | PASS |
| Direct RLS: audit-log non-admin select/insert denial and update/delete denial | PASS |
| Direct RLS: forged onboarding task completion blocked | PASS |
| Direct RLS: employee cannot select another employee's document metadata | PASS |
| Trigger: `handle_new_user` creates profile on Auth user creation | PASS |
| Trigger: `sync_role_to_jwt` mirrors profile role into Auth app metadata | PASS |

### Auth Fix Applied

The SQL-seeded Auth users could not sign in through GoTrue. Two remote DB fixes were applied:

- Added missing `auth.identities` rows for the four seed users.
- Normalized nullable `auth.users` token string fields to empty strings and regenerated password hashes with bcrypt cost 10.

After that, Supabase password sign-in returned 200 for admin, manager, and Alice, and Playwright auth setup passed.

### Performance Mutation Fix Applied

The authenticated mutation tests exposed a server-side validation mismatch: deterministic seed user IDs are accepted by Postgres `uuid`, but Zod's strict `.uuid()` validator rejects UUIDs without an RFC version nibble. Performance Server Actions now validate against Postgres UUID shape instead, keeping the application validator aligned with the database contract.

The same validator alignment was extended to other Server Actions that accept profile/user IDs: documents upload, compensation upsert, onboarding assignment, employee update/self-update, department manager selection, and leave balance updates.

### Seed Auth Fix Codified

`supabase/seed.sql` now creates matching `auth.identities` rows and initializes GoTrue token string fields to empty strings for the deterministic demo users. This codifies the remote Auth repair that fixed the prior `Database error querying schema` / seed login failure.

---

## Remaining Recommended Follow-Up

None open for the v1 MVP.

Session 31 completed the keyboard/focus pass and responsive visual regression pass. The PostCSS advisory remains an external dependency watch item; re-run `npm audit --audit-level=moderate` after the next compatible Next.js/PostCSS release.
