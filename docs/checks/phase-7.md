# Phase 7 Exit Checks — Documents

Date: 2026-04-28
Agents run: QA Agent, Security Agent, UI/UX Agent

---

## QA Agent

All 12 assigned checks PASS.

| Check | Result | Notes |
|---|---|---|
| Employee-only-for-self upload guard | PASS | `actions/documents.ts:74` — checked before any storage write; audit log written on violation |
| Employee cannot upload payslips | PASS | `actions/documents.ts:89`; also blocked by `employee_insert_own_documents` RLS (category != 'payslip') |
| Manager blocked from upload | PASS | `actions/documents.ts:94`; no manager INSERT policy on storage.objects |
| Session client used for visibility before signed URL | PASS | `getSignedDownloadUrl` uses session client RLS check; admin client only called after |
| Signed URL via admin client, not raw path | PASS | `createSignedUrl` used; no `getPublicUrl` anywhere |
| Soft delete admin-only | PASS | `requireRole(["admin"])` at top of `softDeleteDocument` |
| Audit logs: uploaded, downloaded, deleted, access_denied | PASS | All four audit events present with correct metadata |
| Orphan cleanup on metadata insert failure | PASS | `admin.storage.from(BUCKET).remove([storagePath])` called on DB error |
| Zod validation: employeeId, category, title, documentId | PASS | `uploadSchema` covers all three upload fields; UUID validation on documentId |
| TypeScript + build | PASS | Clean after agent fixes |
| Category filter wired to DAL | PASS | `page.tsx` derives filter from searchParam; passed to `getDocuments` |
| Employee isolation via session client in DAL | PASS | `dal/documents.ts:43` uses `createClient()` not admin client |

Issues noted (non-blocking):
- No automated test files exist for Phase 7 — carry forward to Phase 12 hardening.
- `is_shared` column set on insert but never read by any RLS policy or UI — dead code; documented as future feature, not a security gap.

---

## Security Agent

11 of 12 checks PASS. Security agent flagged manager metadata RLS missing `contract` — **this was already fixed by migration `0014_phase5_security_hardening.sql` line 47** which drops and recreates `manager_select_direct_report_documents` with `not in ('payslip', 'id_document', 'contract')`. QA agent confirmed this on cross-check. All 12 checks effectively PASS.

| Check | Result | Notes |
|---|---|---|
| Bucket `public = false` | PASS | `0015_storage_documents.sql:13` |
| No `getPublicUrl` / no raw storage URLs | PASS | Only `createSignedUrl` used |
| Signed URL expiry ≤ 60s | PASS | `SIGNED_URL_EXPIRY_SECONDS = 60` constant |
| Server-generated only (server-only module) | PASS | `"use server"` + admin client is `server-only` |
| Manager Storage RLS excludes payslip, id_document, contract | PASS | `0015:66` — all three excluded via EXISTS subquery |
| Manager document metadata RLS excludes payslip, id_document, contract | PASS | `0014:47` recreated policy includes `'contract'` |
| Service-role key not client-exposed | PASS | `admin.ts` has `import "server-only"` |
| Employee cross-access blocked on upload | PASS | `actions/documents.ts:74` |
| Audit log on access denied | PASS | Written before return at line 75 |
| No IDOR on download | PASS | Session client RLS check before admin client URL mint |
| OWASP A01 — requireRole at top of every action | PASS | All three actions |
| OWASP A02 — expiry enforced server-side | PASS | Constant in server-only module |

Fixes applied from agent recommendations:
- **Signed URL forced as download**: added `{ download: true }` to `createSignedUrl` call — prevents inline rendering of stored files in browser.

Deferred (not blocking Phase 7):
- Extension derived from user-supplied filename (low risk — bucket MIME allowlist is the real guard; enhancement for Phase 11).
- `console.error` in production (not a security issue; code quality note for Phase 11).

---

## UI/UX Agent

All 14 checks PASS.

| Check | Result | Notes |
|---|---|---|
| Upload progress state | PASS | Button shows "Uploading…" when pending |
| Upload error state | PASS | Top-level banner + field-level errors |
| Upload success state | PASS | Emerald success banner |
| Download progress state | PASS | Button shows "Generating…" when loading |
| Download error state | PASS | Error shown below button |
| Category filter | PASS | Select + Apply + conditional Clear link |
| Empty state | PASS | Context-aware message (filter vs no docs) |
| Loading state | PASS | `loading.tsx` skeleton with animate-pulse |
| Destructive action confirmation | PASS | `confirm()` in onClick before form submit |
| Role-based UI | PASS | Upload hidden from manager; delete hidden from non-admin |
| Accessibility basics | PASS | sr-only labels, aria-hidden icons, aria-label on delete |
| Responsive layout | PASS | overflow-x-auto table, w-full inputs |
| Visual consistency | PASS | Matches leave module border/bg/badge patterns |
| Employee column visibility | PASS | Hidden for employee role in both header and body |

Fixes applied from agent recommendations:
- **`onSuccess` during render**: moved to `useEffect` keyed on `state.success` — prevents React warnings and repeated calls.
- **Form reset on success**: `formRef.current?.reset()` called inside the effect — clears file input and fields.
- **Download error `role="alert"`**: added to error paragraph for screen-reader announcement.

---

## Summary

**Phase 7 status: APPROVED for exit.**

All blocking checks across QA, Security, and UI/UX PASS after applying fixes. Phase 12 follow-up added authenticated upload/download coverage, raw Storage path denial, signed URL expiry, and document upload/download audit assertions. Remaining document hardening is direct-query RLS depth, not a hosted Auth blocker.
