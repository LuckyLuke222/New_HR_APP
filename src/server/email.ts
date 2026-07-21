import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getOptionalEmailEnv } from "@/lib/email-env";
import { insertAuditLog } from "@/server/audit";
import type { EmailTemplate } from "@/server/email-templates";

// ─────────────────────────────────────────────────────────────────────────────
// App-notification boundary. Inline, fire-and-forget, best-effort. Every public
// function here returns void/null and NEVER throws — a Resend hiccup or missing
// config must not fail the originating Server Action. Outcomes are visible to
// admins via audit_logs (email.sent / email.failed / email.skipped) and to ops
// via console.error. No retry, no queue (15–20-user scale).
// ─────────────────────────────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type Recipient = { email: string; name: string | null };

// De-dupe by lowercased email; drop blanks. Preserves first-seen name.
function dedupe(recipients: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  for (const r of recipients) {
    const key = r.email?.trim().toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

// ─── recipient resolvers (server-trusted, bypass RLS) ──────────────────────────

export async function getRecipient(profileId: string): Promise<Recipient | null> {
  if (!profileId) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("work_email, display_name")
      .eq("id", profileId)
      .maybeSingle();
    if (!data?.work_email) return null;
    return { email: data.work_email, name: data.display_name ?? null };
  } catch (err) {
    console.error("email.getRecipient failed", err);
    return null;
  }
}

export async function getAdminRecipients(): Promise<Recipient[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("work_email, display_name")
      .eq("role", "admin")
      .not("work_email", "is", null);
    return (data ?? [])
      .filter((r) => r.work_email)
      .map((r) => ({ email: r.work_email as string, name: r.display_name ?? null }));
  } catch (err) {
    console.error("email.getAdminRecipients failed", err);
    return [];
  }
}

export async function getManagerRecipientForEmployee(
  employeeId: string,
): Promise<Recipient | null> {
  if (!employeeId) return null;
  try {
    const supabase = createAdminClient();
    const { data: record } = await supabase
      .from("employee_records")
      .select("manager_id")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (!record?.manager_id) return null;
    return getRecipient(record.manager_id as string);
  } catch (err) {
    console.error("email.getManagerRecipientForEmployee failed", err);
    return null;
  }
}

// ─── send ───────────────────────────────────────────────────────────────────

export async function sendEmail(args: {
  to: Recipient[];
  subject: string;
  html: string;
  text: string;
  template: EmailTemplate;
  entityId?: string | null;
  actorId?: string | null;
}): Promise<void> {
  const { template, entityId = null, actorId = null } = args;
  const recipients = dedupe(args.to);

  try {
    if (recipients.length === 0) {
      await insertAuditLog({
        actorId,
        action: "email.skipped",
        entity: "email",
        entityId,
        metadata: { template, reason: "no_recipients" },
      });
      return;
    }

    const env = getOptionalEmailEnv();
    if (!env) {
      await insertAuditLog({
        actorId,
        action: "email.skipped",
        entity: "email",
        entityId,
        metadata: { template, reason: "email_not_configured", to: recipients.map((r) => r.email) },
      });
      return;
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${env.fromName} <${env.fromAddress}>`,
        // Bare email addresses — NOT "Name <email>". Resend's sandbox owner-check
        // does a raw string match, so a display name on the recipient makes even
        // the account-owner address fail with 403. Bare addresses work in both
        // sandbox and with a verified domain; the recipient display name is cosmetic.
        to: recipients.map((r) => r.email),
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("email.send non-2xx", template, response.status, detail);
      await insertAuditLog({
        actorId,
        action: "email.failed",
        entity: "email",
        entityId,
        metadata: {
          template,
          to: recipients.map((r) => r.email),
          reason: `http_${response.status}`,
        },
      });
      return;
    }

    await insertAuditLog({
      actorId,
      action: "email.sent",
      entity: "email",
      entityId,
      metadata: { template, to: recipients.map((r) => r.email), subject: args.subject },
    });
  } catch (err) {
    console.error("email.send threw", template, err);
    // Best-effort failure record; swallow any secondary error so we never throw.
    await insertAuditLog({
      actorId,
      action: "email.failed",
      entity: "email",
      entityId,
      metadata: {
        template,
        to: recipients.map((r) => r.email),
        reason: "exception",
      },
    }).catch(() => {});
  }
}
