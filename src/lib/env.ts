import "server-only";

import { publicEnvSchema } from "@/lib/env.public";
import { z } from "zod";

// Server env — extends the public schema with secret-bearing values
// (SUPABASE_SERVICE_ROLE_KEY) and server-derived config (APP_URL). The
// `import "server-only"` above makes importing this module from a Client
// Component a build-time error, so the service-role key (and APP_URL) can never
// reach the browser bundle. Public-only readers use `@/lib/env.public` instead.
const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Public base URL of the app, used to build password-reset/invite links from a
  // configured origin instead of request headers (host-header-poisoning defence).
  // Optional: when unset, link construction falls back to request headers.
  APP_URL: z.string().url().optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Coerce ""/whitespace → undefined: compose interpolates an unset `${APP_URL}`
    // to an empty string, which `.url()` would reject. Empty/blank means "not
    // configured" → fall back to request headers.
    APP_URL: process.env.APP_URL?.trim() || undefined,
  });
}
