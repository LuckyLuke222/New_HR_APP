// Stable digest used by `requireRole` (server) and the (app) error boundary
// (client). Kept in its own file so the client `error.tsx` can import without
// pulling in the server-only `helpers.ts`.
export const ACCESS_DENIED_DIGEST = "KUSHHR_ACCESS_DENIED";
