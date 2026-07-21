# Fable Audit — Run 2: Auth / Session Lifecycle · Role→JWT · Audit Logging · Storage

> **Authorship (verified from session transcripts):** all findings below authored by **Opus 4.8** on 2026-07-08 — spawned as a Fable 5 `general-purpose` agent but ran majority-Opus (30 Fable / 47 Opus turns), and the report file was written by an Opus turn. Despite the "Fable Audit" title, this is an Opus-authored pass. Later passes append findings tagged `[Model · date]`.
> **[Fable5 · 2026-07-11]** Second pass authored by **Fable 5** (caller pinned `model: fable` for this spawn; single-model run, no Opus turns). This pass added no new findings — an independent source-only audit reproduced F1 and F2 exactly; corroboration notes with additional evidence are appended to those entries below.
> Provenance: `[Fable5 · date]` = Fable 5 · `[Opus · date]` = Opus · untagged = original pass above.

Independent adversarial audit. Source-only; no parallel-reviewer files were opened.
Scope: identity & role propagation, session/cookie handling, audit logging coverage,
storage/object access, secret leakage.

## Executive summary

The core authorization spine is sound and, in one respect, *better* than its own docs
claim: **authorization never trusts the JWT.** Every server path reads role from
`profiles` (`getSessionUser` → `helpers.ts:41`) and every RLS policy reads it through the
SECURITY DEFINER `get_user_role()` (`0002_profiles_departments.sql:26`). I could find **no
RLS policy and no server code that reads `app_metadata.role` from the JWT** (grep of
`supabase/migrations` and `src` for `auth.jwt`/`app_metadata` returns only the sync trigger
and a test). So the "role in JWT disagrees with DB" window has **no authorization
consequence today** — the DB always wins because the JWT claim is write-only. Column grants
(`0014`, `0049`) plus `with check (role = 'employee')` on the self-update policy close the
self-elevation paths through the session client; the salary/admin-only self-update path is
additionally guarded in `compensation.ts`.

The most serious finding is not in the app code at all: **public self-registration is
enabled in the deployed Supabase config**, which bypasses the entire admin-provisioning
model and hands any network-reachable actor an authenticated `employee` account. Secondary
findings are about *trust in documentation* (the role→JWT sync is dead code whose docstring
is confidently wrong) and *audit durability* (audit writes are best-effort and fail open).

Ranked findings below. Severity is calibrated to the LAN-only, ~15–20-user self-host
deployment the code assumes (`src/lib/rate-limit.ts:1-8`).

---

## Findings (ranked)

### F1 — HIGH · Public self-registration is enabled; bypasses admin-only provisioning
**Files:** `infra/supabase/.env:159,168` · `infra/supabase/docker-compose.yml:145,161` ·
`supabase/migrations/0011_triggers.sql:61-82` · `src/lib/supabase/proxy.ts:57`

The security model assumes "Role assignments are stored in `profiles.role`" and that
accounts are created only by an admin via `admin.auth.admin.createUser` (`employees.ts:166`).
But the deployed GoTrue config enables open signup:

```
infra/supabase/.env
159: DISABLE_SIGNUP=false
168: ENABLE_EMAIL_SIGNUP=true
169: ENABLE_EMAIL_AUTOCONFIRM=false
```

`docker-compose.yml:145` wires `GOTRUE_DISABLE_SIGNUP: ${DISABLE_SIGNUP}` and `:161`
`GOTRUE_EXTERNAL_EMAIL_ENABLED: ${ENABLE_EMAIL_SIGNUP}`. The Supabase API is public — the
browser client hits `NEXT_PUBLIC_SUPABASE_URL/auth/v1/*` for `signInWithPassword`
(`login-form.tsx:40`), so `/auth/v1/signup` is reachable by anyone who can reach the app.

**Scenario (concrete):** An unprovisioned actor on the network POSTs to
`/auth/v1/signup` with an email they control and a password. GoTrue inserts an
`auth.users` row → the `on_auth_user_created` trigger fires `handle_new_user()`
(`0011_triggers.sql:61`) which inserts a `profiles` row with `role='employee'`. The actor
clicks the confirmation email (they own the mailbox; autoconfirm is off but that is not a
barrier for an attacker using their own address), obtains a session, and the proxy
(`proxy.ts:57`, only checks `!user`) lets them into `/dashboard`, `/leave`, the people
directory (`0033`), department list, and their own profile/leave/documents surfaces. No
admin ever provisioned them. This defeats "deny by default" and admin-only account
creation.

**Fix:** Set `DISABLE_SIGNUP=true` in the deployed env (admins create all accounts via the
service-role path already). If a future feature needs self-signup, gate it behind
`GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES` (domain allowlist) and keep autoconfirm off.
Independently, add a defense-in-depth check so a brand-new `profiles` row with no
`employee_records` row cannot reach app data.

**Confidence:** Config CONFIRMED from the repo's deployed `.env`. Whether the edge proxy
(Caddy/envoy) blocks `/auth/v1/signup` externally I could not confirm without a live
request (read-only constraint) — but the same origin serves `signInWithPassword`, so the
route is almost certainly reachable.

> **[Fable5 · 2026-07-11] Corroboration + added evidence.** Independently reproduced from
> the deployed `infra/supabase/.env:159` (`DISABLE_SIGNUP=false`), `:168`
> (`ENABLE_EMAIL_SIGNUP=true`), `:169` (`ENABLE_EMAIL_AUTOCONFIRM=false`). Three points to
> add: (1) **The insecure default ships in-repo** — `infra/supabase/.env.example:168,184,185`
> carries the *same* `DISABLE_SIGNUP=false` / `ENABLE_EMAIL_SIGNUP=true`, so any fresh deploy
> that copies the example inherits open signup by default, not just this one host.
> (2) **Orphan-profile pollution is pre-confirmation.** `on_auth_user_created` fires
> `handle_new_user()` on the `auth.users` INSERT (`0011_triggers.sql:80-82`), i.e. at signup
> time — *before* email confirmation — so even unconfirmed self-signups write a
> `role='employee'` `profiles` row with no matching `employee_records`. An attacker can seed
> junk profiles without ever owning the mailbox, and these rows surface in admin employee
> listings/counts. (3) **No email-domain allowlist.** `handle_new_user` accepts `new.email`
> unconditionally and `GOTRUE_EXTERNAL_EMAIL_AUTHORIZED_ADDRESSES` is not set in the compose
> env, so signup is not even restricted to the company domain. The fix (set
> `DISABLE_SIGNUP=true`) should also be applied to `.env.example`.

---

### F2 — MEDIUM · `sync_role_to_jwt` is dead code and its docstring is confidently wrong
**Files:** `supabase/migrations/0013_role_sync.sql:1-9` · `docs/security-model.md:133`

The migration header states the trigger exists so *"RLS policies and server utilities read
the role from the JWT without a round-trip to profiles."* That is false. Grep across all
migrations and `src` finds **zero** readers of `auth.jwt() ->> 'role'` or
`raw_app_meta_data`. RLS uses `get_user_role()` (a `profiles` lookup); the app uses
`getSessionUser()` (a `profiles` lookup). The synced `app_metadata.role` claim is never
consumed anywhere except one E2E test assertion (`tests/e2e/rls.spec.ts:418`).

This is not exploitable now (it's the fail-safe direction), but it's a classic AI-authored
tell — a plausible-looking mechanism plus a confident-but-inaccurate rationale — and it is
**a trap for the next developer.** The docstring invites someone to "optimize" a future
policy to read the JWT claim, which lags `profiles` by up to the token lifetime
(`JWT_EXPIRY`). The moment any policy trusts the JWT, a demoted admin keeps admin access
until their token refreshes — a real stale-role escalation window that the docs currently
claim is already the design.

**Fix:** Either (a) delete the trigger + claim and correct `security-model.md:133` /
`0013` to state plainly that role is read only from `profiles`; or (b) if the JWT cache is
wanted for performance, add an explicit "never authorize on this claim" warning and a
policy-lint. Do not leave the current "this is how RLS reads role" wording — it is wrong.

> **[Fable5 · 2026-07-11] Corroboration + broader doc surface.** Reproduced independently:
> quantitatively, of the migration files, **only `0013_role_sync.sql` references
> `app_metadata`/`raw_app_meta_data` at all** (grep of `supabase/migrations`) — no policy
> reads it. The dangerous docstring is **not confined to `security-model.md:133`/`0013`**;
> the same "RLS reads role from the JWT" premise is repeated in three more docs, widening the
> trap: `docs/rls-policy-map.md:15` literally *defines* the manager predicate as
> `manager — jwt_role = 'manager'` (it is actually `get_user_role() = 'manager'`, a
> `profiles` read); and `docs/systems-thinking.md:20`, `:33`, `:101` build a whole
> blast-radius story around "JWT stale → wrong permissions in every RLS-protected query,"
> which is **false today** — the DB is always read, so demotion is immediate. The
> systems-thinking Phase-11 test suggestion (`:75`, "after role change assert JWT
> `app_metadata.role` matches") asserts a claim that gates nothing. Any doc-correction fix
> must cover `rls-policy-map.md:15` and `systems-thinking.md:20,33,101,75`, not only the two
> files the original entry named.

---

### F3 — MEDIUM · Audit logging is best-effort and fails open on write failure
**File:** `src/server/audit.ts:27-29`

```
if (error) {
  console.error("audit log insert failed", error);
}
```

`insertAuditLog` swallows every insert error and returns normally. Consequences:

- **Deny paths lose their signal.** `requireRole` (`helpers.ts:78-89`) awaits the
  `auth.access_denied` insert, then throws. If the insert fails (audit table pressure,
  service-role rate limit, malformed metadata), the denial still happens but no row is
  written — and the security model calls the audit row *"the authoritative guard signal"*
  (`security-model.md:24`). The authoritative signal is silently droppable.
- **Mutations are already committed before the (droppable) audit write.** Every action
  writes its business row first (via service-role/admin client) and audits afterward with
  no transaction. A failed audit insert leaves a privileged mutation with no trail.

**Scenario:** An operator investigating abuse relies on volume-based `entity.not_found` /
`auth.access_denied` detection (`security-model.md:98`). An attacker who can induce audit
inserts to fail — or who simply benefits from a transient outage — performs denied/privileged
operations that never appear in `/audit-logs`. Detection false-negatives silently.

**Fix:** For the deny path specifically, treat audit-write failure as fail-closed (still
throw `AccessDeniedError`, which it does — good — but also surface a server-side alert on
audit-insert failure rather than only `console.error`). Consider writing the audit row in
the same transaction as the mutation for state-changing actions, or at minimum emit a
distinct high-priority log/metric on `audit log insert failed` so a dropped trail is itself
observable.

---

### F4 — LOW–MEDIUM · Password-change completion writes no audit row
**Files:** `src/app/(auth)/reset-password/reset-password-form.tsx:134` ·
`src/app/api/auth/password-reset-requested/route.ts:39`

The password *request* is audited (`auth.password_reset_requested`), but the **completion**
— `supabase.auth.updateUser({ password })` — runs client-side against GoTrue and produces
no `audit_logs` row. A completed credential change on **any** account, including an admin's,
leaves no trace in the app's audit trail. security-model's "Required Audit Events" implies
credential lifecycle should be traceable; it isn't for the completion half.

**Scenario:** An attacker who obtains a valid recovery link (or an insider) resets an
admin's password. `/audit-logs` shows only that *a* reset was requested (domain only, no
actor — the request route logs `actorId: null` with just `email_domain`), never that the
password was actually changed or for whom.

**Fix:** Add a server-side confirmation step that writes `auth.password_changed` (actor =
the user id from the recovery session) after `updateUser` succeeds — e.g. a small Route
Handler the form calls post-update, gated same-origin like the request route.

---

### F5 — LOW · Role changes are not distinctly auditable
**File:** `src/server/actions/employees.ts:458-469`

"Role changes" is a Required Audit Event (`security-model.md:94`). `updateEmployee` folds
the role into the generic `employee.updated` event and records only the *new* role in
metadata — no dedicated event, no before-value, and it fires whether or not the role
actually changed. You cannot reconstruct "who was promoted to admin and when" from the
audit log without diffing against external state.

**Fix:** When `parsed.data.role` differs from the current stored role, emit a dedicated
`role.changed` event with `{ from, to }`. Cheap: the action already loads/writes the
profile.

---

### F6 — LOW · CSV formula injection in report export (adjacent to this run's focus)
**File:** `src/app/(app)/reports/export/route.ts:104-108`

`csvCell` escapes RFC-4180 delimiters but does not neutralize leading `=`, `+`, `-`, `@`.
User-controlled fields that flow into reports (e.g. `display_name`, `bank_account_holder`,
`notes`, `job_title`) can carry `=HYPERLINK(...)`/`=cmd|...` payloads that execute when the
**admin** opens the exported CSV in Excel/Sheets. This is an injection-class issue (outside
this run's auth/session/audit/storage focus) but it rides the audited export path
(`report.exported`) and moves PII, so noting it here.

**Fix:** Prefix cells beginning with `= + - @ \t \r` with a single quote or wrap-and-space
before the existing quote logic.

---

## Storage / object access — reviewed, no new exploit found

- Upload path (`documents.ts:77-270`) validates MIME **and** extension per category
  (`validateUploadFile:272`), enforces `employee → self only` (`:134`), `payslip → admin
  only` (`:153`), and `manager → self or in-scope report categories` (`:179`). Path is
  server-composed as `{employeeId}/{category}/{uuid}.{ext}` (`:208`) with a `randomUUID`
  basename — no client-controlled path, no traversal (the extension is the only
  client-derived component and is only appended, not used for directory structure).
- Download (`getSignedDownloadUrl:359`) loads the row via the **session client** (RLS
  enforces visibility) *before* signing via the admin client (`:401`), and signs with a
  60-second expiry, `download: true`. A manager cannot pull a direct report's
  `payslip`/`id_document`/`contract` because `manager_select_direct_report_documents`
  (`0014:41`) excludes those categories and `select_own_documents` (`0053`) only matches
  own rows — so the pre-sign RLS load returns null. Verified the storage policy
  (`select_own_objects`, `0054`) is now role-agnostic and self-scoped, matching the doc row
  policy; the divergence 0054 fixed is real and correctly reasoned.
- Bucket is private with a 10 MiB limit and a MIME allowlist (`0015`, `0029`). Signed URLs
  are the only external surface. No public-bucket leak.

**Residual note (not a finding):** storage RLS is effectively bypassed on every real path
because the server always signs with the service-role client. The `select_own_objects` /
`manager_select_direct_report_objects` policies are latent defense-in-depth only, as
`0054`'s own header candidly states. Acceptable, but it means a bug in the action-layer
category checks would have no storage-RLS backstop for signed-URL generation.

## Session / cookie handling — reviewed

- Middleware (`proxy.ts`) uses `supabase.auth.getUser()` (server-validated against GoTrue),
  not `getSession()` — correct; a forged/tampered cookie won't pass. `next=` redirect is
  sanitized against `//` and `/\` open-redirect (`:67-70`, mirrored in `login-form.tsx:53`).
- `logout` drops the full Router Cache via `revalidatePath("/", "layout")` before redirect
  (`auth.ts:9-16`) — prevents stale authenticated chrome. Good.
- Recovery-session establishment is de-duped per link (`reset-password-form.tsx:275`) and
  clears the token from the URL via `history.replaceState` (`:90`) — reduces token leakage
  via history/referer.
- `authRedirectUrl` builds reset/invite origins from server-only `APP_URL` when set
  (`auth.ts:23`), falling back to request headers only when unset — host-header-poisoning
  defense-in-depth is real.

## Secrets — reviewed

- `SUPABASE_SERVICE_ROLE_KEY` / `APP_URL` are fenced behind `import "server-only"`
  (`env.ts`, consumed by `admin.ts:1`, `server.ts:1`, `audit.ts:1`). Client bundle uses
  only `env.public.ts` (publishable key). No service-role usage in any `"use client"` file
  (`admin.ts` importers are all server modules).
- Error responses to clients are generic ("Compensation could not be saved", "Document not
  found or access denied"); raw DB/auth detail is `console.error`-only. One deliberate
  exception: `describeAuthError` surfaces the raw Supabase code/message, but only in the
  admin-triggered `createEmployee` toast (`employees.ts:751-762`) — admin-scoped, acceptable.

---

## Actions that mutate state but under-cover audit

| Action | Audit gap |
|---|---|
| Password change completion (`reset-password-form.tsx:134`) | No `audit_logs` row on the actual credential change (F4). |
| Role change (`employees.ts:458`) | Folded into `employee.updated`; no dedicated event, no before-value (F5). |
| **All state-changing actions** (`audit.ts:27`) | Audit write is best-effort; a failed insert silently drops the trail (F3) — this is a coverage gap for *every* action, not one. |
| `logout` (`auth.ts:9`) | No audit row. Likely acceptable, flagged for completeness. |

Everything else in `leave.ts`, `onboarding.ts`, `performance.ts`, `departments.ts`,
`compensation.ts`, `documents.ts`, `app-settings.ts`, and `reports/export/route.ts` writes a
matching audit row (verified by mapping each `export async function` to its
`insertAuditLog` call), and deny paths emit `auth.access_denied` before returning. Coverage
breadth is good; the weakness is **durability**, not breadth.

---

## Could not verify (read-only / would need a live request)

- **F1 external reachability of `/auth/v1/signup`** through the edge proxy (Caddy/envoy) —
  needs a live curl, which the read-only constraint forbids. Strong circumstantial evidence
  (same public origin serves `signInWithPassword`).
- **Cookie flags** (`Secure` / `HttpOnly` / `SameSite`) are set by `@supabase/ssr`'s cookie
  options, passed through untouched in `server.ts` / `proxy.ts`. They are not asserted in
  app code — confirming the actual `Set-Cookie` attributes needs runtime inspection.
- **Deny-audit test false-pass** — I did not exhaustively trace whether E2E assertions that
  a deny row exists filter by a fresh timestamp/actor vs. matching a stale row from a prior
  run; `rls.spec.ts` was only spot-checked (line 418) for the JWT-claim reference. Worth a
  dedicated pass if test integrity is in scope.
  > **[Fable5 · 2026-07-11] Partially closed.** Traced `access-matrix.spec.ts` (AM2 :137-149,
  > AM6 :204-216): both deny-audit assertions scope by `.eq("actor", …)` **and**
  > `.gte("created_at", since)` (a `nowIso()` captured just before the action) **and** by the
  > target (`entity_id`/`metadata.target_employee_id`) — so a stale row from a prior run
  > cannot satisfy them. These specific assertions do **not** false-pass. Not exhaustive
  > across all specs, but the highest-risk forge tests are clean.
- **F4 email deliverability** — exploitability of self-signup completion assumes the
  attacker receives GoTrue's confirmation mail at an address they control (true for the
  self-registration scenario; noted for completeness).
