import type React from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { MetricCard } from "@/components/ui/metric-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoalForm, ManagerAppraisalWorkspace, ReviewCycleForm } from "@/components/performance/performance-forms";
import { CycleList, GoalList, ReviewCycleQueue, ReviewList } from "@/components/performance/performance-lists";
import { requireRole } from "@/lib/supabase/helpers";
import { resolvePerformanceTimeZone } from "@/lib/performance-deadline";
import { getAppTimezoneAsAdmin } from "@/server/dal/app-settings";
import {
  getActiveOrVisibleCycles,
  getPerformanceCycles,
  getPerformanceEmployees,
  getPerformanceGoals,
  getPerformanceReviews,
} from "@/server/dal/performance";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    cycleId?: string | string[];
    goalId?: string | string[];
    reviewCycleId?: string | string[];
    reviewEmployeeId?: string | string[];
    view?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const selectedCycleId =
    typeof query.cycleId === "string" ? query.cycleId : undefined;
  const selectedGoalId =
    typeof query.goalId === "string" ? query.goalId : undefined;
  const selectedReviewCycleId =
    typeof query.reviewCycleId === "string" ? query.reviewCycleId : undefined;
  const selectedReviewEmployeeId =
    typeof query.reviewEmployeeId === "string" ? query.reviewEmployeeId : undefined;
  const requestedView =
    typeof query.view === "string" ? query.view : undefined;
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/performance",
  });

  const isAdmin = user.role === "admin";
  const canManage = user.role === "admin" || user.role === "manager";
  type PerformanceView = "cycles" | "appraisals" | "goals" | "reviews";
  const permittedViews: PerformanceView[] = isAdmin
    ? ["cycles", "appraisals", "goals", "reviews"]
    : canManage
      ? ["appraisals", "goals", "reviews"]
      : ["goals", "reviews"];
  const defaultView: PerformanceView = isAdmin
    ? "cycles"
    : canManage
      ? "appraisals"
      : "goals";
  const requestedPermittedView =
    permittedViews.find((view) => view === requestedView) ?? null;
  // Tab-selection priority: explicit ?view= wins over ID-implies-tab so
  // bookmarks and dashboard links remain authoritative. ID params only
  // imply a tab when no explicit ?view= was supplied.
  const initialView: PerformanceView = requestedPermittedView
    ?? (selectedCycleId && isAdmin
      ? "cycles"
      : selectedGoalId && canManage
        ? "goals"
        : (selectedReviewCycleId || selectedReviewEmployeeId) && canManage
          ? "appraisals"
          : defaultView);

  const [cyclesResult, activeCyclesResult, goalsResult, reviewsResult, employeesResult, configuredTimeZone] =
    await Promise.all([
      getPerformanceCycles(),
      getActiveOrVisibleCycles(),
      getPerformanceGoals(),
      getPerformanceReviews(),
      canManage
        ? getPerformanceEmployees(user.role, user.id)
        : Promise.resolve({ employees: [], error: null }),
      getAppTimezoneAsAdmin(),
    ]);
  const businessTimeZone = resolvePerformanceTimeZone(configuredTimeZone);

  const errors = [
    cyclesResult.error,
    activeCyclesResult.error,
    goalsResult.error,
    reviewsResult.error,
    employeesResult.error,
  ].filter(Boolean);
  const selectedCycle =
    cyclesResult.cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
  // Workspace is scoped to active/draft cycles by product intent: closed
  // cycles don't surface here. A direct ?reviewCycleId=<closed-id> URL
  // falls through to the first active cycle (or null). The "Recent
  // appraisals" panel below uses the full cycle list so deadline-lock
  // badges still render on closed-cycle review rows.
  const selectedReviewCycle =
    activeCyclesResult.cycles.find((cycle) => cycle.id === selectedReviewCycleId) ??
    activeCyclesResult.cycles[0] ??
    null;
  const selectedReviewEmployee =
    employeesResult.employees.find((employee) => employee.id === selectedReviewEmployeeId) ??
    null;
  const selectedReview =
    selectedReviewCycle && selectedReviewEmployee
      ? reviewsResult.reviews.find(
          (review) =>
            review.cycleId === selectedReviewCycle.id &&
            review.employeeId === selectedReviewEmployee.id,
        ) ?? null
      : null;
  const selectedReviewGoals =
    selectedReviewCycle && selectedReviewEmployee
      ? goalsResult.goals.filter(
          (goal) =>
            goal.cycleId === selectedReviewCycle.id &&
            goal.employeeId === selectedReviewEmployee.id,
        )
      : [];
  const currentCycles = cyclesResult.cycles.filter((cycle) => cycle.status !== "closed");
  const pastCycles = cyclesResult.cycles.filter((cycle) => cycle.status === "closed");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Performance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Goals, appraisal cycles, and direct-report performance reviews."
              : "Your goals, self-review notes, and completed appraisals."}
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Some performance data could not be loaded. {errors[0]}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Active goals"
          value={goalsResult.goals.filter((g) => g.status !== "completed" && g.status !== "cancelled").length}
          note={`${goalsResult.goals.length} total`}
          href="/performance?view=goals#performance-goals"
        />
        <MetricCard
          label="Visible cycles"
          value={cyclesResult.cycles.length}
          note={`${cyclesResult.cycles.filter((c) => c.status === "active").length} active`}
          href={isAdmin ? "/performance?view=cycles#review-cycles" : canManage ? "/performance?view=appraisals#manager-appraisals" : "/performance?view=reviews#performance-reviews"}
        />
        <MetricCard
          label="Submitted reviews"
          value={reviewsResult.reviews.filter((r) => r.status === "manager_submitted" || r.status === "acknowledged").length}
          note={`${reviewsResult.reviews.length} total`}
          href="/performance?view=reviews#performance-reviews"
        />
      </section>

      <Tabs key={initialView} defaultValue={initialView} className="space-y-4">
        <TabsList aria-label="Performance sections" className="h-auto max-w-full justify-start overflow-x-auto">
          {isAdmin && <TabsTrigger value="cycles">Cycles</TabsTrigger>}
          {canManage && <TabsTrigger value="appraisals">Appraisals</TabsTrigger>}
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="cycles" className="space-y-4">
            <Panel title="Current cycles" id="review-cycles">
              <CycleList
                cycles={currentCycles}
                canEdit
                emptyTitle="No current review cycles"
                emptyText="Create a draft or active cycle to start appraisals."
              />
            </Panel>
            {pastCycles.length > 0 && (
              <CollapsibleSection title={`Past cycles (${pastCycles.length})`} id="past-cycles">
                <CycleList cycles={pastCycles} canEdit />
              </CollapsibleSection>
            )}
            <CollapsibleSection
              title={selectedCycle ? "Edit review cycle" : "Create review cycle"}
              id="cycle-form"
              defaultOpen={Boolean(selectedCycle)}
            >
              <ReviewCycleForm key={selectedCycle?.id ?? "new-cycle"} cycle={selectedCycle} businessTimeZone={businessTimeZone} />
            </CollapsibleSection>
          </TabsContent>
        )}

        {canManage && (
          <TabsContent value="appraisals" className="space-y-4">
            <Panel title="Manager appraisals" id="manager-appraisals">
              <ReviewCycleQueue
                cycles={activeCyclesResult.cycles}
                employees={employeesResult.employees}
                reviews={reviewsResult.reviews}
                selectedCycleId={selectedReviewCycle?.id}
              />
            </Panel>
            {selectedReviewEmployee ? (
              <Panel title="Appraisal workspace" id="manager-appraisal-workspace">
                <ManagerAppraisalWorkspace
                  employee={selectedReviewEmployee}
                  cycle={selectedReviewCycle}
                  review={selectedReview}
                  goals={selectedReviewGoals}
                  businessTimeZone={businessTimeZone}
                />
              </Panel>
            ) : selectedReviewEmployeeId ? (
              <Panel title="Appraisal workspace" id="manager-appraisal-workspace">
                <p className="text-sm text-muted-foreground" role="status">
                  This employee is not in your direct reports, or no longer exists. Pick an employee from the queue above to open their appraisal.
                </p>
              </Panel>
            ) : null}
          </TabsContent>
        )}

        <TabsContent value="goals" className="space-y-4">
          <Panel title={canManage ? "Goals in scope" : "Your goals"} id="performance-goals">
            <GoalList
              goals={goalsResult.goals}
              showEmployee={canManage}
              canManage={canManage}
              canUpdateProgress={user.role === "employee"}
            />
          </Panel>
          {canManage && (
            <CollapsibleSection
              title={selectedGoalId ? "Edit goal" : "Set or update goal"}
              id="goal-form"
              defaultOpen={Boolean(selectedGoalId)}
            >
              <GoalForm
                key={selectedGoalId ?? "new-goal"}
                employees={employeesResult.employees}
                cycles={activeCyclesResult.cycles}
                allCycles={cyclesResult.cycles}
                goals={goalsResult.goals}
                selectedGoalId={selectedGoalId}
                businessTimeZone={businessTimeZone}
              />
            </CollapsibleSection>
          )}
        </TabsContent>

        <TabsContent value="reviews">
          <Panel title={canManage ? "Recent appraisals" : "Your appraisals"} id="performance-reviews">
            <ReviewList
              reviews={reviewsResult.reviews}
              showEmployee={canManage}
              canSelfReview={user.role === "employee"}
              cycles={cyclesResult.cycles}
              businessTimeZone={businessTimeZone}
            />
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-xl border bg-card text-card-foreground shadow">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
