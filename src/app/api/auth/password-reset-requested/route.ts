import "server-only";
import { rateLimit } from "@/lib/rate-limit";
import { insertAuditLog } from "@/server/audit";

// This route writes into the admin-visible audit log on an unauthenticated
// path, so it is gated twice before the service-role insert:
//   1. Same-origin — the only legitimate caller is a same-origin fetch from the
//      forgot-password form, which always sends a matching `origin` header. A
//      direct curl loop typically sends none.
//   2. Per-IP rate limit — caps audit-log flooding even from a spoofed origin.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    console.warn("password_reset_requested: rejected cross-origin request");
    return Response.json({ ok: false }, { status: 403 });
  }

  const ip = clientIp(request);
  if (!rateLimit(`password-reset-requested:${ip}`, { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS })) {
    console.warn(`password_reset_requested: rate-limited ip=${ip}`);
    return Response.json({ ok: false }, { status: 429 });
  }

  let email = "";

  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return Response.json({ ok: false }, { status: 400 });
  }

  await insertAuditLog({
    actorId: null,
    action: "auth.password_reset_requested",
    entity: "auth",
    metadata: { email_domain: email.split("@")[1] ?? null },
  });

  return Response.json({ ok: true });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function clientIp(request: Request): string {
  // Caddy sets X-Forwarded-For; take the first hop. Fallback keeps a single
  // shared bucket when no header is present (still caps total flood rate).
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
