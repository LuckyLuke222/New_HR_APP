import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_DENIED_DIGEST } from "@/lib/supabase/access-denied-digest";
import { insertAuditLog } from "@/server/audit";
import type { UserRole } from "@/server/authz/roles";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
};

// Thrown by `requireRole` on role mismatch. Next.js preserves a pre-set
// `digest` on a thrown error (see node_modules/next/dist/server/app-render/
// create-error-handler.js — `if (err.digest)` branch), so the (app) error
// boundary can detect this in both dev and production.
export class AccessDeniedError extends Error {
  digest = ACCESS_DENIED_DIGEST;
  constructor() {
    super("Access denied");
    this.name = "AccessDeniedError";
  }
}

/**
 * Returns the authenticated user with their role read from the profiles table.
 * Role comes from DB — not exclusively from JWT — so it is always current.
 * Returns null if unauthenticated or if no profiles row exists yet.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile.role as UserRole,
    displayName: profile.display_name as string | null,
  };
}

/**
 * Requires the session user to have one of the allowed roles.
 * Redirects to /login if unauthenticated. On role mismatch the audit row is
 * written and an `AccessDeniedError` is thrown — the (app) error boundary
 * (src/app/(app)/error.tsx) detects it by digest and renders the access-
 * denied UI in place. Throwing (no HTTP redirect) is what makes the response
 * browser-uniform — Chrome and Firefox both see the same body at the same URL.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  opts?: { attemptedResource?: string },
): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!allowedRoles.includes(user.role)) {
    const attemptedResource = opts?.attemptedResource ?? "unknown";

    await insertAuditLog({
      actorId: user.id,
      action: "auth.access_denied",
      entity: "route",
      metadata: {
        attempted_resource: attemptedResource,
        allowed_roles: allowedRoles,
        role: user.role,
      },
    });

    throw new AccessDeniedError();
  }

  return user;
}
