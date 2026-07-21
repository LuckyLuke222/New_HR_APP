# IT access requests — Google Workspace + Slack integrations

Sendable request list for connecting KushHR (internal HR app) to Google Workspace and Slack. Three integrations; two decisions need IT input. Detailed architecture + code touchpoints live in `docs/pending-backlog.md` §4 "Integrations & notifications"; this file is the IT-facing version.

Last updated: 2026-06-11 (Session 168).

---

## (i) Notifications — Email + Slack

**What it does:** Automatically emails and Slack-messages staff when something happens in the HR app (e.g. a leave request is submitted, approved, or rejected; an onboarding task is assigned; a performance review is submitted).

**Needed from IT:**
- **Email sending** — either:
  - approval to send through **Google Workspace SMTP relay** (`smtp-relay.gmail.com`) — IT enables the relay and allowlists our server's IP (note: we won't have the server's fixed IP until the on-prem server is set up), **or**
  - approval to use a **third-party email service** (e.g. Resend / Amazon SES / Postmark) so we can build and test now.
- The **sender address** we may send from (e.g. `hr-noreply@<ourdomain>`).
- Whoever manages our **domain DNS** to add **SPF, DKIM, and DMARC** records (one-time) so our mail isn't flagged as spam.
- **Slack** — approval to install a **Slack app** in our workspace, plus either an **Incoming Webhook URL** for the target channel, or a **bot token** (`xoxb-…`, scope `chat:write`) and the **channel ID(s)** to post to.

## (ii) Authentication emails — Password reset + Invite

**What it does:** Sends the "reset your password" email and the "you've been invited / set your password" email when staff are added or need to sign in.

**Needed from IT:**
- **The same email setup as (i)** — these emails use the same mail sender, so no separate account is needed. (Technical note: this part can only use standard SMTP, not the Gmail API.)
- **Decision — Single Sign-On (SSO):** do you want staff to **"Sign in with Google"** instead of email + password? If yes, we'll need a **Google OAuth client ID + secret** and our app's sign-in URL allowlisted. If no, we'll skip it.

## (iii) Google Calendar sync — Leave

**What it does:** When a leave request is approved, it appears on Google Calendar (and is removed if the leave is cancelled), so everyone can see who's off.

**Needed from IT:**
- A **Google Cloud project** (IT creates one for us, or lets us create one under the organisation).
- The **Google Calendar API enabled**, and a **service account** with its **JSON key** file, shared with us securely.
- **Decision — which calendar:**
  - **Option A (simpler, recommended):** create one shared **"Team Leave" calendar** and give our service account **"Make changes to events"** access; send us the **calendar ID**. *(No special admin permissions needed.)*
  - **Option B:** leave shows on each employee's **own** calendar — this requires a **Workspace super-admin** to grant our service account **domain-wide delegation** for the Calendar scope.

---

## Summary of the ask

1. An email-sending method (Google relay or a third-party service) + sender address + DNS records (SPF/DKIM/DMARC).
2. A Slack app + webhook URL or bot token + channel.
3. A Google Cloud service account (JSON key) + Calendar API enabled + a shared "Team Leave" calendar ID (Option A) **or** domain-wide delegation (Option B).
4. Two decisions: **SSO yes/no**, and **calendar Option A or B**.

---

## Implementation notes (internal — not for IT)

- **Email is shared** across (i) and (ii): one SMTP sender serves both. GoTrue (auth emails) can only use plain SMTP, so the credential must be SMTP, not the Gmail API.
- **App Passwords are phased out** in our Workspace (confirmed 2026-06-11), so a personal-mailbox + app-password SMTP is not an option.
- **Build locally on a free ESP** (recommend **Resend** — free tier, sends from `onboarding@resend.dev` before we own DNS; or **Mailpit** as a local mail sink to prove the code path). Switching to Google Workspace relay later is a **config-only** swap (same `GOTRUE_SMTP_*` env block; relay auths by server IP, ESP by user/key) — re-do the per-provider SPF/DKIM DNS records on switch.
- **Slack + Calendar are environment-independent** (outbound HTTPS + a credential), so they work the same locally and on the server.
- At the on-prem move, update the public-URL env surface (`SITE_URL` / redirect URLs) so auth-email links point at the real FQDN.
