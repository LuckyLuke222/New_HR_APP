import "server-only";

import { z } from "zod";

// App-originated transactional email config (Resend HTTP API). Distinct from the
// GoTrue SMTP block in infra/supabase/.env — that transport handles auth emails
// (password reset / invite); this one is for the app-notification boundary.
//
// Intentionally OPTIONAL: a missing/blank RESEND_API_KEY returns null rather than
// throwing, so email stays non-critical — it must never crash app boot or fail the
// `web` container's /login healthcheck. Mirrors getOptionalPublicEnv in env.public.ts.

const emailEnvSchema = z.object({
  apiKey: z.string().min(1),
  fromAddress: z.string().min(1).default("onboarding@resend.dev"),
  fromName: z.string().min(1).default("KushHR"),
});

export type EmailEnv = z.infer<typeof emailEnvSchema>;

export function getOptionalEmailEnv(): EmailEnv | null {
  const result = emailEnvSchema.safeParse({
    apiKey: process.env.RESEND_API_KEY,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || undefined,
    fromName: process.env.EMAIL_FROM_NAME || undefined,
  });

  return result.success ? result.data : null;
}
