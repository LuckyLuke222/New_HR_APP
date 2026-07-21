# Phase 5 Agent Findings

Date: 2026-04-27

## Sources Checked

- Current Next.js data-security and Server Action guidance.
- Current Supabase SSR/Auth Admin API guidance.
- Current Supabase RLS and API key guidance.
- Local Phase 5 implementation, SQL migrations, current phase notes, and agent responsibilities.

## Research Agent Outcome

Initial outcome: conditional pass with one security failure.

After hardening: pass with runtime risk.

Aligned:

- Server Actions re-check authentication and authorization inside handlers.
- Zod validation is used for mutation inputs.
- Supabase SSR client is cookie-based and server-side reads use the authenticated client.
- Supabase Auth Admin API is isolated behind a server-only client.

Failed:

- `insert_audit_log()` is a public security-definer RPC granted to all authenticated users. It accepts caller-supplied actor/action/entity/metadata, so audit events can be forged.

Fix applied:

- App audit writes now use a server-only service-role helper that inserts into `audit_logs` directly.
- Migration `0014` revokes public/anon/authenticated execute on `insert_audit_log()`.

## QA Agent Outcome

Initial outcome: fail.

After hardening: partial pass; live Auth checks remain pending.

Passed:

- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- Static role checks and validation patterns.

Failed or blocked:

- `npm run test:e2e` fails because existing smoke tests are stale for protected auth flow.
- Live admin/manager/employee runtime checks remain blocked by hosted Supabase Auth instability.
- Employee creation is split across Auth Admin API and public HR tables, so partial state can occur if downstream writes fail.

Fix applied:

- E2E smoke tests now cover the protected-route login redirect and mobile login page.
- Employee creation cleans up partial Auth/profile state on downstream create failure.

## Review Agent Outcome

Initial outcome: fail until fixes are applied.

After hardening: pass with runtime risk.

Blocking findings:

- Manager assignment is only UI-filtered. Server Actions must validate that manager IDs belong to valid admin/manager profiles and must prevent self-manager assignment.
- Employee creation can leave partial state after Auth user creation succeeds.

Fix applied:

- Employee and department Server Actions validate selected managers server-side.
- Employee creation attempts profile/Auth cleanup and writes failure audit events if profile or employee-record writes fail.

Non-blocking findings:

- Detail-page tabs are visual only.
- Current Phase 5 docs had stale wording and needed alignment.
- DAL boundaries and repeated form/action helpers are acceptable for v1 but should be revisited if another mutation surface repeats the pattern.

## UI/UX Agent Outcome

Initial outcome: pass with findings.

After hardening: pass with notes.

Findings:

- Employee detail tabs look interactive but do not switch content.
- Route-level loading states are missing.
- Department inline edit/delete table is dense on mobile.
- Delete confirmation uses native `window.confirm`; an app dialog would be more consistent.
- Form success/error messages need live-region semantics.
- Field errors need `aria-describedby`.
- Mobile navigation hides admin-only destinations beyond the first five items.

Fix applied:

- Employee detail tabs are search-param backed links with placeholder panels.
- Employee and department loading states were added.
- Department delete now uses an inline confirmation instead of `window.confirm`.
- Form messages use live-region roles and errors are associated to fields.
- Mobile navigation no longer truncates role-visible destinations after five items.

Remaining note:

- Department inline editing is still dense on mobile; a dialog or drawer would improve polish.

## Security Agent Outcome

Initial outcome: fail.

After hardening: partial pass; live DB/Auth verification remains pending.

Blocking findings:

- `employee_compensation` RLS exposes full own-row sensitive fields to employees because RLS is row-level, not column-level.
- Audit log RPC is forgeable by any authenticated user.
- Employee creation uses a predictable visible default password.

Additional findings:

- Profile self-update policies permit more direct client-side updates than the self-service UI allows.
- Manager document policy does not block contracts.
- Storage bucket and `storage.objects` RLS are not implemented yet; this is expected before the documents phase can pass.
- Employee detail IDOR attempts are safely hidden by RLS/not-found behavior but not audited.
- Service-role client usage is server-only, but the local secret must stay uncommitted and should be rotated if exposed.

Fix applied:

- Migration `0014` removes employee direct compensation row access.
- Migration `0014` tightens direct profile update grants to display name, phone, and avatar URL.
- Migration `0014` blocks manager access to contract document metadata.
- Employee creation now uses a generated random password that is not displayed or returned to the client.

## Required Next Actions

- Apply migration `0014` to the live Supabase project.
- Run live checks for audit RPC revocation, compensation employee denial, profile grant tightening, and manager contract-document denial.
- Run authenticated admin/manager/employee CRUD and role-visibility checks once hosted Auth is stable.
- Add richer authenticated E2E coverage after demo sign-in works reliably.
