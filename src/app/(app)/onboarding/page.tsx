import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/supabase/helpers";
import {
  getMyTasks,
  getAllTasks,
  getOnboardingProgress,
  getDirectReportIds,
} from "@/server/dal/onboarding";
import { TaskList } from "@/components/onboarding/task-list";
import { ProgressTable } from "@/components/onboarding/progress-table";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

export default async function OnboardingPage() {
  const user = await requireRole(["admin", "manager", "employee"], {
    attemptedResource: "/onboarding",
  });

  const isEmployee = user.role === "employee";
  const isAdmin = user.role === "admin";
  const isManager = user.role === "manager";

  const [tasksResult, progressResult] = await Promise.all([
    isEmployee
      ? getMyTasks(user.id)
      : isManager
        ? getDirectReportIds(user.id).then((ids) =>
            ids.length > 0 ? getAllTasks(ids) : Promise.resolve({ tasks: [], error: null }),
          )
        : getAllTasks(),
    !isEmployee
      ? isManager
        ? getDirectReportIds(user.id).then((ids) =>
            ids.length > 0
              ? getOnboardingProgress(ids)
              : Promise.resolve({ progress: [], error: null }),
          )
        : getOnboardingProgress()
      : Promise.resolve({ progress: [], error: null }),
  ]);

  const pendingCount = tasksResult.tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEmployee
              ? "Your onboarding tasks and progress."
              : isManager
                ? "Onboarding progress for your direct reports."
                : "Onboarding task completion across the company."}
          </p>
        </div>
        {(isAdmin || isManager) && (
          <Button asChild variant="outline">
            <Link href="/onboarding/admin">
              <Settings aria-hidden="true" className="size-4" />
              Manage templates &amp; tasks
            </Link>
          </Button>
        )}
      </div>

      {/* Progress widget for admin / manager */}
      {!isEmployee && (
        <section className="rounded-xl border bg-card text-card-foreground shadow">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Progress overview</h2>
          </div>
          {progressResult.error ? (
            <div className="p-4 text-sm text-destructive">Unable to load progress. {progressResult.error}</div>
          ) : (
            <ProgressTable progress={progressResult.progress} />
          )}
        </section>
      )}

      {/* Task list */}
      <CollapsibleSection
        title={isEmployee ? "Your tasks" : `All tasks${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`}
        id="all-tasks"
        defaultOpen={isEmployee}
      >
        {tasksResult.error ? (
          <div className="p-4 text-sm text-destructive">Unable to load tasks. {tasksResult.error}</div>
        ) : (
          <TaskList
            tasks={tasksResult.tasks}
            isAdmin={isAdmin}
            showEmployee={!isEmployee}
            canCompleteTasks={isEmployee}
          />
        )}
      </CollapsibleSection>
    </div>
  );
}
