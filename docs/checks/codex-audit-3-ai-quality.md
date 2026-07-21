# Codex Audit 3 - AI Quality / Maintainability

## 1. Exec Summary + Maintainability Posture

Overall posture: the app has unusually strong intended-design documentation and several modules follow it well, but the implementation shows classic multi-agent AI authorship drift. The risky parts are not ugly code; they are plausible-looking twins that quietly diverge: some Server Actions log validation failures and entity misses while near-neighbors do not, some selectors resolve exact IDs while others silently pick the first partial match, and side effects described as "fire-and-forget" are still awaited inline after database commits.

I did not find a new BLOCKER in this AI-quality pass that was not already covered by the prior security/schema audits. The top maintainability risks are NEEDS-FIX because they can create wrong records or misleading operational signals under realistic input. The most important cleanup theme is to replace repeated local patterns with a small number of enforced boundaries: one selector-resolution rule, one audited validation helper, and one post-commit notification path.

I read `AGENTS.md` and checked the local modified Next.js docs under `node_modules/next/dist/docs/` before judging framework usage. The relevant local docs confirm Server Functions are public POST endpoints that must authorize internally, Route Handlers are not wrapped by app error boundaries, `cookies()`/`headers()` are async, `src/proxy.ts` is the correct Next 16 convention, and `after()` from `next/server` is available for post-response work from Server Functions and Route Handlers.

## 2. AI-Authorship Pattern Summary

### Pattern: copy-paste security/observability twins drifted

Some action modules follow the security model's required validation-failure logging, while nearby modules return the same user-facing failure without the audit event. This is the kind of partial standardization AI agents often produce: the abstraction exists, but adoption depends on which file was touched last.

Representative instances:

- Good pattern: `src/server/actions/documents.ts:16` imports `logValidationFailed`, and invalid upload input is audited before return at `src/server/actions/documents.ts:109`.
- Good pattern: `src/server/actions/leave.ts:184` audits validation failure before returning field errors.
- Drifted pattern: `src/server/actions/departments.ts:47`, `src/server/actions/employees.ts:142`, and `src/server/actions/onboarding.ts:80` return validation failures through local helpers without the same audit event.

Concrete impact: a direct POST with an invalid department name, employee payload, or onboarding template payload produces a user-facing validation error but no `input.validation_failed` event, while equivalent invalid leave/document/performance inputs do. That contradicts `docs/security-model.md` and makes alerting/searches for invalid-input probing incomplete.

### Pattern: duplicate "friendly" lookup logic silently chooses first match

The selector UX and multiple Server Actions duplicate a "partial text -> first match" fallback. It looks helpful, and tests cover a happy unique partial, but the convention is not safe for HR data where names and labels collide.

Representative instances:

- Client selector chooses an exact match or first partial at `src/components/ui/searchable-select.tsx:49`, stores that in the hidden value at `src/components/ui/searchable-select.tsx:53`, and commits the first partial on blur at `src/components/ui/searchable-select.tsx:82`.
- Employee creation/update repeats server-side first-match fallback for departments and managers at `src/server/actions/employees.ts:592` and `src/server/actions/employees.ts:623`.
- The same fallback appears in document uploads, leave balances/types, performance cycles, and onboarding assignment at `src/server/actions/documents.ts:306`, `src/server/actions/leave.ts:1317`, `src/server/actions/performance.ts:1469`, and `src/server/actions/onboarding.ts:474`.

Concrete impact: with employees named "Morgan Manager" and "Morgane Lead", typing `Morg` can assign the wrong manager depending on ordering. With leave types "Local Leave" and "Local Emergency Leave", typing `Local` can update the wrong balance. The tests only prove one unique partial works: `tests/e2e/admin.spec.ts:809` and `tests/e2e/admin.spec.ts:830`.

### Pattern: comments claim non-blocking side effects, code still blocks

Email delivery is described as best-effort/fire-and-forget, but action code awaits provider calls inline after the database mutation and audit have committed. Local Next docs show `after()` is the intended post-response mechanism available here.

Representative instances:

- `src/server/email.ts:9` says delivery is inline/fire-and-forget, but `src/server/email.ts:124` awaits `fetch()` with no timeout.
- `src/server/actions/leave.ts:465` comments "Fire-and-forget email notifications" and then awaits approver/employee emails at `src/server/actions/leave.ts:486` and `src/server/actions/leave.ts:501`.
- Onboarding and performance repeat inline awaited notifications at `src/server/actions/onboarding.ts:314`, `src/server/actions/onboarding.ts:429`, `src/server/actions/performance.ts:1031`, and `src/server/actions/performance.ts:1355`.

Concrete impact: if Resend or the internal network stalls after a leave request insert/audit, the user waits on a completed state transition and may retry. For onboarding task assignment, the retry path can insert duplicate tasks because the inserts at `src/server/actions/onboarding.ts:286` and `src/server/actions/onboarding.ts:403` are not idempotent in the action.

### Pattern: scaffolded UI/dependency residue

Several shadcn/Radix-style wrappers and dependencies exist but are not wired into the app. This is low immediate risk, but it is a strong AI-authorship tell: generated component inventory remained after product code chose different primitives.

Representative instances:

- `package.json:25` keeps `@radix-ui/react-dialog`, used only by the unused wrapper `src/components/ui/dialog.tsx:4`.
- `package.json:27` keeps `@radix-ui/react-select`, used only by unused wrapper `src/components/ui/select.tsx:4`; the app uses custom/native select fields instead.
- `package.json:37` and `package.json:42` keep `next-themes` and `sonner`, used only by unused wrapper `src/components/ui/sonner.tsx:3`.

Concrete impact: no current runtime exploit found. The cost is maintenance and supply-chain surface: future contributors can reasonably assume dialogs/selects/toasts/theme support are app conventions because the wrappers and packages are present, but they are not actually mounted or imported.

### Pattern: type-system escape hatches cluster around UI/report boundaries

Most of the app uses TypeScript, but some areas lean on non-null assertions and broad casts instead of letting control flow prove invariants.

Representative instances:

- `src/app/(app)/reports/page.tsx:65` calls `getReport(activeKey!, filters)`.
- `src/app/(app)/reports/page.tsx:74` and later render paths repeatedly dereference `meta!` / `result!`.
- `src/server/dal/reports.ts:123` returns `REPORTS.find(... )!`.

Concrete impact: I did not find a present crash from these assertions because the current branches appear to maintain the invariant. The risk is future edits: TypeScript will not catch a moved render branch or unsupported report key because the assertions have taught it to stop checking.

## 3. Ranked Findings

### NEEDS-FIX: ambiguous partial selector fallback can write data to the wrong entity

Evidence:

- `src/components/ui/searchable-select.tsx:49` chooses an exact match or the first partial match, and `src/components/ui/searchable-select.tsx:53` stores it as the hidden select value.
- `src/components/ui/searchable-select.tsx:82` repeats the same first-partial commit on blur.
- Server-side twins repeat the convention at `src/server/actions/employees.ts:592`, `src/server/actions/employees.ts:623`, `src/server/actions/documents.ts:306`, `src/server/actions/leave.ts:1317`, `src/server/actions/leave.ts:1349`, `src/server/actions/performance.ts:1469`, `src/server/actions/performance.ts:1492`, `src/server/actions/onboarding.ts:474`, and `src/server/actions/onboarding.ts:496`.
- The E2E coverage proves a unique partial, not ambiguity: `tests/e2e/admin.spec.ts:809` and `tests/e2e/admin.spec.ts:830`.

Scenario: create two active employees, "Morgan Manager" and "Morgane Lead". In the employee form, type `Morg` in the manager field and blur. The hidden field can become whichever option appears first in the option list. In a no-JS/direct Server Action POST, send an empty `managerId` with `managerIdSearch=Morg`; `resolveManagerId()` can also choose the first ordered partial. The employee is saved with the wrong manager even though the input never uniquely identified that user.

Why it matters: HR entity selectors are authority-bearing inputs. "Best effort" fuzzy matching is fine for search suggestions, but not for persisted IDs.

Fix: make the hidden UUID the only authoritative hydrated value. For progressive enhancement, resolve exact labels only; for partial labels, require exactly one match or return an ambiguous-field error.

Simpler rewrite:

```ts
function exactOptionId(options: SearchableOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const matches = options.filter((option) => {
    return option.label.toLowerCase() === normalized;
  });

  return matches.length === 1 ? matches[0].value : null;
}
```

Then replace the seven bespoke `resolve*Id` helpers with one exact/unique resolver that returns a field error for zero or multiple matches. Rough delta: about -110 to -140 LOC across the action modules, plus removal of the first-partial branch in the client component.

### NEEDS-FIX: "fire-and-forget" email still blocks completed mutations

Evidence:

- `src/server/email.ts:9` documents best-effort delivery, while `src/server/email.ts:124` awaits an unbounded `fetch()`.
- `src/server/actions/leave.ts:407` inserts the leave request, `src/server/actions/leave.ts:450` writes audit, then `src/server/actions/leave.ts:486` and `src/server/actions/leave.ts:501` await notification email before returning.
- `src/server/actions/onboarding.ts:286` / `src/server/actions/onboarding.ts:403` insert tasks, then `src/server/actions/onboarding.ts:314` / `src/server/actions/onboarding.ts:429` await email.
- `src/server/actions/performance.ts:1031` and `src/server/actions/performance.ts:1355` repeat the same post-mutation inline notification pattern.

Scenario: Resend accepts the TCP connection but stalls. The leave request and audit row are already committed, but the Server Action response waits on email. The user sees a hung submit, refreshes, and retries. In onboarding, the same retry can create another task row because the task inserts are not visibly idempotent at the action boundary.

Why it matters: this is both a UX and consistency problem. The code comments encourage reviewers to think notification delivery is not on the critical path, but it is.

Fix: use local Next's documented `after()` API for post-response notification work and add a timeout inside `sendEmail`.

Simpler rewrite:

```ts
import { after } from "next/server";

function notifyAfterCommit(work: () => Promise<void>) {
  after(async () => {
    try {
      await work();
    } catch (error) {
      console.error("notification failed", error);
    }
  });
}
```

Move the multi-recipient email blocks behind `notifyAfterCommit(() => sendLeaveSubmittedEmails(...))`-style helpers. Rough delta: about -80 to -120 LOC across leave/onboarding/performance once the repeated try/catch blocks collapse into one helper, and the response path no longer depends on provider latency.

### NEEDS-FIX: validation/audit conventions are not consistently enforced

Evidence:

- Intended behavior: `docs/security-model.md` requires validation failures and denied/not-found access paths to be audit-visible.
- Implemented in some modules: `src/server/actions/documents.ts:109` and `src/server/actions/leave.ts:184`.
- Missing in twins: `src/server/actions/departments.ts:47`, `src/server/actions/employees.ts:142`, and `src/server/actions/onboarding.ts:80` return validation errors without the same audit event.

Scenario: an attacker or broken integration repeatedly posts malformed onboarding template bodies. The action returns validation errors, but operations querying `audit_logs` for `input.validation_failed` see the invalid leave/document/performance probes and miss onboarding/employee/department probes. That is a wrong operational output from the app's stated security model.

Why it matters: this is exactly where copy-paste drift becomes security-relevant. The modules look similar enough that reviewers expect the same guardrails, but the audit side effect is not shared.

Fix: introduce one action input parser wrapper that takes `{ action, actorId, schema, formData }`, calls `safeParse`, logs `input.validation_failed` once on failure, and returns a standardized action error shape. For lookup misses, use a matching `requireEntity()` helper that logs `entity.not_found`.

Simpler rewrite: a single `parseAuditedActionInput()` helper should replace the repeated `const parsed = schema.safeParse(...)` / local `validationError(...)` branches. Rough delta: likely -60 to -90 LOC in the first pass, and more importantly a missing audit event becomes impossible to omit casually.

### NIT: stale/unscoped audit assertions let tests pass without proving the guard

Evidence:

- `tests/e2e/helpers.ts:141` defines `expectAudit(action, entityId?, since?)`, but only scopes by action unless callers remember to pass `entityId` or `since`.
- `tests/e2e/employee.spec.ts:415` calls `expectAudit("auth.access_denied")` after a forbidden employee action without passing actor, reason, entity, or timestamp.
- A better scoped helper already exists at `tests/e2e/forge.ts:85`.

Scenario: break or remove the denied-audit write in the employee goal-progress path. If any previous `auth.access_denied` row exists in the shared test database, `expectAudit("auth.access_denied")` can still pass. The test name claims the specific guard logged denial, but the assertion only proves some denial existed.

Why it matters: this test shape is how AI-built systems develop false confidence: the test reads like a security proof while asserting on stale global state.

Fix: retire broad `expectAudit(action)` for security-sensitive actions. Require `{ actorId, action, reason, since }` or `{ entityId, since }` and capture `since` immediately before the operation under test.

Simpler rewrite: replace the optional-parameter helper with two explicit helpers, `expectAuditForEntity()` and `expectDenyAuditForActor()`. Rough delta: +10 to +20 LOC in helpers, but each test loses ad hoc polling filters and gains real scope.

### NIT (UNVERIFIED): reports page uses non-null assertions instead of normal control-flow narrowing

Evidence:

- `src/app/(app)/reports/page.tsx:40` derives `activeKey` and `meta`.
- `src/app/(app)/reports/page.tsx:65` calls `getReport(activeKey!, filters)`.
- `src/app/(app)/reports/page.tsx:74`, `src/app/(app)/reports/page.tsx:134`, `src/app/(app)/reports/page.tsx:257`, and `src/app/(app)/reports/page.tsx:262` repeatedly rely on `meta!` / `result!`.
- `src/server/dal/reports.ts:123` asserts that `REPORTS.find()` always succeeds.

Scenario: no current failing input confirmed. This is a maintainability smell: if a future report key is removed, renamed, or conditionally hidden, the assertions prevent TypeScript from flagging branches that now render with missing metadata.

Why it matters: the code is longer and less safe than the straightforward shape. This is AI slop: extra defensive-looking branches paired with assertions that disable the defense.

Fix: split the "no report selected" branch before fetching/rendering and keep `meta`/`activeKey` in a narrowed scope.

Simpler rewrite:

```tsx
if (!activeKey) {
  return <ReportsShell reportOptions={reportOptions} filters={filters} />;
}

const meta = reportMeta(activeKey);
const result = shouldGenerate ? await getReport(activeKey, filters) : null;
```

Then render generated-only UI under `if (result)`. Rough delta: -15 to -25 LOC and removes most non-null assertions from the page.

## 4. Dead-Code / Unused-Dependency List

Manual import scan only; I did not run `depcheck` or install tools.

- `src/components/ui/dialog.tsx:4` and `package.json:25` (`@radix-ui/react-dialog`): wrapper appears unused outside its own file. Approximate removable code: 122 LOC plus dependency.
- `src/components/ui/select.tsx:4` and `package.json:27` (`@radix-ui/react-select`): wrapper appears unused; app uses custom/native select fields. Approximate removable code: 159 LOC plus dependency.
- `src/components/ui/separator.tsx:4` and `package.json:28` (`@radix-ui/react-separator`): wrapper appears unused. Approximate removable code: 31 LOC plus dependency.
- `src/components/ui/sonner.tsx:3`, `package.json:37` (`next-themes`), and `package.json:42` (`sonner`): wrapper appears unused; no mounted `Toaster` or app-level toast usage found. Approximate removable code: 31 LOC plus two dependencies.

Total obvious scaffold residue: about 343 component LOC plus five package dependencies.

## 5. Could-Not-Verify

- I did not run the app, E2E suite, migrations, Docker, or database queries because this audit is read-only and explicitly disallows stateful commands.
- I did not reproduce Server Action direct POST payloads at runtime. The selector finding is based on source-level control flow and test coverage.
- I did not simulate Resend/network latency. The email finding is based on awaited `fetch()` after committed mutations and the local Next `after()` docs.
- I did not run an automated unused-dependency tool. The dead-code list is from `rg` import scans and package usage checks.
- I noticed raw Supabase `.or(...)` string construction in text search helpers, but did not classify it as a finding because I did not verify whether Supabase's client escaping makes the constructed filters safe for all special characters. A runtime PostgREST request with names containing comma/parenthesis/operator characters would be needed to confirm.
