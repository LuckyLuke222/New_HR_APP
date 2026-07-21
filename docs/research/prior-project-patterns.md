# Prior Project Patterns

Date: 2026-04-27

Projects inspected under `~/Documents/`: `BlockchainIntelligence`, `Moove`, `Risk Analytics Module`.

No secrets, credentials, private keys, `.env` contents, or proprietary implementation code were copied.

## Process Patterns

- Append-only handover entries with completed work, partial work, next steps, blockers, changed files, and key learnings.
- Current-phase document that makes completion state visible at all times.
- Separate check artifacts for QA, review, security, UI/UX, and research.
- Explicit project conventions for stack, boundaries, and commands.
- Migration-first database evolution.
- QA evidence that includes commands, manual checks, edge cases, and residual risk.
- Do not mark a phase complete without QA notes.

## Security Lessons

- Keep credentials in `.env`; commit only `.env.example`.
- Never log secrets or sensitive values.
- Use bounded database access and least privilege.
- Review permission boundaries explicitly in every phase.
- Mock external APIs in automated tests; document live/manual validation separately.

## UI Conventions

- Use compact operational dashboards, not marketing pages.
- Make allowed and blocked states clear.
- Expose state transitions visibly.
- Keep navigation stable and predictable.
- Add responsive navigation at scaffold time.

## Database Design Patterns

- Use UUID primary keys.
- Add `created_at` and audit fields deliberately.
- Use JSONB only for flexible event payloads, not as a replacement for core relational fields.
- Add natural uniqueness constraints where sync or repeated ingestion can occur.

## Mistakes Observed

- Do not let handover or current-phase files fall behind actual work.
- Do not rely on UI hiding as authorization.
- Do not introduce real HR/payroll data before auth, roles, RLS, and negative tests exist.
- Do not blindly run forced audit fixes when they propose major framework downgrades.
- Do not keep generated default README content after project-specific scaffold work.
- Track known flakiness or environment requirements explicitly rather than ignoring them.
