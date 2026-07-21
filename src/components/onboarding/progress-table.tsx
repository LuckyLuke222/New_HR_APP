"use client";

import Link from "next/link";
import type { OnboardingProgress } from "@/server/dal/onboarding";

type Props = {
  progress: OnboardingProgress[];
};

export function ProgressTable({ progress }: Props) {
  if (progress.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-foreground">No onboarding data</p>
        <p className="mt-1 text-sm text-muted-foreground">Assign tasks to employees to track progress.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">Employee</th>
            <th scope="col" className="px-4 py-3">Progress</th>
            <th scope="col" className="px-4 py-3">Completed</th>
            <th scope="col" className="px-4 py-3">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {progress.map((p) => {
            const pct = p.totalTasks === 0 ? 0 : Math.round((p.completedTasks / p.totalTasks) * 100);
            const remaining = p.totalTasks - p.completedTasks;
            return (
              <tr key={p.employeeId} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-foreground">
                  {p.firstTaskId ? (
                    <Link
                      href={`#onboarding-task-${p.firstTaskId}`}
                      onClick={() => {
                        document.getElementById("all-tasks")?.setAttribute("open", "");
                      }}
                      className="text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p.employeeName}
                    </Link>
                  ) : (
                    p.employeeName
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${p.employeeName} onboarding progress`}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {p.completedTasks} / {p.totalTasks}
                </td>
                <td className="px-4 py-3">
                  {remaining === 0 ? (
                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      Complete
                    </span>
                  ) : (
                    <span className="text-foreground">{remaining} task{remaining === 1 ? "" : "s"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
