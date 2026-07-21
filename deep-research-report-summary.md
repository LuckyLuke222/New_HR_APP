# AI-Built App Audit Source Summary

Derived from: `deep-research-report.md`

## Purpose

Compact audit reference for reviewing AI-built or AI-assisted applications before production.

The core conclusion from the full report is not “AI code is bad.” The more accurate framing is:

> AI changes the defect profile. It can produce useful code quickly, especially in narrow and well-scaffolded tasks, but it increases risk where production-readiness, security, maintainability, and independent verification are weak.

Use this file as an audit source for agents reviewing KushHR or future AI-assisted projects.

---

## 1. Evidence-Weighted Risk Model

### A. Security Risk — High Confidence

AI-generated code often looks syntactically correct while still omitting or weakening security controls.

**Evidence-backed risks**

- Missing or weak input validation.
- Missing authentication or authorization checks on sensitive routes/actions.
- Unsafe defaults such as broad CORS, disabled TLS checks, or exposed secrets.
- Deprecated API usage.
- Prompt-injection exposure in agentic systems that combine private data, untrusted content, and tool execution.
- Security benchmarks show syntax correctness improving faster than secure-by-default behavior.

**Audit signals**

- Secrets or credentials in repo.
- Client-side-only authorization.
- Server actions/API routes without role/session checks.
- Raw user input sent into DB queries, shell commands, file paths, or LLM/tool calls.
- Raw DB or stack-trace errors returned to users.
- Missing audit logs for denied access or sensitive mutations.

**Useful grep checks**

```bash
rg -n "password|secret|token|api[_-]?key|service[_-]?role|SUPABASE_SERVICE_ROLE"
rg -n "NODE_TLS_REJECT_UNAUTHORIZED|cors\\(.*\\*|Access-Control-Allow-Origin.*\\*"
rg -n "eval\\(|exec\\(|Function\\(|dangerouslySetInnerHTML"
rg -n "catch.*\\{\\s*\\}|except:\\s*pass|console\\.error"
```

---

### B. Supply Chain Risk — High Confidence

The full report treats package hallucination and dependency misuse as one of the strongest evidence-backed AI risks.

**Evidence-backed risks**

- Hallucinated packages.
- Typosquatting or lookalike dependencies.
- Deprecated libraries or APIs.
- Unnecessary dependency bloat.
- Direct GitHub installs or unpinned versions.
- Missing or stale lockfiles.

**Audit signals**

- Dependencies that are not imported anywhere.
- Imports that are not declared in package manifests.
- Unknown packages with low usage, recent creation, weak maintainer history, or suspicious names.
- Forced audit fixes that downgrade core frameworks or introduce breaking changes.

**Checks**

- Compare `package.json` dependencies against imports.
- Confirm lockfile exists and is committed.
- Run dependency audit, but do not blindly apply unsafe `--force` fixes.
- Review direct URL/Git dependencies manually.

---

### C. Verification Burden — High Confidence

The report strongly validates the risk that tests can pass without proving intended behavior.

**Evidence-backed risks**

- LLM-generated tests may encode the implementation’s actual behavior instead of the expected behavior.
- Tests can mirror source logic and therefore bless the same bug.
- High coverage can hide weak assertions.
- Over-mocked tests miss integration failures.
- Passing tests are not enough; behavior must be independently verified.

**Audit signals**

- Tests copy production logic.
- Snapshot tests without behavioral assertions.
- Tests with no assertions or only static equality checks.
- Excessive mocks around DB/auth/storage/payment/email boundaries.
- No negative tests for authorization or invalid input.
- No manual user-flow verification.

**Useful grep checks**

```bash
rg -n "mock|jest\\.mock|vi\\.mock|mock\\.patch|snapshot|toMatchSnapshot"
rg -n "expect\\("
```

**Audit rule**

Do not trust tests as proof. Treat tests as one signal, then verify core behavior independently through runtime, integration, RLS, and manual checks.

---

### D. Maintainability Drift — High Confidence With Nuance

The report validates maintainability drift as a real risk, especially duplication and repetitive structure, but warns against claiming AI always makes code less maintainable.

**Evidence-backed risks**

- More duplicated or copy-pasted code.
- More repetitive structures.
- Higher review burden.
- More issues in AI-assisted pull requests in some studies.
- Less refactoring-associated change over time in some repository-scale studies.

**Important counterevidence**

- Some controlled studies found AI-assisted developers produced code rated slightly more readable, reliable, maintainable, and concise in bounded endpoint-building tasks.
- Therefore, audit should be risk-weighted, not biased toward automatic rejection.

**Audit signals**

- Duplicate logic across modules.
- Inconsistent naming and style.
- “God files” or oversized modules.
- Fake abstractions that add layers without real separation.
- Dead or unused code.
- Mixed paradigms without architectural reason.
- Business rules scattered across UI, server actions, DB policies, and tests.

**Useful checks**

```bash
rg -n "TODO|FIXME|WIP|placeholder|temporary|hack"
find . -type f | wc -l
wc -l src/**/*.ts src/**/*.tsx
```

---

### E. Non-Functional Production Readiness — Medium-High Confidence

The full report says this category is directionally correct but too broad if treated as uniformly proven. Security is strongly evidenced; reliability/operability items are high-value heuristics unless directly verified.

**Audit signals**

- No retries or timeouts for external calls.
- No transaction boundaries for multi-step DB writes.
- No idempotency for actions that may be retried.
- No useful server-side logging.
- No visible failure signal: no audit log, test assertion, or operational log.
- Resource leaks such as unclosed files/connections.
- Missing loading, empty, and error states.

**Heuristic checks**

```bash
rg -n "retry|timeout|AbortController|transaction|rollback|idempot"
rg -n "insertAuditLog|audit_logs|logger|console\\."
```

---

### F. Data Integrity Risk — High Value Audit Area

The report supports checking data integrity as part of production readiness, especially where AI-generated code may trust client state too much.

**Audit signals**

- Missing foreign keys, unique constraints, check constraints, or date-order constraints.
- Sensitive state duplicated in multiple places without a clear owner.
- Client-submitted role, owner, price, salary, status, or approval fields trusted directly.
- JSON blobs used where relational constraints are needed.
- No audit trail for sensitive changes.
- Deletes that cascade unexpectedly across business-critical records.

**Audit rule**

Identify the single source of truth for every important state field. If two places own the same truth, consolidate or document the derivation.

---

## 2. Claim Confidence Matrix

| Claim | Audit Use | Confidence |
|---|---|---|
| AI code can pass tests while still being wrong | Treat tests as insufficient; require independent behavioral checks | High |
| AI-generated code often has security weaknesses | Prioritize auth, validation, secrets, unsafe defaults, prompt injection | High |
| AI can hallucinate or misuse packages | Audit dependencies and imports carefully | High |
| AI code can increase duplication/repetition | Scan for repeated logic and weak abstractions | High |
| AI omits all non-functional concerns systematically | Keep checklist, but mark some items heuristic | Medium-high |
| AI causes poor incident triage because no one owns the mental model | Useful review heuristic, not settled empirical fact | Medium |
| AI is always worse for maintainability | Do not assume; review evidence in the codebase | Low as a blanket claim |

---

## 3. AI-Specific vs Generic vs Platform Risks

The report explicitly recommends separating these categories to avoid false positives.

### AI-Specific Smells

- Hallucinated package names.
- Code that looks plausible but has no tested runtime path.
- Tests generated from implementation rather than requirements.
- Hardcoded values replacing real logic.
- Incomplete generated features left in place.
- Prompt-injection exposure in LLM/agent workflows.

### Generic Software Smells Amplified By AI

- Missing authz.
- Weak validation.
- Duplicate code.
- Inconsistent structure.
- Missing constraints.
- Over-mocking.
- No observability.
- Happy-path-only implementations.

### Platform Or Autonomy-Control Failures

- Agent can delete or mutate production data without approval.
- Tool execution combines private data, untrusted input, and external communication.
- No rollback or restore process.
- No environment separation.
- App-builder platform abstracts away auth/storage defaults unsafely.

---

## 4. Cross-Cutting Failure Patterns

When one issue is found, scan globally. The report emphasizes that AI-generated issues often cluster.

**Red flags**

- Silent failures.
- Happy-path-only workflows.
- Generated but unused features.
- Fake abstractions.
- Incomplete implementation hidden behind polished UI.
- Strong-looking tests with weak behavioral proof.
- Raw model/user output passed into tools or queries.
- Missing owner for critical state.

---

## 5. Audit Execution Strategy

1. Build a dependency and entry-point map.
2. Identify all public boundaries: routes, Server Actions, APIs, jobs, webhooks, storage access, auth callbacks.
3. Identify sensitive data and state owners.
4. Run checks per category: security, supply chain, verification, maintainability, reliability, data integrity.
5. For every sensitive action, verify:
   - auth/session check,
   - role/scope check,
   - input validation,
   - DB/RLS enforcement,
   - audit/log feedback,
   - negative test or manual check.
6. When one defect is found, scan the same pattern globally.
7. Do not rely only on existing tests; verify behavior independently.
8. Separate findings into:
   - AI-specific smell,
   - generic software smell amplified by AI,
   - platform/autonomy-control failure.

---

## 6. Output Requirements For Auditor

### Findings Table

| Section | Issue | Severity | Evidence | Risk Type | Fix |
|---|---|---|---|---|---|

### Top Risks

Rank by:

```text
risk = likelihood x impact
```

### Confidence Label

Every major finding should be labeled:

- **Evidence-backed** — directly supported by code/test/runtime evidence.
- **Heuristic** — plausible risk pattern that needs confirmation.
- **External watch item** — dependency/platform issue outside immediate code control.

### Final Decision

- **GO** — acceptable for production/UAT.
- **GO WITH CONDITIONS** — safe only after listed mitigations.
- **NO-GO** — requires remediation before production.

---

## 7. Severity Guidance

- **Critical** — exploitable vulnerability, data loss, auth bypass, irreversible destructive action, secret exposure.
- **High** — likely production bug, sensitive data exposure, broken workflow, missing authorization, unsafe dependency.
- **Medium** — maintainability, reliability, weak verification, scaling, or operational weakness.
- **Low** — style, minor inconsistency, small inefficiency, low-risk cleanup.

---

## 8. Minimal Fast-Pass Checklist

Use when time-constrained:

- [ ] Secrets or service keys in repo/client code.
- [ ] Missing auth/session checks on public entry points.
- [ ] Missing role/scope checks on sensitive actions.
- [ ] Unknown, hallucinated, or unused dependencies.
- [ ] Missing lockfile or unsafe forced audit fix.
- [ ] Tests overly mocked or mirroring implementation.
- [ ] No negative tests for authz and invalid input.
- [ ] Duplicate code or large unstructured files.
- [ ] Hardcoded values replacing business logic.
- [ ] Silent error handling or swallowed failures.
- [ ] No audit/log feedback for sensitive operations.
- [ ] Missing DB constraints/RLS/storage policies.
- [ ] No manual review of critical user flows.
- [ ] No rollback/restore plan for destructive operations.

---

## 9. Interpretation Notes

- Passing tests do not prove correctness.
- Absence of evidence is a failure signal for security-critical behavior.
- Audit systemic flaws before polishing individual bugs.
- Be careful with blanket claims: AI can improve bounded tasks but still increase long-horizon production risk.
- Treat sociotechnical ownership concerns as important heuristics unless directly evidenced.
- Public AI-app incidents prove the risk is real, but do not prove prevalence.
- The safest audit posture is independent verification, not suspicion for its own sake.

---

## 10. Recommended Audit Lens For KushHR

Given KushHR’s domain, prioritize:

1. Auth/RBAC and manager/employee scope boundaries.
2. Supabase RLS and Storage policies.
3. Service-role key containment.
4. Audit logs for sensitive mutations and access denials.
5. Payroll, documents, identity, and appraisal data privacy.
6. Seed/auth behavior matching production GoTrue behavior.
7. Runtime tests that prove behavior, not just UI rendering.
8. Manual Admin/Manager/Employee scenario review.
9. Dependency audit and external PostCSS/Next.js advisory tracking.
10. Documentation that preserves the human mental model of the system.

---

## Conclusion

This summary should be used as an audit source file, not as a general opinion piece about AI coding.

The production-safety standard is:

> AI-assisted code is acceptable only when humans can explain it, independently verify it, operate it, and safely recover from failures.
