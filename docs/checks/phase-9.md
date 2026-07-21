# Phase 9 Exit Checks — Onboarding

Date: 2026-04-28
Agents run: QA Agent, Security Agent, UI/UX Agent

---

## Initial Agent Result

Status: **FAIL** before fixes.

### QA Findings

| Finding | Severity | Resolution |
|---|---:|---|
| Managers/admins could complete tasks by submitting a forged `taskId` to the Server Action. | High | `completeTask` is now employee-only and validates task ownership before updating. |
| Task list showed `Mark complete` for admins/managers. | High | Completion UI is now rendered only for employee task lists. |
| Empty template set could call `.in("template_id", ["none"])`, causing invalid UUID errors. | High | Template item query is skipped when no templates exist. |

QA baseline checks before fixes:

- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `npm run test:e2e`: PASS

### Security Findings

| Finding | Severity | Resolution |
|---|---:|---|
| `completeTask` used a service-role update after insufficient role scoping. | High | Server Action now allows only employees, verifies own task, and uses a filtered pending-only update. |
| Direct authenticated `update` grant on `onboarding_tasks` allowed field mutation beyond task completion intent. | High | Migration `0017` revokes authenticated update and drops update policies on onboarding tasks. |
| Template assignment insert used service role after manager pre-check. | Medium | Assignment inserts now use the session client so insert RLS is enforced at write time. |
| Template item creation lacked audit coverage. | Low | `onboarding.template_item_created` audit log added. |
| Permission-boundary E2E tests are missing. | Low | Deferred to Phase 12 hardening test coverage. |

### UI/UX Findings

| Finding | Severity | Resolution |
|---|---:|---|
| Admin/manager task lists exposed `Mark complete`. | High | Completion action is employee-only in UI. |
| No empty state when no employees are assignable. | Medium | Assignment form now shows a clear empty state. |
| Template load errors were hidden from managers. | Medium | Assignment page now surfaces template load errors before rendering assignment UI. |
| Mode switcher lacked selected-state semantics. | Low | Added `aria-pressed` to the mode buttons. |

---

## Final Verification

| Check | Result |
|---|---|
| Lint | PASS |
| Type check | PASS |
| Build | PASS — 20 routes |
| E2E smoke tests | PASS — 2/2 |

---

## Review Agent — PASS

| Check | Result |
|---|---|
| MVP-sized scope | PASS — templates, assignments, completion, and progress only. |
| Architecture | PASS — Server Components fetch role-scoped data; Server Actions own mutations. |
| Naming consistency | PASS — onboarding actions/DAL/components follow existing phase patterns. |
| Migration quality | PASS — security hardening is additive and scoped to onboarding tasks. |
| Maintainability | PASS — no new broad abstraction introduced. |
| Overbuilt items | PASS — no automation, reminder workflows, or complex onboarding stages added. |

Deferred review note:

- Permission-boundary E2E coverage should be added in Phase 11 rather than expanding Phase 9 beyond MVP scope.

---

## Security Notes

- Admin and manager task assignment is still allowed, but insertion uses the request session client so RLS policies enforce admin/direct-report scope.
- Employee completion is application-authorized and owner-scoped; direct authenticated updates to onboarding tasks are revoked.
- `auth.access_denied` audit coverage exists for manager assignment outside reporting line and employee completion attempts on another user’s task.
- Remaining work for Phase 12: add dedicated permission-boundary tests for forged task assignment/completion attempts.

---

## Summary

**Phase 9 status: APPROVED for exit after fixes.**

The onboarding module is MVP-sized, role-scoped, and aligned with the Phase 9 plan: admins/managers can assign tasks, employees can complete their own tasks, and admin/manager progress views include empty/loading/error states.
