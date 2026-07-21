import Link from "next/link";
import { ChevronDown, Pencil, Star } from "lucide-react";
import {
  AcknowledgeReviewForm,
  EmployeeGoalProgressForm,
  SelfReviewForm,
} from "@/components/performance/performance-forms";
import type {
  PerformanceCycle,
  PerformanceGoal,
  PerformanceReview,
} from "@/server/dal/performance";
import type { EmployeeOption } from "@/server/dal/onboarding";
import { formatDateDisplay } from "@/lib/format";
import { isCycleDeadlineLocked } from "@/lib/performance-deadline";

export function CycleList({
  cycles,
  canEdit = false,
  emptyTitle = "No review cycles",
  emptyText = "Create a cycle to start appraisals.",
}: {
  cycles: PerformanceCycle[];
  canEdit?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (cycles.length === 0) {
    return <EmptyState title={emptyTitle} text={emptyText} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Cycle</th>
            <th scope="col" className="px-4 py-3">Dates</th>
            <th scope="col" className="px-4 py-3">Due</th>
            <th scope="col" className="px-4 py-3">Status</th>
            {canEdit && <th scope="col" className="px-4 py-3">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {cycles.map((cycle) => (
            <tr key={cycle.id} className="align-top hover:bg-muted/40">
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{cycle.title}</p>
                {cycle.description && (
                  <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground" title={cycle.description}>
                    {cycle.description}
                  </p>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {formatDateDisplay(cycle.startDate)} - {formatDateDisplay(cycle.endDate)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                {cycle.dueDate ? formatDateDisplay(cycle.dueDate) : <span className="text-muted-foreground/50">-</span>}
              </td>
              <td className="px-4 py-3">
                <StatusBadge label={formatStatus(cycle.status)} tone={cycle.status === "active" ? "green" : cycle.status === "closed" ? "slate" : "amber"} />
              </td>
              {canEdit && (
                <td className="whitespace-nowrap px-4 py-3">
                  <Link
                    href={`/performance?view=cycles&cycleId=${cycle.id}#cycle-form`}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    title={`Edit ${cycle.title}`}
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Edit
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewCycleQueue({
  cycles,
  employees,
  reviews,
  selectedCycleId,
}: {
  cycles: PerformanceCycle[];
  employees: EmployeeOption[];
  reviews: PerformanceReview[];
  selectedCycleId?: string;
}) {
  if (cycles.length === 0) {
    return <EmptyState title="No active review cycles" text="Active cycles will appear here for manager appraisals." />;
  }

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? cycles[0];
  const reviewByEmployee = new Map(
    reviews
      .filter((review) => review.cycleId === selectedCycle.id)
      .map((review) => [review.employeeId, review]),
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {cycles.map((cycle) => (
          <Link
            key={cycle.id}
            href={`/performance?view=appraisals&reviewCycleId=${cycle.id}#manager-appraisals`}
            className={`min-w-56 rounded-md border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              cycle.id === selectedCycle.id
                ? "border-primary bg-primary/5 text-foreground"
                : "border bg-card text-foreground hover:border-primary/40"
            }`}
          >
            <span className="block text-sm font-semibold">{cycle.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Due {cycle.dueDate ? formatDateDisplay(cycle.dueDate) : "not set"}
            </span>
          </Link>
        ))}
      </div>

      <div className="divide-y divide-border rounded-xl border bg-card text-card-foreground shadow">
        {employees.map((employee) => {
          const review = reviewByEmployee.get(employee.id);
          const isSubmitted = review?.status === "manager_submitted" || review?.status === "acknowledged";
          const href = `/performance?view=appraisals&reviewCycleId=${selectedCycle.id}&reviewEmployeeId=${employee.id}#manager-appraisal-workspace`;

          return (
            <Link
              key={employee.id}
              href={href}
              className="flex flex-col gap-2 px-4 py-3 transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{employee.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {review?.selfReview ? "Self-review submitted" : "Awaiting self-review"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  label={review ? formatStatus(review.status) : "Not started"}
                  tone={isSubmitted ? "teal" : review?.status === "self_reviewed" ? "amber" : "slate"}
                />
                {review?.score != null && (
                  isSubmitted ? (
                    <ScoreBadge score={review.score} />
                  ) : (
                    <StatusBadge label="Draft saved" tone="slate" />
                  )
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function GoalList({
  goals,
  showEmployee,
  canManage = false,
  canUpdateProgress = false,
}: {
  goals: PerformanceGoal[];
  showEmployee: boolean;
  canManage?: boolean;
  canUpdateProgress?: boolean;
}) {
  if (goals.length === 0) {
    return <EmptyState title="No goals found" text="Goals created by HR or managers will appear here." />;
  }

  const grouped = new Map<string, PerformanceGoal[]>();
  for (const g of goals) {
    const key = g.cycleId ?? "no-cycle";
    const bucket = grouped.get(key);
    if (bucket) bucket.push(g);
    else grouped.set(key, [g]);
  }
  const groups = [...grouped.entries()].sort(([a], [b]) => {
    if (a === "no-cycle") return 1;
    if (b === "no-cycle") return -1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {groups.map(([cycleId, cycleGoals]) => {
        const cycleTitle = cycleGoals[0].cycleTitle ?? "Unassigned";
        return (
          <details key={cycleId} className="group rounded-md border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{cycleTitle}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {cycleGoals.length} {cycleGoals.length === 1 ? "goal" : "goals"}
                </span>
              </div>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
            </summary>
            <div className="divide-y divide-border border-t">
              {cycleGoals.map((goal) => (
                <div key={goal.id}>
                  <div className="space-y-2 px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        {showEmployee && (
                          <Link
                            href={`/employees/${goal.employeeId}`}
                            className="text-xs font-medium text-muted-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {goal.employeeName}
                          </Link>
                        )}
                        <p className="text-sm font-semibold text-foreground">{goal.title}</p>
                        {goal.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{goal.description}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={formatStatus(goal.status)} tone={goal.status === "completed" ? "green" : goal.status === "cancelled" ? "slate" : "amber"} />
                        {goal.dueDate && (
                          <span className="text-xs text-muted-foreground">Due {formatDateDisplay(goal.dueDate)}</span>
                        )}
                        {canManage && (
                          <Link
                            href={`/performance?view=goals&goalId=${goal.id}#goal-form`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title={`Edit ${goal.title}`}
                          >
                            <Pencil aria-hidden="true" className="size-3.5" />
                            Edit
                          </Link>
                        )}
                      </div>
                    </div>
                    <ProgressRing value={goal.progress} />
                    {goal.employeeProgressNote && (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{goal.employeeProgressNote}</p>
                    )}
                  </div>
                  {canUpdateProgress && goal.status !== "cancelled" && (
                    <div className="border-t bg-muted/40 px-4 py-3">
                      <EmployeeGoalProgressForm goal={goal} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export function ReviewList({
  reviews,
  showEmployee,
  canSelfReview,
  cycles = [],
  businessTimeZone,
}: {
  reviews: PerformanceReview[];
  showEmployee: boolean;
  canSelfReview: boolean;
  cycles?: PerformanceCycle[];
  businessTimeZone: string;
}) {
  if (reviews.length === 0) {
    return <EmptyState title="No reviews found" text="Submitted appraisals and self-review requests will appear here." />;
  }

  const cycleById = new Map(cycles.map((cycle) => [cycle.id, cycle] as const));

  return (
    <div className="divide-y divide-border">
      {reviews.map((review) => {
        const reviewCycle = cycleById.get(review.cycleId) ?? null;
        const deadlineLocked = reviewCycle ? isCycleDeadlineLocked(reviewCycle, businessTimeZone) : false;
        const submissionDeadline = reviewCycle?.submissionDeadline ?? null;
        const canEditSelf =
          canSelfReview &&
          (review.status === "draft" || review.status === "self_reviewed");
        const canAcknowledge =
          canSelfReview && review.status === "manager_submitted";
        const managerFeedbackVisible =
          !canSelfReview || review.status === "manager_submitted" || review.status === "acknowledged";

        return (
          <article key={review.id} className="space-y-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {showEmployee ? (
                    <>
                      <Link
                        href={`/employees/${review.employeeId}`}
                        className="text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {review.employeeName}
                      </Link>
                      {" - "}
                    </>
                  ) : null}
                  {review.cycleTitle}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Manager: {review.managerName ?? "Not assigned"}
                </p>
                {canSelfReview && review.status === "self_reviewed" && (
                  <p className="text-xs text-muted-foreground">Pending manager review</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={formatStatus(review.status)} tone={review.status === "acknowledged" ? "green" : review.status === "manager_submitted" ? "teal" : "amber"} />
                {managerFeedbackVisible && review.score != null && <ScoreBadge score={review.score} />}
              </div>
            </div>

            {review.selfReview && (
              <ReviewText title="Self-review" text={review.selfReview} />
            )}
            {managerFeedbackVisible && review.managerStrengths && (
              <ReviewText title="Strengths" text={review.managerStrengths} />
            )}
            {managerFeedbackVisible && review.managerImprovements && (
              <ReviewText title="Improvement areas" text={review.managerImprovements} />
            )}
            {managerFeedbackVisible && review.managerNextSteps && (
              <ReviewText title="Next steps" text={review.managerNextSteps} />
            )}

            {canEditSelf && (
              <SelfReviewForm
                review={review}
                deadlineLocked={deadlineLocked}
                submissionDeadline={submissionDeadline}
              />
            )}
            {canAcknowledge && (
              <AcknowledgeReviewForm reviewId={review.id} />
            )}
          </article>
        );
      })}
    </div>
  );
}

function ReviewText({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{text}</p>
    </div>
  );
}

function ProgressRing({ value, size = 40 }: { value: number; size?: number }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Goal progress"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-primary transition-all"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold text-foreground">{value}%</span>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-800">
      <Star className="h-3.5 w-3.5 fill-amber-500 stroke-amber-500" aria-hidden="true" />
      Score {score}/5
    </span>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "amber" | "green" | "slate" | "teal" }) {
  const cls = {
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    slate: "border bg-muted/40 text-foreground",
    teal: "border-primary/30 bg-primary/5 text-primary",
  }[tone];

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function formatStatus(value: string): string {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
