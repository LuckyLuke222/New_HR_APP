# Scaffold Research

Date: 2026-04-27

## Scaffold Decisions

- Next.js App Router with TypeScript, Tailwind CSS, ESLint, and `src/`.
- Route groups: `src/app/(auth)` and `src/app/(app)`.
- Shared code outside route trees: `src/components`, `src/lib`, `src/server`, `src/types`.
- Private route-local folders (`_components`) for colocated UI that should not become a route.
- npm (universally available, works with official Next.js/shadcn/Supabase tooling).
- `@supabase/ssr` + `@supabase/supabase-js` for SSR-safe auth.
- Zod, React Hook Form, and `@hookform/resolvers` added at scaffold time.
- Playwright added at scaffold time so permission-flow tests have a home from phase 1.
- Supabase client utilities: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`.
- Next 16 `src/proxy.ts` for request-time session refresh (middleware naming is deprecated in current Next docs).
- Central server-side auth/authorization layer: `src/server/authz/`.
- All migrations under `supabase/migrations/`; every table enables RLS in the same migration.
- Service-role key isolated in server-only modules — never imported by client code.
- Sensitive HR/payroll fields split into narrow tables with stricter RLS policies.

## Supabase Auth SSR

- Cookie-based auth required for SSR.
- Use `supabase.auth.getUser()` server-side for protected reads/actions — do not trust cookie contents alone.
- Use database-backed role/membership state for sensitive decisions.
- Validate server-side users inside every Server Action and Route Handler.

## Supabase RLS

- Enable RLS on every table in exposed schemas.
- Use explicit `to authenticated` policies with `auth.uid() is not null`.
- Add indexes on all columns used by RLS policies.
- Mirror `profiles.role` to JWT `app_metadata` via trigger for policy performance.
- See `docs/rls-policy-map.md` for the full policy map.

## Supabase Storage

- Private buckets for all employee documents, contracts, tax forms, IDs, payslips.
- `storage.objects` RLS mirrors the `documents` metadata table policy.
- Signed URLs for temporary downloads — generated server-side only.
- No public buckets for sensitive HR/payroll documents.

## Server Actions And Route Handlers

- Treat as public API endpoints.
- Each handler: authenticate → authorize from DB → validate with Zod → mutate → return safe typed error.
- Use a Data Access Layer for sensitive reads; pass minimal DTOs to Client Components.
- Do not pass raw sensitive rows into Client Components.

## Prior-Project Lessons Applied

From `BlockchainIntelligence`: append-only handover entries, explicit current-phase tracking, QA reports before phase close, migrations over embedded schema, idempotency and edge-case checks.

From `Moove`: primary docs before major decisions, QA notes for happy paths and blocked paths, explicit permission boundary review.

From `Risk Analytics Module`: security rules visible and concrete, commit `.env.example` not `.env`, validate all inputs before DB access, explicit error boundaries.

## Testing

- Run lint, build/type checks, and E2E tests after each phase.
- Keep QA reports as artifacts, not only terminal output.
- Cover both happy paths and blocked paths.
- Use Playwright role/text/label locators instead of brittle selectors.
- Store Playwright auth state under `playwright/.auth` (gitignored).

## References

- Next.js create-next-app: https://nextjs.org/docs/app/api-reference/cli/create-next-app
- Next.js data security: https://nextjs.org/docs/app/guides/data-security
- Next.js authentication: https://nextjs.org/docs/app/guides/authentication
- Next.js project structure: https://nextjs.org/docs/app/getting-started/project-structure
- shadcn/ui Next.js install: https://ui.shadcn.com/docs/installation/next
- Supabase SSR with Next.js: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase SSR advanced: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase secure data: https://supabase.com/docs/guides/database/secure-data
- Supabase Storage: https://supabase.com/docs/guides/storage/buckets/fundamentals
- OWASP Top 10 2025: https://owasp.org/Top10/2025/
