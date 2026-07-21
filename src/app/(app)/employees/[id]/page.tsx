import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeePasswordResetButton } from "@/components/employees/password-reset-button";
import { displayPhone, formatEnum } from "@/lib/format";
import { requireRole } from "@/lib/supabase/helpers";
import { getAuditLogs, type AuditLogRow } from "@/server/dal/audit-logs";
import { getCompensation } from "@/server/dal/compensation";
import { getDocuments, type DocumentRow } from "@/server/dal/documents";
import {
  getPeerEmployeeView,
  getVisibleEmployeeById,
  type EmployeeDetail,
  type PeerEmployeeView,
} from "@/server/dal/employees";
import {
  getLeaveRequests,
  getMyLeaveBalances,
  type LeaveRequest,
} from "@/server/dal/leave";
import { getDirectReportIds } from "@/server/dal/onboarding";

type EmployeeDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

// B7 (UAT 2026-05-20): Overview + Job were duplicates; collapsed into one
// always-visible "Profile" section. Remaining tabs are functional surfaces,
// not redundant. Peer viewers see neither tabs nor sensitive timeline data.
const tabs = [
  { value: "documents", label: "Documents" },
  { value: "leave", label: "Leave" },
  { value: "audit", label: "Audit" },
] as const;

type EmployeeTab = (typeof tabs)[number]["value"];

// Audit tab is admin-only; managers and employees see Documents + Leave only.
function visibleTabs(role: "admin" | "manager" | "employee") {
  return role === "admin" ? tabs : tabs.filter((tab) => tab.value !== "audit");
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: `/employees/${id}`,
  });
  // Clamp to a tab the viewer's role actually has — URL-typed `?tab=audit`
  // as employee/manager falls through to "documents" rather than leaving
  // the tab bar with no active highlight pointing at an admin-only panel.
  const activeTab = resolveActiveTab(tab, user.role);

  // B7 viewer classification:
  //   - `full`: admin OR manager-of-subject OR self. Sees full profile +
  //     Documents/Leave/Audit tabs via existing RLS-scoped DAL.
  //   - `peer`: anyone else. Sees the 5-field peer projection only.
  const isSelf = user.id === id;
  const isManagerOfSubject =
    user.role === "manager" && (await getDirectReportIds(user.id)).includes(id);
  const mode: "full" | "peer" =
    user.role === "admin" || isSelf || isManagerOfSubject ? "full" : "peer";

  if (mode === "peer") {
    const { employee, error } = await getPeerEmployeeView(id);
    if (!employee && !error) {
      notFound();
    }
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <BackLink />
        {error || !employee ? (
          <ErrorPanel error={error} />
        ) : (
          <>
            <PeerHeader employee={employee} />
            <div className="rounded-xl border bg-card text-card-foreground shadow">
              <PeerProfileSection employee={employee} />
            </div>
          </>
        )}
      </div>
    );
  }

  const { employee, error } = await getVisibleEmployeeById(id);

  if (!employee && !error) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BackLink />

      {error || !employee ? (
        <ErrorPanel error={error} />
      ) : (
        <>
          <EmployeeHeader
            employee={employee}
            canSendPasswordReset={user.role === "admin"}
            canEdit={user.role === "admin"}
          />

          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <ProfileSection employee={employee} viewerRole={user.role} />

            <div
              role="tablist"
              aria-label="People profile sections"
              className="flex gap-1 overflow-x-auto border-t border-b px-4 pt-3"
            >
              {visibleTabs(user.role).map((tabItem) => (
                <Link
                  key={tabItem.value}
                  href={`/employees/${employee.id}?tab=${tabItem.value}`}
                  scroll={false}
                  role="tab"
                  aria-selected={activeTab === tabItem.value}
                  className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium ${
                    activeTab === tabItem.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tabItem.label}
                </Link>
              ))}
            </div>

            <EmployeeTabPanel
              employee={employee}
              activeTab={activeTab}
              viewerRole={user.role}
            />
          </div>
        </>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/employees"
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      People
    </Link>
  );
}

function ErrorPanel({ error }: { error: string | null }) {
  return (
    <div className="rounded-md border border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      Unable to load employee details. {error}
    </div>
  );
}

async function ProfileSection({
  employee,
  viewerRole,
}: {
  employee: EmployeeDetail;
  viewerRole: "admin" | "manager" | "employee";
}) {
  // Identity-gap cue: admin-only. Phone lives on `profiles` (editable on the
  // employee edit page); passport_number and nationality live on
  // `employee_compensation` (admin-only RLS, editable in Payroll). Read the
  // compensation row through the admin client to derive the gaps without
  // duplicating those fields onto the profile DTO. Manager/employee viewers
  // can't see or fix the sensitive fields, so the cue is intentionally
  // admin-only (Session 118).
  const identityGaps: Array<"phone" | "passport" | "nationality"> = [];
  if (viewerRole === "admin") {
    if (!employee.phone) identityGaps.push("phone");
    const { compensation } = await getCompensation(employee.id);
    if (!compensation?.passportNumber) identityGaps.push("passport");
    if (!compensation?.nationality) identityGaps.push("nationality");
  }
  const hasProfileGap = identityGaps.includes("phone");
  const hasPayrollGap =
    identityGaps.includes("passport") || identityGaps.includes("nationality");

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <InfoPanel title="Profile" icon={ShieldCheck}>
          <Description label="Work email" value={employee.workEmail} />
          <Description label="Phone" value={displayPhone(employee.phone)} />
          <Description label="Role" value={formatEnum(employee.role)} />
          <Description
            label="Employment status"
            value={formatEnum(employee.employmentStatus)}
          />
        </InfoPanel>

        {identityGaps.length > 0 && (
          <div
            role="status"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            <p className="font-medium">
              Missing identity data: {identityGaps.join(", ")}.
            </p>
            <p className="mt-1 leading-5">
              {hasProfileGap && (
                <>
                  Phone is editable on{" "}
                  <Link
                    href={`/employees/${employee.id}/edit`}
                    className="underline hover:text-amber-700"
                  >
                    this profile
                  </Link>
                  .{hasPayrollGap ? " " : ""}
                </>
              )}
              {hasPayrollGap && (
                <>
                  Passport / nationality are held with payroll data —{" "}
                  <Link
                    href={`/payroll?employeeId=${employee.id}`}
                    className="underline hover:text-amber-700"
                  >
                    open in Payroll
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
        )}

        <InfoPanel title="Job" icon={BriefcaseBusiness}>
          <Description label="Job title" value={employee.jobTitle} />
          <Description label="Department" value={employee.departmentName} />
          <Description label="Manager" value={employee.managerName} />
          <Description
            label="Employment type"
            value={formatEnum(employee.employmentType)}
          />
          <Description label="Work location" value={employee.workLocation} />
        </InfoPanel>
      </section>

      <aside className="space-y-4">
        <InfoPanel title="Timeline" icon={FileText}>
          <Description label="Start date" value={formatDate(employee.startDate)} />
          <Description
            label="End date"
            value={employee.endDate ? formatDate(employee.endDate) : null}
          />
        </InfoPanel>
      </aside>
    </div>
  );
}

function PeerProfileSection({ employee }: { employee: PeerEmployeeView }) {
  return (
    <div className="grid gap-6 p-4">
      <section className="space-y-4">
        <InfoPanel title="Profile" icon={ShieldCheck}>
          <Description label="Department" value={employee.departmentName} />
          <Description
            label="Manager"
            value={
              employee.managerId && employee.managerName ? (
                <Link
                  href={`/employees/${employee.managerId}`}
                  className="text-primary hover:underline"
                >
                  {employee.managerName}
                </Link>
              ) : (
                employee.managerName
              )
            }
          />
          <Description label="Work email" value={employee.workEmail} />
          <Description label="Work phone" value={displayPhone(employee.phone)} />
        </InfoPanel>
      </section>
    </div>
  );
}

async function EmployeeTabPanel({
  employee,
  activeTab,
  viewerRole,
}: {
  employee: EmployeeDetail;
  activeTab: EmployeeTab;
  viewerRole: "admin" | "manager" | "employee";
}) {
  if (activeTab === "documents") {
    return <DocumentsPanel employeeId={employee.id} viewerRole={viewerRole} />;
  }

  if (activeTab === "leave") {
    return <LeavePanel employeeId={employee.id} viewerRole={viewerRole} />;
  }

  return <AuditPanel employeeId={employee.id} viewerRole={viewerRole} />;
}

async function DocumentsPanel({
  employeeId,
  viewerRole,
}: {
  employeeId: string;
  viewerRole: "admin" | "manager" | "employee";
}) {
  const { documents, error } = await getDocuments({ employeeId });

  return (
    <SummaryPanel
      title="Documents"
      icon={FileText}
      actionHref={`/documents?employeeId=${employeeId}`}
      actionLabel={viewerRole === "employee" ? "Open documents" : "View documents"}
      error={error}
      emptyTitle="No documents visible"
      emptyText="Documents for this employee will appear here when uploaded and visible to your role."
    >
      {documents.length > 0 ? (
        <CompactList>
          {documents.slice(0, 5).map((document) => (
            <DocumentSummaryRow key={document.id} document={document} />
          ))}
        </CompactList>
      ) : undefined}
    </SummaryPanel>
  );
}

async function LeavePanel({
  employeeId,
  viewerRole,
}: {
  employeeId: string;
  viewerRole: "admin" | "manager" | "employee";
}) {
  const currentYear = new Date().getFullYear();
  const [balancesResult, requestsResult] = await Promise.all([
    getMyLeaveBalances(currentYear),
    getLeaveRequests({ employeeId }),
  ]);

  const balances = balancesResult.balances.filter((balance) => balance.employeeId === employeeId);
  const requests = requestsResult.requests;
  const error = balancesResult.error ?? requestsResult.error;

  const leaveContent =
    balances.length > 0 || requests.length > 0 ? (
      <>
        {balances.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            {balances.map((balance) => (
              <div key={balance.id} className="rounded-md border border p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {balance.leaveTypeName}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {balance.balance}
                </p>
                <p className="text-xs text-muted-foreground">{balance.year} days remaining</p>
              </div>
            ))}
          </div>
        )}

        {requests.length > 0 && (
          <CompactList>
            {requests.slice(0, 5).map((request) => (
              <LeaveSummaryRow key={request.id} request={request} />
            ))}
          </CompactList>
        )}
      </>
    ) : undefined;

  return (
    <SummaryPanel
      title="Leave"
      icon={CalendarDays}
      actionHref={viewerRole === "admin" ? "/leave/admin" : "/leave"}
      actionLabel={viewerRole === "admin" ? "Manage leave" : "Open leave"}
      error={error}
      emptyTitle="No leave records visible"
      emptyText="Leave balances and requests for this employee will appear here when available to your role."
    >
      {leaveContent}
    </SummaryPanel>
  );
}

async function AuditPanel({
  employeeId,
  viewerRole,
}: {
  employeeId: string;
  viewerRole: "admin" | "manager" | "employee";
}) {
  if (viewerRole !== "admin") {
    return (
      <SummaryPanel
        title="Audit"
        icon={ShieldCheck}
        emptyTitle="Audit logs are admin-only"
        emptyText="Employee-specific audit events are available to administrators."
      />
    );
  }

  const { logs, error } = await getAuditLogs({ entityId: employeeId });

  return (
    <SummaryPanel
      title="Audit"
      icon={ShieldCheck}
      actionHref={`/audit-logs?actor=&action=&entity=employee`}
      actionLabel="Open audit logs"
      error={error}
      emptyTitle="No employee audit events"
      emptyText="Employee-specific audit events will appear here after profile or HR changes."
    >
      {logs.length > 0 ? (
        <CompactList>
          {logs.slice(0, 5).map((log) => (
            <AuditSummaryRow key={log.id} log={log} />
          ))}
        </CompactList>
      ) : undefined}
    </SummaryPanel>
  );
}

function SummaryPanel({
  title,
  icon: Icon,
  actionHref,
  actionLabel,
  error,
  emptyTitle,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ElementType;
  actionHref?: string;
  actionLabel?: string;
  error?: string | null;
  emptyTitle: string;
  emptyText: string;
  children?: React.ReactNode;
}) {
  const hasChildren = Boolean(children);

  return (
    <div className="p-4">
      <section className="rounded-md border border">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          </div>
          {actionHref && actionLabel && (
            <Link
              href={actionHref}
              className="text-sm font-medium text-primary hover:underline"
            >
              {actionLabel}
            </Link>
          )}
        </div>
        {error ? (
          <div className="p-4 text-sm text-destructive">Unable to load {title.toLowerCase()}. {error}</div>
        ) : hasChildren ? (
          <div className="space-y-4 p-4">{children}</div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border rounded-md border border">{children}</ul>;
}

function DocumentSummaryRow({ document }: { document: DocumentRow }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{document.title}</p>
        <p className="text-xs text-muted-foreground">{formatEnum(document.category)}</p>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(document.createdAt)}</p>
    </li>
  );
}

function LeaveSummaryRow({ request }: { request: LeaveRequest }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{request.leaveTypeName}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(request.startDate)} - {formatDate(request.endDate)}
        </p>
      </div>
      <span className="text-xs font-medium capitalize text-muted-foreground">{request.status}</span>
    </li>
  );
}

function AuditSummaryRow({ log }: { log: AuditLogRow }) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">{log.action}</p>
        <p className="text-xs text-muted-foreground">{log.actorName}</p>
      </div>
      <p className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</p>
    </li>
  );
}

function EmployeeHeader({
  employee,
  canSendPasswordReset,
  canEdit,
}: {
  employee: EmployeeDetail;
  canSendPasswordReset: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-lg font-semibold text-foreground">
            {employee.displayName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-normal text-foreground">
              {employee.displayName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.jobTitle ?? "No job title"} ·{" "}
              {employee.departmentName ?? "No department"}
            </p>
          </div>
        </div>

        {(canEdit || canSendPasswordReset) && (
          <div className="flex flex-col gap-2 sm:items-end">
            {canSendPasswordReset && (
              <EmployeePasswordResetButton employeeId={employee.id} />
            )}
            {canEdit && (
              <Button asChild variant="outline">
                <Link href={`/employees/${employee.id}/edit`}>
                  <Pencil aria-hidden="true" className="size-4" />
                  Edit
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PeerHeader({ employee }: { employee: PeerEmployeeView }) {
  return (
    <section className="rounded-xl border bg-card text-card-foreground shadow p-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-lg font-semibold text-foreground">
          {employee.displayName
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-normal text-foreground">
            {employee.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {employee.departmentName ?? "No department"}
          </p>
        </div>
      </div>
    </section>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <dl className="grid gap-4 p-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Description({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.length === 0);
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{isEmpty ? "Not set" : value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function parseTab(value: string | undefined): EmployeeTab {
  return tabs.some((tab) => tab.value === value)
    ? (value as EmployeeTab)
    : "documents";
}

function resolveActiveTab(
  value: string | undefined,
  role: "admin" | "manager" | "employee",
): EmployeeTab {
  const parsed = parseTab(value);
  return visibleTabs(role).some((tab) => tab.value === parsed)
    ? parsed
    : "documents";
}
