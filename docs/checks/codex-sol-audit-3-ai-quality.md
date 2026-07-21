# Sol Audit 3 — AI-Authorship Failure Modes and Maintainability

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## 1. Executive summary and posture

KushHR is unusually well documented for an AI-built application and contains many explicit defensive comments, targeted tests, and state-ownership notes. I found no hallucinated Next.js 16 entry-point convention: `src/proxy.ts` is correct for the installed framework, and authorization is repeated in actions rather than trusted to Proxy alone.

The maintainability posture is nevertheless **fragile**. The codebase shows multi-session accretion: four very large action/DAL files, hundreds of unchecked database casts, two copies of important business calculations, and near-identical action twins that received different race/audit fixes. The dominant failure mode is not “obviously bad generated code”; it is plausible, heavily commented code whose invariant was fixed in one path but not propagated to its siblings.

## 2. AI-authorship pattern summary

### Pattern A — Copy-paste twins diverge after a fix

- **Leave decision twins:** approve/reject perform conditional updates without verifying an affected row (`src/server/actions/leave.ts:600-633`, `:741-764`), while cancel documents and implements the required select-back guard (`src/server/actions/leave.ts:873-900`).
- **No-op admin mutations:** onboarding toggle/delete paths (`src/server/actions/onboarding.ts:112-148`, `:617-644`) and leave toggles (`src/server/actions/leave.ts:1155-1199`, `:1753-1791`) repeat the “no error means success” mistake.
- **Validation twins:** performance, leave, compensation, and documents call `logValidationFailed`; app settings, departments, employees, and onboarding return structurally similar validation errors without it (for example `src/server/actions/employees.ts:393-401`, `src/server/actions/onboarding.ts:379-387`).

**Class fix:** create one mutation result primitive that distinguishes error / zero rows / one row and one parse-and-audit primitive. Ban naked `update(...).eq(...)` and `delete(...).eq(...)` in action files with an ESLint/custom AST check.

### Pattern B — Redundant caller state drifts from authoritative state

- Existing performance-goal update scopes the actual goal owner but audits the redundant form employee (`src/server/actions/performance.ts:442-464`, `:513-529`).
- `deducted_days` is described as frozen state but refund re-derives per-year days from the current holiday table (`supabase/migrations/0042_leave_working_days_and_refund.sql:7-16`, `:220-251`).
- Role is copied to Auth metadata (`supabase/migrations/0013_role_sync.sql:1-27`) even though both app authorization and RLS read the profile DB row (`src/lib/supabase/helpers.ts:28-54`, `supabase/migrations/0002_profiles_departments.sql:24-33`). The copy is currently harmless but adds reconciliation surface.

**Class fix:** derive audit/projection fields from the row that committed. Store exactly the state needed to reverse a ledger operation. Remove unused derived security state or add a reconciliation check and name it explicitly as a cache.

### Pattern C — Service-role DALs encode trust in comments, not types

- Arbitrary-ID functions `getMyTasks(employeeId)` and `getDirectReportIds(managerId)` bypass RLS (`src/server/dal/onboarding.ts:107-142`, `:287-294`).
- `getCompensationSummary(employeeId)` reads an arbitrary salary summary; safety rests on the current caller (`src/server/dal/compensation.ts:72-97`, comments at `:100-118`).
- `getEmployeesNeedingAttention()` reads compensation-presence fields with service role and states in a comment that callers are admin (`src/server/dal/employees.ts:535-585`).

**Class fix:** make service APIs viewer-aware (`getCompensationSummary(viewer, target)`) and perform authorization inside the boundary, or accept branded IDs produced only by an authorization function. Prefer session RLS/DB projection where possible.

### Pattern D — Commentary density exceeds invariant enforcement

- `handle_leave_refund` comments promise a verbatim frozen refund but the SQL recomputes it (`supabase/migrations/0042_leave_working_days_and_refund.sql:7-16`, `:220-251`).
- `assertCycleNotDeadlineLocked` says it protects writes but returns “allowed” on lookup error/not-found because the query error is ignored (`src/server/actions/performance.ts:1422-1445`).
- Storage comments say policies guard direct access while the direct employee insert policy intentionally omits category enforcement (`supabase/migrations/0015_storage_documents.sql:1-6`, `:44-52`).

**Class fix:** convert security comments into constraints, transaction functions, and negative tests. Comments should explain why a machine-enforced invariant exists, not substitute for it.

### Pattern E — Framework use is correct, but data-access style is mixed

The installed Next 16 docs recommend a server-only DAL, authorization close to the data source, and React `cache` for render-pass session memoization. Proxy naming/export is correct (`src/proxy.ts:1-12`), and Server Actions re-authorize. But data access is split among session DALs, service-role DALs, actions, Server Components, and security-definer RPCs without one enforceable rule. Examples include direct queries in `src/server/dal/dashboard.ts:109+`, service hydration in `src/server/dal/performance.ts:203-324`, and action-owned business logic in `src/server/actions/leave.ts:167-1914`.

**Class fix:** choose a documented pattern: thin actions → viewer-aware domain service/RPC → typed DTO. Restrict service-role creation to that layer.

## 3. Ranked findings

### NEEDS-FIX — Positive audit tests largely do not prove the current action logged

**Evidence:** `expectAudit` leaves `since` optional (`tests/e2e/helpers.ts:141-158`). Only 2 of 44 call sites pass it; examples with neither timestamp nor entity ID are `tests/e2e/manager.spec.ts:474`, `tests/e2e/employee.spec.ts:694`, `:742`, and `tests/e2e/admin.spec.ts:367`, `:1440`, `:1517`, `:2592`. Cleanup failure does not fail the suite (`tests/e2e/global-teardown.ts:29-40`).

**Concrete wrong-output trace:** remove the audit call from compensation self-update while an old `compensation.self_updated` row remains. The UI operation passes and `expectAudit('compensation.self_updated')` finds the stale row. The security regression ships with green E2E.

**Fix:** require `{action, actorId, since, entityId?}`; snapshot time before submit and query a unique event after it. Make teardown isolation failure visible. The deny helper already demonstrates the better pattern.

### NEEDS-FIX — Database access is effectively untyped

**Evidence:** neither Supabase client is instantiated with a generated `Database` type (`src/lib/supabase/server.ts:7-30`, `src/lib/supabase/admin.ts:6-18`). A source scan found 338 `as string` assertions; representative concentrated casts are `src/server/dal/onboarding.ts:80-100`, `:172-184`, and `src/server/dal/performance.ts:224-285`.

**Concrete wrong-output trace:** a migration renames or makes nullable a selected field. TypeScript still accepts `row.field as string`; runtime mapping returns `undefined` under a declared non-null DTO, and downstream string operations or audit metadata fail only in a user path.

**Fix:** generate Supabase schema types in CI, parameterize both clients, type RPC results, and remove `Record<string, unknown>` row plumbing. Treat generated-type diffs as migration review artifacts.

### NEEDS-FIX — Employee update violates transactional state ownership

**Evidence:** profile/role commits first (`src/server/actions/employees.ts:419-428`), employee record commits separately (`:435-455`), and audit happens last (`:458-469`).

**Concrete wrong-output trace:** a mismatched record ID makes the second write fail after a role change. UI reports failure, profile/JWT role changed, job record did not, and the success audit is absent.

**Fix:** one transactional database command for the relational rows plus durable reconciliation for Auth metadata. See Audit 1 for authorization impact.

### NEEDS-FIX — Goal creation returns success after dependent review bootstrap fails

**Evidence:** goal insert commits at `src/server/actions/performance.ts:569-575`; review bootstrap failure is only logged at `:577-607`; goal success/audit follows at `:610-634`.

**Concrete wrong-output trace:** a review insert fails because of a constraint or permission regression. The manager sees “goal created,” but the appraisal workspace has no corresponding review row and the only signal is console output.

**Fix:** either make goal+review+audits one transaction or make review creation an explicit idempotent outbox job with surfaced retry state. Do not call a dependent write “best effort” when later product behavior assumes it exists.

### NEEDS-FIX — Working-day logic has two implementations and the reversal is already wrong

**Evidence:** TypeScript mirror is acknowledged at `src/server/actions/leave.ts:1009-1073`; SQL owner is `supabase/migrations/0042_leave_working_days_and_refund.sql:44-66`; refund recomputes from current source at `:220-251` despite the frozen-state contract at `:7-16`.

**Concrete wrong-output trace:** approve five working days, add a holiday retroactively, then cancel. The approval debited five; refund recomputes four, leaving a one-day loss.

**Fix:** one DB function should own preview, validation, debit, and reversal semantics. Store the per-year debit ledger used at approval and refund that ledger exactly.

### NEEDS-FIX — Very large action files concentrate unrelated invariants

**Evidence:** `src/server/actions/leave.ts` is 1,914 lines, `performance.ts` 1,526, `employees.ts` 834, and `onboarding.ts` 644; `src/server/dal/dashboard.ts` is 899. The approve/reject drift and missing deadline check are concrete consequences within these files.

**Concrete wrong-output trace:** a developer finds and fixes zero-row handling in cancellation but misses the two decision functions hundreds of lines away; that is the current state.

**Fix:** split by capability, not arbitrary line count: leave request lifecycle, balance administration, holiday administration, and working-day service; performance cycles, goals, reviews. Keep shared transition helpers adjacent and tested once.

### NIT — The codebase contains orphan UI/dependencies and starter assets

**Evidence:** `src/components/ui/sonner.tsx:1-4` is the only source import of `next-themes` and `sonner`; no file imports that component. Both remain dependencies at `package.json:37`, `:42`. `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, and `window.svg` have no source references.

**Concrete wrong-output:** no runtime defect; they add install/audit surface and falsely suggest a toast/theme system exists.

**Fix:** remove the orphan component, two dependencies, and starter assets after confirming no external/static references.

## Simpler rewrite example

Current leave decision flows duplicate roughly 150 lines each for load → scope → conditional update → audit → email. The state transition itself can be a typed DB function returning the committed event:

```ts
export async function decideLeave(formData: FormData) {
  const actor = await requireRole(["admin", "manager"]);
  const input = await parseAudited(decisionSchema, formData, actor, "leave.decide");
  if (!input.ok) return input.error;

  const result = await leaveTransitions.decide({
    actorId: actor.id,
    actorRole: actor.role,
    requestId: input.value.requestId,
    decision: input.value.decision,
    note: input.value.approverNote,
  }); // DB transaction: scope + status CAS + balance trigger + audit

  if (!result.ok) return actionError(result);
  await notifications.enqueue(result.event);
  return { success: true, message: result.message };
}
```

One ~45-line adapter plus a ~70-line transactional function replaces two ~150-line action bodies and centralizes the race/audit invariant: approximately **300 → 115 lines (-185)** before tests. The goal is not abstraction for its own sake; it is one owner for one transition.

## 4. Dead-code / unused-dependency list

| Item | Evidence | Verdict |
|---|---|---|
| `src/components/ui/sonner.tsx` | No imports; only place using theme/toaster packages. | Orphan. |
| `next-themes`, `sonner` | `package.json:37`, `:42`; only referenced by orphan module. | Unused runtime dependencies. |
| Default `public/*.svg` starter assets | No source references found. | Likely removable NIT. |
| JWT role mirror | Written by migration 0013; no `auth.jwt()` role read in migrations/source authorization. | Not dead in Auth payload, but operationally unused derived state; document/remove/reconcile. |

## 5. Could not verify

- **UNVERIFIED:** tree-shaking may exclude the orphan Sonner module completely; no production bundle was built in this read-only pass.
- **UNVERIFIED:** repository settings may enforce reviews, CODEOWNERS-like ownership, Dependabot, or branch protections that are not stored in the checkout.
- **UNVERIFIED:** generated DB types may exist outside `src/` or be produced only in an uncommitted operator workflow; neither client uses them here.
- I verified Next behavior against the installed `node_modules/next/dist/docs/` guidance, not memory. No modified-Next API misuse was found in the audited entry points.
