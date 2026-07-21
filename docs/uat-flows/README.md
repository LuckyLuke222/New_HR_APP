# KushHR UAT Flows

Focused, end-to-end manual review scripts. Each flow walks one business scenario from start to finish across the roles involved, in 20–40 minutes by one person. The point is to catch real product issues without the fatigue of a full-app pass.

## Scope vs. the comprehensive doc

`docs/checks/phase-13.md` § "Comprehensive Manual User Flow Scenarios (2026-05-09)" is the **exhaustive reference** — ~140 scenarios across every page, every role, every guardrail. Use it as the safety net for pre-pilot full passes.

`userflow.doc` (at the repo root) is the **flow-inventory + HRMS-comparison work plan**. It enumerates every flow the app should support (admin / manager / employee / negative-security paths) plus a plan for comparing KushHR against Frappe HRMS, BambooHR, and HiBob. Most of its UAT-shaped material is folded into the focused scripts here; specifically Task 1.5 (negative / security flows) became `security-and-rbac-guards.md`, Phase 4 "Multi-year leave deducts from correct yearly balances" became a step in `leave-request-lifecycle.md`, and Phase 4 "Rehire or reactivation" became a step in `employee-profile-lifecycle.md`. The remaining content in `userflow.doc` is research scope (matrix-building, product comparison) — it produces inputs for the product backlog, not a rotation script.

The files in this folder are the **working scripts** — they pick the highest-value lifecycle for each module and run it once, in order. They are not a replacement for the comprehensive doc; they are the rotation you run between full passes.

## The flows

| # | File | Time | Roles | Primary value |
|---|---|---|---|---|
| 1 | [leave-request-lifecycle.md](leave-request-lifecycle.md) | 30 min | employee → manager → admin | Approval / rejection / urgent leave / balance decrement |
| 2 | [new-hire-onboarding.md](new-hire-onboarding.md) | 35 min | admin → employee | Create employee → first login → assigned tasks → completion |
| 3 | [performance-cycle.md](performance-cycle.md) | 40 min | admin → manager → employee | Cycle → goal → self-review → manager appraisal → acknowledgment |
| 4 | [payroll.md](payroll.md) | 20 min | employee → manager → admin | Self-edit non-salary fields, manager view-only summary, admin full record |
| 5 | [document-upload.md](document-upload.md) | 20 min | employee → admin | Upload → category policy → signed download → soft delete |
| 6 | [password-reset.md](password-reset.md) | 20 min | unauthenticated → admin → employee | Forgot password → admin-generated recovery link → set new password → sign in |
| 7 | [employee-profile-lifecycle.md](employee-profile-lifecycle.md) | 30 min | admin (+ employee self-view) | Create → edit job/dept/manager → role change → terminate → directory effect |
| 8 | [leave-admin-and-rollover.md](leave-admin-and-rollover.md) | 30 min | admin | Settings policy defaults → leave type/balance admin → year rollover → per-request auto-seed |
| 9 | [security-and-rbac-guards.md](security-and-rbac-guards.md) | 25 min | every role | Negative paths — every place a role is supposed to be blocked. Derived from `userflow.doc` § Task 1.5. |

## Recommended rotation

Pick **one flow per week** while the product is in active development. Rotate through the nine in order; finishing the loop is ~2 months. If a flow surfaces an issue, log it against the relevant module — don't pause the rotation, the other flows still need attention.

The security/RBAC flow (#9) is the cheapest insurance against an RLS or `requireRole` regression — consider running it more often than weekly (e.g. before every release) since it's only 25 minutes and the failure modes are critical.

Before any milestone (pilot, internal demo, external review):

- Run **every flow** at least once.
- Run `npm run cleanup:e2e-data:dry-run` after each flow; it should report 0 targeted artifacts. If a flow produced UAT artifacts (e.g. a UAT employee, a UAT leave type) that should not persist, clean them up manually via the admin UI before the next flow.
- Capture **two screenshots per flow**: one from the actor's success state, one from the audit log entry that proves the action happened.

## Before-pilot checklist

Run this once, in one sitting, before any pilot deployment:

- [ ] Full Playwright suite green (`lsof -ti:3000 | xargs kill 2>/dev/null && npm run cleanup:e2e-data && npx playwright test --reporter=line`).
- [ ] Every flow in this folder run once in the last 7 days, with the audit-log evidence captured.
- [ ] Cleanup dry run reports 0 targeted artifacts.
- [ ] Comprehensive UAT scenarios in `docs/checks/phase-13.md` reviewed for any item that has not yet been hand-tested in production-shape data.
- [ ] At least one [non-developer usability test](#non-developer-usability-test-template) recorded.

## Non-developer usability test template

The flow scripts assume the tester knows the product. Once a quarter, find someone who doesn't — preferably an HR or operations person who has never used KushHR.

**Setup**: 10 minutes. Browser open at `/login`. Seed credentials for an employee account (Alice). Don't explain the app.

**Task**: "Submit a leave request, and then check whether your manager has seen it."

**What to record**:

- Where did they hesitate or look confused?
- Did they find Forgot Password without help?
- Did they understand which fields were required?
- After submitting, did they know how to check the status? Did they look in the right place (dashboard? leave page? email?)?
- Did they notice the dashboard "Recent updates" or "Action items" panels at all, or did they re-navigate via the menu?
- Any vocabulary they didn't recognise ("Local Leave", "MUR", "Direct report")?

Write what they said and did. **Do not coach.** The point is to see the product through fresh eyes.

A 10-minute session usually surfaces 1–3 things that no rotation flow ever catches.

## Conventions inside each flow file

- **Preconditions** — exact seed users and any data state required before starting.
- **Steps** — numbered, with a clear pass/fail outcome per step.
- **Audit log events to verify** — exact action strings, plus where to filter.
- **What to check on the next dashboard refresh** — verifies feedback loops, not just the primary action.
- **Cleanup** — what to delete via the admin UI and a pointer to `npm run cleanup:e2e-data` for the script-driven cleanup of any Playwright-style fixtures left behind.

Use a fresh seed reset (`supabase db reset`) if a flow drifts the seed state in a way that affects subsequent flows. Otherwise rotate freely.
