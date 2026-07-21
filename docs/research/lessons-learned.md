# Lessons Learned

Date: 2026-04-27

## Process

- Keep project memory in repo files, not only conversation context.
- Use a root project contract (`PROJECT_CONTEXT.md`) so stack, boundaries, and completion gates stay visible.
- Treat QA, review, UI/UX, research, and security checks as written artifacts, not only terminal output.
- Use explicit phase gates: research → plan → scaffold → review → QA → security → handover.
- Supabase RLS must be designed with the schema, not added later.
- Server Actions are public endpoints and need handler-local authz and validation.
- Keep `handover.md`, `current-phase.md`, and research notes current after every phase — falling behind creates ambiguity and lost context.

## Testing

- Run lint, build/type check, and E2E tests after each phase.
- Cover both happy paths and blocked access paths.
- Add permission-boundary tests before any real HR/payroll/document data is reachable.
- Use Playwright role/text/label locators instead of brittle selectors.
- Store Playwright auth state under `playwright/.auth` (gitignored).

## Deployment

- Commit `.env.example`; never commit `.env.local` or `.env`.
- Avoid build-time network requirements where possible.
- Document residual dependency audit risks explicitly — do not blindly apply forced fixes that propose major framework downgrades.

## Prior-Project Sources

See `docs/research/prior-project-patterns.md` for reusable patterns from sibling projects.
