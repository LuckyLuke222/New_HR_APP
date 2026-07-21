"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { completeTask, deleteTask, type OnboardingActionState } from "@/server/actions/onboarding";
import type { OnboardingTask } from "@/server/dal/onboarding";

const initial: OnboardingActionState = { success: false, message: "" };

type Props = {
  tasks: OnboardingTask[];
  isAdmin: boolean;
  showEmployee: boolean;
  canCompleteTasks: boolean;
};

export function TaskList({ tasks, isAdmin, showEmployee, canCompleteTasks }: Props) {
  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold">No tasks found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin ? "Assign tasks to employees from the admin page." : "You have no onboarding tasks assigned yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40 text-left text-xs font-semibold uppercase text-muted-foreground">
          <tr>
            {showEmployee && <th scope="col" className="px-4 py-3">Employee</th>}
            <th scope="col" className="px-4 py-3">Task</th>
            <th scope="col" className="px-4 py-3">Template</th>
            <th scope="col" className="px-4 py-3">Due</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isAdmin={isAdmin}
              showEmployee={showEmployee}
              canCompleteTasks={canCompleteTasks}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskRow({
  task,
  isAdmin,
  showEmployee,
  canCompleteTasks,
}: {
  task: OnboardingTask;
  isAdmin: boolean;
  showEmployee: boolean;
  canCompleteTasks: boolean;
}) {
  const [completeState, completeAction, completePending] = useActionState(completeTask, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTask, initial);

  const isPending = task.status === "pending";

  return (
    <tr id={`onboarding-task-${task.id}`} className="scroll-mt-24 align-top hover:bg-muted/40 target:bg-amber-50">
      {showEmployee && (
        <td className="px-4 py-3 font-medium text-foreground">
          <Link
            href={`/employees/${task.employeeId}`}
            className="text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {task.employeeName}
          </Link>
        </td>
      )}
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{task.title}</p>
        {task.description && (
          <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={task.description}>
            {task.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {task.templateName ?? <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
        {task.dueDate ? formatDate(task.dueDate) : <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={task.status} />
        {task.completedAt && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">{formatDate(task.completedAt)}</p>
        )}
        {task.completionNote && (
          <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Note: </span>
            {task.completionNote}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          {canCompleteTasks && isPending && (
            <form action={completeAction} className="space-y-1">
              <input type="hidden" name="taskId" value={task.id} />
              <label htmlFor={`completion-note-${task.id}`} className="sr-only">
                Completion note
              </label>
              <Textarea
                id={`completion-note-${task.id}`}
                name="completionNote"
                rows={2}
                maxLength={1200}
                defaultValue={completeState.values?.completionNote ?? ""}
                placeholder="Add a note about how this was done (optional)"
                className="max-w-xs px-2 py-1 text-xs"
                autoComplete={`new-completion-note-${task.id}`}
              />
              <Button type="submit" size="sm" disabled={completePending}>
                {completePending ? "Saving…" : "Mark complete"}
              </Button>
            </form>
          )}
          {isAdmin && (
            <form action={deleteAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="text-sm text-destructive hover:underline disabled:opacity-50"
                onClick={(e) => {
                  if (!confirm("Delete this task?")) e.preventDefault();
                }}
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </form>
          )}
          {completeState.message && (
            <p
              role="alert"
              className={cn(
                "text-xs",
                completeState.success ? "text-emerald-700" : "text-destructive",
              )}
            >
              {completeState.message}
            </p>
          )}
          {deleteState.message && !deleteState.success && (
            <p role="alert" className="text-xs text-destructive">{deleteState.message}</p>
          )}
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: OnboardingTask["status"] }) {
  // Semantic accent shades retained — emerald=completed, amber=pending.
  const cls =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
      : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";

  return (
    <Badge variant="outline" className={cn("capitalize", cls)}>
      {status}
    </Badge>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value.includes("T") ? value : value + "T00:00:00"));
}
