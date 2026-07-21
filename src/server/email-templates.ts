import "server-only";

// Plain-TS transactional email templates for the app-notification boundary.
// No MJML / React Email — volume doesn't justify it. Each builder takes
// already-resolved primitives (names, dates, status) and returns the three
// parts sendEmail needs. Templates do NOT touch the database.

export type EmailContent = { subject: string; html: string; text: string };

// Stable identifiers logged in audit metadata (email.sent / email.failed).
// `*_confirmation` variants go to the actor who performed the action; the bare
// variants go to the other party (approver / assignee / counterparty).
export type EmailTemplate =
  | "leave_submitted"
  | "leave_submitted_confirmation"
  | "leave_approved"
  | "leave_approved_confirmation"
  | "leave_rejected"
  | "leave_rejected_confirmation"
  | "onboarding_tasks_assigned"
  | "onboarding_tasks_assigned_confirmation"
  | "onboarding_task_assigned"
  | "onboarding_task_assigned_confirmation"
  | "performance_review_submitted"
  | "performance_review_submitted_confirmation"
  | "performance_review_acknowledged"
  | "performance_review_acknowledged_confirmation";

// ─── helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// YYYY-MM-DD → "12 Jun 2026". Leaves anything unparseable untouched.
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dateRange(start: string, end: string, isHalfDay: boolean): string {
  if (start === end) {
    return isHalfDay ? `${formatDate(start)} (half day)` : formatDate(start);
  }
  return `${formatDate(start)} → ${formatDate(end)}`;
}

// One shared minimal layout. `paragraphs` are plain strings (already escaped by
// the builder where they include user input); they become <p> in html and
// newline-separated lines in text.
function layout(heading: string, paragraphs: string[]): { html: string; text: string } {
  const body = paragraphs.map((p) => `      <p style="margin:0 0 16px;line-height:1.5;">${p}</p>`).join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 24px;font-size:18px;">${escapeHtml(heading)}</h1>
${body}
      <p style="margin:24px 0 0;font-size:12px;color:#71717a;">Sign in to KushHR to view the details. This is an automated message — please don't reply.</p>
    </div>
  </body>
</html>`;
  const text = `${heading}\n\n${paragraphs
    .map((p) => p.replace(/<[^>]+>/g, ""))
    .join("\n\n")}\n\nSign in to KushHR to view the details. This is an automated message — please don't reply.`;
  return { html, text };
}

function content(subject: string, heading: string, paragraphs: string[]): EmailContent {
  const { html, text } = layout(heading, paragraphs);
  return { subject, html, text };
}

// ─── builders ───────────────────────────────────────────────────────────────

export function leaveSubmittedEmail(args: {
  requesterName: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  workingDays: number;
}): EmailContent {
  const who = escapeHtml(args.requesterName);
  const range = escapeHtml(dateRange(args.startDate, args.endDate, args.isHalfDay));
  return content(
    `Leave request from ${args.requesterName}`,
    "New leave request awaiting your decision",
    [
      `<strong>${who}</strong> submitted a leave request.`,
      `Dates: ${range} (${args.workingDays} working day${args.workingDays === 1 ? "" : "s"}).`,
      `Review it in the Leave section to approve or reject.`,
    ],
  );
}

export function leaveDecisionEmail(args: {
  approved: boolean;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  approverNote: string | null;
}): EmailContent {
  const verb = args.approved ? "approved" : "rejected";
  const range = escapeHtml(dateRange(args.startDate, args.endDate, args.isHalfDay));
  const paragraphs = [
    `Your leave request for <strong>${range}</strong> was <strong>${verb}</strong>.`,
  ];
  if (args.approverNote) {
    paragraphs.push(`Note from the approver: ${escapeHtml(args.approverNote)}`);
  }
  return content(
    `Your leave request was ${verb}`,
    `Leave request ${verb}`,
    paragraphs,
  );
}

export function onboardingTasksAssignedEmail(args: {
  taskCount: number;
  dueDate: string | null;
}): EmailContent {
  const n = args.taskCount;
  const paragraphs = [
    `You have ${n} new onboarding task${n === 1 ? "" : "s"} assigned to you.`,
  ];
  if (args.dueDate) paragraphs.push(`Due: ${escapeHtml(formatDate(args.dueDate))}.`);
  paragraphs.push("Open the Onboarding section to get started.");
  return content("New onboarding tasks assigned", "New onboarding tasks", paragraphs);
}

export function onboardingTaskAssignedEmail(args: {
  title: string;
  dueDate: string | null;
}): EmailContent {
  const paragraphs = [
    `A new onboarding task was assigned to you: <strong>${escapeHtml(args.title)}</strong>.`,
  ];
  if (args.dueDate) paragraphs.push(`Due: ${escapeHtml(formatDate(args.dueDate))}.`);
  paragraphs.push("Open the Onboarding section to view it.");
  return content("New onboarding task assigned", "New onboarding task", paragraphs);
}

export function performanceReviewSubmittedEmail(): EmailContent {
  return content(
    "Your performance review is ready",
    "Performance review submitted",
    [
      "Your manager has submitted your performance review.",
      "Open the Performance section to read it and acknowledge.",
    ],
  );
}

export function performanceReviewAcknowledgedEmail(args: {
  employeeName: string;
}): EmailContent {
  const who = escapeHtml(args.employeeName);
  return content(
    `${args.employeeName} acknowledged their review`,
    "Performance review acknowledged",
    [
      `<strong>${who}</strong> has acknowledged the performance review you submitted.`,
      "No further action is needed.",
    ],
  );
}

// ─── actor confirmation builders ────────────────────────────────────────────
// Sent to the person who performed the action, in addition to the other-party
// email above. Worded from the actor's point of view.

export function leaveSubmittedConfirmationEmail(args: {
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  workingDays: number;
}): EmailContent {
  const range = escapeHtml(dateRange(args.startDate, args.endDate, args.isHalfDay));
  return content(
    "Your leave request was submitted",
    "Leave request submitted",
    [
      `Your leave request for <strong>${range}</strong> (${args.workingDays} working day${args.workingDays === 1 ? "" : "s"}) was submitted and is awaiting approval.`,
      "You'll get an email once it's approved or rejected.",
    ],
  );
}

export function leaveDecisionConfirmationEmail(args: {
  approved: boolean;
  requesterName: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
}): EmailContent {
  const verb = args.approved ? "approved" : "rejected";
  const who = escapeHtml(args.requesterName);
  const range = escapeHtml(dateRange(args.startDate, args.endDate, args.isHalfDay));
  return content(
    `You ${verb} ${args.requesterName}'s leave request`,
    `Leave request ${verb}`,
    [`You ${verb} the leave request from <strong>${who}</strong> for <strong>${range}</strong>.`],
  );
}

export function onboardingTasksAssignedConfirmationEmail(args: {
  taskCount: number;
  assigneeName: string;
}): EmailContent {
  const n = args.taskCount;
  const who = escapeHtml(args.assigneeName);
  return content(
    "You assigned onboarding tasks",
    "Onboarding tasks assigned",
    [`You assigned ${n} onboarding task${n === 1 ? "" : "s"} to <strong>${who}</strong>.`],
  );
}

export function onboardingTaskAssignedConfirmationEmail(args: {
  title: string;
  assigneeName: string;
}): EmailContent {
  return content(
    "You assigned an onboarding task",
    "Onboarding task assigned",
    [
      `You assigned the task <strong>${escapeHtml(args.title)}</strong> to <strong>${escapeHtml(args.assigneeName)}</strong>.`,
    ],
  );
}

export function performanceReviewSubmittedConfirmationEmail(args: {
  employeeName: string;
}): EmailContent {
  const who = escapeHtml(args.employeeName);
  return content(
    `You submitted ${args.employeeName}'s performance review`,
    "Performance review submitted",
    [
      `You submitted the performance review for <strong>${who}</strong>. They've been notified to read and acknowledge it.`,
    ],
  );
}

export function performanceReviewAcknowledgedConfirmationEmail(): EmailContent {
  return content(
    "You acknowledged your performance review",
    "Performance review acknowledged",
    ["You acknowledged your performance review. No further action is needed."],
  );
}
