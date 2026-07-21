"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Drop the entire client Router Cache (chrome + page segments) so the
  // next request can't show stale authenticated UI from before sign-out.
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function authRedirectUrl(path: string) {
  // Prefer a configured origin so reset/invite links are never built from
  // request headers (host-header-poisoning defence-in-depth; GoTrue's redirect
  // allowlist is the upstream mitigation). Fall back to headers when APP_URL is
  // unset so local dev keeps working without extra config.
  const configuredOrigin = getServerEnv().APP_URL;
  if (configuredOrigin) {
    return new URL(path, configuredOrigin).toString();
  }

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host") ?? "localhost:3100"}`;
  return new URL(path, origin).toString();
}
