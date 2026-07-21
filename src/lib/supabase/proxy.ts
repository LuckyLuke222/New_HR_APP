import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getOptionalPublicEnv } from "@/lib/env.public";

// Paths that do not require authentication.
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/access-denied",
  // Anonymous password-reset audit write — reachable pre-auth; protected by its
  // own same-origin + per-IP rate-limit gate in the route handler.
  "/api/auth/password-reset-requested",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getOptionalPublicEnv();

  // No env vars — allow through (dev bootstrap before .env.local is configured).
  if (!env) {
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user hitting a protected route → /login.
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting /login → honor ?next= when safe, else /dashboard.
  if (user && pathname === "/login") {
    const rawNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
        ? rawNext
        : "/dashboard";
    const target = request.nextUrl.clone();
    target.pathname = safeNext;
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}
