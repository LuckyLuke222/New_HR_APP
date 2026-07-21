# AI-Built App Risk Audit

Date: 2026-04-29
Source audit file: `deep-research-report-summary.md`

## Decision

**GO WITH RESIDUAL EXTERNAL WATCH**

The project has a strong security and systems-thinking foundation: server-only service-role usage, role-checked Server Actions, Supabase RLS, private Storage, audit logging, and focused E2E/RLS tests. The original audit blocker, authenticated Playwright browser setup, and the Phase 13 remediation items have been resolved. The remaining condition is an upstream Next/PostCSS advisory that has no acceptable force-fix path.

## Evidence Gathered

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — 22 routes |
| `npm audit --audit-level=moderate` | FAIL — known PostCSS advisory through `next@16.2.4`; force fix downgrades Next to `9.3.3` |
| `npx playwright test --project=setup --reporter=list --workers=1` | PASS — 3/3 |
| `npx playwright test --reporter=list --workers=1` | PASS — 50/50 |

## System Map

| Surface | Evidence |
|---|---|
| Public app routes | `src/app/(app)/*`, protected by `src/proxy.ts` and page-level `requireRole()` |
| Server Actions | 35 exported action entry points across departments, documents, employees, leave, onboarding, payroll, performance |
| Auth/session | `src/lib/supabase/helpers.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts` |
| Service-role access | `src/lib/supabase/admin.ts`, `src/server/audit.ts`, selected server-only DAL/actions |
| Sensitive data | payroll compensation, documents, audit logs, employee records, leave, onboarding, performance reviews |
| DB authorization | Supabase migrations with RLS policies in `supabase/migrations/` |
| Runtime verification | `tests/e2e/*.spec.ts`, including direct RLS checks and role storage states |

## Findings

| Section | Issue | Severity | Evidence | Risk Type | Fix |
|---|---|---:|---|---|---|
| Verification burden | Full authenticated Playwright suite previously failed at auth setup. | Resolved | Manual browser login was confirmed by the user on 2026-04-29. `tests/e2e/auth.setup.ts` now signs in through Supabase Auth and writes role storage states directly. `npx playwright test --project=setup --reporter=list --workers=1` passed 3/3 and `npx playwright test --reporter=list --workers=1` passed 50/50 after added business-flow coverage. | Evidence-backed | Keep the direct storage-state auth setup; rerun the full suite before production/UAT sign-off. |
| Data integrity / feedback | Leave approval balance decrement could silently fail from the app user's perspective if no matching balance row existed. | Resolved | Migration `0020_leave_approval_missing_balance_error.sql` changes the trigger to raise an exception when no matching balance row is updated. Targeted Playwright coverage confirms approval fails visibly and the request remains pending. | Evidence-backed | Keep approval and balance decrement in the same transaction. |
| Audit feedback | Some denied business actions returned failure without an `auth.access_denied` audit log. | Resolved | Added audit logs for leave self-rejection, employee payslip upload, manager document upload, and non-employee payroll change request submission in `src/server/actions/leave.ts`, `src/server/actions/documents.ts`, and `src/server/actions/compensation.ts`. | Evidence-backed | Keep denied sensitive actions paired with `auth.access_denied`; add representative runtime assertions when those flows become UI-reachable. |
| Supply chain | Two dependencies appeared unused in source. | Resolved | `react-hook-form` and `@hookform/resolvers` were removed from `package.json` and `package-lock.json`. Import scan now only finds historical documentation mentions. | Evidence-backed | Re-add only if forms adopt React Hook Form later. |
| Supply chain | Known external PostCSS advisory remains. | Medium | `npm audit --audit-level=moderate` reports `postcss <8.5.10` via `next@16.2.4`; npm proposes `npm audit fix --force` installing `next@9.3.3`. | External watch item | Do not force-fix. Re-run audit after compatible Next/PostCSS release. |
| Maintainability drift | Several files are near the "large module" threshold used by the audit source. | Low | Largest source files: `performance.ts` 469 lines, `leave.ts` 467, `employees.ts` 439, `onboarding.ts` 429, `employee-form.tsx` 424. | Heuristic | No immediate refactor required; if touched again, consider extracting shared validation/audit/action helpers. |

## Positive Evidence

| Area | Evidence |
|---|---|
| Service-role containment | `src/lib/supabase/admin.ts:1` imports `server-only`; service-role key is read only in `getServerEnv()` and passed to the admin Supabase client at `admin.ts:9-16`. |
| DB role source of truth | `getSessionUser()` reads role from `profiles` instead of trusting JWT alone: `src/lib/supabase/helpers.ts:20-41`. |
| Route/action access feedback | `requireRole()` writes `auth.access_denied` before redirecting wrong-role users: `src/lib/supabase/helpers.ts:48-73`. |
| Append-only audit helper | Audit writes go through server-only service-role helper: `src/server/audit.ts:1-29`. |
| Server Action authorization | Exported actions consistently call `requireRole()` near entry; examples: compensation `src/server/actions/compensation.ts:40-44`, documents `src/server/actions/documents.ts:45-51`, performance `src/server/actions/performance.ts:37-43`. |
| Document Storage safety | Upload path is scoped as `{employeeId}/{category}/{uuid}.{ext}` and metadata is inserted separately: `src/server/actions/documents.ts:99-130`; download first fetches metadata via session client/RLS before admin signed URL creation: `documents.ts:171-190`. |
| Private bucket and MIME allowlist | `supabase/migrations/0015_storage_documents.sql:9-23` creates private `hr-documents` bucket with allowed MIME types; storage RLS is defined at `0015:29-68`. |
| Payroll privacy | Employee payroll page calls `getOwnCompensationSummary()` only: `src/app/(app)/payroll/page.tsx:25-28`; summary excludes bank/tax/national ID in `src/server/dal/compensation.ts:87-109`. |
| Performance score/data integrity | Zod enforces score 1-5 at `src/server/actions/performance.ts:236-247`; DB duplicates this at `supabase/migrations/0018_performance_appraisals.sql:128-131`. |
| Direct RLS coverage | `tests/e2e/rls.spec.ts` verifies profile/employee scope, payroll sensitivity, audit-log non-admin denial, document metadata denial, forged onboarding denial, and auth triggers. |
| Document runtime coverage | `tests/e2e/employee.spec.ts:148-198` covers upload, metadata, signed URL, raw path denial, and signed URL expiry. |
| New-hire workflow coverage | `tests/e2e/admin.spec.ts` covers admin-created employee account, profile/job record verification, password reset for test login, onboarding assignment, new employee login, task completion, and audit evidence. |
| Manager leave approval coverage | `tests/e2e/manager.spec.ts` covers direct-report leave approval, audit evidence, leave-balance decrement, and visible failure when the balance row is missing. |

## Verification Notes

- The browser login path is confirmed manually by the user, and automated setup now uses Supabase Auth directly to create deterministic Playwright storage states.
- The Playwright config reuses an existing dev server outside CI (`playwright.config.ts:58-63`). A clean-server rerun remains useful before production/UAT sign-off.
- Existing tests are stronger than typical AI-generated test suites: they include negative RLS checks, real Supabase integration, authenticated role workflows, Storage signed URL checks, and audit-log assertions.

## AI-Specific / Generic / Platform Classification

| Type | Observed? | Notes |
|---|---|---|
| AI-specific smell | Limited | No hallucinated imports found in source, but two dependencies appear unused. No obvious fake generated features except the intentionally placeholder settings page. |
| Generic software smell amplified by AI | Yes | Some denied-action audit logging is inconsistent; large action files are nearing maintainability thresholds. |
| Platform/autonomy-control failure | Not observed in app code | No agentic tool execution or LLM runtime feature exists in KushHR. Supabase/Next dependency advisories remain external watch items. |

## Recommended Remediation Order

1. Re-run `npm audit` after the next compatible Next.js/PostCSS release.
2. Execute the manual Admin/Manager/Employee scenario script before UAT or production sign-off.

## Final Production Readiness View

KushHR is not showing the common catastrophic AI-built-app failure modes: no exposed service-role key, no public Storage bucket, no missing role-check pattern across Server Actions, no obvious dependency hallucination in imports, and meaningful direct RLS tests exist.

The production-readiness decision is **GO WITH RESIDUAL EXTERNAL WATCH**. The remaining watch item is the upstream PostCSS advisory through Next; do not apply the current forced downgrade fix.
