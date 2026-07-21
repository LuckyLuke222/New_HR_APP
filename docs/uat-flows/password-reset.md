# Password Reset

**Status (Session 154, 2026-06-02): ✅ Closed — walked end-to-end, no findings.** Both public self-service (`@kushhr.dev` rejection + deliverable-email generic-success) and admin-generated recovery link paths verified. Invalid-link guards (steps 5–6), recovery-session clearing on success (step 8), old-password rejection (step 10), autofill-compatible login (step 11), and `next` param redirect (step 12) all passed. Audit rows present. Alice's password restored to `TestPass123!` per step 13. Pending-backlog Email-notifications item updated to flag that the public `/forgot-password` path relies on Supabase Auth email delivery and will need its own provider when off Supabase Cloud.

**Time:** 20 minutes  •  **Roles:** unauthenticated user → admin → employee  •  **Modules:** `/login`, `/forgot-password`, `/reset-password`, employee profile, `/audit-logs`

End-to-end of both reset paths: public self-service (Session 79 / 81 implicit-flow client) and admin-generated recovery link (Session 82). Verifies link validation, completion UX (Session 80), and the autofill-compatible login (Session 84).

## Preconditions

- `admin@kushhr.dev` can sign in.
- A second browser / private window for the unauthenticated path.
- A real, deliverable email inbox you can access — the public `resetPasswordForEmail` flow requires a non-`@kushhr.dev` address that Supabase will actually deliver to. If no such address is available, treat the public-flow step 4 as a smoke check only (the "demo email rejected" branch is what's testable).
- Note the latest audit timestamp.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Unauthenticated user | Open `/login` in a fresh private window. | Login page renders. Email + Password labels visible. Forgot password link visible. |
| 2 | Unauthenticated user | Click **Forgot password?** | Lands on `/forgot-password`. Form has uncontrolled email input (Session 81 — verify by typing without losing focus on re-renders). |
| 3 | Unauthenticated user | Type a `@kushhr.dev` seed address (e.g. `alice@kushhr.dev`). Submit. | Specific demo-email message appears explaining `@kushhr.dev` seed accounts cannot receive reset emails (Session 79). Audit row `auth.password_reset_request_failed` or similar. |
| 4 | Unauthenticated user | Submit a deliverable real email address. | Generic success message: "If that email belongs to a KushHR account, a reset link has been sent." (Same message whether the email exists or not — no account enumeration.) `/api/auth/password-reset-requested` returns 200. Audit row `auth.password_reset_requested`. |
| 5 | Unauthenticated user | Open `/reset-password` directly (no token in the URL). | Friendly message: a valid reset link is required. Update Password button is disabled. (Session 83 / Phase 13 invalid-link path.) |
| 6 | Unauthenticated user | Open `/reset-password?token_hash=abc123` (partial / fake token). | Specific incomplete-link message (Session 82). No password update is possible. |
| 7 | Admin | Sign in. Open Alice's profile (`/employees/<alice-id>`). Click **Generate password reset link**. | Audit row `auth.password_reset_link_generated` for Alice's id. The link field shows the full URL ending in `token_hash=…&type=recovery`. **Copy** button copies the exact URL (Session 82). |
| 8 | Alice (second browser) | Paste the copied URL. Page loads. Enter a new password (e.g. `NewUatPass!23`). Confirm. Submit. | Recovery session verified before the form enables. Submit succeeds. Page redirects to `/login?message=password-updated` (Session 80). Login page shows the success banner. Audit row `auth.password_reset_completed`. |
| 9 | Alice | Sign in with the new password. | Lands on `/dashboard` as employee. |
| 10 | Alice | Sign out. Sign in with the **old** password. | Sign-in fails with generic invalid-credentials message. |
| 11 | Alice | Sign in again with new password. **Trigger Chrome's autofill** (or simulate by setting `value` via DevTools `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set!.call(emailEl, 'alice@kushhr.dev')`). | Email + password fields **retain** the autofilled values across re-renders (Session 84 — uncontrolled inputs). Sign in proceeds. |
| 12 | Alice (third browser tab) | Sign in to KushHR. Then back-button to `/login?next=%2Fperformance`. | Already-authenticated browser back-button hit redirects to `/performance` (the `next` param), not `/dashboard` (Session 84 / Batch 1 A3). |
| 13 | Alice | Reset Alice's password back to `TestPass123!` (the seed default) using the same admin reset-link path so future flows don't break. | Password updated. |

## Audit log events to verify

- `auth.password_reset_requested` × 1 (public flow with deliverable email)
- A failed request audit row × 1 (seed `@kushhr.dev` rejection)
- `auth.password_reset_link_generated` × 1 (admin-generated for Alice)
- `auth.password_reset_completed` × 2 (Alice's new password, and the reset back to the seed default)

## What to check on the next dashboard refresh

After the flow, sign back in as admin and verify:

- Recent audit events panel includes the password reset entries.
- Login page no longer shows the "Password updated" banner once Alice navigates away from `/login`.

## Cleanup

- **Critical:** confirm Alice's password is back to `TestPass123!` after step 13 — Playwright auth setup relies on this. If you skipped step 13, the full Playwright suite will fail at `tests/e2e/auth.setup.ts`.
- No data artifacts to remove. Audit log entries are intentionally retained.

`npm run cleanup:e2e-data` is not relevant here — this flow only touches Auth + audit.

## Notes for the reviewer

If step 4 reveals whether the email exists (e.g. by returning a different message), that's a critical account-enumeration regression — file immediately. If step 5 lets the form submit without a token, that's a Session 83 regression. If step 8 keeps the user signed in via the recovery session (instead of forcing re-auth at `/login`), that's a Session 80 regression — the recovery session must be cleared on success. If step 11's autofill is wiped, that's a Session 84 regression on uncontrolled inputs.
