# Security Model

## Security Principles

- Deny by default.
- RLS on every table.
- Server-side authorization on every mutation.
- Zod validation on every mutation input.
- Private Storage for HR/payroll documents.
- Least privilege across Admin, Manager, and Employee.
- Audit sensitive mutations.

## Authorization Layers

**UI layer** — may hide unavailable nav and actions for usability. Not an authorization boundary.

**Server layer** — every Server Action and Route Handler must:
- Verify authenticated user.
- Load role and scope from trusted server/database state (not only JWT claims).
- Validate input with Zod.
- Check role and record scope before mutation.
- Return safe, non-leaking errors.
- Write an `auth.access_denied` audit log entry on any early-exit due to insufficient permission.
- On role mismatch, `requireRole` (src/lib/supabase/helpers.ts) writes the audit row then throws `AccessDeniedError`; the (app) segment error boundary (src/app/(app)/error.tsx) detects the stable digest and renders the access-denied UI **in place at the attempted URL** (no HTTP redirect). This is what makes the response browser-uniform — Chrome and Firefox both render the same body at the same URL. The audit row is the authoritative guard signal; the in-page render is the visible-UX layer. **Route Handlers are not wrapped by the (app) error boundary** — they must catch `AccessDeniedError` and return a plain `403` themselves (e.g. `src/app/(app)/reports/export/route.ts`); the `auth.access_denied` audit is still written before the throw, so the guard signal is identical.

**Database layer** — Supabase RLS is the final authorization layer. Every table must enable RLS, have explicit policies, and include indexes on policy columns.

**Defense-in-depth for data-integrity rules.** Where a rule must hold for *all* writers (not only the Server Action path — e.g. forge attempts, future direct-DB callers, races), enforce it twice: once in the Server Action (user-friendly error + audit row) and once at the DB layer (constraint, trigger, or partial index). Example: leave-request overlap rejection runs an existence check in `submitLeaveRequest` and is also guarded by the `leave_requests_no_overlap` EXCLUDE constraint (migration 0035). The DB error (SQLSTATE 23P01) is translated to the same user message so the boundary is invisible to the caller but auditable in `audit_logs`.

## Role Access Rules

**Admin** — full company access; edits payroll fields; approves/rejects payroll change requests; manages leave types and balances; views audit logs; manages settings.

**Manager** — direct reports only (active employees); approves/rejects direct-report leave; assigns direct-report onboarding tasks. Cannot access employees outside their reporting line. Cannot see bank, tax, national ID, salary, or payroll fields.

**Employee** — own profile, leave, documents, and payroll record; directly edits own bank/tax/national-id/passport/nationality on `/payroll` (migration 0049); completes own tasks. Cannot edit salary, currency, pay frequency, effective date, or notes — those remain admin-only. Cannot approve own leave. Cannot view other employees' private data.

## Sensitive Data Separation

Keep these fields out of general profile rows and in narrow tables with stricter policies:

- Salary, compensation, and pay frequency → `employee_compensation` (admin-only writes)
- Bank/payment details → `employee_compensation` (employee self-edit + admin)
- Tax identifiers and national ID → `employee_compensation` (employee self-edit + admin)
- Private document storage paths → `documents`

Compensation column-level write enforcement (migration 0049, 2026-06-02): the
`authenticated` role has UPDATE only on `bank_name, bank_account_holder,
bank_account_number, tax_id, national_id, passport_number, nationality`.
Salary, currency, pay frequency, effective date, and notes are physically
unwritable on the session-client; admin writes via service-role. The previous
`payroll_change_requests` mediation layer has been retired (migration 0048).

Manager scope on `employee_compensation` is enforced by SECURITY DEFINER RPC
`public.get_direct_report_compensation_summaries()` (migration 0050), **not**
by base-table RLS. Manager has zero base-table SELECT for direct-report rows;
the RPC return type is the only column-level surface and contains only
summary fields (salary, currency, pay frequency, effective date) — bank, tax,
national ID, passport, and notes cannot reach a manager session. This closes
the F4 gap from the payroll UAT (Session 154): column grants restrict UPDATE
only, so without an RPC chokepoint a manager's broad SELECT could read every
column on rows the RLS row-policy allowed.

`profiles` and `employee_records` must not carry compensation or bank/tax fields.

## Storage Security

- Use private Supabase Storage buckets only. No public buckets for HR/payroll documents.
- Enforce access through `storage.objects` RLS — mirrors the `documents` metadata table policy.
- Serve sensitive files via signed URLs generated server-side, never raw Storage URLs.
- Payslips use category `payslip` and remain in private buckets.

### Document Upload File Policy

All document uploads are validated before Storage upload in the Server Action, and the private `hr-documents` bucket is configured with the union of the same MIME types plus a 10 MiB object limit.

| Category | Allowed file types | Max size |
|---|---|---:|
| `contract` | PDF, DOC, DOCX | 10 MiB |
| `id_document` | PDF, JPG, PNG | 10 MiB |
| `payslip` | PDF only | 10 MiB |
| `policy` | PDF only | 10 MiB |
| `other` | PDF, DOC, DOCX, JPG, PNG, TXT | 10 MiB |

The Server Action validates both MIME type and filename extension. The bucket-level MIME allowlist is deliberately broader than some categories because Supabase Storage applies allowed MIME types bucket-wide, not per folder/category.

## Required Audit Events

- Employee creation/update.
- Compensation update (`compensation.updated` for admin edits; `compensation.self_updated` for employee self-edits — metadata.fields_updated distinguishes scope).
- *(Retired 2026-06-02)* `change_request.submitted/approved/rejected/cancelled` — table dropped in migration 0048. Historical rows remain queryable.
- Leave submission and approval/rejection.
- Document upload/delete/download.
- Role changes.
- Failed authorization attempts (`auth.access_denied`).
- Server Action `safeParse` failures (`input.validation_failed`, entity `server_action`). Metadata: `{ resource, fields, issue_codes }` — field names and zod issue codes only; no submitted values, to keep PII out of `audit_logs`. Written by `logValidationFailed` in `src/server/audit.ts`.
- Lookups against a syntactically-valid but nonexistent entity (`entity.not_found`, entity = the missing table, `entity_id` = the UUID that did not resolve). Metadata: `{ resource, reason? }`. Suppressed when the database call itself errored (already surfaced through `console.error`). Written by `logEntityNotFound` in `src/server/audit.ts`. Distinct from `auth.access_denied`: `entity.not_found` fires before any scope check, when the targeted row simply does not exist.
- **Admin access to the new families** is one click from `/audit-logs` via the "Quick filters — forge-probe detection" row at the top of the filter card: "Suspicious input (today)" pre-fills `?action=input.validation_failed&from=<today>`, "Missing-entity probes (today)" pre-fills `?action=entity.not_found&from=<today>`. Today-scope deliberately filters historical typo noise and surfaces fresh probing activity. Volume signals (many rows from one actor in a short window) are the actionable pattern.

### Design note: `entity.not_found` uniformity (RLS-denied vs genuine missing)

In Server Actions that use the **session client** (`createClient()`) for the initial lookup — `approveLeaveRequest`, `rejectLeaveRequest`, `cancelLeaveRequest` in `src/server/actions/leave.ts`, `getSignedDownloadUrl` in `documents.ts` — `.maybeSingle()` returns `null` in two cases that the action layer **cannot distinguish**:

1. The row does not exist (genuine not-found).
2. The row exists, but RLS filtered it out for the current user (scope-denied without authoritative knowledge that the row exists).

Both cases write the same `entity.not_found` audit row with the same metadata shape. This is a **deliberate design choice**, not an oversight:

- **No information leak via the audit channel.** A non-admin probing UUIDs cannot distinguish "this UUID is real but you can't see it" from "this UUID does not exist." Both classes of forge produce identical audit signals.
- **No timing-side-channel introduced.** Both branches take the same code path through the helper, with the same insert latency.
- **Detection still works.** Volume-based detection (an actor producing many `entity.not_found` rows in a short window) catches both forge classes equally well — see the admin audit-log filter for high-frequency probing.

When a future reviewer needs to differentiate the two cases — for example, to surface a different operator-facing warning — the action should first call the admin client to authoritatively check existence, then emit a `reason: "scope_denied"` vs no-reason metadata. Do not pull that distinction into the action layer pre-emptively; the uniformity is a security property of the current design.

Actions that use the **admin client** directly for the lookup (e.g. `softDeleteDocument`, `approveChangeRequest` / `rejectChangeRequest` after the atomic status-gated update) do not have this conflation — a null result there means the row truly does not exist (or is not in the expected status), and the `reason: "missing_or_not_pending"` metadata reflects that.

## OWASP Top 10 2025 Mapping

- **Broken Access Control** — primary risk; enforce via RLS + server-side checks, not UI hiding.
- **Security Misconfiguration** — prevent public buckets, missing RLS, permissive CORS, leaked env vars. Password-reset/invite link origin is built from the configured `APP_URL` env (server-only) when set, not request headers, so it can't be host-header-poisoned; GoTrue's redirect allowlist (`SITE_URL`/`ADDITIONAL_REDIRECT_URLS`) is the upstream mitigation (`src/server/actions/auth.ts` `authRedirectUrl`).
- **Software Supply Chain Failures** — track npm audit findings; current residual: moderate PostCSS advisory through `next@16.2.4` (tracked upstream, not force-fixed).
- **Cryptographic Failures** — rely on Supabase Auth and secure cookie handling defaults. Secret-bearing env modules are fenced behind `import "server-only"` so a Client Component importing one is a build error: `src/lib/env.ts` (`SUPABASE_SERVICE_ROLE_KEY` / `APP_URL` via `getServerEnv`) and `src/lib/email-env.ts` (`RESEND_API_KEY`). Public `NEXT_PUBLIC_*` getters live in `src/lib/env.public.ts` (no fence). Rule: the `server-only` sentinel belongs on the module that *owns* a secret, not only on its current consumer; never move a server getter into the public module.
- **Injection** — use structured Supabase APIs, Zod validation, and parameterized access.
- **Insecure Design** — role boundaries designed before features are built.
- **Authentication Failures** — Supabase Auth SSR; consider MFA/AAL2 for privileged admin operations in a future hardening pass.
- **Software/Data Integrity Failures** — audit critical changes and payroll exports.
- **Security Logging and Alerting Failures** — append-only audit trail for sensitive actions; authorization failures logged.
- **Mishandling Exceptional Conditions** — no stack traces or internal error details returned to clients.

## Assumptions

- Supabase Auth is the identity source.
- Role assignments are stored in `profiles.role` (trusted DB state); JWT `app_metadata.role` is a derived cache synced by trigger — DB always wins on conflict.
- Admins are trusted operators, but audit logging still applies.
- Managers only need direct-report access; direct-report scope excludes terminated employees.
- MFA/AAL2 can be introduced for sensitive admin operations once auth basics are stable.

## Never

- Expose service-role keys in frontend code.
- Rely only on client-side role checks.
- Store secrets in the repository.
- Make Storage buckets public for HR/payroll documents.
- Skip RLS because this is an MVP.
