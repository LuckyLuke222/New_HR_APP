# KushHR auth/session/JWT/audit/storage audit - run 2

Scope: independent read-only audit of auth/session lifecycle, role propagation into JWT claims, audit logging, storage/object access, and secret handling. I read `AGENTS.md` first and checked the local modified Next.js docs under `node_modules/next/dist/docs/` before judging Server Actions, Route Handlers, cookies, and proxy behavior. Relevant local Next guidance: Server Actions are directly POST-reachable and must authorize internally; Route Handlers are not wrapped by the app error boundary; `cookies()` is async and cookies can only be set from Server Functions or Route Handlers.

## 1. Executive summary

I did not find a general self-service role-escalation path. Signup creates a default `employee` profile (`supabase/migrations/0011_triggers.sql:61`), role changes are intended to sync into `auth.users.raw_app_meta_data` (`supabase/migrations/0013_role_sync.sql:27`), and the app reads role from `profiles`, not directly from the JWT (`src/lib/supabase/helpers.ts:29`). The current RLS helper also reads `profiles.role` (`supabase/migrations/0002_profiles_departments.sql:26`), while self-service profile updates are grant-limited to non-role columns (`supabase/migrations/0014_phase5_security_hardening.sql:33`).

The high-risk issue is narrower: the admin employee update path can commit a role/profile change, trigger JWT sync, then fail later and write no success/role-change audit. That creates exactly the kind of "action failed, but authority changed" state an AI-built system can hide behind clean-looking code.

Top risks:

1. HIGH: `updateEmployee()` mutates `profiles.role` before updating the job record and before auditing, so a stale or forged `recordId` can leave a role change active with no `employee.updated` or role-change audit row.
2. NEEDS-FIX: `insertAuditLog()` is fail-open. If audit insertion errors, privileged mutations and deny paths still continue, violating the security model's "all denies/mutations audited" contract.
3. NEEDS-FIX: the unauthenticated password-reset audit route trusts caller-controlled `Host`/`Origin` and `X-Forwarded-For`; because the Next app still publishes `:3100`, direct callers can bypass the same-origin/rate-limit assumptions and flood admin-visible audit rows.
4. TEST GAP: at least one deny-audit E2E assertion can false-pass on stale rows because it checks only `action = auth.access_denied` without actor, reason, entity, or `created_at >= since`.

Storage looked materially better than the audit paths: server uploads generate the storage key from trusted IDs plus `randomUUID()` (`src/server/actions/documents.ts:207`), category/MIME/extension/size policy is centralized (`src/lib/document-upload-policy.ts:20`), the bucket is private (`supabase/migrations/0015_storage_documents.sql:9`), and signed downloads are minted only after a session/RLS document lookup (`src/server/actions/documents.ts:381`, `src/server/actions/documents.ts:402`). I did not find a secret bundled into client code; `SUPABASE_SERVICE_ROLE_KEY` is fenced by `server-only` (`src/lib/env.ts:1`, `src/lib/supabase/admin.ts:1`) and only `NEXT_PUBLIC_*` are intentionally built into the browser image (`Dockerfile:20`).

## 2. Ranked findings

### HIGH - Employee role changes can commit, sync to JWT metadata, and return failure with no audit

`src/server/actions/employees.ts:419` / `src/server/actions/employees.ts:424` / `src/server/actions/employees.ts:435` / `src/server/actions/employees.ts:448` / `src/server/actions/employees.ts:453` / `src/server/actions/employees.ts:458` / `supabase/migrations/0013_role_sync.sql:27` / `src/lib/supabase/helpers.ts:29`

Defect: `updateEmployee()` first uses the service-role client to update `profiles.display_name`, `profiles.phone`, and `profiles.role`. Only after that does it update `employee_records` through the session client, constrained by both `recordId` and `employee_id`. The success audit row is after both writes. If the profile update succeeds but the record update fails, the function returns `"Employee job record could not be updated."` and never writes `employee.updated`.

Why this violates the intended model: `docs/security-model.md:89` requires employee updates to be audited, `docs/security-model.md:94` separately calls out role changes, and `docs/security-model.md:95` requires failed authorization attempts. `profiles.role` is the source of truth and the JWT role is a derived cache; the profile update fires `sync_role_to_jwt_on_profile_change`, so this is not a cosmetic partial update. The app reads role from the DB on the next server request.

Exploit scenario: an admin opens Alice's edit form, or a malicious admin direct-posts the Server Action payload, with `id=<alice-profile-id>`, `role=admin`, and a stale or forged `recordId` that does not belong to Alice. The profile update at `src/server/actions/employees.ts:419` changes Alice's DB role to `admin`; the trigger at `supabase/migrations/0013_role_sync.sql:27` mirrors that into `auth.users.raw_app_meta_data`. The `employee_records` update at `src/server/actions/employees.ts:435` matches zero rows because of `.eq("id", parsed.data.recordId)` plus `.eq("employee_id", parsed.data.id)`, `.single()` errors, and the function returns at `src/server/actions/employees.ts:453`. No `employee.updated` audit row at `src/server/actions/employees.ts:458` runs, and there is no separate `role.changed` row with old/new role.

Fix: make employee profile and record changes atomic, preferably with a DB RPC/transaction that updates both or neither and writes the audit row in the same transaction. If keeping two calls, update the job record before changing `profiles.role`, or split role changes into a dedicated audited path after all other validations succeed. Log old and new role explicitly, e.g. `role.changed` with `{ from, to }`, because `employee.updated` currently logs only the submitted new role.

Confidence: High. The write order and early return are explicit; I did not need runtime mutation to construct the failure state.

### NEEDS-FIX - Audit logging fails open for both privileged mutations and deny paths

`src/server/audit.ts:19` / `src/server/audit.ts:27` / `src/lib/supabase/helpers.ts:78` / `src/lib/supabase/helpers.ts:89` / `src/server/actions/app-settings.ts:116` / `src/server/actions/app-settings.ts:169` / `src/server/actions/app-settings.ts:179`

Defect: `insertAuditLog()` inserts into `audit_logs`, but if Supabase returns an error it only `console.error`s and returns. Callers do not know the audit row failed. `requireRole()` awaits the helper and then throws `AccessDeniedError`; sensitive mutation paths such as `updateAppSettings()` mutate state, call `insertAuditLog()`, then return success.

Concrete failure scenario: the audit insert path breaks due to a revoked grant, a bad service-role key, a schema/constraint mismatch, or a transient database error. An admin submits valid settings. `updateAppSettings()` updates `app_settings` at `src/server/actions/app-settings.ts:116`, calls the audit helper at `src/server/actions/app-settings.ts:169`, the helper swallows the insert error at `src/server/audit.ts:27`, and the action returns `"Settings saved."` at `src/server/actions/app-settings.ts:179` with no audit row. Similarly, a non-admin hitting `/settings` is denied by `requireRole()`, but if the audit insert fails, the denial still proceeds with no `auth.access_denied` row.

Fix: make the audit helper return a result or throw on failure, and decide per call site whether the operation is audit-critical. For HR/payroll mutations and access denials, fail closed or move the mutation plus audit into a transaction/RPC. If best-effort audit is desired for non-critical observability, make that explicit with a separate helper name so critical paths cannot accidentally opt into it.

Confidence: High for the code behavior under an audit insert error. I did not mutate the DB to induce the error.

### NEEDS-FIX - Public password-reset audit route can be directly flooded by spoofing origin/IP headers

`infra/supabase/docker-compose.app.yml:27` / `infra/supabase/docker-compose.app.yml:30` / `src/app/api/auth/password-reset-requested/route.ts:15` / `src/app/api/auth/password-reset-requested/route.ts:21` / `src/app/api/auth/password-reset-requested/route.ts:39` / `src/app/api/auth/password-reset-requested/route.ts:49` / `src/app/api/auth/password-reset-requested/route.ts:62`

Defect: the unauthenticated audit route is protected by same-origin and per-IP checks, but both checks trust headers controlled by any direct HTTP caller. `isSameOrigin()` compares `new URL(origin).host` to `Host`; `clientIp()` takes the first `X-Forwarded-For` value. The compose app still publishes the web container directly on `3100:3100`, explicitly noting that proxy-only ingress is a later hardening item.

Exploit scenario: from the LAN/VPN, a caller sends repeated direct requests to `http://<host>:3100/api/auth/password-reset-requested` with `Host: kushhr.internal`, `Origin: http://kushhr.internal`, and a rotating `X-Forwarded-For` value. The request passes `isSameOrigin()` and receives a fresh rate-limit bucket for each spoofed IP, then inserts `auth.password_reset_requested` with actor `null` and attacker-chosen email domains. This does not reset passwords by itself, but it pollutes the admin-visible audit stream and can bury real reset events.

Fix: remove the direct web port or bind it to loopback only, and expose the app only through Caddy. On the route, compare `Origin` to configured `APP_URL` or a fixed allowlist, not the request's `Host`. Only honor `X-Forwarded-For` from a trusted reverse proxy; otherwise key the limiter on the socket/proxy-derived client IP. Consider making this audit write server-side in the reset request flow so anonymous clients cannot directly create these audit rows.

Confidence: High for the direct-header bypass if `:3100` is reachable. If production has already firewalled the published port, impact drops to configuration drift risk.

### TEST GAP - A deny-audit assertion can pass on a stale unrelated audit row

`tests/e2e/helpers.ts:144` / `tests/e2e/helpers.ts:152` / `tests/e2e/employee.spec.ts:398` / `tests/e2e/employee.spec.ts:405` / `tests/e2e/employee.spec.ts:415` / `src/server/actions/performance.ts:797` / `src/server/actions/performance.ts:798`

Defect: `expectAudit(action, entityId?, since?)` only filters by action unless callers pass more constraints. In the forged employee goal-progress test, the code swaps a hidden `goalId`, expects the UI denial, then calls `expectAudit("auth.access_denied")` with no `since`, actor, entity, reason, or target goal. The app's denial row should contain `reason: "goal_progress_not_owner"` and `goal_id`, but the test does not require either.

Concrete false-pass scenario: remove or break the `logDenied()` call in `updateOwnGoalProgress()` while leaving the UI denial intact. If any previous test run or earlier test already wrote an `auth.access_denied` row, `expectAudit("auth.access_denied")` can still pass because the helper orders by latest matching action and has no freshness bound. That masks exactly the audit-regression class this run is trying to catch.

Fix: in this test, take `const since = nowIso()` immediately before the forged submit and use `expectDenyAudit({ actorId: ids.alice, since, reason: "goal_progress_not_owner" })`, or extend the helper to require `since` for deny assertions and support metadata predicates. Review no-entity/no-since callers for sensitive events such as `app_settings.updated`, `holiday.bulk_uploaded`, `leave.submitted`, and `compensation.self_updated`.

Confidence: High. This is a test confidence issue, not a production authz defect.

## 3. Actions missing audit coverage

The following are not all ranked as separate findings, but they are coverage gaps against the stated audit model.

| Area | Missing audit coverage | Evidence |
|---|---|---|
| Employee update | Partial role/profile mutation before later failure writes no success/failure/role-change audit. | `src/server/actions/employees.ts:419`, `src/server/actions/employees.ts:453`, `src/server/actions/employees.ts:458` |
| Audit helper | Any caller can lose its audit row if `audit_logs` insert errors; caller still continues. | `src/server/audit.ts:19`, `src/server/audit.ts:27` |
| App settings validation | `safeParse` failure returns field errors without `input.validation_failed`. | `src/server/actions/app-settings.ts:93`, `src/server/actions/app-settings.ts:104` |
| Employees validation | Create/update/password-reset ID parse failures return field errors without `input.validation_failed`. | `src/server/actions/employees.ts:142`, `src/server/actions/employees.ts:146`, `src/server/actions/employees.ts:393`, `src/server/actions/employees.ts:399`, `src/server/actions/employees.ts:501`, `src/server/actions/employees.ts:503` |
| Departments validation/not-found | Create/update/delete parse failures are unaudited; delete lookup errors, including syntactically valid missing IDs, return safe error without `entity.not_found`. | `src/server/actions/departments.ts:47`, `src/server/actions/departments.ts:52`, `src/server/actions/departments.ts:105`, `src/server/actions/departments.ts:111`, `src/server/actions/departments.ts:164`, `src/server/actions/departments.ts:168`, `src/server/actions/departments.ts:172`, `src/server/actions/departments.ts:179` |
| Documents upload validation | Missing/empty file and category-specific file-policy rejects are not logged, even though forged upload bodies can hit these branches. | `src/server/actions/documents.ts:85`, `src/server/actions/documents.ts:86`, `src/server/actions/documents.ts:123`, `src/server/actions/documents.ts:125` |
| Onboarding validation | Template/task create/assign/complete parse failures return field errors without `input.validation_failed`; missing raw IDs in toggle/delete branches are also silent. | `src/server/actions/onboarding.ts:80`, `src/server/actions/onboarding.ts:84`, `src/server/actions/onboarding.ts:118`, `src/server/actions/onboarding.ts:119`, `src/server/actions/onboarding.ts:163`, `src/server/actions/onboarding.ts:168`, `src/server/actions/onboarding.ts:251`, `src/server/actions/onboarding.ts:256`, `src/server/actions/onboarding.ts:379`, `src/server/actions/onboarding.ts:385`, `src/server/actions/onboarding.ts:549`, `src/server/actions/onboarding.ts:553`, `src/server/actions/onboarding.ts:623`, `src/server/actions/onboarding.ts:624` |
| Public holidays | Toggle parse failure and bulk-upload JSON/schema failures are unaudited. | `src/server/actions/leave.ts:1760`, `src/server/actions/leave.ts:1763`, `src/server/actions/leave.ts:1820`, `src/server/actions/leave.ts:1827`, `src/server/actions/leave.ts:1830`, `src/server/actions/leave.ts:1831` |
| Password-reset audit route | Invalid JSON/email requests are rejected without audit. That may be intentional for noise, but it means malformed anonymous probes are invisible except console/status. | `src/app/api/auth/password-reset-requested/route.ts:28`, `src/app/api/auth/password-reset-requested/route.ts:35` |

I did not re-report the documented `cancelLeaveRequest` RLS-short-circuit audit gap from `docs/access-matrix.md:187`, and I did not re-report run 1's onboarding/performance existence-oracle findings.

## 4. Could not verify

- I did not run Server Action POSTs, migrations, Docker, Supabase, Playwright, or DB writes because this run is read-only. The exploit scenarios are static traces.
- Cookie flags (`Secure`, `HttpOnly`, `SameSite`, expiry/rotation) are delegated to `@supabase/ssr` cookie options and GoTrue runtime configuration. The app forwards the options in `src/lib/supabase/server.ts:21` and `src/lib/supabase/proxy.ts:42`, but I did not observe a live `Set-Cookie` response.
- I could not verify whether production actually exposes `:3100`/Kong `:8000` outside localhost or whether firewall rules compensate for the published compose ports.
- The public forgot-password flow builds `redirectTo` from `window.location.origin` (`src/app/(auth)/forgot-password/forgot-password-form.tsx:51`), while the admin reset helper prefers configured `APP_URL` (`src/server/actions/auth.ts:18`). I did not classify this as a finding because GoTrue `SITE_URL`/`ADDITIONAL_REDIRECT_URLS` should reject unapproved origins, but it should be tested against the deployed allowlist, especially while direct `:3100` ingress exists.
- I did not find an exploitable stale-JWT authorization window in the current app/RLS because role checks read `profiles.role`. The JWT role sync trigger is still operationally important for Supabase Auth metadata, but DB role appears to win today.
- I did not inspect built client bundles. Static source review found no server-secret imports in Client Components and no `SUPABASE_SERVICE_ROLE_KEY` use outside `server-only` modules, but bundle verification would require a build.
