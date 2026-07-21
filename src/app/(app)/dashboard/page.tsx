import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getAdminDashboardData,
  getEmployeeDashboardData,
  getManagerDashboardData,
  type AdminDashboardData,
  type DashboardActionItem,
  type DashboardRecentUpdate,
  type EmployeeDashboardData,
  type ManagerDashboardData,
  type UnroutedPendingLeave,
} from "@/server/dal/dashboard";
import type { AuditLogRow } from "@/server/dal/audit-logs";
import type { DocumentRow } from "@/server/dal/documents";
import type { LeaveBalance } from "@/server/dal/leave";
import { WhoIsOutPanelBody } from "@/components/dashboard/who-is-out-panel";
import type { OnboardingTask } from "@/server/dal/onboarding";

export default async function DashboardPage() {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/dashboard",
  });

  const firstName = extractFirstName(user.displayName, user.email);

  if (user.role === "admin") {
    const data = await getAdminDashboardData();
    return <AdminDashboard data={data} firstName={firstName} />;
  }

  if (user.role === "manager") {
    const data = await getManagerDashboardData(user.id);
    return <ManagerDashboard data={data} firstName={firstName} />;
  }

  const data = await getEmployeeDashboardData(user.id);
  return <EmployeeDashboard data={data} firstName={firstName} />;
}

// Split on the first whitespace so single-name rows ("Olive") stay intact.
// Fall back to the local-part of the email when display_name is null.
function extractFirstName(displayName: string | null, email: string | null): string | null {
  const name = (displayName ?? "").trim();
  if (name) return name.split(/\s+/)[0];
  if (email) {
    const local = email.split("@")[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
  }
  return null;
}

function DashboardGreeting({ firstName }: { firstName: string | null }) {
  if (!firstName) return null;
  return (
    <h1
      data-testid="dashboard-greeting"
      className="text-2xl font-semibold tracking-normal text-foreground"
    >
      Hi {firstName} <span aria-hidden="true">👋</span>
    </h1>
  );
}

function AdminDashboard({ data, firstName }: { data: AdminDashboardData; firstName: string | null }) {
  const progressPercent =
    data.onboarding.total === 0
      ? 0
      : Math.round((data.onboarding.completed / data.onboarding.total) * 100);

  return (
    <DashboardShell
      title="Admin dashboard"
      description="Company-wide HR controls and operational oversight."
      errors={data.errors}
      firstName={firstName}
    >
      <MetricGrid>
        <MetricCard label="Headcount" value={data.headcount} note="People records" href="/employees" />
        <MetricCard label="Pending leave" value={data.pendingLeave} note="Awaiting decision" href="/leave?status=pending" />
        <MetricCard label="Onboarding progress" value={`${progressPercent}%`} note={`${data.onboarding.pending} open tasks`} href="/onboarding/admin" />
        <MetricCard label="Performance reviews" value={data.performance.submittedReviews} note={`${data.performance.openReviews} open`} href="/performance" />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Action items"
          action={
            data.actionItems.length > 0 ? (
              <Link
                className="text-sm font-medium text-primary hover:underline"
                href="/leave?status=pending"
              >
                Open queues
              </Link>
            ) : null
          }
        >
          <ActionItemList items={data.actionItems} />
        </Panel>

        <Panel title="Recent updates">
          <RecentUpdateList updates={data.recentUpdates} />
        </Panel>

        <Panel
          title="Unrouted pending leave"
          action={
            data.unroutedPendingLeave.length > 0 ? (
              <Link
                className="text-sm font-medium text-primary hover:underline"
                href="/employees?attention=1"
              >
                Assign managers
              </Link>
            ) : null
          }
        >
          <UnroutedPendingLeaveList requests={data.unroutedPendingLeave} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel title="Operational report">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard tone="subtle" label="Starters, last 30 days" value={data.startersLast30Days} href="/employees?recent=starters" />
            <MetricCard tone="subtle" label="Leavers, last 30 days" value={data.leaversLast30Days} href="/employees?status=terminated" />
            <MetricCard tone="subtle" label="Approved leave days, last 30 days" value={data.leaveUsageApprovedDays} href="/leave?status=approved" />
            <MetricCard tone="subtle" label="Needs attention" value={data.employeesNeedingAttention} href="/employees?attention=1" />
          </div>
        </Panel>

        <Panel
          title="Recent audit events"
          action={<Link className="text-sm font-medium text-primary hover:underline" href="/audit-logs">View all</Link>}
        >
          <AuditEventList events={data.recentAuditEvents} />
        </Panel>
      </div>

      <Panel title="Team leave calendar" action={<Button asChild size="sm" variant="default"><Link href="/leave/calendar"><Calendar aria-hidden="true" className="size-4" />View calendar</Link></Button>}>
        <WhoIsOutPanelBody entries={data.whoIsOut} />
      </Panel>
    </DashboardShell>
  );
}

function ManagerDashboard({ data, firstName }: { data: ManagerDashboardData; firstName: string | null }) {
  return (
    <DashboardShell
      title="Manager dashboard"
      description="Direct-report activity, approvals, and team availability."
      errors={data.errors}
      firstName={firstName}
    >
      <MetricGrid>
        <MetricCard label="Direct reports" value={data.directReports} note="Active reporting line" href="/employees" />
        <MetricCard label="Pending approvals" value={data.pendingApprovals} note="Direct-report leave" href="/leave?status=pending" />
        <MetricCard label="Team out this week" value={data.whoIsOut.length} note="Approved leave" href="/leave?status=approved" />
        <MetricCard label="Open reviews" value={data.performance.openReviews} note={`${data.performance.activeGoals} active goals`} href="/performance" />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Action items"
          action={
            data.actionItems.length > 0 ? (
              <Link
                className="text-sm font-medium text-primary hover:underline"
                href="/leave?status=pending"
              >
                Review all
              </Link>
            ) : null
          }
        >
          <ActionItemList items={data.actionItems} />
        </Panel>

        <Panel title="Recent updates">
          <RecentUpdateList updates={data.recentUpdates} />
        </Panel>
      </div>

      <Panel title="Team leave calendar" action={<Button asChild size="sm" variant="default"><Link href="/leave/calendar"><Calendar aria-hidden="true" className="size-4" />View calendar</Link></Button>}>
        <WhoIsOutPanelBody entries={data.whoIsOut} />
      </Panel>

      {/*
        Manager scope/boundary rules are documented in `docs/security-model.md`
        and `docs/rls-policy-map.md`. They were previously rendered as a
        dashboard panel; the user does not need to be reminded of their own
        limits on every visit — the rules are enforced by RLS + Server Action
        guards, and reference material belongs in docs, not on the dashboard.
      */}
    </DashboardShell>
  );
}

function EmployeeDashboard({ data, firstName }: { data: EmployeeDashboardData; firstName: string | null }) {
  // Payroll summary is intentionally NOT shown on the employee dashboard.
  // Employees must navigate to /payroll explicitly to view their compensation;
  // this keeps salary/bank/tax data off the high-traffic dashboard surface.

  const balanceCards =
    data.balances.length > 0
      ? data.balances.map((balance) => (
          <MetricCard
            key={balance.id}
            label={`${balance.leaveTypeName} balance`}
            value={
              Number.isInteger(balance.balance)
                ? balance.balance
                : balance.balance.toFixed(1).replace(/\.0$/, "")
            }
            note={`Days remaining (${balance.year})`}
            href="/leave"
          />
        ))
      : [
          <MetricCard
            key="no-balance"
            label="Leave balance"
            value="—"
            note="No balances assigned yet"
            href="/leave"
          />,
        ];

  return (
    <DashboardShell
      title="Employee dashboard"
      description="Your personal HR workspace."
      errors={data.errors}
      firstName={firstName}
    >
      <MetricGrid>
        {balanceCards}
        <MetricCard label="Open tasks" value={data.pendingTasks} note="Onboarding" href="/onboarding" />
        <MetricCard label="Active goals" value={data.performance.activeGoals} note={`${data.performance.openReviews} reviews awaiting you`} href="/performance" />
      </MetricGrid>

      <Panel
        title="Action items"
        action={
          data.pendingTaskItems.length > 0 ? (
            <Link className="text-sm font-medium text-primary hover:underline" href="/onboarding">
              View all
            </Link>
          ) : null
        }
      >
        <PendingTaskList tasks={data.pendingTaskItems} />
      </Panel>

      <Panel title="Recent updates">
        <RecentUpdateList updates={data.recentUpdates} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Leave balances"
          action={<Link className="text-sm font-medium text-primary hover:underline" href="/leave">View leave</Link>}
        >
          <LeaveBalanceList balances={data.balances} />
        </Panel>

        <Panel
          title="Recent documents"
          action={<Link className="text-sm font-medium text-primary hover:underline" href="/documents">View documents</Link>}
        >
          <DocumentList documents={data.recentDocuments} />
        </Panel>
      </div>

      <Panel title="Team leave calendar" action={<Button asChild size="sm" variant="default"><Link href="/leave/calendar"><Calendar aria-hidden="true" className="size-4" />View calendar</Link></Button>}>
        <WhoIsOutPanelBody entries={data.whoIsOut} />
      </Panel>

      <Panel title="Payroll">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            Update your bank, tax, and identification details directly under Payroll. Salary and pay frequency are managed by an admin.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/payroll">Open payroll</Link>
          </Button>
        </div>
      </Panel>
    </DashboardShell>
  );
}

function DashboardShell({
  title,
  description,
  errors,
  firstName,
  children,
}: {
  title: string;
  description: string;
  errors: string[];
  firstName: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        {firstName ? (
          <>
            <DashboardGreeting firstName={firstName} />
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </>
        )}
      </div>

      {errors.length > 0 && (
        <Alert role="alert">
          <AlertDescription>
            Some dashboard data could not be loaded. {errors[0]}
          </AlertDescription>
        </Alert>
      )}

      {children}
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </section>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // <section> + <h2> retained verbatim — tests use both
  // `page.locator("section").filter({ hasText: ... })` and
  // `getByRole("heading", { name: ..., exact: true })`. Shadcn `Card`
  // and `CardTitle` would render <div>s and break both selectors, so
  // we apply Card's token classes to the existing <section>.
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AuditEventList({ events }: { events: AuditLogRow[] }) {
  if (events.length === 0) {
    return <EmptyState icon={ShieldCheck} title="No audit events" text="Sensitive activity will appear here." />;
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground/70" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{event.action}</p>
            <p className="text-xs text-muted-foreground">
              {event.actorName} · {event.entity} · {formatDateTime(event.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PendingTaskList({ tasks }: { tasks: OnboardingTask[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No open tasks"
        text="Pending onboarding tasks assigned to you will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((task) => (
        <li key={task.id} className="py-3 first:pt-0 last:pb-0">
          <Link
            href="/onboarding"
            className="flex items-start gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open onboarding task: ${task.title}${task.dueDate ? `, due ${formatDate(task.dueDate)}` : ""}`}
          >
            <ClipboardList aria-hidden="true" className="mt-0.5 size-4 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.templateName ? `${task.templateName} · ` : ""}
                {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentUpdateList({ updates }: { updates: DashboardRecentUpdate[] }) {
  if (updates.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No recent updates"
        text="Leave decisions, completed tasks, reviews, and new documents will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {updates.map((update) => (
        <li key={update.id} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={update.href}
            className="flex items-start gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${update.title}: ${update.detail}`}
          >
            <RecentUpdateIcon kind={update.kind} tone={update.tone} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {update.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {update.detail} · {formatDateTime(update.occurredAt)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentUpdateIcon({
  kind,
  tone,
}: {
  kind: DashboardRecentUpdate["kind"];
  tone?: DashboardRecentUpdate["tone"];
}) {
  const className = "mt-0.5 size-4";
  const testProps = {
    "data-testid": "recent-update-icon",
    "data-tone": tone ?? "neutral",
    "data-kind": kind,
  } as const;

  if (kind === "leave") {
    if (tone === "success") {
      return <CheckCircle2 aria-hidden="true" className={`${className} text-emerald-600`} {...testProps} />;
    }
    if (tone === "danger") {
      return <XCircle aria-hidden="true" className={`${className} text-destructive`} {...testProps} />;
    }
    if (tone === "pending") {
      return <Clock aria-hidden="true" className={`${className} text-amber-600`} {...testProps} />;
    }
    return <ClipboardList aria-hidden="true" className={`${className} text-primary`} {...testProps} />;
  }
  if (kind === "onboarding") {
    return <CheckCircle2 aria-hidden="true" className={`${className} text-emerald-600`} {...testProps} />;
  }
  if (kind === "document") {
    return <FileText aria-hidden="true" className={`${className} text-muted-foreground`} {...testProps} />;
  }
  return <ShieldCheck aria-hidden="true" className={`${className} text-indigo-500`} {...testProps} />;
}

function ActionItemList({ items }: { items: DashboardActionItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing pending"
        text="Items waiting on you will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={item.href}
            className="flex items-start gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${item.title}: ${item.detail}`}
          >
            <ActionItemIcon kind={item.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ActionItemIcon({ kind }: { kind: DashboardActionItem["kind"] }) {
  if (kind === "performance") {
    return <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 text-indigo-500" />;
  }
  return <ClipboardList aria-hidden="true" className="mt-0.5 size-4 text-amber-500" />;
}


function UnroutedPendingLeaveList({ requests }: { requests: UnroutedPendingLeave[] }) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="All pending leave is routed"
        text="Pending leave from employees without a manager will appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => (
        <li key={request.id} className="py-3 first:pt-0 last:pb-0">
          <Link
            href={`/leave?status=pending#leave-request-${request.id}`}
            className="flex items-start gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Unrouted pending leave for ${request.employeeName}: ${formatDate(request.startDate)} to ${formatDate(request.endDate)}`}
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{request.employeeName}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(request.startDate)} to {formatDate(request.endDate)} · {request.leaveTypeName} · no manager assigned
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function LeaveBalanceList({ balances }: { balances: LeaveBalance[] }) {
  if (balances.length === 0) {
    return <EmptyState icon={AlertCircle} title="No balances yet" text="Leave balances will appear once assigned." />;
  }

  return (
    <ul className="divide-y divide-border">
      {balances.map((balance) => (
        <li key={balance.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <span className="text-sm font-medium text-foreground">{balance.leaveTypeName}</span>
          <span className="text-sm text-muted-foreground">{balance.balance} days</span>
        </li>
      ))}
    </ul>
  );
}

function DocumentList({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return <EmptyState icon={FileText} title="No documents" text="Documents shared with you will appear here." />;
  }

  return (
    <ul className="divide-y divide-border">
      {documents.map((document) => (
        <li key={document.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <FileText aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground/70" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{document.title}</p>
            <p className="text-xs text-muted-foreground">
              {document.category.replace("_", " ")} · {formatDate(document.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-md border bg-muted/40 p-6 text-center">
      <Icon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

