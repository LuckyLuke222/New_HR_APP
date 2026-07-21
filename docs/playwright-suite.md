# Playwright Suite — KushHR

Single reference for how the end-to-end test suite is organised. The config (`playwright.config.ts`) is the source of truth; this doc explains the *why* and tells contributors where to put new tests.

## Projects

The suite is one config with multiple **projects**. Each project filters by file and can be run in isolation. `setup` is a dependency of the role projects; it seeds the `playwright/.auth/*.json` storage states once per run.

| Project | File | Storage state | Purpose |
|---|---|---|---|
| `setup` | `tests/e2e/auth.setup.ts` | writes admin/manager/employee `.auth` | Signs in three personas via Supabase and persists storage state. |
| `chromium` (smoke) | `tests/e2e/smoke.spec.ts` | none | Unauthenticated checks: route guards, public reset/forgot. Fast. |
| `rls` | `tests/e2e/rls.spec.ts` | none (raw DB) | Direct-DB RLS forge + DB-level constraints (e.g. `leave_requests_no_overlap`). |
| `admin` | `tests/e2e/admin.spec.ts` | admin | Admin-scoped feature flows (dashboards, audit logs, settings, payroll, onboarding admin, leave admin). |
| `manager` | `tests/e2e/manager.spec.ts` | manager | Manager direct-report flows, approvals, team views. |
| `employee` | `tests/e2e/employee.spec.ts` | employee | Employee self-service: leave, onboarding tasks, documents, payroll summary. |
| `reports` | `tests/e2e/reports.spec.ts` | admin | Admin reporting module (`/reports`): report selector, per-report rendering, `report.generated` audit, and CSV export (download via the Export CSV link → `report.exported` audit). Non-admin denial (incl. `/reports/export` 403) lives in `security`. |
| `security` | `tests/e2e/security-rbac-guards.spec.ts` | switched per `describe` via `test.use({ storageState })` | Automation of `docs/uat-flows/security-and-rbac-guards.md` — URL guards + forge replay. |

Test count drifts as the suite grows. The current rough mix is ~125–135 rendered tests across all projects.

## Forge helper contract — `tests/e2e/forge.ts`

The security project uses three helpers to automate the "forge methodology" from the UAT doc.

| Helper | Signature | What it does |
|---|---|---|
| `captureServerAction(page, action)` | `(page, () => Promise<void>) => Promise<CapturedAction>` | Runs the supplied action, intercepts the resulting Server Action POST, and returns `{ url, body, headers }`. The captured body is the real submission payload — including hidden fields, action signature, and CSRF context. |
| `forgeAndReplay(page, captured, fromId, toId)` | swaps `fromId` → `toId` everywhere in `captured.body` and replays via `page.request.post(...)` | Returns `{ status, body }` of the forged response. Use this to check the server-side guard, not the UI. |
| `expectDenyAudit({ actorId, since, entityId?, reason? })` | polls `audit_logs` for an `auth.access_denied` row matching the filter | Asserts the deny was *audited*, not only blocked. Audit row is the canonical guard signal. |
| `nowIso()` | `() => string` | Snapshot timestamp used as the `since` filter so audit polls don't see pre-test rows. |

Multipart uploads (file inputs) are not supported — `request.postData()` returns null for those. See the skipped step 13 test in `security-rbac-guards.spec.ts` for the documented workaround.

The general security-test shape:

```ts
const since = nowIso();
const captured = await captureServerAction(page, async () => {
  await page.getByRole("button", { name: /.../i }).click();
});
const { status, body } = await forgeAndReplay(page, captured, donorId, victimId);
expect(status).toBe(200);
expect(body).toContain("...denial string...");
await expectDenyAudit({ actorId, entityId, reason, since });
```

## Running the suite

Full suite (always pre-clean):
```bash
lsof -ti:3100 | xargs kill 2>/dev/null
npm run cleanup:e2e-data
npx playwright test --reporter=line
```

One project (most common during development):
```bash
npx playwright test --project=security
npx playwright test --project=admin
npx playwright test --project=rls
```

One test:
```bash
npx playwright test -g "B1/F1 — alice submitting"
```

### Targeting a different origin (`PLAYWRIGHT_BASE_URL`)

`baseURL` defaults to `http://127.0.0.1:3100` (host dev via the spawned `webServer`). Set `PLAYWRIGHT_BASE_URL` to run against a **deployed origin instead** — used by the off-cloud validation gate to hit the dockerized app behind Caddy:
```bash
PLAYWRIGHT_BASE_URL=https://kushhr.internal npx playwright test --reporter=line
```
When `PLAYWRIGHT_BASE_URL` is set, the `webServer` block is disabled (no host-dev spawn) — the target stack must already be running. `ignoreHTTPSErrors: true` is on for the internal-CA cert. `auth.setup.ts` derives the minted cookie's **name** (`sb-<host>-auth-token`), **domain**, and **secure** flag from this origin, so the storage state matches what the app reads under that host. Demo personas still sign in with `TestPass123!`.

**Persisting the target per machine.** If `PLAYWRIGHT_BASE_URL` is not already in the environment, `playwright.config.ts` hydrates it from `.env.local` (gitignored, machine-local) before the config evaluates. So on a box that runs the self-host stack, add `PLAYWRIGHT_BASE_URL=https://kushhr.internal` to `.env.local` once and the whole suite targets the running container without an inline env var — and `webServer` stays `undefined`, which **prevents the port-3100 collision**: with the var unset, Playwright would otherwise reuse the `kushhr-web` container squatting on 3100 at the wrong origin, so the `sb-127-auth-token` cookie never matches `sb-kushhr-auth-token` and every authenticated test silently redirects to `/login`. Leave it out of `.env.local` (the CI/clean-checkout case) to keep the spawned-local-dev default.

## Cleanup contract

Test residue between runs is the most common source of flaky failures (the 2026-05-22 B1 pre-flight discovered UAT residue still living in the live DB from older Playwright runs).

- `tests/e2e/global-teardown.ts` runs `npm run cleanup:e2e-data` after the full suite. Set `PLAYWRIGHT_SKIP_CLEANUP=1` to retain artifacts when debugging.
- Tests that seed via `supabaseAdmin` **must** clean up in a `try / finally`. Inserting and forgetting is a regression — the cleanup script (`scripts/cleanup-playwright-artifacts.mjs`) only catches the well-known shapes (`Journey ...`, deterministic seed IDs).
- Per-test cleanup registries (see `rls.spec.ts` top + `manager.spec.ts` header) are the preferred pattern when many tests share the same seed type.
- **Performance review cycles** created via `createPerformanceCycle()` in `tests/e2e/helpers.ts` set `description = "Created by Playwright"`. The cleanup script matches on this as a generic catch-all so future test cycles get caught without needing the title prefix to be added per test. Do not change the description without updating `PLAYWRIGHT_CYCLE_DESCRIPTION` in `scripts/cleanup-playwright-artifacts.mjs` in lockstep.

## Placement rule of thumb

When adding a new test, ask in this order:

1. **Is it a denial / forge / audit assertion?** → `security-rbac-guards.spec.ts`. Use the forge helpers; assert both the server response *and* the audit row.
2. **Is it a direct-DB constraint or RLS guarantee?** → `rls.spec.ts`. No UI; raw `supabaseAdmin` and `createSignedInClient`.
3. **Is it role-normal feature behaviour?** → the matching role file (`admin.spec.ts` / `manager.spec.ts` / `employee.spec.ts`). UI-driven, storage-state-loaded.
4. **Is it cross-cutting and unauthenticated?** → `smoke.spec.ts`.

Don't create a new `.spec.ts` file for a single feature — extend the right project. New spec files are reserved for genuinely new test layers (e.g. a future visual-regression project would justify one).

## When to update this doc

(Mirrors the trigger list in `CLAUDE.md` step 5.)

- A new `.spec.ts` file is created in `tests/e2e/`.
- A project is added / removed / renamed in `playwright.config.ts`.
- A shared helper in `tests/e2e/forge.ts` (or any new helper file) is added or its public contract changes.
- The cleanup or auth-setup flow changes.

Individual `test(...)` additions inside an existing file do **not** trigger an update — those are visible via per-project counts at run time, and noting each one here is noise.
