# QA Report

Date: 2026-04-28
Phase: 12 — Hardening (final)

## Summary

Status: **PASS — static, smoke, authenticated role, mutation workflow, RLS, accessibility, and responsive checks pass.**

---

## Static Checks

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 22 routes |
| `npx playwright test --reporter=list` | PASS — 47/47 |
| `npm audit --audit-level=moderate` | Residual — known PostCSS advisory via Next (see security-review.md) |

---

## Build Route Count

22 routes confirmed in production build:

- `/` (static)
- `/login` (static)
- `/_not-found`
- `/access-denied`
- `/audit-logs`
- `/dashboard`
- `/departments`
- `/documents`
- `/employees`
- `/employees/[id]`
- `/employees/[id]/edit`
- `/employees/new`
- `/leave`
- `/leave/admin`
- `/leave/new`
- `/onboarding`
- `/onboarding/admin`
- `/payroll`
- `/payroll/change-requests`
- `/performance`
- `/performance/reviews`
- `/settings`

---

## E2E Smoke Coverage

`tests/e2e/smoke.spec.ts` covers:

1. Protected `/dashboard` route redirects anonymous users to `/login`.
2. All 15 core protected routes redirect anonymous users to `/login?next=...`:
   - `/audit-logs`, `/departments`, `/documents`, `/employees`, `/employees/new`, `/leave`, `/leave/admin`, `/leave/new`, `/onboarding`, `/onboarding/admin`, `/payroll`, `/payroll/change-requests`, `/performance`, `/performance/reviews`, `/settings`
3. `/login` renders on mobile viewport (375px).

## Authenticated Workflow Coverage

`tests/e2e/auth.setup.ts` logs in seeded admin, manager, and employee accounts and saves storage states.

Authenticated tests cover:

- Admin route access and employee directory visibility.
- Manager route access/denial and direct-report visibility.
- Employee route access/denial, own profile, leave balance, and payroll summary visibility.
- Performance cycle creation, goal creation, manager appraisal submission, employee self-review, and acknowledgement.
- Document upload, signed URL download, raw Storage path denial, and signed URL expiry.
- Leave submission and payroll change request submission with audit-log assertions.
- Direct RLS checks for profiles, employee records, document metadata, sensitive payroll tables, audit logs, and forged onboarding task completion.
- Auth trigger checks for profile creation and JWT role sync.

---

## Loading States Coverage

| Route | Loading State |
|---|---|
| `/dashboard` | PASS |
| `/audit-logs` | PASS |
| `/employees` | PASS |
| `/employees/[id]` | PASS (added Phase 12) |
| `/departments` | PASS |
| `/documents` | PASS |
| `/leave` | PASS |
| `/leave/admin` | PASS (added Phase 12) |
| `/onboarding` | PASS |
| `/onboarding/admin` | PASS (added Phase 12) |
| `/payroll` | PASS |
| `/payroll/change-requests` | PASS (added Phase 12) |
| `/performance` | PASS |
| `/performance/reviews` | PASS |

---

## Empty State Coverage

All list/table views include empty states:

- Employees list: "No employees found"
- Leave list: "No leave requests found"
- Audit logs: "No audit events found"
- Documents: "No documents found"
- Departments: "No departments yet"
- Payroll compensation: "No compensation record on file"
- Dashboard widgets: per-widget empty messages for out-of-office, balances, recent docs, audit events
- Onboarding task list: empty template/task states

---

## Error Boundary Coverage

Added `src/app/(app)/error.tsx` — catches unhandled Server Component errors and shows a recoverable fallback with a digest reference (no stack trace exposed to client).

---

## Phase-by-Phase Exit Check Status

| Phase | Status |
|---|---|
| Phase 0 — Research | Complete |
| Phase 1 — Architecture | Complete |
| Phase 2 — Scaffold | Complete |
| Phase 3 — Schema/RLS | Complete (direct RLS and trigger checks PASS) |
| Phase 4 — Auth/RBAC | Complete (authenticated fixtures PASS) |
| Phase 5 — Employee Directory | Complete (route/role smoke PASS) |
| Phase 6 — Leave | Complete (leave submit audit workflow PASS) |
| Phase 7 — Documents | Complete (upload/download/raw-path/expiry workflow PASS) |
| Phase 8 — Payroll | Complete (employee change request audit workflow PASS) |
| Phase 9 — Onboarding | Complete — QA/Security/UI/UX agents all PASS |
| Phase 10 — Dashboards/Audit | Complete (route smoke and direct audit-log RLS checks PASS) |
| Phase 11 — Performance | Complete — SQL/RLS/code-review/browser workflow verified |
| Phase 12 — Hardening | **PASS** — this report |

---

## Remaining QA Gaps

None open for the v1 MVP. Post-Phase-12 QA completed the audit-log filter depth check, keyboard/focus pass, and responsive visual regression pass.

External watch item: re-run `npm audit --audit-level=moderate` after the next compatible Next.js/PostCSS release.
