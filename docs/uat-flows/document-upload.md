# Document Upload

**Time:** 20 minutes  •  **Roles:** employee → admin (+ manager guard)  •  **Modules:** `/documents`, `/audit-logs`

Document lifecycle: upload → category policy → signed download → soft delete. Verifies the category restrictions per role (Phase 7), the MIME/size policy (Session 70), and the signed-URL expiry behaviour.

## Preconditions

- All three role users sign in.
- Two test files on disk:
  - **`uat-contract.pdf`** — any valid PDF, ≤ 10 MiB.
  - **`uat-bad.txt`** — a `.txt` file used to trigger the MIME mismatch path.
- Note the latest audit timestamp.

## Steps

| # | Actor | Step | Pass criteria |
|---|---|---|---|
| 1 | Alice | Sign in. Open `/documents`. | Page loads with employee-scoped list (her own documents only). |
| 2 | Alice | Open the **Upload document** panel. Note: as employee, the category selector does NOT include **Payslip** (Session 70 / Phase 7 policy). | Categories visible: Contract, ID Document, Policy, Other. Payslip absent. |
| 3 | Alice | Pick category **Contract**, title "UAT — Employment Contract", choose `uat-contract.pdf`, submit. | Success message. Audit row `document.uploaded`. Document appears in Alice's list. |
| 4 | Alice | Pick category **Policy**, title "UAT — Policy Mismatch", choose `uat-bad.txt`, submit. | Upload **rejected** before the Storage object is created. Friendly error explains MIME / extension mismatch (Session 70). No orphaned Storage object exists. |
| 5 | Alice | Click **Download** on her uploaded contract from step 3. | A new tab opens. Downloaded URL resolves to a signed Supabase URL with `expires=...`. File downloads. Audit row `document.downloaded`. |
| 6 | Alice | Copy the signed URL from the address bar (or DevTools). Wait > 60 seconds, then paste into a fresh tab. | The link returns an expired-token error (signed URL TTL ~60 s). No download. |
| 7 | Manager | Sign in. Open `/documents`. | Manager sees Alice's contract (direct report) but **does not** see Bob's documents. Manager **does not** see Alice's payslips/id_document/contract per Phase 7 manager-document-category RLS depending on category — Contract is partially restricted. Re-read Phase 7 if unsure; the precise allowed categories for manager scope are documented there. |
| 8 | Manager | Try to upload a document. | Manager **cannot** upload — they should not see the Upload panel. (Phase 7: managers blocked from upload.) |
| 9 | Bob | Sign in. Open `/documents`. | Bob sees only his own documents. Does not see Alice's. |
| 10 | Admin | Sign in. Open `/documents`. | Admin sees all documents. Category filter works. |
| 11 | Admin | Filter by category **Contract**. Find Alice's UAT contract. | Visible. |
| 12 | Admin | Upload as admin: category **Payslip**, title "UAT — Alice Payslip Jan", `uat-contract.pdf` (re-used as the PDF content), pick Alice as the employee. Submit. | Success. Document appears under Alice. Audit row `document.uploaded`. (Payslip category only available to admin.) |
| 13 | Alice | Refresh `/documents`. | Alice sees the payslip the admin just uploaded for her. Recent documents panel on her dashboard reflects it (Session 76). |
| 14 | Admin | On Alice's UAT contract row, click **Delete**. Confirm the dialog. | Document soft-deletes from the list. Storage object is also removed (Session 24 best-effort cleanup). Audit row `document.deleted`. |
| 15 | Alice | Refresh `/documents`. | The soft-deleted contract is **not** in her list. Her dashboard's Recent documents panel reflects only remaining documents. |
| 16 | Bob | Try `/documents/<Alice's doc id>` direct URL (if you can reconstruct it). | Returns access denied or not found. Audit row `auth.access_denied` (Phase 7 RLS guard). |

## Audit log events to verify

- `document.uploaded` × 2 (Alice's contract + admin's payslip for Alice)
- `document.upload_rejected` or equivalent × 1 (the .txt rejected — name may vary; see Session 70)
- `document.downloaded` × 1
- `document.deleted` × 1
- `auth.access_denied` × 1 (Bob trying cross-user access)

## What to check on the next dashboard refresh

- **Alice's dashboard:** Recent documents panel shows the admin-uploaded payslip; does not show the deleted contract.
- **Admin's dashboard:** Recent audit events shows the upload + delete entries.

## Cleanup

- Delete the admin-uploaded UAT payslip via admin `/documents` row → Delete to avoid surfacing a fake payslip on Alice's dashboard between rotations.
- Soft-deleted documents are intentionally retained with `deleted_at` set; no UI exposure means they're invisible but the row + audit entry remain (audit integrity).

`npm run cleanup:e2e-data` removes Playwright-prefixed document titles only.

## Notes for the reviewer

If step 2 shows **Payslip** to an employee, that's a Phase 7 regression — file as critical. If step 6's expired URL still downloads, that's a signed-URL TTL regression. If step 14 leaves the Storage object behind (you'd need Supabase Studio to verify), that's a Session 24 regression on the soft-delete cleanup. Step 4's pre-Storage rejection is the heart of Session 70's policy — if a `.txt` lands in Storage even briefly, the rejection is too late.

## Findings
1.  When admin uploads a document, employee sees it as uploaded by "unknown".  Can we look into?
2. When deleting, i get popup.  We removed all this type of behaviour previously.  Can we remove it here as well?  Find another way to confirm delete, based on other parts of the project.

## Severity ranking and remediation batches (2026-06-01)

Captured after the full UAT rotation completed. Findings above are grouped into severity tiers and batched by file/area to minimise churn.

### Severity tiers

**Critical** — data integrity / security
- (none)

**High** — incorrect guard behavior / lifecycle / process
- (none)

**Medium** — UX gaps / missing affordances
- F1 ✅: Admin-uploaded document shows "Unknown" uploader to the recipient employee. Root cause: `fetchProfileNames` in [src/server/dal/documents.ts:69,77](../../src/server/dal/documents.ts#L69) uses the RLS-scoped Supabase client; `profiles` RLS hides the admin's row from a non-direct-report employee → `profiles.get(admin_id)` undefined → `?? "Unknown"` fallback. Same RLS-as-filter class as the Session 150 leave inactive-type bug.

**Low** — polish
- F2 ✅: Delete document button triggers a `window.confirm()` popup ([src/components/documents/soft-delete-document-form.tsx:22-24](../../src/components/documents/soft-delete-document-form.tsx#L22)). Project pattern (cancel-leave, leave-type-deactivate, public-holidays) is no popup — direct submit with inline `useActionState` feedback. Soft-delete is reversible at audit level so a popup adds no safety.

### Remediation batches

| Batch | Findings | Surface area | Severity | Notes |
|---|---|---|---|---|
| **B1** Document uploader name resolution | F1 | [src/server/dal/documents.ts](../../src/server/dal/documents.ts) (likely also a new RPC migration under `supabase/migrations/`) | Medium | ✅ Closed Session 151 (Claude) — new migration `0046_profile_display_names_rpc.sql` adds `security definer` RPC `get_profile_display_names(p_ids uuid[])` mirroring 0033/0045; `fetchProfileNames` in documents.ts now routes through the RPC so RLS-hidden admin uploader resolves to display_name instead of "Unknown". |
| **B2** Document delete UX consistency | F2 | [src/components/documents/soft-delete-document-form.tsx](../../src/components/documents/soft-delete-document-form.tsx) | Low | ✅ Closed Session 151 (Claude) — `window.confirm()` replaced with inline two-step confirm: first click arms (`armed` useState + `event.preventDefault` + visible label flip to "Click again to confirm" + destructive-toned bordered chip), second click submits natively. `useEffect` watching `state.message` resets `armed=false` on server error so the user must re-arm before retrying. New Playwright pin at [tests/e2e/admin.spec.ts:554](../../tests/e2e/admin.spec.ts#L554). The 3 sibling `confirm()` sites in payroll/onboarding stay scoped to their own UAT flows per user decision. |

### Recommended sequencing

1. **B1 → B2** — B1 is Medium and architecturally non-trivial (RPC vs RLS decision); B2 is a 3-line removal. Either order works; B2 is a quick-win if scoped first.

### Open product questions

- **B1** — Path (a) RPC vs (b) widen `profiles` RLS? Recommend (a) by analogy with migration 0045 (`get_company_approved_leave`) — keeps `profiles` RLS narrow. Confirm before writing the migration.
- **B2** — Sweep the other 3 `confirm()` call sites (payroll cancel, onboarding template/task) in the same PR, or scope strictly to documents and log the rest as a follow-up?

### Remediation log

**Session 151 (Claude, 2026-06-01) — B1 + B2 closed**

- **B1 — Document uploader name resolution.** New migration [supabase/migrations/0046_profile_display_names_rpc.sql](../../supabase/migrations/0046_profile_display_names_rpc.sql) adds `security definer` function `get_profile_display_names(p_ids uuid[])` returning `(id, display_name)`. Pattern mirrors `get_people_directory` (0033) and `get_company_approved_leave` (0045): `auth.uid() is not null` guard, `set search_path = public`, revoked from public + granted to authenticated, coalesce `display_name → work_email → 'Unknown'`. [src/server/dal/documents.ts:130-145](../../src/server/dal/documents.ts#L130) `fetchProfileNames` body swapped from direct `profiles.select` to `supabase.rpc("get_profile_display_names", ...)`; same `Map<string,string>` return shape so the 2 callers (`getDocuments`, `getDocumentById`) inherit the fix. Disclosure surface analysis in the migration header: no new PII surface vs. `get_people_directory` which already exposes display_name + work_email for every active employee to every authenticated user.
- **B1 /user-check.** QA clean. Review APPROVED-WITH-FIXES — 2 NITs auto-routed to [docs/follow-ups.md](../follow-ups.md) ("Auto-routed NITs from /user-check 2026-06-01 (B1 document uploader RPC)"): (1) `fetchProfileNames` fragmented across 7 DAL files — sweep candidate to extract a shared util calling the new RPC; (2) `dashboard.ts:714` helper omits the `work_email` fallback the other 6 helpers share.
- **B2 — Document delete UX consistency.** [src/components/documents/soft-delete-document-form.tsx](../../src/components/documents/soft-delete-document-form.tsx) replaced `window.confirm()` with an inline two-step confirm: `armed` useState, first click `event.preventDefault()` + arm (button flips to "Click again to confirm" with destructive-toned bordered chip + aria-label "Confirm delete document"), second click submits the form natively. Auto-applied UIUX fix: `useEffect` watching `state.message` resets `armed=false` on server error so the user must re-arm before retrying. New Playwright pin at [tests/e2e/admin.spec.ts:554](../../tests/e2e/admin.spec.ts#L554) (`admin delete document requires a two-click inline confirm (B2)`) — seeds via supabaseAdmin, asserts both states + audit + `deleted_at` DB invariant + `try/finally` cleanup. Backstop added to [scripts/cleanup-playwright-artifacts.mjs:105-110](../../scripts/cleanup-playwright-artifacts.mjs#L105) (`"Admin Delete Pin Doc"` in `documentTitlePrefixes`).
- **B2 /user-check.** QA clean (1 pre-existing-gap NIT routed). Review APPROVED-WITH-FIXES (3 NITs routed: extract `<TwoStepConfirmButton>` at rule-of-three; no blur-reset on armed; test comment cleanup). UIUX APPROVED-WITH-FIXES (auto-applied error-reset useEffect; 1 NIT routed on touch-target size).
- **Pre-smoke gate** clean for both batches.

**Session 151 (Claude, 2026-06-01) — bonus app-shell race fix (out of UAT scope)**

- Playwright loop on the B1 targeted suite surfaced a sidebar-hydration race that intercepted Upload-document clicks on `/documents` (pre-existing, also observed on `/dashboard` per `docs/follow-ups.md:148`). Two surgical fixes in [src/components/app/app-shell.tsx:151,207](../../src/components/app/app-shell.tsx#L151): sidebar SSR `width` default flipped from `DEFAULT_EXPANDED_WIDTH` → `COLLAPSED_WIDTH`; main column SSR `paddingLeft` removed in favour of `lg:[padding-left:var(--sidebar-width,4rem)]` (Tailwind fallback now matches collapsed sidebar). Removes overlap + matches stated `collapsed=true` default. Closes follow-ups.md:148.
- Same loop exposed a `<details open={false}>` reconciliation bug in [src/components/ui/collapsible-section.tsx](../../src/components/ui/collapsible-section.tsx): RSC re-renders after Server Action `revalidatePath` were slamming the panel shut and hiding the success Alert. Converted to `"use client"` + controlled `open` via `useState`/`onToggle`.
- Stale Next.js dev-server cache masked both fixes on first re-run for app-shell and CollapsibleSection respectively — killing port 3000 forced a rebuild for the new `"use client"` boundary. Worth remembering for future client-component boundary changes.

