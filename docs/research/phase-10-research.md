# Phase 10 Research — Audit Logs And Dashboards

Date: 2026-04-28

## Sources Reviewed

- Local Next.js 16 docs:
  - `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
  - `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- Existing KushHR docs:
  - `docs/systems-thinking.md`
  - `docs/phase-plan.md`
  - `docs/current-phase.md`
  - `handover.md`

## Relevant Guidance

- Server Components may query databases directly, but data access should remain server-only.
- KushHR already uses a DAL pattern; Phase 10 should keep dashboard and audit-log reads in DAL modules and return minimal DTOs.
- Dashboard queries should avoid N+1 patterns and should not duplicate source-of-truth state.
- Audit logs are append-only: admins may read, application service paths may insert, and no app role should update or delete rows.
- Role dashboards must be scoped server-side, not merely hidden in the UI.

## Phase 10 Decisions

- Use existing source tables for dashboard metrics:
  - `employee_records` for headcount, starters, leavers.
  - `leave_requests` and `leave_balances` for leave metrics.
  - `onboarding_tasks` for onboarding metrics.
  - `documents` for employee document summaries.
  - `audit_logs` for recent security/business events.
- No new schema or derived dashboard table is needed for MVP.
- Use the request session client for role-scoped reads so RLS remains the database authorization layer.
- Use only safe payroll summary fields for employee dashboard display.
- Keep audit-log filters simple: actor UUID, action, entity, and date range.

## Risks And Deferred Work

- Current headcount trend is a simple 30-day starters/leavers view, not a historical snapshot. A real trend requires periodic snapshots or richer employment history.
- Phase 11 should add permission-boundary tests for `/audit-logs` and direct `audit_logs` update/delete denial.
- Dashboard metric accuracy should be verified with seeded live data once Auth/runtime test users are stable.
