# Follow-ups

Small, deferred items surfaced by `/user-qa`, `/user-review`, `/user-uiux`, `/security-review`, or ad-hoc code review. Things we don't want to forget but that aren't worth tracking in `pending-backlog.md` (which is reserved for strategic, multi-session work like the reporting module, role expansion, holiday calendar, etc.).

## How to use this file

- **Add an item** when something is *defer-able polish*: a NIT, a NEEDS-FIX whose impact isn't urgent enough to block, a follow-up surfaced during a review pass, a "while you're in here" sweep. One line per item, file:line citation, the source pass that surfaced it, and a date.
- **Promote to `pending-backlog.md`** if the item grows into strategic work (a meaningful feature, multi-session effort, or design decision that needs a plan).
- **Delete the line** when fixed. The fix is captured permanently in `handover.md`; this file is for what's still open.
- **Drop the line + add a one-line "decided not to" note in `handover.md`** if scope decision changes.

Keep it scannable. If a line needs more than two sentences, it probably belongs in a UAT-flow doc, in `pending-backlog.md`, or as a code comment.

### Auto-routed NITs from /user-check 2026-06-24 (user-flow inventory gate)

- `tools/check-user-flows.mjs` — `"Flow"` is read for error messages but not in the required-columns guard; a `Flow` header rename silently degrades coverage errors to `"(unnamed flow)"` instead of failing fast. Add `"Flow"` to the guard array. `(source: /user-qa, /user-review)`
- `tools/check-user-flows.mjs` — coverage title check uses `String.includes()` (substring); a title that is a prefix of a renamed test would false-pass, and a deleted test whose title lingers in a comment wouldn't be caught. No live collision today (titles are distinctive). Tighten to a `test(`/`it(`-declaration regex. `(source: /user-qa, /security LOW Finding 2)`
- `tools/check-user-flows.mjs` — the `Covered by` parser validates only the **first** `<spec>.spec.ts › "title"` pair in a cell; a future multi-reference cell would silently check only the first. Add a one-line comment noting the limitation (not currently reachable — every row cites one test). `(source: /user-qa, /user-review)`

### Surfaced 2026-06-24 (user-flow inventory gate)

- `tools/check-user-flows.mjs` duplicates `actionInventory` / `pageInventory` / `routeFromFile` from `tools/check-access-matrix.mjs` (deliberate — avoids refactoring a shipped CI gate). This is the **2nd** consumer of that parse; on a **3rd**, extract `tools/lib/code-inventory.mjs` and repoint both gates (rule of three). `(source: plan decision)`

### Auto-routed NITs from /user-check 2026-06-19 (access-matrix step 6 — cross-check gate)

- `tools/check-cross-check.mjs:25-26` — `RLS_MAP`/`MATRIX` default to bare relative paths resolved against `process.cwd()`; running `node check-cross-check.mjs` from inside `tools/` gives ENOENT. Pre-existing convention (sibling `check-access-matrix.mjs:23-24` identical); anchor both to repo root if either is ever touched. `(source: /user-qa)`
- `tools/check-cross-check.mjs:69` — `Storage Buckets` section regex is case-sensitive (`/^Storage Buckets\b/`); won't match a lowercased header. Exact-case in the doc today, so not currently a problem. `(source: /user-qa)`
- `tools/check-cross-check.mjs:66-71` — `dbTableInventory` only counts backtick-wrapped `## ` headers; an unquoted `## tablename` header would be silently excluded from the governed inventory (false assurance the table is gated). Add a `rls-policy-map.md` note that every governed table header must use the backtick form, or warn on an unrecognised non-backtick `## ` header. `(source: /security)`
- `tools/check-cross-check.mjs:86` — the `^#`-heading section-exit guard in `crossCheckInventory` is order-dependent on the `## N.` entry branch above it firing its `continue` first; safe today, but widening the entry regex (e.g. `## 7` without a dot) could let the guard suppress the entry. Add a comment noting the coupling if touched. `(source: /user-review)`
- `tools/check-cross-check.mjs:68` vs `:104` — two parse strategies in one file (`dbTableInventory` global `matchAll` vs `crossCheckInventory` line-walk; `firstCellTokensOfSection` first-match-only vs `matchAll`). All correct/intentional (Storage rows name one bucket; §7 may carry alias tokens) — a one-line comment on each explaining the asymmetry would aid the next reader. `(source: /user-review)`

### UX feedback gap 2026-06-18

- **`SearchableSelectField` silently clears a no-match entry — no user feedback** (`src/components/ui/searchable-select.tsx` ~85-101: on blur, when the typed query matches no option it does `setQuery("")`). Observed in the manager document-upload picker: typing/picking someone not on the team makes the selection **disappear silently**, with no error or reason. Per systems-thinking (visible signal on failure), it should surface an inline hint instead (e.g. "No match — pick from the list" / keep the text + mark invalid). **Shared component** — fix benefits every searchable picker (uploads, admin employee/manager pickers, performance, onboarding), not just manager upload. `(source: manager upload smoke 2026-06-18)`

### Auto-routed NITs from /user-check 2026-06-18 (access-matrix step 2 suite)

- `tests/e2e/access-matrix.spec.ts` (AM3) — the employee `<select name="employeeId">` is targeted via `.first()`; scope it to `#document-upload-panel` so intent is explicit and a future second `employeeId` select can't silently mis-target. Matches the existing `security-rbac-guards.spec.ts:670` convention, hence non-blocking. `(source: /user-qa)`
- `tests/e2e/access-matrix.spec.ts` (AM2) — `expect(status).toBe(200)` adds no unique signal (a 200 with an error payload is the Server-Action contract); the `body.toMatch(/not found or access denied/i)` is the real proof. Harmless; drop or keep as documentation. `(source: /user-qa)`
- `tests/e2e/access-matrix.spec.ts` (file-header comment) — the DOM-swap prior-art reference names `manager.spec.ts` / `employee.spec.ts` but not a line; add `(e.g. manager.spec.ts:670)` so a reader tracing the technique doesn't have to grep. `(source: /user-review)`
- `tests/e2e/access-matrix.spec.ts` — decorative section-rule comments are inconsistent (§6.6 block uses a 3-dash `───` rule vs the 4-dash `────` rule on §6.1/§6.2). One-character cosmetic alignment if the file is next touched. `(source: /user-review)`
- `tests/e2e/access-matrix.spec.ts` (AM3) — the `manager_id = null` precondition reset has no `finally` restore. Matches the existing convention (`security-rbac-guards.spec.ts:670` / `rls.spec.ts:84` reset-to-null without restore, since null is bob's seed baseline and report-needing tests set it themselves), so non-blocking. Consider a capture-and-restore if test ordering ever makes the leak observable. `(source: /security)`

### Auto-routed from /user-check 2026-06-18 (own-docs / manager upload)

- `src/components/documents/document-upload-form.tsx` — `selectedEmployeeId` is `useState`-seeded from `state.values?.employeeId` (initial-only), so in theory it could desync from the picker after a validation round-trip. **Low/likely-moot:** the form submits the *current* selection, so `state.values.employeeId == selectedEmployeeId`; and `effectiveCategory` (derived) prevents any out-of-scope submit, so no security/functional gap. Not fixed inline because the obvious fix (a re-sync `useEffect`) reintroduces the `set-state-in-effect` lint just removed. Revisit only if a real desync is observed. `(source: /user-qa)`
- `src/components/documents/document-upload-form.tsx:29` — `EMPLOYEE_CATEGORIES` is also used for the manager-self branch; rename to `NON_PAYSLIP_CATEGORIES` (or comment) for clarity. `(source: /user-qa)`
- `src/app/(app)/documents/page.tsx` — `canUpload = isAdmin || isManager || employee` is always true given `requireRole([a,m,e])`; dead expression, can be dropped (always render the panel). `(source: /user-qa)`
- `src/server/dal/employees.ts` `getManagerUploadEmployeeOptions` / `getDirectReportIds` — a silent query error returns `[]` (picker shows only self), not surfaced. Pre-existing pattern; note for the DAL-error-surfacing sweep. A failed `getDirectReportIds` would also make a legit report-upload deny as `manager_upload_outside_scope` (misleading audit) — add a comment at `documents.ts:180`. `(source: /user-qa, /user-review)`
- **✅ CLOSED 2026-06-19 (migration 0054).** `storage.objects` SELECT now mirrors 0053: `0054_storage_objects_select_own_role_agnostic.sql` drops `employee_select_own_objects` and creates role-agnostic `select_own_objects`. Applied + policy swap verified; MS1–MS3 + Playwright (4/4) green; `/security` re-confirmed strictly-self, no cross-tenant widening. The cross-link comment was folded in (0054 header + `document-upload-policy.ts`). Residual doc-only NITs/LOWs auto-routed below (2026-06-19 block). ~~**`storage.objects` SELECT policy not mirrored to 0053 (review BLOCKER, deferred-by-decision pending).**~~ `0015_storage_documents.sql` `employee_select_own_objects` still gates `get_user_role()='employee'`, so own-file Storage SELECT for managers/admins is denied at the Storage layer — while `documents` metadata SELECT is now role-agnostic (0053). **No user-visible impact today** (downloads use `admin.storage.createSignedUrl`, service-role, bypassing Storage RLS), but it breaks the documented "Storage RLS mirrors metadata" invariant (`docs/rls-policy-map.md`). Fix = a new migration mirroring 0053 on `storage.objects` (`select_own_objects`: `bucket_id='hr-documents' AND (storage.foldername(name))[1] = auth.uid()::text`). **High-risk component (`storage.objects` RLS) → own systems-thinking + `/security`.** `/security` (2026-06-18) confirmed: not exploitable today (signed URLs use service-role; the gap only *false-denies* a direct-API own-file read, never false-grants) but required before phase close. **Fold in the LOW finding:** `manager_select_direct_report_objects` excludes `('payslip','id_document','contract')` independently of `MANAGER_UPLOAD_CATEGORIES` — add a cross-link comment so they can't drift. `(source: /user-review, /security)`
- `documents` INSERT RLS (`employee_insert_own_documents`, `role='employee'`) vs manager self-upload (admin-client insert bypasses it) — three artefacts (migration, rls-map, action comment) are consistent only because the admin client papers the gap; if a session client ever did manager writes it'd silently block. Document the dependency or add a `manager_insert_own_documents` policy. `(source: /user-review)`
- `src/app/(app)/documents/page.tsx:16` + `document-upload-form.tsx:21` — duplicate `CATEGORY_LABELS`; move to the shared `document-upload-policy.ts` (both already import it). `(source: /user-review)`
- `MANAGER_UPLOAD_CATEGORIES` is a three-point coupling (storage policy, documents policy, TS constant) held by comments; consider deriving from a DB ENUM/view in a future migration. `(source: /user-review)`

- `tests/e2e/` — **no manager-persona document-upload test** (admin.spec/employee.spec cover theirs). Add one: manager picker defaults to self, categories = all-non-payslip for self / policy-other for a report, clamp fires, forge denied. Natural home = the access-matrix executable suite (step 2) or a `manager.spec.ts` upload test. `(source: /user-uiux)` — **PARTIAL 2026-06-18:** the **forge-denied** leg is now pinned by `access-matrix.spec.ts` AM3 (manager→non-report upload → `manager_upload_outside_scope`). Still open: the **positive-path** UI assertions (picker defaults to self, reactive category list self↔report, clamp notice).
- `src/components/documents/document-upload-form.tsx:183-190` — `state.message` is rendered twice (the `<Alert>` + an inline `<p>`), so two live regions announce on submit; de-dup (pre-existing). `(source: /user-uiux)`
- `src/app/(app)/documents/page.tsx` subtitle — 2-level role ternary; a `Record<role,string>` map would read cleaner (polish). `(source: /user-uiux)`

### Access-matrix divergence 2026-06-18

- ~~**Manager document upload (decided change).**~~ **DONE 2026-06-18:** managers upload **for self (any non-payslip) + direct reports (policy/other)** — `uploadDocument` enforces `isSelf OR (report ∈ getDirectReportIds AND category ∈ MANAGER_UPLOAD_CATEGORIES)`; picker = self + reports; form reactive categories (self → all non-payslip; report → policy/other). Paired with migration 0053 (role-agnostic own-doc visibility) so managers see what they upload. Reports stay policy/other (keeps the 0014 hardening). `(source: access-matrix review)`
- ~~**GAP — managers cannot see their OWN documents.**~~ **DONE 2026-06-18 (migration 0053):** `select_own_documents` made role-agnostic (`employee_id = auth.uid()`) — every user sees their own documents. Manager self-upload restored (any non-payslip; reports stay policy/other). `docs/access-matrix.md` + `docs/rls-policy-map.md` updated. `(source: manager upload smoke 2026-06-18)`

### Pre-pilot decision 2026-06-18

- **DECISION — off-site backup destination (pre-pilot).** `infra/supabase/backup/backup.sh` writes encrypted archives **locally on the same host**; the `OFF-SITE` upload is a marked TODO. Local-only protects against bad-migration / accidental-delete (restore from yesterday) but NOT against the server/disk dying. Pick an off-site target (S3-compatible bucket / NAS / second host) and wire the ~2-line upload in `backup.sh`'s OFF-SITE block. Rides on the same IT/infra conversation as server exposure. **Settle before the pilot accumulates real data.** `(source: server-deploy backup discussion)`

### Security closures 2026-06-17 (db:migrate tool)

- **DONE (`/security`, LOW)** — pinned `set search_path = pg_catalog, pg_temp` on the two fully-qualified `supabase_admin` statements (ledger DDL + backfill insert) as defence-in-depth. **Deliberately NOT applied to the apply transaction** — migrations create unqualified `public` objects + use extension functions, so they must run under the default Supabase search_path (overriding it would create temp tables / break them); documented inline.
- **DONE (`/security`, LOW)** — added a comment on `fail()` that CI runs of `db:migrate` should mask psql stderr (verbatim output is fine for a local operator).

### Auto-routed NITs from /user-check 2026-06-17 (db:migrate tool)

- `scripts/db-migrate.mjs` (backfill branch, ~line 150) — `--backfill` is silently ignored when the ledger is already populated. Add an early `if (BACKFILL && applied.size > 0)` exit with "Ledger already populated — --backfill is a no-op; use `npm run db:migrate`." for clearer operator feedback. `(source: /user-qa)`
- `scripts/db-migrate.mjs` — `spawnSync` uses the default 1 MB `maxBuffer`. Fine now (migrations ~118 KB, ledger read tiny); revisit (pass a larger `maxBuffer`) if the migration suite or ledger output approaches ~500 KB. `(source: /user-qa)`
- `scripts/db-migrate.mjs` — unknown flags are silently ignored (only `--list`/`--backfill` recognised); a typo like `--backfil` runs incremental mode quietly. Add an unknown-flag warning. `(source: /user-review)`
- `scripts/db-migrate.mjs` (apply loop) — `apply.stdout` (psql NOTICE/INFO output during a migration) is discarded; for a long migration with progress notices that output is lost. Consider forwarding it. `(source: /user-review)`
- `scripts/db-migrate.mjs` — if both `--list` and `--backfill` are passed against an empty ledger, `--backfill` wins (the `--list` check is reached only with a non-empty ledger). Add a one-line precedence comment. `(source: /user-review)`
- `scripts/db-bootstrap.mjs` / `db-migrate.mjs` — if a third DB-ops script appears, extract the shared `psql()` helper to `scripts/lib/psql.mjs` (rule-of-three; two callers today, keep independent). And: if deploys ever go CI/CD, have `db:bootstrap` seed the ledger so a fresh instance needs no manual `--backfill`. `(source: /user-review)`

### Server-deploy prep 2026-06-17 (surfaced drafting `docs/server-deploy.md`)

- ~~**GAP — incremental migrations on a live server DB.**~~ **DONE 2026-06-17:** added `scripts/db-migrate.mjs` + `npm run db:migrate` — ledger (`kushhr_migrations.applied`) + apply-pending (per-migration txn) + one-time `--backfill` for pre-ledger DBs + `--list` dry-run + append-only drift guard. Documented in `docs/server-deploy.md` §6. `(source: server-deploy runbook)`
- **DECISION — demo-seed vs clean start on the server.** `db:bootstrap` applies migrations **and** the demo seed (4 demo accounts + sample data). A real pilot likely wants a clean DB + one real admin, not demo PII. Add a "migrations-only, no seed" path to `db-bootstrap` (or a flag), or document the manual migrations-without-`seed.sql` apply. Decide before inviting users. `(source: server-deploy runbook)`

### Test flake 2026-06-17

- `tests/e2e/smoke.spec.ts:152` — "login form signs in via uncontrolled inputs (autofill-compatible)" races: it runs `page.evaluate` to set input values immediately after `goto("/login")`, before the form hydrates, so under parallel load (6 workers) / cold `next dev` compilation it hits the "Loading sign in..." state → `querySelector('input[name="email"]')` is null → `TypeError: Illegal invocation`. Passes in isolation. Fix: add `await page.waitForSelector('input[name="email"]')` before the `page.evaluate`. Not caused by the env split (import-path-only; build green; manual login passed). `(source: /smoke-done)`

### Security closures 2026-06-17 (env server-only)

- **DONE** — `src/lib/email-env.ts` was missing `import "server-only"` while reading `RESEND_API_KEY` (same class as the `env.ts` finding). Sentinel added; `next build` green; sole importer (`src/server/email.ts`) was already fenced so zero behavior change. `(source: /security)`

### Auto-routed NITs from /user-check 2026-06-17 (env server-only split)

- `src/lib/env.ts` — asymmetric naming vs the new `env.public.ts`. Consider renaming `env.ts` → `env.server.ts` so the pair is symmetric and self-documenting, matching the `src/lib/supabase/{client,server,admin}.ts` convention; repoint the 2 `getServerEnv` importers (`auth.ts`, `admin.ts`) and update `env.public.ts:6`'s cross-reference comment. Purely discoverability — the `server-only` sentinel already enforces the boundary mechanically. `(source: /user-review)`

### Auto-routed NITs from /user-check 2026-06-17 (APP_URL host-header defence)

- ~~**MEDIUM (pre-existing, `/security` 2026-06-17)** — `src/lib/env.ts` lacks `import "server-only"`; a future `"use client"` import of `getServerEnv` would bundle `SUPABASE_SERVICE_ROLE_KEY` into the browser.~~ **DONE 2026-06-17:** split into `src/lib/env.public.ts` (public getters, no `server-only`) + `env.ts` (now `import "server-only"`, keeps `getServerEnv`); repointed the 4 public importers (`forgot-password-form.tsx`, `client.ts`, `server.ts`, `proxy.ts`). `next build` green — client import of `getServerEnv` is now a build error. `(source: /security)`
- `src/server/actions/auth.ts:25` — `authRedirectUrl(path)` assumes `path` begins with `/`; a non-`/`-prefixed path combined with an `APP_URL` that has a non-root path (e.g. `https://host/app`) would resolve surprisingly via `new URL`. Not a current bug (all callers pass `/reset-password`). Add a one-line JSDoc noting `path` must be absolute. `(source: /user-qa)`

### Auto-routed NITs from /user-check 2026-06-12

- `src/server/email-templates.ts:96,169,210,247` — email subject-line interpolations (`requesterName` / `employeeName`) not run through `escapeHtml`. Safe in practice (the whole payload is `JSON.stringify`'d by `sendEmail`, so JSON is escaped; subjects aren't HTML) — consistency-only with the escaped HTML bodies. `(source: /user-qa)`
- `src/server/email.ts:124` — no timeout on the Resend `fetch`; since sends are `await`ed inline, a Resend network hang would stall the wired Server Action (default fetch has no timeout). Add `AbortSignal.timeout(5000)` to bound the blast radius. Ties into the inline-vs-queued latency follow-up in `pending-backlog.md` §4(a). `(source: /user-qa)`
- `src/server/email.ts:33–84` — recipient resolvers (`getRecipient` / `getAdminRecipients` / `getManagerRecipientForEmployee`) call `createAdminClient()` directly rather than going through the DAL (`src/server/dal/employees.ts` pattern). Acceptable for a self-contained boundary module returning minimal `Recipient` DTOs; if recipient resolution grows past 3 functions, migrate to a `src/server/dal/email.ts` wrapper. `(source: /user-review)`
- `src/server/actions/{leave,onboarding,performance}.ts` (email blocks) — the inline `await sendEmail(...)` adds latency to the action response. This Next version exports a stable `after()` from `next/server`; wrapping the email try/catch in `after(() => { ... })` defers it past response flush with no semantic change. **The fix is `after()`, not a queue** — refines the latency item above and the inline-vs-queued note in `pending-backlog.md` §4(a). `(source: /user-review)`
- `src/server/actions/{leave,onboarding,performance}.ts` — the defensive outer `catch {}` around each email block only guards thrown exceptions from the (pure) template builders; the resolvers and `sendEmail` swallow their own errors. Tighten the comment so a future reader doesn't over-trust it as the primary safety net. `(source: /user-review)`

---

### Auto-routed NITs from /user-check 2026-06-03 (reporting module Phase 1)

- `src/app/(app)/reports/page.tsx` — repeated `meta!` non-null assertions throughout the active-report branch; hoist to a local `const activeMeta = meta!` at the top of the branch for readability. Safe as-is (block is `activeKey`-gated). (source: /user-qa)
- `src/server/dal/reports.ts:135/173/195` — headcount/starters/leavers each call `getVisibleEmployees()` (full-table load + in-memory date filter, no DB-side predicate). Acceptable at current scale; add a callsite note and revisit (DB-side date filter) when `employee_records` grows large. (source: /user-review)
- `src/server/dal/reports.ts` — does not call `safeDalError` directly (propagates errors already processed by the reused DAL helpers), unlike its peer `dashboard.ts`. Harmless today; align if the DAL gains its own queries. (source: /user-review)
- `src/components/reports/report-table.tsx:27` — `key={index}` on rows; fine for server-rendered static tables, but switch to a stable composite key if `ReportTable` is ever promoted to a client component with sorting/reorder. (source: /user-review)
- `src/app/(app)/reports/page.tsx` — KPI-strip guard `summary.length > 0 && !result.error` is redundant (DALs return empty `summary` on error); simplify or invert for clarity. Harmless today. (source: /user-uiux)
- `src/server/dal/reports.ts` `previousMonthRange()` — no unit test for the date-math boundaries (Jan year-rollover, Feb/leap, month-length). The project has no unit-test harness (Playwright E2E only); adding one is infra. Cover Jan/leap/normal cases if/when a unit runner is introduced. (source: /user-qa)

## Open

### Auto-routed NITs from /user-check 2026-06-17 (db-bootstrap script)

- `scripts/db-bootstrap.mjs:129` — `verify` guard checks only `verify.status !== 0`, not `verify.error` (the probe guard at :60 checks both). Works by accident (`status` is `null` when `spawnSync` errors). Add `|| verify.error` for parity. (source: /user-review)
- `scripts/db-bootstrap.mjs:106` — `apply.stderr` is discarded on the success path; psql `NOTICE:` lines vanish during a slow apply. Forward it (`if (apply.stderr) process.stderr.write(apply.stderr)`) before the status check. (source: /user-review)
- `scripts/db-bootstrap.mjs:40` — `psql()` passes `input: undefined` to `spawnSync` when the caller omits `input`; harmless (probe uses `-tAc`, not stdin) but the optional-input contract is ambiguous. Use a defensive spread or a one-line comment. (source: /user-review)
- `scripts/db-bootstrap.mjs:40-46` — DB name `"postgres"` is hard-coded inside `psql()` while `CONTAINER` is a top-level constant; promote to `const DB = "postgres"` for consistency. (source: /user-review)
- `src/components/employees/employee-form.tsx:152` — `set-state-in-effect` suppressed (block disable) for the `submitted`->state prop reconciliation; works, but is the one of the three suppressions with a cleaner alternative (remount via `key` on the form so React reinitialises state on save). Revisit if the save-flow is touched. The `app-shell` (SSR hydration) and `soft-delete` suppressions are intentional-final. (source: CI lint investigation, 2026-06-17)

### Auto-routed NITs from /user-check 2026-06-16 (pre-fork P-item batch)

- `.github/workflows/ci.yml:20` — `npx eslint .` lints the whole tree; ESLint flat config ignores `node_modules` by default, but confirm `.next/` build output is also ignored before CI scales, or scope to `src/`. (source: /user-qa, /user-review)
- `src/app/global-error.tsx:4` — `import "./globals.css"` is intentional (global-error replaces the root layout that normally imports it) but couples the error boundary to that path; low risk, noted for awareness. (source: /user-qa)
- `src/lib/supabase/proxy.ts:9` — `isPublicPath` matches any sub-path of a listed entry, so `/api/auth/password-reset-requested/<x>` would also be public; harmless today (no sub-routes; Next 404s first) but document if sub-routes are added. Pre-existing pattern. (source: /user-review)
- `src/app/api/auth/password-reset-requested/route.ts:34` — invalid-email returns 400 (a weak format oracle); for an audit-only endpoint consider returning `{ ok: true }` regardless of email validity. Security agent to own the verdict. (source: /user-review)
- `src/app/not-found.tsx:12` — back-link hard-codes `/dashboard`; an unauthenticated 404 visitor gets bounced `/dashboard`→`/login` (minor speed-bump). (source: /user-review)
- `safeNext` allowlist is duplicated across `src/lib/supabase/proxy.ts:60` (middleware) and `src/app/(auth)/login/login-form.tsx:53` (client) — now extended in both with the backslash clause. Pre-existing dup; extract a shared `isSafeRedirectPath()` when convenient. (source: /user-review)
- `src/app/(app)/reports/loading.tsx` — skeleton has no results-area block; the post-"Run" report view (table/chart) will cause vertical CLS. Trade-off: the first-load `/reports` view shows only the selector + "select a report" empty state (no table), so a results skeleton over-represents that common case. Decide per the dominant path before adding. (source: /user-uiux)
- `src/app/(app)/reports/loading.tsx:16` — skeleton card uses `rounded-md border` (sibling-skeleton convention) but the real report cards are `rounded-xl … shadow`; minor corner/depth shift on load. Repo-wide skeleton-vs-page convention question, not unique to this file. (source: /user-uiux)
- `src/app/not-found.tsx:6` — the "404" eyebrow `<p>` is announced redundantly by screen readers; add `aria-hidden="true"` (duplicates the `<h1>` "Page not found"). (source: /user-uiux)
- `src/app/(app)/error.tsx:37` — pre-existing: primary button uses `text-white` instead of the semantic `text-primary-foreground` token (the two new error/404 surfaces were aligned to the token this session; error.tsx left as-is to stay in scope). (source: /user-uiux, pre-existing)
- `src/server/audit.ts:18-19` — pre-existing: `insertAuditLog` writes via the service-role client (`from("audit_logs").insert`), bypassing RLS, rather than the `insert_audit_log()` security-definer RPC that migrations 0009/0012 establish as the intended sole write path. Works (service-role is the server-side audit writer), but diverges from the stated invariant; confirm intentional or re-route through the RPC. (source: /security, pre-existing)
- ~~**Automate fresh-DB bootstrap (migrations + seed).** `docker compose up` does not apply `supabase/migrations/` or `supabase/seed.sql` — a fresh clone must run the manual psql loop now documented in README's "Initialize the database — first boot only". Consider a one-shot migrate/seed container or `npm run db:bootstrap` so a new clone is login-ready without the manual step. (source: onboarding gap, 2026-06-16)~~ **DONE (Session 175):** `npm run db:bootstrap` → `scripts/db-bootstrap.mjs`. Fresh-only guard (probes `public.profiles`; no-op if present, abort if DB unreachable). README + LOCAL_SETUP Step 4 updated. Auto init-container option declined (fragile/hides errors for novice operators).

### ✅ FIXED 2026-06-15 (Session 173) — self-review "Saving…" hang (TWO distinct bugs; full root cause)

The initial 2026-06-15 entry blamed only a client boolean-edge guard. Deeper investigation (Session 173, Network capture + Codex second opinion) found that was a **separate, real-but-insufficient** bug; the actual "Saving… forever" hang was a Server-Action revalidation wedge. Both fixed. Durable lesson + diagnostic method in `learning.md` ("A Server Action that revalidatePaths its OWN heavy route wedges useActionState").

- **Bug 1 — collapse guard (real, fixed):** `SelfReviewForm`/`GoalForm` keyed the success→collapse transition off the `state.success` boolean, which can't fire on a second consecutive `success: true` (resubmit). Fixed by keying off the `useActionState` object identity (`state !== prevState`, fresh per dispatch) — the `PublicHolidayRow` pattern. *This governs the collapse AFTER the result commits; it could not fix the hang on its own.*
- **Bug 2 — the actual hang (root cause):** `submitSelfReview` (and the sibling employee actions `updateOwnGoalProgress`, `acknowledgeReview`) called `revalidatePath("/performance")` — **the current route**. That folds a re-render of the large employee `/performance` tree (many `useActionState` forms) into the Server Action response; React committing it **as the action's `useActionState` result** wedges `pending` → stuck "Saving…". The POST returns **200 with `{success:true}`** in the body — a client-commit wedge, not transport. Ruled out (with evidence): Caddy, the Caddy header block, Supabase, Next 16.2.9 (reproduced on 16.2.4), Radix tab identity. **Fix:** removed `revalidatePath` from the three employee actions; the forms call `router.refresh()` on success (`useEffect` keyed on the `state` object) — a separate navigation after `pending` clears, restoring fresh props without the wedge (the `compensation-form.tsx` pattern). Pages are dynamic (cookie-based client) so no cross-user freshness lost. `after(revalidatePath)` was tried and rejected (left stale props → broke post-submit Edit/acknowledge UI). The 7 admin/manager `revalidatePerformancePaths()` callers are unchanged (lighter trees, no wedge).
- **Verification:** gate green (tsc/eslint); targeted Playwright green (`employee.spec.ts` self-review+resubmit+acknowledge); hang itself verified by manual smoke (Playwright's clean browser can't reproduce the real-browser wedge). Reopen-during-refresh no-flash safeguards kept: `canReopen` includes `state.success`; `submitSelfReview` returns `values`.
- **Minor residual (acceptable):** during the `router.refresh()` latency window the just-submitted summary text/badge briefly lags, and `AcknowledgeReviewForm` shows its success message in both the banner and inline status (by-design dual anchor) until the form swaps out. (source: manual smoke + Network capture 2026-06-15, Session 173)
- **Test-harness note (recurring):** the targeted Playwright run needs `PLAYWRIGHT_BASE_URL=https://kushhr.internal` (matching the app's cookie host); the bare default redirects every auth test to `/login` — the `auth.setup` base-URL/cookie-name mismatch already logged below.

### Pre-fork audit findings (2026-06-12)

From the whole-codebase pre-fork audit (`docs/checks/prefork-audit.md`). The P0/P1 items were actioned across Sessions 171 (Next 16.2.9 bump, ws audit fix, LICENSE, Caddy security headers) and 174 (P1-3 password-reset rate limit + same-origin gate, P1-5 CI workflow, the P3 nits, email/path scrub). The two items below are a settled decision and one deferred defence-in-depth item.

- `infra/supabase/.env.example:35-36` — demo `ANON_KEY`/`SERVICE_ROLE_KEY` (upstream `supabase-demo` JWTs, re-signed by `rotate-secrets.mjs`). **Decided 2026-06-16: left as-is** — placeholdering would break a naive copy-example-without-rotate boot, and they're public knowns, not secrets. Accept the secret-scanner `eyJ…` noise. (source: prefork-audit 2026-06-12)
- ~~`src/server/actions/auth.ts:17-23` — `authRedirectUrl` builds the password-reset `redirectTo` from request headers (`origin`/`x-forwarded-proto`/`host`), a host-header-poisoning surface for reset links (consumed at `employees.ts:527`). Mitigated upstream (GoTrue only honours allowlisted redirect URLs = the FQDN), so defence-in-depth only: derive from a configured app-URL env instead of request headers.~~ **DONE 2026-06-17 (Session 176):** added optional `APP_URL` server env (`src/lib/env.ts`); `authRedirectUrl` prefers it and ignores headers when set, falls back to headers when unset. Documented in `.env.example`, `LOCAL_SETUP.md`, `README.md`. (source: prefork-audit 2026-06-12)

### Auto-routed NITs from /user-check 2026-06-10 (off-cloud validation-gate slice)

- `tests/e2e/auth.setup.ts:28` — no guard when `PLAYWRIGHT_BASE_URL`'s host prefix diverges from `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`; mismatch → minted cookie name ≠ what the app reads → silent login-redirect on every auth test. Consider a startup assertion. (source: /user-qa)
- `infra/supabase/checks/schema-parity.sh:44` — dead `\restrict|\unrestrict` alternatives in the normalize pattern (`pg_dump --schema-only` never emits psql meta-commands). Harmless; remove for clarity. (source: /user-qa)
- `playwright.config.ts:87` — setting `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100` explicitly suppresses `webServer` without starting dev (tests point at nothing). Doc the prerequisite; not a code change. (source: /user-qa)
- `tests/e2e/auth.setup.ts:8-17` + `tests/e2e/helpers.ts` — `.env.local` parse is duplicated and the new cookie-derivation block lives only in `auth.setup.ts`; extract `resolveAuthCookieAttrs(baseURL)` to `helpers.ts` if/when a second setup caller appears (rule-of-three not yet met). (source: /user-review)
- `tests/e2e/admin.spec.ts:1328` — third independent consumer of the `PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100"` fallback (alongside config + auth.setup); promote to a shared constant once it grows past three. (source: /user-review)
- `infra/supabase/checks/schema-parity.sh:42` — consider `pg_dump --no-comments` (PG14+, in-container is PG17) instead of grep-stripping `^--` lines; cleaner and less brittle. (source: /user-review)
- `docs/checks/schema-parity-cloud-vs-selfhost.md` (VERDICT string in `schema-parity.sh`) — uses a Unicode em-dash; if the archive is ever parsed as ASCII the bytes differ. Cosmetic. (source: /user-review)

### Self-host validation gate — reconcile cloud-authored Playwright suite (Session 166)

The Playwright suite was authored/tuned against Supabase **cloud**; against the self-host stack (`https://kushhr.internal`, single dev-sized container) two non-defect classes surfaced. Gate verdict was still green for the stack (182/187 serial; all personas auth; RBAC URL+forge guards, signed-URL doc protections, audit observability all pass).

- **Run the self-host gate with constrained workers, not default `fullyParallel`.** Full-parallel run = 34 failures; `--workers=1` = 4. The ~30-failure swing is cross-project contention against the single node (e.g. manager tests mutating Alice while employee tests read her) — every such test passes serially / in isolation. Cloud's pooled backend hid this. **Gate command for self-host:** `PLAYWRIGHT_BASE_URL=https://kushhr.internal npx playwright test --workers=1`. Consider a `workers` cap (or a project-serial mode) when `PLAYWRIGHT_BASE_URL` is external. Not a product issue at 15–20 users. (source: validation gate)
- **`admin.spec.ts:248` (`password reset recovery link updates the user password`)** — deterministic mismatch: assertion `toHaveURL(/\/login\?message=password-updated$/)` (anchored) vs self-host actual `/login?message=password-updated&next=%2Fdashboard`. Password reset **functionally works** (URL carries `message=password-updated`); the `$` anchor is cloud-shaped. Decide: relax the regex to tolerate a trailing `&next=`, or confirm whether the extra `next` param is intended self-host middleware behavior. (source: validation gate)
- **`manager.spec.ts:956` (B5 goal submit lock) + `employee.spec.ts:636` (self-update payroll) — submit→toast latency flakes on the single node.** Both failed the `--workers=1` off-cloud-from-main gate (2026-06-11) with the identical signature: the submit button captured mid-pending (`"Submitting..."`/`"Saving…"` `[disabled]`, empty `alert`) — the server action was still in flight when the toast wait expired (10s / 5s). Not functional defects; pass in isolation. Root cause is single-node query latency against the **real migrated dataset** (6762 audit_logs + per-action audit insert + heavy accumulated-goal queries). Test-robustness fix (separate from any product change): key the toast wait off the button leaving its pending state, or bump the per-assertion timeout; structurally these belong with the parallel-suite isolation races logged below. (source: off-cloud-from-main validation gate 2026-06-11) **Update 2026-06-12 (Session 170):** `employee:636` flaked again in the email-slice gate (full serial run) but **passes in isolation** (4/4, 5.7s) — still Bucket C. Note the new inline `await sendEmail(...)` in `submitLeaveRequest` adds latency to the submit→toast path (3 DAL reads + 2 Resend HTTP round-trips, the sandbox 403s being full round-trips) which nudges this margin; the proper fix is to not block the action response on email delivery (move sends to a post-response hook / `after()` if this Next supports it, or an outbox) — folds into the "inline vs queued" decision in `pending-backlog.md` §4(a).

### Performance

- **Subjective click-latency observed in dev 2026-05-25.** User reported buttons feel slower than expected. Likely Next.js dev-mode HMR + on-demand route compilation, not a prod issue. Confirm against a `npm run build && npm start` baseline before instrumenting. If reproducible in prod: capture browser DevTools Performance + Supabase query timings on the slow surface (probably the profile page after B7's new `getDirectReportIds` viewer-classifier call, or the dashboard with its multi-DAL fan-out). Schedule for a dedicated perf pass at the Phase 13 UAT closure boundary. Source: user observation 2026-05-25.

### Auto-routed NITs from /user-check 2026-06-10 (Step 3 on-prem deploy shape)

- `infra/supabase/backup/restore.sh:35-36` — storage archive is decrypted+decompressed twice (once for `head -15`, once for `wc -l`) just to print the verify listing. Single `tar -t | tee` would halve it. Cosmetic verify path only. (source: /user-review)
- `infra/supabase/backup/restore.sh:30` — PBKDF2 `-iter 600000` is a hardcoded literal, while `backup.sh:29` defines it as `PBKDF2_ITERS`. If the iteration count is ever bumped in `backup.sh`, `restore.sh` silently falls out of sync and existing archives become unrestorable. Share the constant or add a `# must match PBKDF2_ITERS in backup.sh` comment. (source: /user-review)
- `infra/supabase/backup/backup.sh:59` — `manifest.sha256` is append-only (`>>`); after retention prune, lines for deleted archives remain with no disk cross-check. Acceptable at this scale; add a manifest-prune-on-retention cycle if it ever matters. (source: /user-review)
- `infra/supabase/docker-compose.yml:480-481` — the named-volume provenance comment is slightly wordy for an inline note (captures WHY/migration provenance, so acceptable as-is). (source: /user-review)

### Off-cloud self-host — Step 3 deferrals (Session 165)

- **Off-site backup destination unwired.** `infra/supabase/backup/backup.sh` writes encrypted archives locally only; the off-site upload is a marked `# OFF-SITE:` TODO at the end of the script. Pick a target (S3-compatible bucket / NAS / second host) and wire it. (source: Step 3C plan)
- **Proxy-only ingress not yet enforced.** Kong's `:8000` and web's `:3100` stay published as a rehearsal fallback alongside Caddy's `:443`. At hardening, drop both port maps so the only ingress is the reverse proxy. (source: Step 3B plan)
- **Physical on-prem move outstanding.** Step 3 was rehearsed on the Mac. The real move needs: real hardware/VM, the named volumes recreated empty + repopulated via migrations + data-only load, real internal DNS for `<FQDN>` (drop `extra_hosts`), and the internal CA distributed to client machines. (source: Step 3 plan)
- **Old `./volumes/db/data` bind dir still on disk.** Kept as a safety copy after 3A's bind→named-volume migration (parity verified). Remove once Step 3 is signed off — needs explicit user approval (file-loss safeguard). (source: Step 3A)
- **Step 2 GoTrue SMTP still pending.** Blocked on mailbox creds (leaning App-Password `hr-noreply@` mailbox). Only the employee forgot-password email is blocked; admin onboarding uses `generateLink`. (source: §0 workstream 2)

### UI polish

- **Admin `/payroll` Employee picker → Load button vertical misalignment.** Screenshot: `Screenshots/misalignment_payroll.png`. The Load button sits visibly below the Employee input field — `mt-[1.625rem]` in [src/app/(app)/payroll/page.tsx:148-152](src/app/(app)/payroll/page.tsx#L148) is meant to clear the `SearchableSelectField` label so the button aligns with the input row, but the field now also renders a hint line ("Selected: <name>") below the input, pushing the visible button top below the input top. Two clean fixes: (a) replace the magic `mt-[1.625rem]` with a flex layout that vertically centres the button on the input row (e.g. wrap input in `flex items-center gap-3` and split hint into its own row), or (b) move the Load button onto the same row as the input but inside the SearchableSelectField's input container, so the field's own layout owns the alignment. Source: UAT 2026-06-02 walk of `docs/uat-flows/payroll.md`.

### Auto-routed NITs from /user-check 2026-06-02 (payroll reshape)

- `src/server/dal/compensation.ts:66-70` — `getOwnCompensationForSelfEdit` is a passthrough to `getCompensation` with no behavioural change. The wrapper adds a conceptual layer with no test coverage. Either remove the wrapper and call `getCompensation` directly from `payroll/page.tsx`, or document the specific invariant it enforces vs. what `getCompensation` alone cannot express. (source: /user-qa)
- `src/components/app/app-shell.tsx:72` — pre-existing ESLint error `react-hooks/set-state-in-effect` (calling `setMounted(true)` synchronously inside an effect). Session 154's one-line change to that file (`"manager"` added to Payroll roles) did not introduce this; inherits the lint debt. (source: /user-qa)
- `supabase/migrations/0049_compensation_self_service_and_manager_view.sql:11-14` + `src/server/actions/compensation.ts:401` — `updated_by` column is in the `selfUpdateCompensation` UPDATE payload but is NOT in the migration 0049 `grant update (...)` column list. The action uses service-role so the write succeeds, but if a future refactor switches the self-update path to the session client, `updated_by` would be silently dropped. Add `updated_by` to the column grant in a follow-up migration, or note explicitly that the self-update action must keep using service-role for this stamp to land. (source: /user-review)
- `supabase/migrations/0049_compensation_self_service_and_manager_view.sql:13-16` — the migration's header comment described the `manager_select_direct_report_compensation` policy as "Defence-in-depth, not the primary gate". That framing was retrospectively false: at 0049 time the policy WAS the primary gate (column grants don't restrict SELECT). Migration 0050 dropped the policy and added the SECURITY DEFINER RPC. The 0050 header explains the sequence correctly; a follow-up migration could add a re-comment-only migration on 0049's table to correct the historical record, or accept that 0050's comment is the canonical explanation. (source: /user-review)
- `src/components/payroll/compensation-form.tsx:365-375` — `AccountNumberRevealHint` affordance uses an underlined text button ("Show" / "Hide"). Eye-icon convention (`Eye` / `EyeOff` from lucide-react) is more universally recognized for reveal toggles on sensitive fields. Polish only. (source: /user-uiux)
- `src/components/payroll/compensation-form.tsx:363` — revealed account number renders in `font-mono text-xs text-muted-foreground/70`. The 70% opacity is fine for the masked state but is unnecessarily faint after Show — the value is the primary thing to read. Drop to full-opacity `text-muted-foreground` on the revealed branch only. (source: /user-uiux)
- `src/app/(app)/payroll/page.tsx:83-84` — Manager `/payroll` "My compensation" section has no tagline below the `<h2>`, while "Direct reports" does. Asymmetric. Adding a matching tagline like "Read-only summary of your own salary details." reduces the visual asymmetry. (source: /user-uiux)
- `src/components/payroll/compensation-form.tsx:370` — Show/Hide button uses `focus-visible:outline-none focus-visible:underline` only — no `focus-visible:ring` token. On a `text-xs` element this is a WCAG 2.4.11 (Focus Appearance) contrast concern. Add the project-standard `focus-visible:ring-2 focus-visible:ring-ring` token. (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-06-01 (B2 document delete two-step confirm)

- `scripts/cleanup-playwright-artifacts.mjs:108` — `"Admin Invalid Upload Doc"` (from `tests/e2e/admin.spec.ts:530`) is absent from `documentTitlePrefixes`. Pre-existing gap; zero-cost to add when next touching the list. (source: /user-qa)
- `src/components/documents/soft-delete-document-form.tsx:12` — `armed` is inlined in the component. When the second sibling `confirm()` site migrates to this pattern (payroll-cancel / onboarding template-remove / onboarding task-delete), rule-of-three is met → extract `<TwoStepConfirmButton>` with `{ label, armedLabel, ariaLabel, armedAriaLabel, onConfirm, pending, error }` API. (source: /user-review)
- `src/components/documents/soft-delete-document-form.tsx:29-34` — no blur/focus-out reset on `armed`. Currently safe (per-row component, prop-stable `documentId`) but worth handling in the extracted component when it lands. (source: /user-review)
- `tests/e2e/admin.spec.ts:554-558` — drop "Session 151" reference and `documents/page.tsx:150` line number from the test comment; keep only the functional description (session numbers and file:line refs in test comments drift). (source: /user-review)
- `src/components/documents/soft-delete-document-form.tsx` (armed button) — `py-0.5` + `text-sm` renders ~20-22px tall, below WCAG 2.5.5 44px touch target on mobile. Bump to `py-1` or larger when on a mobile-polish pass. Sibling NIT to the leave-calendar `+N more` toggle already logged Session 149. (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-06-01 (app-shell SSR + CollapsibleSection)

- `src/components/leave/public-holidays-admin-panel.tsx:53-57` — hand-rolled controlled `<details>` (`useState(false)` + `onToggle`) is now the third occurrence of the same pattern (documents/performance/onboarding via `CollapsibleSection`, plus this one). Rule-of-three met — extract the pattern, e.g. either route the panel through `CollapsibleSection` or extend `CollapsibleSection` to accept a custom header so the panel can drop its inline `<details>`. (source: /user-review)
- `src/components/app/app-shell.tsx:71-85` — `useSyncExternalStore` refactor would eliminate the 64→saved-width sidebar flash for users with saved expanded preference AND close the pre-existing `react-hooks/set-state-in-effect` lint on `setMounted(true)`. Proper modern React pattern for localStorage subscription; ~30 lines + a same-tab storage-event dispatch on toggle. Out-of-scope today (race fix + lint fix were split; lint refactor deferred). (source: /user-review)
- `src/components/app/app-shell.tsx:254` — pre-existing `border border-t` double-border on MobileNav (re-flagged here, also logged earlier at 2026-05-27). (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-06-01 (B1 document uploader RPC)

- `src/server/dal/{leave,dashboard,performance,audit-logs,compensation,onboarding}.ts` — 6 sibling `fetchProfileNames` helpers still do a direct `profiles` select via the user-scoped (or admin) Supabase client. `documents.ts` now routes through `get_profile_display_names` RPC (migration 0046) to handle the RLS-hidden-uploader case. `leave.ts:406` and `audit-logs.ts:70` use the user-scoped client the same way `documents.ts` formerly did → same latent "Unknown" gap; the other 4 use `adminClient` and bypass RLS. Sweep candidate: extract a shared `src/server/dal/lib/fetch-profile-names.ts` calling the RPC. (source: /user-review)
- `src/server/dal/dashboard.ts:714` — dashboard helper selects only `display_name`, omits the `work_email` fallback the other 6 helpers share. Pre-existing inconsistency; align on the next touch. (source: /user-review)

### Auto-routed NITs from /user-check 2026-05-29 (B4 cap-and-spill)

- `src/components/leave/day-chip-list.tsx:1` — add a one-line comment above `"use client"` explaining why the client boundary exists here (e.g. `// Client island: expand/collapse requires useState; parent leave-calendar-view stays a Server Component.`). (source: /user-review)
- `src/components/leave/leave-calendar-view.tsx:258-266` — pre-existing `todayISO()` and `currentMonth()` helpers use `new Date()` without UTC pinning while the rest of the view is UTC-pinned via `Date.UTC(...)`. Not introduced by this session; flagged for a future UTC-consistency sweep. (source: /user-review)
- `src/components/leave/day-chip-list.tsx:57-70` — `+N more` / `Show less` toggle button is ~22-24px tall (`py-0.5` + 11px text), below the 44px touch-target recommendation. Desktop-only (mobile uses the day-list), so not a hard fail; consider widening to `py-1` if discoverability suffers. (source: /user-uiux)
- `src/components/leave/day-chip-list.tsx:69` — visible label `Show less` and accessible label `Show fewer leaves on …` diverge (ARIA 2.4.6 / 2.5.3 NIT). Either align the visible label to match the accessible verb, or accept the divergence as an intentional terseness trade-off. (source: /user-uiux)
- `src/components/leave/leave-calendar-view.tsx:147,152` — today's cell uses `min-h-24` + `ring-2 ring-inset`; on narrow viewports (~1024–1280px wide) a very tall expanded cell can make the today-ring look proportionally thicker. Cosmetic only. (source: /user-uiux)

### Auto-routed NITs from /user-check B2 2026-05-28

- `src/server/dal/dashboard.ts:40` — `DashboardRecentUpdateTone` is `export`ed but no consumer imports it directly (`page.tsx` accesses via `DashboardRecentUpdate["tone"]`). Drop `export` to make it file-local, or document the intent. (source: /user-qa)
- `tests/e2e/employee.spec.ts:156` — B2/F2 test inserts the pending leave row without a pre-clean guard (unlike the half-day/refund tests which `delete` by employee+dates before insert). If a prior run crashes between insert and `finally`, the overlap exclusion constraint will surface a confusing 23P01 instead of a clean assertion. Add pre-clean matching sibling tests' pattern. (source: /user-qa)
- `src/server/dal/dashboard.ts:615,754,825` — `status === "approved" ? "success" : "danger"` ternary now repeated 3× across employee/admin/manager builders. Extract a one-line `leaveDecisionTone()` helper. (source: /user-review)
- `src/app/(app)/dashboard/page.tsx:488,506` — `XCircle text-destructive` on rejected leave/payroll-change rows reads as a delete affordance; consider `Ban` or `MinusCircle` for "refused" semantics. Low risk inside a Link row. (source: /user-uiux)
- `src/app/(app)/dashboard/page.tsx:451` — pending row aria-label says "pending" twice ("Sick Leave pending: … · Pending approval"). Reword title to "Sick Leave – awaiting approval" or drop one occurrence. (source: /user-uiux)
- `src/server/dal/dashboard.ts:678` — Recent Updates panel hard-caps at 6 items with no "View all" link; bursts of pending submissions could silently push older rejections off the list. Add an action link to `/leave` or similar. (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-05-27

- `src/server/actions/performance.ts:580` — `manager_id` on auto-created review row is set to `user.id` (the actor — could be admin). Two insertion sites for `performance_reviews` now diverge on `manager_id` semantics. Confirm whether bootstrap path should source from employee's `profiles.manager_id`. Document in `systems-thinking.md` once resolved. (source: /user-qa, /user-review)
- `src/server/actions/performance.ts:570` — `maybeSingle` read before bootstrap insert discards error. If query fails transiently, `existingReview` is null and code attempts a duplicate insert. Destructure `error` and guard. (source: /user-review)
- `src/components/performance/performance-forms.tsx:857` — Simplified `!editing` guard folds `isSubmitted` and `deadlineLocked` intent into the `useState` initializer 13 lines away. A one-line comment explaining this would restore readability. (source: /user-review)
- `src/components/performance/performance-forms.tsx:861` — `state.success` in `lockedLabel` is a transitional signal covering the render cycle between action return and prop update. Comment the WHY for future maintainability. (source: /user-review)
- `src/components/performance/performance-lists.tsx:313` — "Pending manager review" text has no `mt-1` margin class, unlike adjacent secondary-info lines. Add for vertical rhythm consistency. (source: /user-uiux)
- `src/components/performance/performance-forms.tsx:765 vs 812` — ManagerAppraisalWorkspace shows status twice: left panel (uppercase label) and right panel (pill badge). Same `formatEnum` value but different typography (`font-semibold uppercase` vs `font-medium`). Intentional layout distinction but visually inconsistent. Align if treating both as status indicators. (source: /user-uiux)

### Auto-routed NITs from /user-check B2 2026-05-27

- `src/components/performance/performance-forms.tsx:236` — `prevSuccess` render-during-render pattern + create-only reset asymmetry missing WHY comment (matches SelfReviewForm:837 pattern). (source: /user-review)
- `src/server/actions/performance.ts:387` — `intent === "draft"` branch now unreachable from GoalForm UI; add comment noting it's preserved for API stability. (source: /user-review)
- `src/server/actions/performance.ts:542,632` — success message wording asymmetry between create ("Goal created and submitted.") and update ("Goal submitted and locked.") paths not documented. (source: /user-review)
- `src/components/performance/performance-forms.tsx:374` — button row `flex-col` on mobile is overkill for single button + status text; `flex-row flex-wrap` would suffice. (source: /user-uiux)
- `src/components/performance/performance-forms.tsx:375` — `size="sm"` on Submit button reads small relative to the 7-field form body; polish candidate. (source: /user-uiux)

### Profile HR fields (B7 / F11 deferred)

- **Add date of birth, next of kin, home address, marital status to the profile.** User chose to skip in the B7 pass (2026-05-25) to keep scope tight; the UAT finding F11 (date of birth missing everywhere) is acknowledged. Revisit as a dedicated profile-fields batch: needs a migration adding columns to `profiles` (DOB, address, marital status) and likely a separate `emergency_contacts` table for next-of-kin (supports multiple + primary flag + ordering). Self-editable; audit-logged. Hidden from peer view. Source: B7 product question 2026-05-25.

### Profile page layout (B7 follow-up)

- **Job panel and Timeline aside feel unbalanced after Overview/Job merge.** [src/app/(app)/employees/[id]/page.tsx:163](../src/app/(app)/employees/[id]/page.tsx#L163) currently lays Profile + Job (left) against a single Timeline panel (right). Work location ends up in the lower-left grid cell with nothing to its right; Timeline is alone in the aside. Either move Timeline inline as a third section beneath Job, or pull start/end dates into the Job grid so Work location pairs with them. Source: B7 manual smoke 2026-05-25.
- **`border border` duplicate-class artifacts** at [src/app/(app)/employees/[id]/page.tsx:167](../src/app/(app)/employees/[id]/page.tsx#L167), 477, 508. Pre-existing — predate B7. Sweep when next touching the file. Source: `/user-qa` 2026-05-25.

### Audit logs (`/audit-logs`)

- **Quick-filter UTC-vs-local "today" edge case** — [src/app/(app)/audit-logs/page.tsx:40](../src/app/(app)/audit-logs/page.tsx#L40) computes `today` as `new Date().toISOString().slice(0, 10)` (UTC). In Mauritius (UTC+4), between local 00:00 and 04:00 the link points to yesterday's local date. Fix with `Intl.DateTimeFormat("en-CA", { timeZone })` once a company timezone is available. Source: `/user-qa` 2026-05-23 (NIT-2).
- **Clear-quick-filter convenience button** — when a quick filter is active, offer an inline "Clear quick filter" anchor that drops only `action` + `from` without nuking other filters via the full Clear button. Power-user affordance. Source: `/user-qa` 2026-05-23 (NIT-5).
- **Active aggregation tier for forge-probe detection (B3 follow-up)** — the passive quick-filter shortcuts ship; the active tier counts per-actor rows in the last hour and surfaces actors over a threshold (start N=20, window=60 min). Needs a small DAL helper (`getAuditLogRateByActor`), an admin-only display (dashboard panel or `/audit-logs` sortable column), and a threshold decision. Optional alerting (email/Slack) is a further escalation. Source: `/security-review` 2026-05-23 against B3.
- **Audit-log pagination** — DAL is capped at 100 newest rows ([src/server/dal/audit-logs.ts:35](../src/server/dal/audit-logs.ts#L35)); the page now renders a muted "Showing the most recent 100 events. Narrow filters to see older records." caption when the cap is hit, so admins are no longer in the dark. When audit volume grows past the point where a half-day search misses what admins need, replace with cursor pagination (`created_at < <last>` "Load older" button) — adds `cursor` param to `getAuditLogs`, a client component for the load-more button, and probably drops the cap caption. Source: session-discovered polish off the back of B9 smoke-pass, 2026-05-25.

### Audit-log instrumentation (cross-module)

- **Resource-string convention drift** — `requireRole({ attemptedResource: "action:leave.submit" })` uses an `action:` prefix; the new B3 audit metadata uses bare `"leave.submit"`. Two conventions for the same logical identifier. Sweep to align (recommend keeping `action:`). Source: `/user-review` 2026-05-23.
- **`ZodLikeError` bespoke type in `src/server/audit.ts:32-35`** — structural type instead of `import type { ZodError } from "zod"`. Pragmatic during the B3 tsc fix loop; risk is silent rot if zod changes `.flatten()`. Re-anchor with a generic. Source: `/user-review` 2026-05-23.
- **`expectAuditWithMetadata` duplication** — near-clone of `expectAudit` in `tests/e2e/helpers.ts:136`. Promote to shared on next caller. Source: `/user-review` 2026-05-23.

### Test hygiene (B1 overlap fallout)

- **leave_requests test inserts on seed users must use a unique date window AND try/finally cleanup** — the B1 `leave_requests_no_overlap` exclusion constraint is on `(employee_id, daterange(start_date, end_date, '[]'))` and **ignores `leave_type_id`**, so any two specs that pin `ids.alice` (or `ids.bob`) into overlapping dates collide across parallel workers regardless of leave type. Patched three known cases on 2026-05-23 (admin B1/F6 scope, employee `dashboard shows recent updates` window+cleanup, security-rbac-guards step 12 window+cleanup, and the leak in `employee submits leave and payroll requests` at lines 511-512). When adding new `leave_requests` test seeds: (1) capture `error` on every insert so constraint rejections don't surface as downstream `undefined`-shaped failures, (2) pick a unique date window grep-confirmed unused in `tests/`, (3) wrap in `try { … } finally { delete by id }`. Source: full-suite triage 2026-05-23.

### SearchableSelectField polish (B2 follow-up)

- **Firefox dropdown inferior to Chrome** — `SearchableSelectField` in Firefox doesn't show a proper dropdown on click without typing; Chrome shows the full option list immediately. Likely needs an explicit open-on-focus or open-on-click handler. Affects all `SearchableSelectField` instances (Employee, Review Cycle, Manager, etc.). Source: UAT B2 smoke 2026-05-27.
- **Typo-after-selection wipes the field** — [src/components/ui/searchable-select.tsx:82-104](../src/components/ui/searchable-select.tsx#L82-L104) strict-blur (B2) clears the field on no-match. Tradeoff: typing "Engineering" then accidentally appending "x" and tabbing out now clears the whole selection instead of leaving the typo'd value for the user to correct. Both options have downsides; strict-blur is the safer default (no UI lies). Polish candidate: a transient "Press Enter to select" hint or a visible "X" clear button when query is non-empty. Source: `/user-uiux` 2026-05-23.

### B2 review findings

- **Two error-message paths for the same field** — [src/server/actions/employees.ts:108](../src/server/actions/employees.ts#L108) rejects non-UUID with "Select a manager from the list."; [employees.ts:875-879](../src/server/actions/employees.ts#L875-L879) `validateManager()` rejects valid-UUID-but-wrong-role with "Select an admin or manager." Same field, two messages — only reachable via devtools forge but inconsistent if/when it surfaces. Align to one message or split semantically (format vs role). Source: `/user-review` 2026-05-23 (NIT-A2).
- **B2 pin does not cover `validateManager` forge path** — [tests/e2e/admin.spec.ts:766](../tests/e2e/admin.spec.ts#L766) covers UI strict-blur + resolved-name path but not the server-side UUID-exists + role-check guard. Reason omitted: Server Actions in Next 16 aren't trivially POSTable from Playwright. Workable path: the DOM-setter trick at [admin.spec.ts:1042](../tests/e2e/admin.spec.ts#L1042) (inject a forged UUID into the hidden `<select>`, then submit and assert `fieldErrors.managerId = ["Select an admin or manager."]`). Worth adding for defence-in-depth pinning. Source: `/user-review` 2026-05-23 (NIT-Q2).

### Leave balance backfill / dashboard data gap

- **General-purpose "fill balances for any year" admin tool** — `rolloverLeaveBalances` ([src/server/actions/leave.ts:1104](../src/server/actions/leave.ts#L1104)) hardcodes `targetYear = currentYear + 1`. Employees created **before Session 58 (2026-05-07)** never got the default-seeded `leave_balances` rows that `createEmployee` now inserts (22 Local + 15 Sick), so prior employees have partial-year coverage with no admin tool to fix it short of manual `/leave/admin` rows. Want: an admin form on `/leave/admin` to pick year + leave-type set and run the same idempotent upsert. Surfaced 2026-05-23 when Alain's dashboard showed 3 cards (no 2026 Sick Leave) vs Alice's 4. Source: manual UAT during B4.
- **Dashboard partial-balance UX gap** — [src/app/(app)/dashboard/page.tsx:214-233](../src/app/(app)/dashboard/page.tsx#L214-L233) renders one MetricCard per existing `leave_balances` row. The empty-state fallback only fires when **zero** rows exist; the partial case (Local seeded, Sick missing) silently shows fewer cards instead of a placeholder. Employees can't tell they're missing a balance type. Render expected-types with a "—" placeholder + "No balance set" note when a row is missing. Source: same observation, 2026-05-23.

### Pre-existing lint debt

- **`leave.ts:1097-1098`** — `_prev`/`_formData` unused-vars warnings on `rolloverLeaveBalances`. Pre-existing; fix opportunistically. Source: `/user-qa` 2026-05-23.

### B5 review findings

- **No-op reopen returns `success: true`** — [src/server/actions/performance.ts:535-537](../src/server/actions/performance.ts#L535) (`reopenGoalDefinition` on an already-unlocked goal) and [:906-907](../src/server/actions/performance.ts#L906) (`reopenManagerReview` on a non-`manager_submitted` row). Defensive code that shouldn't fire from the UI (Edit button is conditional), but if it does the UI shows green success styling for a no-op. Make `success: false` with the same message or silent. Source: `/user-qa` 2026-05-24 (NIT-1).
- **GoalForm draft-button label** — [src/components/performance/performance-forms.tsx:251](../src/components/performance/performance-forms.tsx#L251) keeps the historical "Update goal" label for the draft button on an existing goal (preserves existing Playwright pin in `manager.spec.ts:341`). QA argued for "Save draft" consistently regardless of `draft.goalId`. Re-evaluate when the existing pin is updated. Source: `/user-qa` 2026-05-24 (NIT-3).
- **B5 forge-resistance pin missing** — `reopenManagerReview` and `reopenGoalDefinition` are structurally forge-resistant (both read `employee_id` from DB before `canManageEmployee`), but a UUID-swap pin in [tests/e2e/security-rbac-guards.spec.ts](../tests/e2e/security-rbac-guards.spec.ts) using the [forge.ts](../tests/e2e/forge.ts) helper would close the loop. Form: capture Morgan reopening her own report's review, swap `reviewId` for Bob's, fire — expect deny + `auth.access_denied` audit row. Source: `/user-qa` 2026-05-24.
- **B5 self-review resubmit pin missing** — `submitSelfReview` on an already-`self_reviewed` row now writes the `review_self_reopened` → `review_self_submitted` audit pair. Add an employee-side pin in `tests/e2e/employee.spec.ts` to lock this behavior. Source: `/user-qa` 2026-05-24.

### Test infrastructure

- **Centralize denied-access Playwright assertion** — [tests/e2e/helpers.ts](../tests/e2e/helpers.ts) should expose `expectAccessDenied(page)` that does `getByRole("heading", { name: "Access denied" }).toBeVisible()`. Route the 11 callers (9 in `employee.spec.ts` + `manager.spec.ts` fixed 2026-05-24, plus 2 in `security-rbac-guards.spec.ts`) through it. Closes the invariant-drift mode that caused the 9 stale `toHaveURL(/access-denied/)` failures after B4 — future denied-access UX changes touch one file instead of grep-and-pray. Source: ad-hoc 2026-05-24.

### B5 architecture findings (`/user-review` 2026-05-24)

- **TOCTOU symmetry on `reopenGoalDefinition`** — [src/server/actions/performance.ts:557](../src/server/actions/performance.ts#L557) clears the lock without the `.is(...)` filter + row-count check that `savePerformanceGoal` ([:373](../src/server/actions/performance.ts#L373)) uses for the submit path. Narrow race window (submit → immediate reopen interleaving) but the audit trail can show a "submitted" confirmation toast lying about an already-unlocked row. Add `.not.is("goal_definition_submitted_at", null)` filter + row-count guard mirroring the submit path.
- **`reopenManagerReview` naming distinction** — add a one-line comment on [src/server/actions/performance.ts:873](../src/server/actions/performance.ts#L873) clarifying why it doesn't carry the `Definition` suffix that `reopenGoalDefinition` does: reviews have no sub-field lock — the whole review reverts.

### B5 deadline-lock findings (`/user-qa` + `/user-review` 2026-05-26)

- **`assertCycleNotDeadlineLocked` extra DB roundtrip in reopen paths** — [src/server/actions/performance.ts](../src/server/actions/performance.ts) reopen paths (`reopenGoalDefinition`, `reopenManagerReview`, `submitSelfReview`) already load the parent cycle's `cycle_id` but the helper re-fetches the cycle row just to read `submission_deadline` + `submission_lock_enabled`. Two roundtrips where one would do. Cheap to fix by merging the deadline columns into the existing parent-row select and passing them to the helper. Low-frequency endpoints; defer until a query-budget pass. Source: `/user-review` 2026-05-26 (NIT-2).
- **`assertCycleNotDeadlineLocked` silently treats missing cycle as unlocked** — [src/server/actions/performance.ts](../src/server/actions/performance.ts) `if (!cycle) return null` is the safe default but doesn't emit an audit row for a forged-cycleId case (the calling action already validates the entity, so this branch is unreachable in normal flow). Add a one-line comment documenting the intent so future maintainers don't accidentally repurpose the helper for paths that don't pre-validate the cycle. Source: `/user-review` 2026-05-26 (NIT-9).
- **`submitManagerReview` server guard lacks an independent integration pin** — the B5 Playwright pin in `admin.spec.ts` exercises `savePerformanceGoal` as a proxy for the shared `assertCycleNotDeadlineLocked` helper because the `ManagerReviewForm` pre-submit UI now intercepts before submit can be attempted. Both actions share the helper so the helper is integration-tested, but a direct call-site regression on `submitManagerReview` would slip past the suite. Add a forge-style pin in `tests/e2e/security-rbac-guards.spec.ts` that bypasses the UI (set cycle to locked, POST to the action endpoint), asserts `auth.access_denied` audit row with `metadata.reason="deadline_passed"`. Sibling to the "B5 forge-resistance pin missing" line already logged above. Source: `/user-review` 2026-05-26 (Finding 15).

### B5 UI polish findings (`/user-uiux` 2026-05-24)

- **Score format inconsistency** — `LockedManagerReviewSummary` ([src/components/performance/performance-forms.tsx:542](../src/components/performance/performance-forms.tsx#L542)) renders `"3 / 5"` (spaces) while `performance-lists.tsx:139` renders `"Score 3/5"` (no spaces, prefixed). Same module, same page — align.
- **`LockedGoalSummary` "by" clause** — [src/components/performance/performance-forms.tsx:277](../src/components/performance/performance-forms.tsx#L277) renders "on {ts}" with no "by ..." clause when `goalDefinitionSubmittedByName` is null. Add a fallback like `"by HR system"`.
- **`SelfReviewForm` badge labels use status-enum language** — [src/components/performance/performance-forms.tsx:665](../src/components/performance/performance-forms.tsx#L665) "Closed (manager submitted)" / "Closed (acknowledged)" are enum strings, not user language. Reframe as "Closed — under manager review" / "Closed — acknowledged by you".
- **"Edit" button label on reopen forms** — [src/components/performance/performance-forms.tsx:307](../src/components/performance/performance-forms.tsx#L307) and [:549](../src/components/performance/performance-forms.tsx#L549). Idle label is "Edit"; pending state already says "Re-opening...". Align idle to "Re-open for editing" for explicit consequence.
- **Focus management after Edit click** — clicking Edit triggers a server action and the locked summary unmounts; the editable form mounts but focus lands on `<body>` instead of the first input. Add `autoFocus` or `useRef`-based focus restore on the editable form's first input.
- **Teal "Submitted" badge contrast** — `text-primary` on `bg-primary/5` at `text-xs` is marginal at AA 4.5:1 depending on the resolved `--primary` CSS variable value. Green "Acknowledged" passes (~4.8:1). Run a contrast check on the actual token value; bump opacity or use a stronger text color if the badge fails.

### Onboarding task row

- **Delete button link-style anti-pattern** — [src/components/onboarding/task-list.tsx:142-153](../src/components/onboarding/task-list.tsx#L142) — sibling of the "Mark complete" control fixed in B6. Same `text-sm text-destructive hover:underline` link-styling. UAT only flagged "Mark complete"; converting to a shadcn `<Button size="sm" variant="ghost">` (or `variant="destructive"` if destructive emphasis is wanted) keeps the row visually consistent. Source: B6 sweep 2026-05-25.
- **Textarea padding override** — [src/components/onboarding/task-list.tsx:131](../src/components/onboarding/task-list.tsx#L131) — `className="max-w-xs px-2 py-1 text-xs"` overrides shadcn `Textarea`'s base `px-3 py-2`, shrinking padding asymmetrically vs the rest of the form system. Pre-existing, now more visible next to the default-sized Button. Source: `/user-uiux` 2026-05-25 (NIT).
- **Mark complete Button width vs textarea width** — [src/components/onboarding/task-list.tsx:134](../src/components/onboarding/task-list.tsx#L134) — `<Button size="sm">` is `inline-flex`, so it's narrower than the `max-w-xs` textarea above it. Adding `w-full max-w-xs` (or wrapping the action stack in a `max-w-xs` div) would make the Actions column read as an intentional block. Source: `/user-uiux` 2026-05-25 (NIT).
- **B6 pin `toHaveClass` regex lacks token boundary** — [tests/e2e/employee.spec.ts:350](../tests/e2e/employee.spec.ts#L350) — `/bg-primary/` matches both `bg-primary` and `hover:bg-primary/90`. Tighten to `/\bbg-primary\b/` or pass the string `"bg-primary"` to `toHaveClass`. No false-positive risk today, but the assertion doesn't enforce token boundary. Source: `/user-qa` 2026-05-25 (NIT).
- **B6 pin success-message regex inconsistent with spec convention** — [tests/e2e/employee.spec.ts:356](../tests/e2e/employee.spec.ts#L356) — `filter({ hasText: /task marked as complete/i })` is case-insensitive; rest of the spec file uses exact strings. Swap to `filter({ hasText: "Task marked as complete." })` for consistency. Source: `/user-qa` 2026-05-25 (NIT).

### Cross-cutting UI sweeps

- **Silent-success audit across `useActionState` forms** — B6's uiux pass found that `text-destructive` message blocks gated on `!state.success` hide the success message after a Server Action returns `{ success: true, message }`. The shadcn primary-Button visual upgrade (Sessions 100–105) raised expectations of immediate feedback across most forms, but message-render gates were not swept the same way. Grep `!\w+\.success` / `state\.success` in `src/components/` and `src/app/(app)/`, audit each for a missing emerald success render. Skip cases where the form unmounts on success (delete → row removed, redirect-after-submit) — silent is correct there. Bounded: likely 5–15 candidates. Source: B6 uiux pass 2026-05-25.
- **Stray "t" character + textarea-shifted-right on pending row** — observed during B6 manual smoke (2026-05-25, Chrome). One pending row rendered a floating "t" character above/left of its textarea, and that row's textarea+button rendered visibly further right than other pending rows on the same page. Could not re-verify (tab closed). Suspected causes: HMR/dev-mode reconciliation artifact from a stale completed-variant DOM node, OR a Chrome autofill overlay chip (the per-task `autoComplete` token should suppress this — worth confirming with DevTools that the attribute is actually applied). Re-attempt repro in incognito + hard-refresh next time the onboarding page is touched. Source: B6 manual smoke 2026-05-25.

### App shell (sidebar + main column)

- **Dashboard layout race on first paint — sidebar overlay clips left metric card** — observed during B6 manual smoke (2026-05-25, Chrome). On `/dashboard` first load the sidebar painted in a wider hover/expanded state on top of the main content while the main column's left padding stayed at the collapsed-width offset, so the leftmost MetricCard (Local Leave balance) was hidden behind the sidebar overlay. `Cmd+Shift+R` clears it — so this is a hydration / paint race, not a persisted-state bug. Likely owner: `src/components/app/app-shell.tsx` `--sidebar-width` CSS var on `<html>` (Session 110) vs the localStorage-driven `kushhr.sidebar.collapsed` read inside a `useEffect` after mount. Same class as Session 121 stale-chrome but different trigger. Repro hard to capture (intermittent). Reviewer ask if it recurs: open DevTools → Elements before/after `Cmd+Shift+R` and diff `<html>`'s inline `--sidebar-width` value against the body padding. Source: B6 manual smoke 2026-05-25.

### Performance tabs maintainability sweep (Session 135)

- **Export a shared `PerformanceView` type + `PERFORMANCE_VIEWS` constant** — [src/app/(app)/performance/page.tsx:46](../src/app/(app)/performance/page.tsx#L46) declares `PerformanceView` inline; the `view=` string values (`"cycles" | "appraisals" | "goals" | "reviews"`) appear as raw literals in ~8 call sites across [src/server/dal/dashboard.ts](../src/server/dal/dashboard.ts) and [src/components/performance/performance-lists.tsx](../src/components/performance/performance-lists.tsx). Extract a shared module so a tab-key rename is a compile-time catch. Source: `/user-review` 2026-05-26 (NIT-2, NIT-6).
- **Metric-card href role-awareness** — [src/app/(app)/performance/page.tsx:153](../src/app/(app)/performance/page.tsx#L153) "Submitted reviews" card links unconditionally to `?view=reviews#performance-reviews`; the sibling card above is role-aware. Decide a consistent rule (always default-tab vs always topic-tab). Source: `/user-review` 2026-05-26 (NIT-4).
- **Manager acknowledged-appraisal recent-update lands on read-only tab** — [src/server/dal/dashboard.ts:810](../src/server/dal/dashboard.ts#L810) routes manager acknowledgments to `?view=reviews` (read-only), but semantically a manager opening an acknowledged appraisal might expect the `appraisals` workspace tab. Confirm intent with product or align with employee-side `view=reviews` only. Source: `/user-review` 2026-05-26 (NIT-5).
### Auto-routed NITs from /user-check 2026-05-27

- `src/components/performance/performance-lists.tsx:182` — GoalList cycle group sort is unstable for named cycles; consider sorting by title or start date. (source: /user-uiux)
- `src/components/performance/performance-lists.tsx:193` — auto-expand when only one cycle group (`groups.length === 1`) to avoid extra click for single-cycle employees. (source: /user-uiux)
- `src/components/ui/collapsible-section.tsx:19` — uses hardcoded `border-slate-200 bg-white text-slate-950`; migrate to design tokens (`border-border bg-card text-foreground`) on next touch. (source: /user-uiux)

### Leave admin UX (UAT R1 session 2026-05-28)

- **`/leave/admin` — Employee + leave-type filter** — admin balance list has no filter; collapsed "Select employee and leave type" section like other product filters. Source: UAT leave-request-lifecycle Finding #1.
- **`/leave/admin` — placement under "Request leave" on `/leave`** — admin currently opens Leave admin from a bottom link. Move next to "Request leave" with a subtly different colour treatment so admin doesn't have to scroll. Source: UAT leave-request-lifecycle Finding #3.
- **`/leave` "Out this week" — collapsible + capped row count** — for admins + managers the list grows long; consider collapsible with ~25-row cap. Source: UAT leave-request-lifecycle Finding #4.

### Cross-product long-table collapsing pattern (UAT leave F8 / B5)

- **Long tables across modules need a consistent collapse/limit pattern** — `/leave`, `/leave/admin`, `/performance`, others. Design-system effort: one shared component / convention, then sweep consumers. Source: UAT leave-request-lifecycle Finding #13 (F8). Parked post-pilot by user decision 2026-05-28.

### Auto-routed NITs from /user-check B1 2026-05-28

- `src/components/leave/leave-request-form.tsx:242` vs `:460` — destructive-tone preview box uses `border-destructive/30` while exceeded-balance `LeaveBalanceHint` uses `border-destructive/40`; the two can render simultaneously. Align to one opacity. (source: /user-uiux)
- `src/components/leave/leave-request-form.tsx:461` — non-exceeded `LeaveBalanceHint` branch has no explicit border token (relies on default `border-input` from `border` shorthand). Name the token explicitly (`border-muted` or `border-input`) for consistency with the other hint boxes. (source: /user-uiux)

### Playwright parallel-suite test-isolation races (deferred from B1 full-suite run 2026-05-28)

Three tests share the **Alice + Local Leave + 2027** balance row and interleave during `fullyParallel: true` runs — `tests/e2e/employee.spec.ts` "submits half-day" + "cancels approved leave and balance is refunded" + `tests/e2e/security-rbac-guards.spec.ts` "B1/F1 alice submitting an overlapping leave request is blocked + audit". Symptoms (intermittent): refund test reads balance partway through half-day's deduction (Expected: 8, Received: 7.5); half-day reads balance after refund's 2-day deduction (Expected: 9.5, Received: 7.5); security-RBAC overlap test finds 2 rows in its 2027-03 window when refund's row is present (Expected: 1, Received: 2). Targeted-grep runs pass; full-suite runs are flaky. Fix path: move the three tests onto disjoint balance keys (different employee, different leave type, or different year). Pre-existing — not introduced by B1; B1 hardened the leftover-state cleanup of half-day + refund (try/finally + pre-clean) but the in-flight balance contention is a structural fixture problem. (source: full-suite run after B1)

- `tests/e2e/manager.spec.ts` "manager reviews a cycle, saves an appraisal draft, then submits it" — pre-existing flake noted in Session 144 handover; fails intermittently waiting for `"Manager appraisal submitted."` toast inside `#manager-appraisal-workspace`. Not B1-related.

### Auto-routed NITs from /user-check B4 2026-05-27

- `src/components/app/app-shell.tsx:72` — pre-existing ESLint `react-hooks/set-state-in-effect` on `setMounted(true)` inside `useEffect`; split into two effects or use `useSyncExternalStore`. (source: /user-qa)
- `src/components/app/app-shell.tsx:254` — pre-existing redundant `border` after `border-t` on `MobileNav`. (source: /user-qa)
- `src/components/performance/performance-forms.tsx:624` — amber warning box `space-y-1` gap may feel tight; consider `space-y-2` for vertical rhythm consistency. (source: /user-uiux)
- `src/components/app/app-shell.tsx:179-191` — expand button placed in nav area (below header) while collapse button lives in header; asymmetric but functional, track for future sidebar redesign. (source: /user-uiux)

### Process experiments

- **Try ralph loop on low-risk follow-ups** — for the boring tail of this file (NITs, single-button restyles, padding overrides, test-precision improvements, the silent-success sweep) experiment with a ralph-style loop ([snarktank/ralph](https://github.com/snarktank/ralph), Geoff Huntley's pattern): single stable prompt, agent reads `docs/follow-ups.md` → picks first open NIT under `## Open` that doesn't require product input → plan + fix + commit → move the entry to `## Recently closed` → loop. The `/loop` skill already exists in `.claude/skills/loop`. **Hard constraints:** loop must refuse touching any high-risk component listed in `docs/systems-thinking.md` (`handle_new_user`, `sync_role_to_jwt`, `insert_audit_log()`, `storage.objects` RLS, FKs on `profiles`) and any item flagged as requiring a product decision. Batch the Post-change agents (QA / Review / UI-UX) at the end of an N-NIT sweep, not per-iteration, to keep token cost sane. **Not for:** UAT batches, schema changes, anything in `docs/pending-backlog.md` (strategic work needs the existing Plan-mode + Systems Thinking gate). Source: B6 wrap-up discussion 2026-05-25.

---

## Recently closed

(Move items here briefly before deleting if you want a paper trail beyond `handover.md`. Optional — `handover.md` is the durable record.)

- **Codex update (2026-05-26):** Closed B5 deadline-lock UTC slip by evaluating the configured IANA business timezone, with `Indian/Mauritius` only as fallback; closed the cycle-form guidance-copy item while implementing the acknowledgment-after-deadline policy.

### Auto-routed NITs from /user-check 2026-05-29

- `src/components/leave/leave-balance-admin-panel.tsx:31` — `selectedYear` does not auto-navigate to the upserted-year tab after a save for a new year; admin must click the new tab manually. Discoverability NIT, no functional bug. (source: /user-qa)
- `src/server/dal/leave.ts:183` — pre-existing: `query.in("year", [])` is reached if an empty array is passed; PostgREST returns 0 rows (semantically correct) but a `years.length === 0` short-circuit would avoid the round trip. (source: /user-qa)
- `src/components/leave/leave-balance-admin-panel.tsx:39`, `leave-type-admin-panel.tsx:18`, `public-holidays-admin-panel.tsx:53` — all 3 collapse `<summary>` elements lack the project-standard `focus-visible:ring-2 focus-visible:ring-ring` token; `collapsible-section.tsx:21` and `performance-lists.tsx:200` set the precedent. (source: /user-uiux)
- `src/components/leave/leave-type-admin-panel.tsx:89-95` — no empty-state copy when `types.length === 0` (other 2 panels handle their zero-data cases). (source: /user-uiux)
- `src/components/leave/public-holidays-admin-panel.tsx:156` — inner year-group `<summary>` elements missing `[&::-webkit-details-marker]:hidden list-none` (outer 3 panel summaries suppress it consistently). (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-05-29 (B1 inactive balance + B2 admin CTA)

- `src/server/dal/leave.ts:21-22` — `LeaveBalance.leaveTypeIsActive` is populated only by `getMyLeaveBalances` with `?? false` semantics; add a JSDoc on the field, or extract `MyLeaveBalance = LeaveBalance & { leaveTypeIsActive: boolean }` and narrow `getMyLeaveBalances`'s return type to make the per-caller contract explicit. (source: /user-review)
- `src/app/(app)/leave/page.tsx:90` — `&& b.leaveTypeIsActive` predicate is uncommented; one inline line explaining the RLS-hide-means-inactive rationale would close the maintenance gap. (source: /user-review)
- `src/server/dal/leave.ts:432` (pre-existing) — `fetchTypeNames` discards the Supabase error silently; if it ever fails, every balance card disappears with no signal. Same pattern in `fetchProfileNames`. Worth a single error-logging pass on both helpers. (source: /user-review)

### Auto-routed NITs from /user-check 2026-06-01 (B3 admin leave filter)

- `src/server/dal/dashboard.ts:127-130` — admin-IDs fetch is a sequential await before the main `Promise.all`. Cannot be parallelised today since `adminIds` is consumed at the `getUnroutedPendingLeave(adminIds)` call site inside the `Promise.all`. One extra RTT per admin dashboard render — acceptable, worth a re-batch if profiles latency becomes observable. (source: /user-qa)

### Deferred from new-hire-onboarding UAT B1/B3 (2026-06-01)

- **Product question — can admin submit leave at all?** B3 hides admin's own leave from admin-dashboard panels but doesn't block submission. Admin currently has no upline (by design) so any admin leave request is structurally unrouted. Needs a separate product call: (a) keep current — admin can submit but only manages from `/leave` directly, (b) block admin from `/leave/new`, or (c) auto-approve admin leave. (source: B3 plan)
- **Admin's approved leave may surface in `getCompanyApprovedLeave`** (whoIsOut / Team-leave calendar) and the leave-usage approved-days metric. Same root cause as B3 — defer until surfaced in another UAT. (source: B3 plan)
- **Admin's empty leave balances** — B1 backfill inserts admin into `employee_records` directly, bypassing `createEmployee` Server Action's `seedDefaultLeaveBalances` call. Admin's `/leave` page shows empty Local/Sick balance cards. Acceptable today; if "can admin submit leave?" is answered Yes-with-balances, seed admin balances here too. (source: B1 plan)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 2 + absence status filter)

- `tests/e2e/reports.spec.ts` — the no-PII test asserts absence of `"National ID"` / `"Passport number"` columnheaders that no current report emits; the assertions pass vacuously (forward-looking guards). The `"Score"` assertion is the one doing real work. Add a comment clarifying these are guards, not current-data checks. (source: /user-qa)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 2 — review pass)

- `src/server/dal/reports.ts` — `getAbsenceListReport` re-implements the empty→`["approved"]` fallback inline; the page already resolves it via `checkedStatuses`/`reportDefaults`. Canonical default lives in `reportDefaults`; the DAL could trust a non-empty `filters.statuses`. Kept as defense-in-depth for now. (source: /user-review)
- `src/server/dal/reports.ts` — `isReportKey` (`REPORTS.some`) + `reportMeta` (`REPORTS.find`) are two linear scans per request; collapse to one lookup if the catalogue grows. (source: /user-review)
- `src/server/dal/reports.ts` — `periodOf` comment's "no timezone drift" note is partially redundant given the `string` signature; trim. (source: /user-review)
- `src/app/(app)/reports/page.tsx` — `getReport(activeKey!, …)` non-null assertion right after the `activeKey != null` guard; readability only. (source: /user-review)
- `tests/e2e/reports.spec.ts` — "each report runs" asserts only absence-of-error, not the "No data" empty-state path for the 4 new reports; a future UAT round should confirm empty-state rendering. (source: /user-review)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 2 — uiux pass)

- `src/app/(app)/reports/page.tsx` — `/reports?report=absence-list` status `<input type="checkbox">` have no explicit `focus-visible:ring-ring`; rely on the browser default ring (accessible but inconsistent with other focusable controls on the page). (source: /user-uiux)
- `src/app/(app)/reports/page.tsx` — "Run report" submit uses `variant="outline"` while other primary submits in the app use `variant="default"` (filled); deemphasises the primary action. (Phase 1 surface; re-confirm intended.) (source: /user-uiux)
- `src/app/(app)/reports/page.tsx` — native checkbox fill uses the browser-default accent (not the app `--accent` token); cosmetic only, meets WCAG 1.4.11. (source: /user-uiux)

### Reporting filter limits — considered & deferred (2026-06-03)

- Soft date caps (e.g. "no dates >1 year old") were considered to prevent heavy reports and **deferred — do nothing for now** (user call). Rationale: headcount/starters/leavers ignore the date at the query layer (load all employees, filter in memory), so a date cap wouldn't reduce their cost; leave-usage/absence-list fetch volume is bounded by org size, not unbounded time. The genuine scale lever is the existing load-all-then-filter-in-memory ceiling (already logged) — a row cap + "showing first N" notice would be the better guard if/when volume warrants. Revisit when data volume actually bites.

### Test isolation — employee cancel/refund flake (2026-06-03)

- `tests/e2e/employee.spec.ts:1027` "employee cancels approved leave and balance is refunded" — intermittent failure under the full parallel suite (`fullyParallel: true`); passes in isolation and on re-run. Root cause: asserts **absolute** balance values (`midBalance === 6`, `postBalance === 8`) on the shared Alice/Local-Leave/**2027** `leave_balances` row, which the test upserts but deliberately does not isolate (`finally` skips balance cleanup). Any concurrent worker mutating that row *through the approval/refund trigger* (a pending→approved transition or cancel for Alice Local Leave 2027) shifts the absolutes. Same class as Session 152 Bob-manager-drift / leave-overlap orphan. **Fix:** year-isolate the test to a dedicated far-future year (e.g. 2099) so no other spec shares the balance key — the B4/F3 test below it already uses 2030 for this reason. (Not this session's regression — surfaced during the Phase 2 full-suite run.)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 3 — qa pass)

- `src/app/(app)/reports/export/route.ts:73` — `statuses: meta.statusFilter ? filters.statuses ?? null : null` logs `null` for non-status-filter reports intentionally, but the inline ternary is subtle; a one-line comment would clarify intent. (source: /user-qa)
- `src/app/(app)/reports/export/route.ts:20-31` — `let user` + try/catch around `requireRole` is correct for Route Handlers but diverges from the page's direct `await requireRole(...)`; consider a shared `withRole` wrapper if more Route Handlers appear. (source: /user-qa)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 3 — review pass)

- `src/app/(app)/reports/export/route.ts:37` — `params.get("report") ?? undefined` converts `null`→`undefined` to satisfy `isReportKey`'s signature; consider widening `isReportKey` to accept `string | null | undefined`, or a one-line comment. (source: /user-review)
- `src/app/(app)/reports/export/route.ts` (filename label) — `new Date().toISOString().slice(0,10)` fallback is UTC, same characteristic as `today()` in `reports.ts`; could mislabel "tomorrow" for UTC+N users near midnight. Flag for the Phase 12 timezone-hardening pass alongside `today()`. (source: /user-review)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 3 — uiux pass)

- `src/app/(app)/reports/page.tsx` — filter-bar button group "Run report → Export CSV → Clear" could read clearer with a separator (e.g. `ml-auto` on Clear) to split run-actions from the destructive reset. (source: /user-uiux)
- `src/app/(app)/reports/page.tsx` — filter-bar buttons default to `size="default"` (h-9) while the report-selector strip uses `size="sm"`; not a regression but the two control rows differ in height. (source: /user-uiux)
- `src/app/(app)/reports/page.tsx` — Export CSV could add `aria-label="Export CSV (downloads file)"` so AT announces the download side-effect; partially addressed by the `download` attribute + icon. (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 4 charts — qa pass)

- `src/components/reports/report-chart.tsx:32` — `ResponsiveContainer width="100%"` + fixed `height={260}` renders at zero width SSR then resizes on hydration; a `min-h-[260px]` on the wrapping `<figure>` would remove the layout shift. (source: /user-qa)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 4 charts — review pass)

- `src/server/dal/reports.ts:44-48` — `ReportChartSpec.categoryKey`/`valueKey` are plain `string` with no compile-time check that the key exists in the report's `columns`; a miskey renders empty bars silently (recharts doesn't throw). Fine at 2 callers; if charts grow to 4+, add a validation in `getReport`'s result path that warns on a missing key. (source: /user-review)
- `src/server/dal/reports.ts:45-46` — the "must exist in the report's columns" constraint lives only on the type-level block comment; add `// must match a key present in this report's ReportResult.columns` to each of the `categoryKey`/`valueKey` field comments so it's visible at the point of editing. (source: /user-review)
- `tests/e2e/reports.spec.ts:122-123` — the cross-test "grain-toggle/headcount tests prove ≥1 row" comment becomes stale if those tests move/skip; reword to state the actual precondition (seeded active employees for headcount; ambient leave_request data for leave-usage — see the stashed seeding fix). (source: /user-review)

### Auto-routed NITs from /user-check 2026-06-03 (reporting Phase 4 charts — uiux pass)

- `src/components/reports/report-chart.tsx:49` — Tooltip `cursor` fill `var(--color-muted)` is near-white on the white card → hover highlight reads as no feedback; use an opacity (`/60`) or `var(--color-accent)` for a faint visible band. (source: /user-uiux)
- `src/components/reports/report-chart.tsx:32` — `height={260}` may be cramped on a ~320px phone (labels + bars); revisit if users report cramped mobile charts. (source: /user-uiux)
- `src/app/(app)/reports/page.tsx:302-305` — chart has no visible title/caption for sighted users (only the SR `aria-label`); a one-line `text-xs text-muted-foreground` caption above the chart would orient before the bars. (source: /user-uiux)
- `src/app/globals.css:32` — `--chart-1` teal is a hue shift from the slate-primary base; reads app-native (shadcn ships this hue) but flag for product sign-off if "no visual departure" is interpreted strictly as "no new hue." (source: /user-uiux)

### Deferred from /user-check 2026-06-03 (reporting Phase 4 — stashed NEEDS-FIX, user chose follow-up)

These were rated NEEDS-FIX by the sub-agents but had multiple resolutions / open questions; user opted to defer rather than apply this session.
- `tests/e2e/reports.spec.ts:115` — leave-usage chart assertion depends on ambient DB leave data, not a self-contained seed. Passes today (same assumption as the green grain-toggle test) but fragile on a fresh `supabase db reset`. **Fix:** seed one approved `leave_request` (date in the default previous-month range, `deducted_days > 0`) with `afterEach` cleanup, mirroring the security-rbac seeding pattern. (source: /user-qa)
- `src/components/reports/report-chart.tsx:27-31` — chart `<figure>` has no overflow control; uiux flagged possible horizontal overflow on narrow viewports with many bars. Recharts `ResponsiveContainer width="100%"` is designed not to overflow, so likely a non-issue — **MS14 (mobile reflow) is the live check**. If it reproduces: add `min-w-0` + wrap in `overflow-x-auto`. (source: /user-uiux)
- `src/components/reports/report-chart.tsx:27-29` — chart exposes only `aria-label="… chart"` to screen readers, no numeric data. The accessible `<ReportTable>` directly below carries the same data in semantic markup (so WCAG 1.1.1 is met), but a tighter link would help: `<figcaption class="sr-only">` or `aria-describedby` → the table's id. Effectively NIT-grade given the adjacent table. (source: /user-uiux)


### Auto-routed NITs from /user-check 2026-06-05 (chart caption — uiux pass)

- `src/app/(app)/reports/page.tsx:304` — chart caption uses a generic `<p>`; if it moves inside `<figure>` it should become a `<figcaption>` (strictly more correct, removes the separate element discussion). Tied to the stashed figcaption/aria decision below. (source: /user-uiux)
- `src/components/reports/report-chart.tsx:29` — if the caption becomes a `<figcaption>`, the `<figure>`'s `aria-label` becomes redundant and should be removed in the same change so the figcaption serves as the accessible name. (source: /user-uiux)

### Auto-routed NITs from /user-check 2026-06-10 (Step 1 dockerization — review pass)

- `infra/supabase/docker-compose.app.yml:29-30` — `NEXT_PUBLIC_*` are passed as build args (baked into the browser bundle) AND repeated in the runtime `environment` block (server-side `process.env` only). Add an inline comment noting the browser bundle reads the baked build-arg value, so a future operator doesn't expect runtime edits to reach the client. (source: /user-review)
- `Dockerfile:38` — `COPY --from=builder /app/public ./public` omits `--chown=nextjs:nodejs` while the adjacent standalone/static COPYs include it; world-readable so harmless, tidy for consistency. (source: /user-review)
- `Dockerfile:12` — `npm ci` has no BuildKit cache mount; add `RUN --mount=type=cache,target=/root/.npm npm ci` to make cold deps-stage rebuilds near-instant when `package-lock.json` is unchanged. (source: /user-review)

### Manually added follow up: 4jun26
1. Should be able to apply for leave in the past.  There are times when one cannot apply the leave beforehand.
2.

### Surfaced 2026-06-11 (Resend SMTP slice — manual smoke)

- `src/app/(auth)/reset-password/reset-password-form.tsx:138-143` — the password-update `catch` maps **every** `updateUser` error to one generic message ("Password could not be updated. Use the latest reset link and try again."). This masks the two common non-link causes: GoTrue `422 same_password` ("New password should be different from the old password") and `weak_password`. Result: a user who types their existing/weak password is wrongly told the link is bad and sent to request a new one. **Fix:** branch on `updateError.code` (`same_password`, `weak_password`) and surface the real reason inline; keep the generic "latest reset link" copy only for session/token errors. UX papercut, not a security issue. (source: manual smoke during GoTrue→Resend SMTP verification) 
### Auto-routed NITs from /user-check 2026-06-19 (0054 storage-mirror — review + security passes)

- `supabase/migrations/0054_storage_objects_select_own_role_agnostic.sql:32-37` — `select_own_objects` omits the `deleted_at is null` guard its 0053 counterpart has; correct-by-design (`storage.objects` has no `deleted_at` column) but a one-line comment would stop a future maintainer from "restoring" it. (source: /user-review)
- `supabase/migrations/0054_storage_objects_select_own_role_agnostic.sql:24-28` — CROSS-LINK note names `manager_select_direct_report_objects` without its owning migration number; append `(0015)` for grep-free traceability. (source: /user-review)
- `src/lib/document-upload-policy.ts:5-12` — comment lists the manager-blocked categories inline across three places (TS allowlist + two RLS denylists); could instead state that `MANAGER_UPLOAD_CATEGORIES` is the single source of truth to be cross-walked, avoiding triple maintenance. (source: /user-review)
- `supabase/migrations/0015_storage_documents.sql:46` (`employee_insert_own_objects`) — INSERT remains role-gated to `employee` while SELECT is now role-agnostic (0054); no exploit today (uploads use the admin client) but add a latent-risk comment mirroring 0054's SELECT note: any future session-client upload path for managers/admins needs a role-agnostic INSERT policy. (source: /security, LOW)
- Cross-link hardening — make the `MANAGER_UPLOAD_CATEGORIES` ↔ `manager_select_direct_report_objects` denylist coupling a stated migration-gated invariant (a "KEEP IN SYNC WITH" directive naming both files), so adding a `DocumentCategory` forces a lockstep denylist update. Overlaps the review NIT above; resolve together. (source: /security, LOW)

### Auto-routed NITs from /user-check 2026-06-19 (access-matrix step 3 — qa pass)

- `tools/check-access-matrix.mjs:44` — `routeFromFile` yields `"/"` if a `page.tsx`/`route.ts` ever sits directly under `src/app/` with no path segments; not in today's topology (glob scoped to `(app)/**`) but silently mishandled. (source: /user-qa)
- `tools/check-access-matrix.mjs:23` — `MATRIX` + glob paths are repo-root-relative; invoking the script from a subdir fails with unhelpful ENOENT. A `process.chdir` to the repo root at `main()` start would make it invocation-path-independent (CI always runs from root, so non-blocking). (source: /user-qa)
- `docs/access-matrix.md:102-107` — the checker-convention blockquote sits inside §3 between the table and the exemption block; doc-layout clarity only, parser unaffected. (source: /user-qa)

### Auto-routed NITs from /user-check 2026-06-19 (access-matrix step 3 — review pass)

- `tools/` vs `scripts/` — the checker lives in a new `tools/` dir while the three prior CI-adjacent scripts live in `scripts/`; no documented differentiation. Either fold into `scripts/` or add a `tools/README.md` stating the intent (e.g. authz static-analysis helpers, anticipating the step-4 DB cross-check script). (source: /user-review)
- `tools/check-access-matrix.mjs:98` — exemption separator regex includes a `--` (ASCII double-hyphen) branch that is fragile by shape (could in theory match an inline `-->`); cannot trigger today since the block is closed by `-->` on its own line. Tidy if touched. (source: /user-review)

### Surfaced 2026-06-19 (access-matrix step 4 — DB↔app cross-check)

- **Latent safe-direction grants (`profiles` / `documents` own-UPDATE).** RLS grants `employee` own-non-role UPDATE on `profiles` and own-non-sensitive UPDATE on `documents`, but the app exposes **no session-client write path** for either (`access-matrix.md` §7 findings 1–2). Not exploitable (app stricter than DB). Revisit when employee self-edit of profile / documents is built — at that point either add the action *or* narrow the DB grant so the two layers literally agree; pick whichever the feature needs. `(source: step-4 cross-check)`
- ~~**Step 6 — automate the DB↔app cross-check.**~~ **DONE 2026-06-19 (Session 184):** `tools/check-cross-check.mjs` (`npm run check:cross-check`, CI `gate` job) bidirectionally diffs the DB-table inventory of `rls-policy-map.md` against the `access-matrix.md` §7 per-table agreement table — a divergence blocks the PR. Inventory-completeness only (a table can't be added on one side without the other); the allow/deny judgements stay the §7 audit + the 2-AI close gate. `(source: step-4 cross-check)`

### Auto-routed NITs from /user-check 2026-06-19 (access-matrix step 4 — review pass)

- `docs/access-matrix.md` §7 agreement table — app-surface cells use loose shorthand inconsistent with the §3 exact-name standard: `employee_compensation` row says `compensation.upsert/selfUpdate` (real: `upsertCompensation`/`selfUpdateCompensation`); `onboarding_templates`/`onboarding_tasks` rows use globs (`onboarding.*Template*`). Prose-only (not parsed by `check-access-matrix.mjs`), so non-blocking; tighten to exact action names if the table is next touched. `(source: /user-review)`
- `docs/access-matrix.md` §7 `employee_records` row — cites read surfaces only (`/employees`, `/employees/[id]`); for parity with the `profiles`/`departments` rows it could also name the admin write path (`employees.createEmployee`/`updateEmployee`). Admin-write agreement is implicit from §3; completeness NIT only. `(source: /user-review)`
- `docs/access-matrix.md` §7 intro — calls the safe direction a "latent inconsistency"; the finding prose + `follow-ups.md` use the cleaner "latent grant". Align vocabulary if touched (avoids implying a bug). `(source: /user-review)`

### Auto-routed NITs from /user-check 2026-06-19 (access-matrix step 5 — security pass)

- `docs/access-matrix.md` §6.7 `assignTemplate` row — ledger cell shows `auth.access_denied` with no reason, but the code emits and the spec asserts `reason: "manager_assign_outside_direct_reports"` (`onboarding.ts:268`, `security-rbac-guards.spec.ts:568`). Cell is proven; add the reason string for parity with the other rows when next touched. `(source: /security)`
- `tests/e2e/employee.spec.ts:415` — `updateOwnGoalProgress` not-owner asserts the audit row via the unscoped `expectAudit("auth.access_denied")` (no actor/`since` filter), the one §6.7 ledger cell not on the scoped `expectDenyAudit({ actorId, since })` pattern. Test still proves the guard via UI + DB asserts, but a stale same-session `auth.access_denied` row could mask a regression. Upgrade to `const since = nowIso()` before the submit + `expectDenyAudit({ actorId: ids.alice, since })` to close the stale-row false-pass risk. `(source: /security)`

### Auto-routed NITs from /user-qa 2026-06-19 (playwright base-url hydration)

- `playwright.config.ts:16` — `.split(/\n/)` could be `.split(/\r?\n/)` to make CRLF intent explicit (value is already `.trim()`-stripped, so behaviour is correct today; cosmetic). `(source: /user-qa)`
- `playwright.config.ts:19` — bare `catch {}` swallows all errors, not just `ENOENT`; a permissions error on `.env.local` would silently fall back to the 3100 default (same collision). Narrow to rethrow unexpected codes: `catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }`. `(source: /user-qa)`
- `docs/playwright-suite.md` — cookie-derivation paragraph could cross-reference the `auth.setup.ts:29-30` `split(".")[0]` single-label-host caveat so a future contributor sees the subdomain assumption. `(source: /user-qa)`

### Surfaced 2026-07-02 (docker-compose DX simplification)

- ~~**Compose command verbosity** — every stack command in `README.md` repeats `-f docker-compose.yml -f docker-compose.app.yml` because Compose only auto-loads the base file and the app overlay must be named explicitly.~~ **DONE 2026-07-07:** added `COMPOSE_FILE=docker-compose.yml:docker-compose.app.yml` to `infra/supabase/.env` + `.env.example`; simplified all runbook commands to bare `docker compose …` (`README.md`, `LOCAL_SETUP.md`, `infra/supabase/backup/README.md`, `docs/server-deploy.md`). Makefile option not taken — `COMPOSE_FILE` suffices. Deploy-architecture context captured in `docs/aws-ecr-deployment-plan.md`. `(source: session 187 advisory)`

### Surfaced 2026-07-02 (internal-CA browser-trust not documented)

- **Trust the internal CA (one-time) — missing from README.** Caddy serves `https://kushhr.internal` with `tls internal` (per-install unique CA); browsers reject it until the CA is imported, and the 1-year HSTS header (`Caddyfile:24`) turns the cert warning into a hard, un-bypassable block after any temporary exception is cleared (e.g. PC restart). This bit the operator and will bite every new local installer (`certs/` is gitignored, so a fresh clone has no CA and `web` won't start until one is exported). Add a short README "Trust the internal CA (one-time)" section covering: (1) export `caddy-root.crt` from the running Caddy → `infra/supabase/certs/` (bootstrap for `web`), (2) import it into Firefox **Authorities** tab (Firefox uses its own store) *or* macOS Keychain + `security.enterprise_roots.enabled=true` for system-wide, (3) note each install mints its **own** CA (don't share the file), and (4) warn that `docker compose down -v` / volume prune regenerates the CA and invalidates trust. Doc-only. User offered the change; deferred to a future session. `(source: session 188 cert-troubleshooting)`
- **Optional: soften HSTS for the internal hostname (code).** `Caddyfile:24` sets `max-age=31536000; includeSubDomains` — correct for a real HR/payroll FQDN but it's what converts a click-through cert warning into a lockout on the `.internal` dev box. If the team keeps tripping on this, consider lowering `max-age` (or dropping HSTS) specifically for `kushhr.internal` while keeping it for real deploys. Security tradeoff — not needed once the CA is trusted; insurance only. `(source: session 188 cert-troubleshooting)`
