# KushHR — Demo Script

Presenter walkthrough of the main HR features. Keep it simple: show the role, do the action, point out the visible result.

**Dev server:** http://127.0.0.1:3100 (run `npm run dev`).

## Demo accounts

All passwords: `TestPass123!`

| Role | Email | Sees in sidebar |
|---|---|---|
| Admin | `admin@kushhr.dev` | Everything (incl. Departments, Reports, Audit Logs, Settings) |
| Manager | `manager@kushhr.dev` | Dashboard, People, Leave, Documents, Onboarding, Performance, Payroll |
| Employee (Alice) | `alice@kushhr.dev` | Dashboard, People, Leave, Documents, Onboarding, Performance, Payroll |

> Tip: open two browsers (or one normal + one incognito) so you can switch between Admin/Manager and the Employee without logging out each time.

## Suggested order (≈20 min)

1. **Dashboard** (orientation) — 1 min
2. **People Directory** — 2 min
3. **Leave request flow** (employee → manager) — 4 min — *the headline cross-role demo*
4. **Performance review flow** (admin → manager → employee) — 5 min
5. **Onboarding flow** (admin creates a hire) — 4 min
6. **Documents** — 1 min
7. **Reporting module** (admin) — 2 min
8. **Audit Logs** (admin) — 1 min
9. **Settings** (admin) — 1 min

---

## 1. Dashboard

**Role:** any. Sign in → lands on `/dashboard`.

- Point out the **role-aware sidebar** — Alice (employee) does not see Departments / Reports / Audit Logs / Settings; the admin does. Same app, different surface per role.
- **Leave balance cards** (Local 22 / Sick 15 for the year).
- **Action items** panel — pending things that need *this* user (approvals, onboarding tasks, appraisal acknowledgements).
- **Recent updates** — the cross-role feedback feed (a request you submit shows here; an approval your manager makes shows here too).

---

## 2. People Directory

**Role:** any (`/employees`, labelled **People**).

- Searchable directory of everyone — name, job title, department, manager.
- Open one profile (`/employees/[id]`) → show the tabs: employment details, leave, documents.
- Note: visibility is scoped by role (an employee sees the directory; an admin can edit records and create new ones).

---

## 3. Leave request flow  ⭐ headline demo

Shows submission → approval → balance decrement → both dashboards updating. Two roles.

**Employee (Alice):**
1. Sidebar → **Leave** → **Request leave**.
2. Pick **Local Leave**, choose two consecutive weekdays, add a note. Submit.
   - Form preview reads **"2 working days requested"**. Success toast. Redirects to `/leave`.
   - New row shows **Pending**.
3. Open **Dashboard** → the request appears under **Recent updates**.

**Manager (Morgan):**
4. Sign in as manager. Dashboard **Action items** shows the pending request → click it (or open `/leave?status=pending`).
5. The pending row shows Alice's name, leave type, dates, and an **inline balance context** ("X days available; 2 working days requested").
6. **Approve**, add an approver note.
   - Status → **Approved**. Row leaves the pending queue.

**Back to Alice:**
7. Refresh Dashboard → approved request shows in **Recent updates** with the approver note. Balance reflects the deduction.

> Optional add-on: show the **urgent** path — flagging urgent with a blank reason is rejected server-side (reason required).

---

## 4. Performance review flow

One appraisal cycle across three roles. This is the most feature-rich flow — keep narration tight.

**Admin:**
1. `/performance` → **Cycles** tab → **Create review cycle** (title, Draft, date range). Submit → cycle appears as **Draft**.
2. **Edit** the cycle → set status **Active** → Save.

**Manager:**
3. `/performance` → **Goals** → **Set or update goal** → pick Alice, the cycle, a title. Submit → goal appears under **Goals in scope**.
   - *Scope guard demo:* try setting a goal for someone who isn't a direct report → rejected with "You can only manage goals for employees in your scope."

**Employee (Alice):**
4. `/performance` → **Reviews** → submit a **self-review** for the cycle. Status → `self_reviewed`.

**Manager:**
5. `/performance` → **Appraisals** → open the **Appraisal workspace** → select the cycle + Alice.
   - Left: Alice's self-review + her goal. Right: score / strengths / improvements / next steps.
6. **Save draft** first → point out Alice **cannot** see the score yet (drafts are private).
7. **Submit** the appraisal (score + all fields).

**Back to Alice:**
8. Dashboard → cycle shows in **Recent updates** ("manager appraisal submitted"); Action items shows **Acknowledge appraisal**.

---

## 5. Onboarding flow

**Role:** Admin (creates a new hire end-to-end).

1. `/employees/new` → fill name, work email, role **Employee**, job title, start date, **Engineering** department.
   - Manager field **auto-prefills** to the Engineering manager.
2. Submit → "Employee created. Generate a password reset link before first login." New person appears in **People**.
3. Open the new profile → **Generate password reset link** → copy the link (first-login flow; no password is emailed in the demo env).
4. `/onboarding/admin` → if needed, create a template with two tasks → use **Assign tasks → From template** → pick the new hire + template. Submit.
5. New hire's profile → **Leave** tab → balances (Local 22 / Sick 15) were **auto-seeded** on creation.
6. *(optional)* Open the reset link in a second browser, set a password, sign in → new hire lands on their dashboard with the onboarding **Action items** listed.

> Punchline: one admin action provisions the account, leave balances, manager link, and onboarding checklist — all visible to the new hire on first login.

---

## 6. Documents

**Role:** any (`/documents`).

- Upload / view employee documents (contracts, IDs, etc.).
- Access is scoped — an employee sees their own documents; an admin manages across the org.
- Show one upload and the resulting entry; mention storage is access-controlled (RLS), not a public bucket.

---

## 7. Reporting module

**Role:** Admin only (`/reports`).

1. Pick a report (e.g. **Headcount**) → set filters (date / grain / status) → **Generate**.
2. Show the **table** + the **themed bar chart** rendered above it (Headcount and Leave usage have charts).
3. Click **Export CSV** → a download is produced. Mention it's admin-gated and the export is audit-logged (`report.exported`).

---

## 8. Audit Logs

**Role:** Admin only (`/audit-logs`).

- Every meaningful action writes an immutable audit row — leave submitted/approved, employee created, report exported, access denied.
- Filter by event / actor and point out a couple of rows generated **earlier in this demo** (e.g. `leave.requested`, `performance.manager_review_submitted`, `report.exported`).

> Punchline: nothing happens off the record — this is the platform's accountability spine.

---

## 9. Settings

**Role:** Admin only (`/settings`).

- Org-level **leave policy defaults** (Local Leave 22 / Sick Leave 15) — these are what new hires get auto-seeded with.
- Show that changing a default here is the single source of truth for downstream provisioning.

---

## Closing points

- **One codebase, role-shaped experience** — admin / manager / employee each see a different, scoped app.
- **Cross-role feedback loops** — an action by one user surfaces on the right people's dashboards.
- **Accountability built in** — RBAC guards + immutable audit log on every sensitive action.
