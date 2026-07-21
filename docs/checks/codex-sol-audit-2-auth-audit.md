# Sol Audit 2 — Auth/Session Lifecycle, Audit Logging, and Storage

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## Executive summary

Identity plumbing is stronger than its comments imply: authorization reads `profiles.role` from the database on every check, and RLS also calls `get_user_role()` against the database. The JWT role is a derived cache that is currently not used for authorization, so a stale claim does not create a role-escalation window. Session refresh follows the Supabase SSR pattern and the modified Next.js 16 `proxy.ts` convention.

The release blockers are elsewhere. The self-host deployment template enables public signup, producing a valid employee profile for any caller who knows the public Auth endpoint. Separately, audit is best-effort: every business mutation can succeed while its audit insert fails, contrary to the repository's own mandatory-audit model. Storage validation checks only caller-declared MIME and filename extension, not bytes.

## Ranked findings

### BLOCKER — Public signup is enabled by the shipped deployment default

**Evidence:** `infra/supabase/.env.example:154-184` sets `DISABLE_SIGNUP=false` and `ENABLE_EMAIL_SIGNUP=true`; Compose passes these directly to GoTrue at `infra/supabase/docker-compose.yml:143-163`. Every Auth insert creates an employee profile at `supabase/migrations/0011_triggers.sql:45-68`. Any authenticated user can call the people directory RPC at `supabase/migrations/0033_people_directory.sql:13-40`.

**Concrete trace:** an outsider calls `/auth/v1/signup` with the public publishable/anon key. GoTrue accepts the signup and `handle_new_user` creates `profiles(role='employee')`. After confirmation, the caller invokes `get_people_directory()` and receives active employees' names, job titles, departments, and work email addresses, even though no admin created an employee record for the outsider. Other any-authenticated projections, including company leave visibility, are also reachable.

**Fix:** ship and assert `DISABLE_SIGNUP=true`; retain admin-only `auth.admin.createUser` onboarding. Add a deployment preflight/health check that queries the effective GoTrue setting or attempts a disposable signup and fails the release if it succeeds. Consider an allowlisted invite-only hook as defense in depth.

**Confidence:** high for repository defaults and resulting authorization. **UNVERIFIED:** the live gitignored `.env` may already override the default.

### BLOCKER — Audit logging fails open and is outside business transactions

**Evidence:** `insertAuditLog` uses a separate service-role insert and only logs errors at `src/server/audit.ts:5-30`. The security model requires audit on privileged actions at `docs/security-model.md:17-24` and enumerates audit events at `docs/security-model.md:87-97`.

**Concrete trace:** the database accepts `employee_compensation` or leave mutation, then rejects `audit_logs` inserts because of disk exhaustion, schema drift, a permission regression, or service disruption. `insertAuditLog` prints an error and resolves; the action returns success. There is no durable evidence of who changed salary, role, leave balance, document, or settings. Because the business write and audit write use separate requests, even making the helper throw would still leave a committed unaudited mutation.

**Fix:** move privileged state transition and audit append into the same Postgres transaction/RPC. For operations spanning Auth/Storage, use a durable outbox with idempotent reconciliation and surface unhealthy backlog as an operational alert. At minimum, return failure and raise telemetry when mandatory audit cannot be written—but understand that this alone is not atomic.

**Confidence:** high.

### NEEDS-FIX — Logout ignores failure and can leave a live session

**Evidence:** `src/server/actions/auth.ts:9-15` awaits `signOut()` but discards its error, clears the router cache, and redirects.

**Concrete trace:** during a GoTrue outage or rejected sign-out request, `signOut` returns an error and the refresh/session cookie remains usable. The shared-computer user sees a login redirect and assumes logout succeeded; the next protected navigation refreshes the still-valid session and restores access.

**Fix:** inspect the return error, clear the local auth cookies through the supported SSR client behavior when safe, render an explicit failure, and add an E2E case that simulates upstream sign-out failure. For high-sensitivity use, define whether “logout” must revoke all refresh tokens or only this session.

**Confidence:** medium-high; exact client cookie behavior on an upstream failure requires runtime verification.

### NEEDS-FIX — Approve/reject can write false success audits after losing a race

**Evidence:** approve loads pending at `src/server/actions/leave.ts:552-570` and updates with a pending predicate but no select-back at `src/server/actions/leave.ts:600-633`; reject repeats the pattern at `src/server/actions/leave.ts:711-764`. The cancellation twin explicitly select-backs to avoid this class at `src/server/actions/leave.ts:873-900`.

**Concrete trace:** admin and manager both load the same pending request. Admin approves first. Manager's later reject/approve update matches zero rows; PostgREST returns no error. The second action writes `leave.rejected`/`leave.approved`, sends decision emails, and returns success although it changed nothing.

**Fix:** use `.select('id').maybeSingle()` and require one row, as cancellation does, or move the transition and audit into an atomic RPC returning the committed state.

**Confidence:** high.

### NEEDS-FIX — Several admin actions audit no-op mutations as success

**Evidence:** examples include `toggleTemplate` (`src/server/actions/onboarding.ts:112-148`), `deleteTemplateItem` (`src/server/actions/onboarding.ts:200-226`), `deleteTask` (`src/server/actions/onboarding.ts:617-644`), and leave-type/holiday toggles (`src/server/actions/leave.ts:1155-1199`, `src/server/actions/leave.ts:1753-1791`). These update/delete without a returned row and then append a success audit.

**Concrete trace:** an admin submits a syntactically valid UUID that does not exist. Supabase reports no error and zero affected rows. The action returns success and emits `onboarding.task_deleted`, `leave_type.toggled`, or the equivalent, manufacturing an event for a change that never happened.

**Fix:** standardize mutations on `select(...).maybeSingle()`/row-count assertions; use `logEntityNotFound` for zero rows. A transaction-owned audit should derive entity/action from the row actually changed.

**Confidence:** high.

### NEEDS-FIX — Upload validation trusts metadata, not file content

**Evidence:** the action checks size, `File.type`, and filename extension at `src/server/actions/documents.ts:272-289`, then uploads bytes at `src/server/actions/documents.ts:207-215`. No signature sniffing, document parser isolation, antivirus scan, or quarantine state exists.

**Concrete trace:** a caller submits executable/polyglot content named `policy.pdf` with `type=application/pdf`. Both checks pass and the private object is stored and later delivered to an HR user through a signed URL. Private storage prevents public browsing but does not protect the downloader from malicious content.

**Fix:** verify magic bytes/parseability, quarantine uploads, scan asynchronously with a maintained malware engine, and only expose signed download after a clean result. Keep browser-declared MIME as a hint, not proof. Also close the direct Storage bypass detailed in Audit 1.

**Confidence:** high.

### NEEDS-FIX — Validation and deny audit conventions are incomplete

**Evidence:** `app-settings`, `departments`, `employees`, and `onboarding` import no `logValidationFailed` despite validation returns (for example `src/server/actions/app-settings.ts:104-111`, `src/server/actions/employees.ts:393-401`, `src/server/actions/onboarding.ts:379-387`). `requireRole` redirects unauthenticated calls without an audit at `src/lib/supabase/helpers.ts:69-73`. File presence/type failures return before audit at `src/server/actions/documents.ts:85-91`, `123-130`.

**Concrete trace:** a compromised manager account repeatedly probes malformed IDs and payload boundaries in onboarding; the requests are rejected but leave no `input.validation_failed` events. Operations sees only successes and some role/object denies, not the probing pattern required by the stated security model.

**Fix:** one action-input helper should parse, log a sanitized validation failure, and return a consistent error. Explicitly decide and document which unauthenticated/background failures are security events; avoid logging sensitive input values.

**Confidence:** high.

### NEEDS-FIX — Most positive audit E2E assertions can pass on stale rows

**Evidence:** the helper makes both `entityId` and `since` optional at `tests/e2e/helpers.ts:141-158`. Of 44 `expectAudit` calls, only the two report tests pass `since` (`tests/e2e/reports.spec.ts:65`, `:165`); examples without either bound include `tests/e2e/employee.spec.ts:694`, `:742`, `tests/e2e/admin.spec.ts:367`, `:1440`, `:1517`, `:2592`. Teardown failure is deliberately non-fatal at `tests/e2e/global-teardown.ts:29-40`.

**Concrete trace:** a compensation update stops logging after a regression. An old `compensation.updated` row remains because cleanup failed. The test at `tests/e2e/admin.spec.ts:367` queries only action, finds the stale row, and passes.

**Fix:** make `since` required and snapshot it immediately before the operation; require actor and entity ID wherever one exists. Fail CI when cleanup fails, or isolate each run with a unique test-run marker/schema.

**Confidence:** high.

### NIT — Password-reset audit rate limiting is process-local and trusts the first forwarded IP

**Evidence:** the limiter is a module `Map` that resets on restart and becomes per-worker at `src/lib/rate-limit.ts:1-12`; client IP takes the first `x-forwarded-for` value at `src/app/api/auth/password-reset-requested/route.ts:62-66`.

**Concrete trace:** after scaling to two web workers, a caller gets five requests per worker per window; after restart the budget resets. If the ingress preserves attacker-supplied leading XFF values, the caller rotates fake IPs and floods anonymous audit rows.

**Fix:** for the current single-process LAN deployment this is acceptable. Before scaling/exposing publicly, use a trusted-proxy-derived address and shared store/gateway limit. Test Caddy's effective header rewrite.

**Confidence:** high on process-local behavior; **UNVERIFIED** whether current Caddy strips/overwrites spoofed leading XFF in the deployed topology.

## Identity and role propagation verdict

1. GoTrue creates `auth.users`.
2. `handle_new_user` creates a profile with default employee role (`supabase/migrations/0011_triggers.sql:45-68`).
3. `sync_role_to_jwt` mirrors profile role into `raw_app_meta_data` (`supabase/migrations/0013_role_sync.sql:12-27`).
4. Server authorization does **not** trust that claim: `getSessionUser` validates with `auth.getUser()` and reads `profiles.role` (`src/lib/supabase/helpers.ts:33-54`).
5. RLS also calls the DB-backed `get_user_role()` (`supabase/migrations/0002_profiles_departments.sql:24-33`). A repository-wide migration search found no `auth.jwt()` role authorization.

Therefore there is no demonstrated stale-JWT elevation window. The JWT role copy can drift and is confusing, but it is not currently authoritative. The dangerous identity issue is open account creation, not self-editing role; the profile column grant excludes `role` (`supabase/migrations/0014_phase5_security_hardening.sql:33-34`).

## Actions missing or unreliable audit coverage

| Class | Affected actions/paths | Gap |
|---|---|---|
| Logout | `src/server/actions/auth.ts:9-15` | No success/failure audit; failure ignored. |
| Validation | `app-settings.ts`, `departments.ts`, `employees.ts`, `onboarding.ts`; early file failures in `documents.ts` | Rejected malformed input not logged consistently. |
| Unauthenticated access | `src/lib/supabase/helpers.ts:69-73`; proxy redirects | No audit event. This may be intentional noise control but contradicts “every deny path” if read literally. |
| Not found / zero rows | onboarding deletes/toggles, leave type/holiday toggles | Success audit for no mutation; some not-found paths return without `logEntityNotFound`. |
| Every successful privileged action | All calls through `insertAuditLog` | Audit may fail after business commit and action still succeeds. |
| Email outcomes | `src/server/email.ts:8-13`, `:100+` | Best-effort design is documented; events are themselves lost when audit is unhealthy and there is no queue/retry. |

## Could not verify

- **UNVERIFIED:** effective production `DISABLE_SIGNUP`, SMTP confirmation, Auth password policy, refresh-token rotation, and cookie flags are in gitignored/runtime configuration.
- **UNVERIFIED:** `APP_URL` is blank in the template, so reset URLs fall back to request headers (`src/server/actions/auth.ts:18-32`). GoTrue's redirect allowlist should reject a poisoned origin, but effective proxy Host validation and live allowlist were not tested.
- **UNVERIFIED:** signed URL expiry/defaults and object cache headers require a runtime response or explicit expiry option inspection in the installed Supabase client.
- No requests, tests, migrations, builds, or stateful services were run in this read-only pass.
