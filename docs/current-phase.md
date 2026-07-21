# Current Phase

## Phase 13 — AI-Built App Risk Audit

Status: **GO WITH RESIDUAL EXTERNAL WATCH** — remediation complete, manual UAT in progress.

Decision docs: `docs/ai-built-app-risk-audit.md`, `docs/checks/phase-13.md`, `docs/ultrareview-findings.md`.

### Exit checks remaining

- [x] Complete manual human-flow UAT across all 9 flows (9/9 done) and record pass/fail evidence.
- [x] Build KushHR user-flow inventory (`docs/user-flow-inventory.md`, code-grounded, gated by `tools/check-user-flows.mjs`). HRMS comparison **parked** (work-plan in `userflow.doc`).
- [ ] Run final reviews with multiple AI systems after manual UAT and user-flow comparison. **THREE systems DONE, run blind** — Codex (GPT-5) `codex-audit-*.md` + Fable 5/Opus `fable-audit-*.md` + Sol (GPT-5.6) `codex-sol-audit-1..6-*.md`. All folded into `docs/checks/audit-remediation-plan.md` (Tier A/B/C/D + **Tier P production-readiness**) + colleague `audit-summary.pdf`. Fable **and** Sol independently re-found the 3 items Codex missed (open self-registration, refund-recompute BLOCKER, column-ungated leave UPDATE); Sol escalated audit fail-open to BLOCKER and added a production-readiness verdict (**2.5/5 pilot-grade**). Gate stays open until **Tier-A remediation** lands; Tier P is the separate production-hardening track before real staff data.

### UAT flow status

| Flow | Doc | Status |
|---|---|---|
| Employee profile lifecycle | `docs/uat-flows/employee-profile-lifecycle.md` | **Complete** (Sessions 106–118) |
| Security & RBAC guards | `docs/uat-flows/security-and-rbac-guards.md` | **Complete** (Session 122 + 136 closures) |
| Performance cycle | `docs/uat-flows/performance-cycle.md` | **Complete** (Sessions 139–142) — all 12 findings closed across B1–B4 |
| Leave request lifecycle | `docs/uat-flows/leave-request-lifecycle.md` | **Complete** (Sessions 145–149) — F1–F7 closed across B1–B4 |
| Leave admin & year rollover | `docs/uat-flows/leave-admin-and-rollover.md` | **Complete** (Session 150 — F1+F2 closed across B1/B2) |
| Document upload | `docs/uat-flows/document-upload.md` | **Complete** (Session 151 — F1+F2 closed across B1/B2) |
| New-hire onboarding | `docs/uat-flows/new-hire-onboarding.md` | **Complete** (Session 153 — F1+F2+F3 closed across B1/B2/B3) |
| Password reset | `docs/uat-flows/password-reset.md` | **Complete** (Session 154 — walked clean, no findings) |
| Payroll | `docs/uat-flows/payroll.md` | **Complete** (Session 154 — workflow reshaped: change-request retired, employee self-service + manager view-only RPC; F1+F2+F3+F4+F5 closed inline) |

### Priority path

1. Walk the remaining 1 UAT flow (payroll change request).
2. Record pass/fail evidence in each UAT doc; triage and remediate findings per batch.
3. ~~User-flow inventory build.~~ **DONE** — `docs/user-flow-inventory.md` + `check:user-flows` gate. (HRMS comparison parked.)
4. Final multi-AI review — Codex + Fable + Sol passes ALL DONE, combined into `docs/checks/audit-remediation-plan.md`; **next: remediate Tier-A findings** (self-registration off, leave-ledger integrity ×3, perf cycle guard + draft-read + Sol's audit/deadline items, `updateEmployee` atomicity) + Tier P P0 production-hardening.
5. External Next/PostCSS advisory — re-check after next compatible release.

### References

- Session history: `handover.md`
- Open items: `docs/pending-backlog.md`
- Completed phase archive: `docs/phase-history.md`
- Follow-ups: `docs/follow-ups.md`
- Product scope: `PROJECT_CONTEXT.md`, `docs/product-requirements.md`
- Schema/security: `docs/database-design.md`, `docs/security-model.md`, `docs/rls-policy-map.md` (DB layer), `docs/access-matrix.md` (application layer — who-can-do-what; the two must agree)
- Build plan: `docs/phase-plan.md`, `MainProjectSteps.md`
- Server deploy: `docs/server-deploy.md` (runbook: deploy-don't-develop, TLS branches, `db:migrate` loop, backups)
- AWS deploy: `docs/aws-ec2-deployment-test.md` (throwaway single-EC2 test runbook + pause/resume), `docs/aws-deploy-field-report.md` (what worked / issues to expect on a real box), `docs/aws-ecr-deployment-plan.md` (ECR/CI build path), `docs/aws-sizing.md` (instance sizing)
- Research & lessons: `docs/research/*.md`, `learning.md`
