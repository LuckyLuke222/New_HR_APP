# Sol Audit 6 — Production-Readiness and Professional-Grade Assessment

> Authored entirely by GPT-5.6 "Sol" (Codex), one-shot independent pass, on 2026-07-13.
> Provenance: [Sol · date] = GPT-5.6 Sol · later passes append findings tagged [Model · date].

## 1. Verdict

KushHR is **pilot-grade, not production-grade: 2.5/5** on a scale where 1 is prototype, 2 is usable MVP, 3 is controlled internal production, 4 is mature production, and 5 is a continuously assured high-sensitivity platform. It is more professional than a typical solo MVP—coherent module layout, extensive threat/access documentation, real RLS tests, pinned migrations, health checks, a deployment runbook, and disciplined human approval—but the operational assurance does not match the sensitivity of HR/payroll data. Public signup is unsafe by default, business writes and audit are non-atomic, CI does not run E2E/build/security tests, backups remain on the same host and restore verification can swallow failure, and there is no centralized application telemetry/alerting or complete incident/privacy operating model.

## 2. Dimension-by-dimension assessment

### Repo scaffolding and structure

**Genuinely good:** A single Next application is the correct shape for a 15–20-user internal tool; a monorepo would add ceremony without value. `src/app/`, `src/components/`, `src/server/actions/`, `src/server/dal/`, and `src/lib/` make the main layers discoverable. Server-only boundaries exist around secrets and privileged clients. The installed Next 16 convention is followed by `src/proxy.ts`, and the `Dockerfile` produces a non-root standalone runtime image.

**Falls short:** boundaries are descriptive rather than enforceable. Business rules are concentrated in 1,914-line `leave.ts` and 1,526-line `performance.ts`; DAL functions sometimes enforce RLS through a session, sometimes accept caller IDs and use service role, while some Server Components query through composite DALs. This makes “where authorization lives” answerable only by reading the call chain. The current Next guidance recommends one server-only DAL approach with authorization and minimal DTOs close to the data source, not a mixture auditors must rediscover ([Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication), [Next.js data security guide](https://nextjs.org/docs/app/guides/data-security)).

**Concrete gap:** define and enforce a thin-action → viewer-aware domain service/transaction → typed DTO architecture. Restrict `createAdminClient()` imports to that boundary.

### Architecture and data layer

**Genuinely good:** `docs/security-model.md`, `docs/access-matrix.md`, and `docs/rls-policy-map.md` articulate deny-by-default, direct-report scope, private storage, and fixed compensation projections. All surviving public application tables enable RLS. Manager compensation uses a fixed security-definer RPC instead of returning sensitive base rows. Migration checksums and per-file transactions in `scripts/db-migrate.mjs` are stronger than many small internal apps.

**Falls short:** the service role is a common application data path in `src/server/actions/` and several `src/server/dal/` modules. Supabase explicitly documents that service/secret roles bypass RLS, so every caller check becomes the security perimeter ([Supabase Postgres roles](https://supabase.com/docs/guides/database/postgres/roles), [Supabase API-key guidance](https://supabase.com/docs/guides/getting-started/api-keys)). Several direct `authenticated` mutation grants are simultaneously broader than the app. This creates two authorization models rather than defense in depth. The clients are not parameterized with generated schema types, producing hundreds of assertions.

**Concrete gap:** move critical transitions—employee role/job update, leave decision/balance/audit, document metadata, performance workflow—into typed transaction functions. Use session RLS for ordinary reads, narrowly scoped RPCs for special projections, and service role only for irreducible Auth/Storage administration.

### Change management and engineering process

**Genuinely good:** `CLAUDE.md` requires plan-first work, state ownership/blast-radius thinking, explicit approval, surgical changes, targeted verification, and handover. `docs/systems-thinking.md`, `docs/current-phase.md`, `handover.md`, and descriptive recent commits show real attention to recoverable context and intent. Human approval for high-risk HR changes is a professional choice, not an automation failure.

**Falls short:** the process is unusually documentation-heavy and tool/person dependent. Important gates live as prose and custom agent skills rather than repository-enforced policy. The checkout has one CI workflow but no `CODEOWNERS`; branch protections/reviewer requirements are not auditable from the repo. `docs/server-deploy.md` still says “draft,” and deployment includes manual edits/decisions. A mature process makes the safe path the default even when the primary operator or AI workflow is absent.

**Concrete gap:** codify required reviews, migration ownership, branch/ruleset gates, release checklist, and rollback evidence in GitHub/repository configuration. Keep the thoughtful workflow, but compress session narrative and make only durable decisions load-bearing.

### Testing and CI

**Genuinely good:** Playwright coverage is broad by small-app standards. `tests/e2e/security-rbac-guards.spec.ts`, `access-matrix.spec.ts`, `rls.spec.ts`, multi-role storage state, and direct forged-request helpers test boundaries that ordinary UI tests miss. The static CI gate (`.github/workflows/ci.yml`) runs type-check, lint, and three custom access/documentation consistency checks.

**Falls short:** CI runs neither `next build` nor Playwright. The green required check therefore does not prove that the production artifact builds, migrations apply, RLS works, or core workflows pass. There are no fast unit/contract tests for leave math, transitions, CSV safety, or mapping functions. Positive audit assertions are mostly stale-row tolerant, and global cleanup failure is non-fatal. OWASP ASVS is intended as a testable security-control baseline, not merely design prose; KushHR would benefit from selecting an ASVS level/profile and mapping automated evidence to it ([OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)).

**Concrete gap:** add a disposable Supabase CI job that migrates from zero, seeds isolated test data, runs RLS/security/critical E2E serially, and fails cleanup. Add a production build job and small unit/property suites for pure business rules. Full cross-browser UI can remain scheduled/manual.

### Observability and operations

**Genuinely good:** Compose services have health checks; Caddy provides one TLS front door and baseline headers; `docs/server-deploy.md` covers first boot, migration, backup-before-change, smoke, and rollback. `infra/supabase/backup/backup.sh` encrypts DB and Storage archives, uses temporary files, hashes them, and prunes retention. Audit rows cover many business/security events.

**Falls short:** application errors go to `console.error`; there is no error tracker, request correlation, metrics, SLO, alert routing, or application readiness check beyond `/login`. Audit is not reliable telemetry because inserts fail open and it is not centrally monitored. The optional Supabase log feature is disabled in the base Compose environment. OWASP recommends separating audit/transaction trails from security/operational logging, testing logging failure, centralized collection, and alerting on serious events ([OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)).

Backups are explicitly local-only in `infra/supabase/backup/README.md` and `backup.sh`; the same disk/host failure can destroy production and backup. Worse, `restore.sh` suppresses `pg_restore` failure with `|| true` and can print “Verification done” after a partial restore. NIST contingency guidance treats recovery as a planned, tested capability, not the existence of an archive ([NIST SP 800-34 Rev. 1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final)). `infra/supabase/run.sh` also has a `secrets` command that prints passwords/API keys to the terminal, increasing scrollback/log leakage risk.

**Concrete gap:** off-host immutable/encrypted backups, fail-closed restore verification with source-vs-restore assertions, quarterly recovery drill, centralized structured logs/error tracking, and a small alert set (auth/signup anomaly, audit-write failure, backup failure, disk, DB health, 5xx rate).

### Security and compliance posture

**Genuinely good:** threat/access design is explicit, RLS is pervasive, private documents use signed URLs, sensitive manager compensation is projected, secrets are server-only, and Caddy provides TLS/headers. The team has invested in negative authorization tests and auditability.

**Falls short:** the program is not ready to claim safe handling of production HR/payroll PII. Repository defaults enable public signup. There is no demonstrated MFA policy, periodic access/role review, joiner-mover-leaver control, data retention/deletion schedule, incident-response runbook/tabletop, privacy inventory, data-subject request procedure, or vendor/subprocessor record. Bank/tax/national ID fields are plaintext in the main database; encryption-at-rest may exist at disk level but field exposure and key separation are not documented. CSP is explicitly deferred in `infra/supabase/Caddyfile`, and direct `:3100`/`:8000` publishes remain a documented hardening item.

**Concrete gap:** perform a lightweight data-protection assessment with counsel/owner for the applicable Mauritius/company obligations; establish data classes, retention, access review, incident response, backup/key ownership, and breach escalation. Use OWASP ASVS 5.0 as the technical acceptance baseline and keep legal compliance claims separate from technical controls.

### Dependency and supply-chain health

**Genuinely good:** `package-lock.json` exists; Next/React are exact in `package.json`; the Docker Compose base pins most Supabase images to explicit versions and maintains `infra/supabase/versions.md`. The `Dockerfile` uses `npm ci`, a multi-stage build, and a non-root runtime. Updates appear deliberate rather than automatic surprise upgrades.

**Falls short:** many npm direct ranges are caret-based (safe at install only because of the lock); Node and Caddy base tags (`node:22-alpine`, `caddy:2-alpine`) are mutable, as are GitHub Action major tags. No committed Dependabot configuration, dependency-review job, SBOM, container scan, secret scan, or image-signing/provenance workflow exists. `sonner` and `next-themes` appear unused. GitHub's dependency review can block vulnerable packages introduced in a PR, and Dependabot can raise security updates ([GitHub dependency review](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review), [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates)).

**Concrete gap:** enable alerts/security updates, add dependency review where licensing permits, run `npm audit`/OSV plus container scanning on a schedule, generate an SBOM, remove unused deps, and pin production images/actions by digest/SHA where operationally practical.

### Documentation and onboarding

**Genuinely good:** a new engineer can understand product roles, schema, access intent, deployment topology, UAT flows, and historical decisions from `README.md`, `LOCAL_SETUP.md`, `docs/security-model.md`, `docs/database-design.md`, `docs/server-deploy.md`, and phase/handover material. Comments often capture why, not only what.

**Falls short:** volume and drift reduce trust. The RLS map disagrees with final policies for holidays, documents, and app settings. The deploy runbook contains unresolved demo-seed, ingress, SMTP, and off-site-backup decisions. There is no one-page production ownership sheet listing operator, escalation, RTO/RPO, data owner, and current release readiness.

**Concrete gap:** create a short production handbook/index with authoritative links and automated freshness checks. Archive session narrative from the onboarding path. Generate schema/grant facts rather than hand-maintaining them.

## 3. What the best software in this class does differently

For a small internal HR system, “best” means boring, verifiable controls—not microservices or FAANG scale:

1. **Invite-only identity with lifecycle ownership.** HR/admin creates users; signup is technically disabled; role changes and terminations revoke/reconcile sessions; MFA is required for admins.
2. **Transaction-owned audit.** Salary, role, leave balance, and document transitions commit with an immutable audit/outbox event or do not commit.
3. **One authorization boundary.** Session RLS handles ordinary user-scoped reads; narrowly typed transaction/RPC methods handle writes. Service-role use is exceptional and centrally reviewed.
4. **Disposable-environment CI.** Every migration is applied from zero and from an upgrade fixture; security/RLS tests and a production build gate merges. Tests prove a newly created event, not any historical row.
5. **Recoverability with independent failure domains.** Encrypted off-site backups, fail-closed automated verification, defined RPO/RTO, and rehearsed full DB+object restore.
6. **Actionable telemetry.** Structured logs with request IDs, error tracking, a few operational/security metrics, centralized retention, and named on-call/escalation—even if “on-call” is one operator plus a manager.
7. **Privacy operations.** Data inventory/classification, minimum necessary access, quarterly access review, retention/deletion, incident playbook, and documented handling of exports/backups.
8. **Supply-chain gates.** Locked dependencies, automated advisories, dependency/container scanning, immutable release artifacts, SBOM, and auditable rollback tags.

## 4. Prioritized recommendations

### Table stakes before real production data

| Priority | Recommendation | Rough effort | Maturity gap closed |
|---|---|---:|---|
| P0 | Disable and preflight public signup; remove demo accounts/seed from production bootstrap; close direct `:3100`/`:8000` ingress and finalize TLS/FQDN. | 1–2 days + IT decision | Prevents trivial account/data exposure; repeatable secure deploy. |
| P0 | Fix frozen leave refund, manager broad leave UPDATE, employee partial role update, and leave decision zero-row races. | 4–7 days | Core HR data correctness and authorization integrity. |
| P0 | Make privileged mutation + audit atomic (or durable outbox) and alert on audit health. | 1–2 weeks | Defensible accountability for payroll/PII changes. |
| P0 | Wire encrypted off-site backup, make restore fail closed, compare source/restore, and complete a documented full DB+Storage recovery drill. | 2–4 days plus storage procurement | Single-host disaster recovery and credible RPO/RTO. |
| P0 | Add CI production build + migrated disposable DB + critical RLS/security E2E; require the checks on protected main. | 3–5 days | Green CI becomes meaningful release evidence. |
| P1 | Add centralized error/structured log collection and alerts for 5xx, audit failure, signup anomaly, DB/disk, and backup status. | 2–4 days | Failures become detectable before user reports. |
| P1 | Establish a concise privacy/security operating pack: owner, data inventory, access review, retention, incident response, export/backup handling, MFA decision. | 3–5 days with business/legal owner | Program-level PII governance. |
| P1 | Add file signature/parse validation, quarantine/malware scan, and close direct Storage/metadata insert bypass. | 3–7 days | Safe document intake. |

### Professional hardening / maintainability

| Priority | Recommendation | Rough effort | Maturity gap closed |
|---|---|---:|---|
| P2 | Generate Supabase types and refactor to viewer-aware domain services/transaction RPCs; split leave/performance by capability. | 2–4 weeks incrementally | Enforceable architecture, safer changes. |
| P2 | Make audit assertions run-scoped; add unit/property tests for leave math, transitions, CSV cells, and mappers. | 3–5 days | Faster and more trustworthy regression feedback. |
| P2 | Add Dependabot/advisory ownership, dependency review/scans, SBOM, image digest strategy; remove orphan deps/assets. | 1–3 days | Supply-chain hygiene. |
| P2 | Generate RLS/grant/schema inventory from a migrated DB and compare to expected policy manifest. | 2–4 days | Eliminates documentation/security drift. |

### Nice-to-have polish

- Lazy-load Recharts and consolidate dashboard aggregates only after measuring.
- Add a modest CSP after inventorying required scripts/styles; do not paste a brittle policy.
- Prebuild/publish an immutable ECR image as planned in `docs/aws-ecr-deployment-plan.md`; do not require Kubernetes.
- Add scheduled cross-browser E2E and a lightweight staging rehearsal before releases.

## 5. Honest caveats

- A 15–20-user LAN/VPN tool does **not** need microservices, Kubernetes, multi-region active-active, Kafka, a dedicated SRE team, or hundreds of dashboards. One Next app, one Postgres, one object store, and Docker Compose can be a professional architecture.
- Process-local rate limiting, synchronous notifications, and manual deploy approval can be proportionate while the system remains internal and single-worker—provided the limits are documented and the ingress assumption is enforced.
- Full E2E on every small PR may be slow. A professional small-team compromise is fast unit/static/build checks per PR, critical RLS/security E2E per PR, and the full UI suite scheduled/pre-release.
- Field-level encryption is not automatically superior if keys live beside the app and search/use requires decryption. Start with disk/backups encryption, strict access, minimized projections, and key ownership; add field encryption/tokenization where a documented threat model justifies it.
- Human approval and the Systems-Thinking workflow are strengths for sensitive changes. The gap is not lack of autonomy; it is that critical controls must still hold when a different engineer operates the repository.
- Repository evidence cannot prove live branch protection, host firewalling, secret-manager use, disk encryption, monitoring configured outside the repo, or the effective gitignored `.env`. Those may raise the operational rating, but they require evidence before production sign-off.
