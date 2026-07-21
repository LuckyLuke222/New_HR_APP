"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelectField } from "@/components/ui/searchable-select";
import { SelectField } from "@/components/ui/select-field";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { Lock, Star } from "lucide-react";
import { formatDateDisplay, formatEnum } from "@/lib/format";
import {
  acknowledgeReview,
  createReviewCycle,
  reopenGoalDefinition,
  reopenManagerReview,
  savePerformanceGoal,
  submitManagerReview,
  submitSelfReview,
  updateReviewCycle,
  updateOwnGoalProgress,
  type PerformanceActionState,
} from "@/server/actions/performance";
import type {
  PerformanceCycle,
  PerformanceGoal,
  PerformanceReview,
} from "@/server/dal/performance";
import type { EmployeeOption } from "@/server/dal/onboarding";
import { isCycleDeadlineLocked } from "@/lib/performance-deadline";

const initial: PerformanceActionState = { success: false, message: "" };

function DeadlineLockedBadge({ deadline }: { deadline: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700">
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      Locked — deadline passed{deadline ? ` ${formatDateDisplay(deadline)}` : ""}
    </span>
  );
}

export function ReviewCycleForm({
  cycle,
  businessTimeZone,
}: {
  cycle?: PerformanceCycle | null;
  businessTimeZone: string;
}) {
  const isEditing = Boolean(cycle);
  const [state, action, pending] = useActionState(isEditing ? updateReviewCycle : createReviewCycle, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [lastStatus, setLastStatus] = useState<string>(cycle?.status ?? "draft");
  // Controlled checkbox so unchecking survives a validation failure.
  // FormData omits unchecked boxes (no key in formData → state.values.submissionLockEnabled
  // is undefined), so an uncontrolled `defaultChecked` would re-render against the
  // original cycle's value and silently revert the user's unchecked intent.
  const [submissionLockEnabled, setSubmissionLockEnabled] = useState<boolean>(
    Boolean(cycle?.submissionLockEnabled),
  );
  const [persistedLockEffective, setPersistedLockEffective] = useState<boolean>(
    cycle ? isCycleDeadlineLocked(cycle, businessTimeZone) : false,
  );
  const unlockSubmitConfirmedRef = useRef(false);
  // After a server roundtrip, sync the checkbox to the round-tripped intent.
  // The form keeps `defaultChecked`-style "first render uses prop" semantics
  // while still letting the server tell us what the user submitted.
  const [prevValuesKey, setPrevValuesKey] = useState<string | undefined>(undefined);
  const valuesKey = state.values
    ? `${state.success}-${state.values.submissionLockEnabled ?? ""}`
    : undefined;
  const checkboxRenderKey =
    valuesKey ?? `initial-${cycle?.id ?? "new"}-${Boolean(cycle?.submissionLockEnabled)}`;
  if (valuesKey !== prevValuesKey) {
    setPrevValuesKey(valuesKey);
    if (state.values) {
      // "on" only when the user submitted with the box checked. Anything else
      // (undefined / empty) means the user submitted unchecked — honour that.
      const submittedLockEnabled = state.values.submissionLockEnabled === "on";
      setSubmissionLockEnabled(submittedLockEnabled);
      if (state.success && !submittedLockEnabled) {
        setPersistedLockEffective(false);
      }
    }
  }
  const needsUnlockConfirmation =
    isEditing && persistedLockEffective && !submissionLockEnabled;

  useEffect(() => {
    if (state.success && !isEditing) formRef.current?.reset();
  }, [isEditing, state.success]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const status = formRef.current?.elements.namedItem("status");
        if (status instanceof HTMLSelectElement) setLastStatus(status.value);
        if (needsUnlockConfirmation && !unlockSubmitConfirmedRef.current) {
          event.preventDefault();
          return;
        }
        unlockSubmitConfirmedRef.current = false;
      }}
    >
      {cycle && <input type="hidden" name="cycleId" value={cycle.id} />}
      <FormMessage state={state} />
      {state.success && !isEditing && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground"
        >
          <p className="font-medium">Next steps</p>
          {lastStatus === "draft" ? (
            <p className="mt-1 text-foreground/90">
              The cycle is in <span className="font-semibold">Draft</span>. Edit it to{" "}
              <span className="font-semibold">Active</span> in the Review cycles list before managers can use it.
            </p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <li>
              <Link className="font-medium text-primary underline-offset-2 hover:underline" href="/performance?view=goals#goal-form">
                Set a goal for this cycle
              </Link>
            </li>
            <li>
              <Link
                className="font-medium text-primary underline-offset-2 hover:underline"
                href="/performance?view=appraisals#manager-appraisals"
              >
                Open the review queue
              </Link>
            </li>
            <li>
              <Link className="font-medium text-primary underline-offset-2 hover:underline" href="/performance?view=cycles#review-cycles">
                View all cycles
              </Link>
            </li>
          </ul>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField id="cycle-title" name="title" label="Cycle title" defaultValue={state.values?.title ?? cycle?.title ?? ""} maxLength={120} required error={state.fieldErrors?.title?.[0]} />
        <SelectField id="cycle-status" name="status" label="Status" defaultValue={state.values?.status ?? cycle?.status ?? "draft"} required>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </SelectField>
        <TextField id="cycle-start" name="startDate" label="Start date" type="date" defaultValue={state.values?.startDate ?? cycle?.startDate ?? ""} required error={state.fieldErrors?.startDate?.[0]} />
        <TextField id="cycle-end" name="endDate" label="End date" type="date" defaultValue={state.values?.endDate ?? cycle?.endDate ?? ""} required error={state.fieldErrors?.endDate?.[0]} />
        <TextField id="cycle-due" name="dueDate" label="Due date" type="date" defaultValue={state.values?.dueDate ?? cycle?.dueDate ?? ""} error={state.fieldErrors?.dueDate?.[0]} optional />
        <TextField id="cycle-submission-deadline" name="submissionDeadline" label="Submission deadline" type="date" defaultValue={state.values?.submissionDeadline ?? cycle?.submissionDeadline ?? ""} error={state.fieldErrors?.submissionDeadline?.[0]} optional />
        <div className="space-y-1.5">
          <label htmlFor="cycle-submission-lock" className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              key={checkboxRenderKey}
              id="cycle-submission-lock"
              type="checkbox"
              name="submissionLockEnabled"
              checked={submissionLockEnabled}
              onChange={(event) => setSubmissionLockEnabled(event.target.checked)}
              className="size-4 rounded border-input text-primary focus:ring-ring"
            />
            Hard-lock after deadline
          </label>
          <p className="text-xs text-muted-foreground">
            When enabled, authored changes lock after the deadline. Employees can still acknowledge submitted appraisals.
          </p>
          {needsUnlockConfirmation && (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                Disabling this hard-lock immediately allows goal, appraisal, and self-review authored changes again.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSubmissionLockEnabled(true)}
                >
                  Keep hard-lock
                </Button>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  className="border-amber-400 text-amber-900 hover:bg-amber-100"
                  onClick={() => {
                    unlockSubmitConfirmedRef.current = true;
                  }}
                >
                  {pending ? "Saving..." : "Unlock and save"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <TextArea id="cycle-description" name="description" label="Description" defaultValue={state.values?.description ?? cycle?.description ?? ""} maxLength={600} error={state.fieldErrors?.description?.[0]} optional />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={pending || needsUnlockConfirmation}>
          {pending ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save cycle" : "Create cycle"}
        </Button>
        <InlineSaveStatus state={state} />
      </div>
    </form>
  );
}

export function GoalForm({
  employees,
  cycles,
  allCycles,
  goals,
  selectedGoalId,
  businessTimeZone,
}: {
  employees: EmployeeOption[];
  cycles: PerformanceCycle[];
  allCycles?: PerformanceCycle[];
  goals: PerformanceGoal[];
  selectedGoalId?: string;
  businessTimeZone: string;
}) {
  const [state, action, pending] = useActionState(savePerformanceGoal, initial);
  const selectedGoal = useMemo(
    () => goals.find((goal) => goal.id === selectedGoalId) ?? null,
    [goals, selectedGoalId],
  );
  const [draft, setDraft] = useState(() => goalToDraft(selectedGoal));
  const [messageDismissed, setMessageDismissed] = useState(false);
  // Key off the useActionState object identity (fresh per dispatch), not
  // state.success: two new goals created back-to-back return success === true
  // twice, so a boolean diff can't fire the second time and the form wouldn't
  // reset. Mirrors SelfReviewForm / PublicHolidayRow.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    setMessageDismissed(false);
    if (state.success && !draft.goalId) {
      // cycleId stays visible because the cycle picker is uncontrolled (defaultValue)
      // and its key ("goal-cycle-new") doesn't change, so React preserves internal state.
      setDraft((d) => ({ ...emptyGoalDraft, cycleId: d.cycleId }));
    }
  }
  const currentGoal = useMemo(
    () => goals.find((goal) => goal.id === draft.goalId) ?? null,
    [goals, draft.goalId],
  );
  const isLocked = Boolean(currentGoal?.goalDefinitionSubmittedAt);
  const [prevLocked, setPrevLocked] = useState(isLocked);
  if (isLocked !== prevLocked) {
    setPrevLocked(isLocked);
    if (!state.success) setMessageDismissed(true);
  }
  // Lock lookup uses the full cycle list (incl. closed) so a goal on a
  // closed-but-deadline-locked cycle still surfaces the amber badge instead
  // of letting the user click Edit and discovering the lock at server-deny
  // time. Picker options below stay scoped to active cycles.
  const cyclesForLockLookup = allCycles ?? cycles;
  const currentCycle = useMemo(
    () => cyclesForLockLookup.find((cycle) => cycle.id === currentGoal?.cycleId) ?? null,
    [cyclesForLockLookup, currentGoal?.cycleId],
  );
  const deadlineLocked = currentCycle ? isCycleDeadlineLocked(currentCycle, businessTimeZone) : false;

  if (employees.length === 0) {
    return <EmptyFormState title="No employees in scope" text="There are no employees available for goal assignment." />;
  }

  return (
    <div className="space-y-3">
      <SelectField
        id="goal-id"
        name="goalIdPicker"
        label="Existing goal"
        value={draft.goalId}
        onChange={(event) => {
          const goal = goals.find((item) => item.id === event.target.value) ?? null;
          setDraft(goalToDraft(goal));
          setMessageDismissed(true);
        }}
      >
        <option value="">Create new goal</option>
        {goals.map((goal) => (
          <option key={goal.id} value={goal.id}>
            {goal.employeeName} - {goal.title}
          </option>
        ))}
      </SelectField>

      {/* Errors show as a banner here; success shows inline next to the button. */}
      {!state.success && <FormMessage state={state} />}

      {isLocked && !messageDismissed && state.success && state.message && (
        <InlineSaveStatus state={state} />
      )}

      {isLocked && currentGoal ? (
        <LockedGoalSummary goal={currentGoal} deadlineLocked={deadlineLocked} submissionDeadline={currentCycle?.submissionDeadline ?? null} />
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="goalId" value={draft.goalId} />
          <div className="grid gap-3 md:grid-cols-2">
            {draft.goalId && <input type="hidden" name="employeeId" value={draft.employeeId} />}
            <SearchableSelectField
              key={`goal-employee-${draft.goalId || "new"}`}
              id="goal-employee"
              name="employeeId"
              label="Employee"
              options={employees.map((employee) => ({ value: employee.id, label: employee.label }))}
              defaultValue={draft.employeeId}
              disabled={Boolean(draft.goalId)}
              emptyLabel="Select employee"
              error={state.fieldErrors?.employeeId?.[0]}
              required
            />
            <SearchableSelectField
              key={`goal-cycle-${draft.goalId || "new"}`}
              id="goal-cycle"
              name="goalCycleId"
              label="Review cycle"
              options={cycles.map((cycle) => ({ value: cycle.id, label: cycle.title }))}
              defaultValue={state.values?.goalCycleId ?? draft.cycleId}
              emptyLabel="Select review cycle"
              error={state.fieldErrors?.cycleId?.[0]}
              required
            />
            <TextField
              id="goal-due"
              name="dueDate"
              label="Due date"
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              optional
            />
            <div className="md:col-span-2">
              <TextField
                id="goal-title"
                name="title"
                label="Goal title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                maxLength={160}
                required
                error={state.fieldErrors?.title?.[0]}
              />
            </div>
            <SelectField
              id="goal-status"
              name="status"
              label="Status"
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
              required
            >
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </SelectField>
            <TextField
              id="goal-progress"
              name="progress"
              label="Progress"
              type="number"
              value={draft.progress}
              min={0}
              max={100}
              required
              onChange={(event) => setDraft((current) => ({ ...current, progress: event.target.value }))}
              error={state.fieldErrors?.progress?.[0]}
            />
            <div className="md:col-span-2">
              <TextArea
                id="goal-description"
                name="description"
                label="Description"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                maxLength={800}
                optional
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="submit" name="intent" value="submit" size="sm" disabled={pending}>
              {pending ? "Submitting..." : draft.goalId ? "Re-submit" : "Submit"}
            </Button>
            {!messageDismissed && <InlineSaveStatus state={state} />}
          </div>
        </form>
      )}
    </div>
  );
}

function LockedGoalSummary({
  goal,
  deadlineLocked = false,
  submissionDeadline = null,
}: {
  goal: PerformanceGoal;
  deadlineLocked?: boolean;
  submissionDeadline?: string | null;
}) {
  return (
    <div className="space-y-3 rounded-md border border-t-[2px] border-t-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Submitted
        </span>
        {deadlineLocked && <DeadlineLockedBadge deadline={submissionDeadline} />}
        {goal.goalDefinitionSubmittedAt && (
          <span className="text-xs text-muted-foreground">
            on {new Date(goal.goalDefinitionSubmittedAt).toLocaleString()}
            {goal.goalDefinitionSubmittedByName ? ` by ${goal.goalDefinitionSubmittedByName}` : ""}
          </span>
        )}
      </div>
      <dl className="grid gap-3 md:grid-cols-2">
        <SummaryRow label="Employee" value={normalizeUnknown(goal.employeeName)} />
        <SummaryRow label="Review cycle" value={normalizeUnknown(goal.cycleTitle ?? "—")} />
        <SummaryRow label="Due date" value={goal.dueDate ?? "—"} />
        <SummaryRow label="Status" value={formatEnum(goal.status) ?? goal.status} />
        <SummaryRow label="Progress" value={`${goal.progress}%`} />
        <div className="md:col-span-2">
          <SummaryRow label="Title" value={goal.title} />
        </div>
        <div className="md:col-span-2">
          <SummaryParagraph label="Description" value={goal.description} />
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Employee progress and notes can still be updated on the goal row.
      </p>
      {!deadlineLocked && <ReopenGoalForm goalId={goal.id} />}
    </div>
  );
}

function ReopenGoalForm({ goalId }: { goalId: string }) {
  const [state, action, pending] = useActionState(reopenGoalDefinition, initial);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="goalId" value={goalId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Re-opening..." : "Edit"}
      </Button>
      <InlineSaveStatus state={state} />
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function SummaryParagraph({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{value && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}

// DAL returns the literal string "Unknown" / "Unknown cycle" when a profile
// or cycle lookup misses (see hydrateGoals / hydrateReviews in
// src/server/dal/performance.ts). Rendering verbatim would read as if it
// were a real name — collapse to the em-dash used for empty optional fields.
function normalizeUnknown(value: string): string {
  return value === "Unknown" || value === "Unknown cycle" ? "—" : value;
}

const emptyGoalDraft = {
  goalId: "",
  employeeId: "",
  cycleId: "",
  dueDate: "",
  title: "",
  status: "not_started",
  progress: "0",
  description: "",
};

function goalToDraft(goal: PerformanceGoal | null) {
  if (!goal) return emptyGoalDraft;

  return {
    goalId: goal.id,
    employeeId: goal.employeeId,
    cycleId: goal.cycleId ?? "",
    dueDate: goal.dueDate ?? "",
    title: goal.title,
    status: goal.status,
    progress: String(goal.progress),
    description: goal.description ?? "",
  };
}

export function EmployeeGoalProgressForm({ goal }: { goal: PerformanceGoal }) {
  const [state, action, pending] = useActionState(updateOwnGoalProgress, initial);
  const router = useRouter();
  // Refresh on success so the goal row's progress badge reflects DB truth (action
  // doesn't revalidatePath — see SelfReviewForm). State object as dep → fires per submit.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="goalId" value={goal.id} />
      <FormMessage state={state} />
      <TextArea
        id={`goal-progress-note-${goal.id}`}
        name="employeeProgressNote"
        label="Progress note"
        defaultValue={state.values?.employeeProgressNote ?? goal.employeeProgressNote ?? ""}
        maxLength={1200}
        error={state.fieldErrors?.employeeProgressNote?.[0]}
        optional
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-24">
          <TextField
            id={`goal-progress-${goal.id}`}
            name="progress"
            label="Progress"
            type="number"
            defaultValue={state.values?.progress ?? String(goal.progress)}
            min={0}
            max={100}
            required
            error={state.fieldErrors?.progress?.[0]}
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 pb-2 pt-2 text-sm font-medium text-foreground transition hover:bg-muted/40 has-[:checked]:border-primary/30 has-[:checked]:bg-primary/5 has-[:checked]:text-primary">
          <input
            type="checkbox"
            name="markComplete"
            defaultChecked={goal.status === "completed"}
            className="size-4 rounded border-input accent-primary focus:ring-ring"
          />
          Complete
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save progress"}
        </Button>
      </div>
    </form>
  );
}

export function ManagerReviewForm({
  employees,
  cycles,
  selectedEmployeeId,
  selectedCycleId,
  review,
  businessTimeZone,
}: {
  employees: EmployeeOption[];
  cycles: PerformanceCycle[];
  selectedEmployeeId?: string;
  selectedCycleId?: string;
  review?: PerformanceReview | null;
  businessTimeZone: string;
}) {
  const [state, action, pending] = useActionState(submitManagerReview, initial);
  const formRef = useRef<HTMLFormElement>(null);
  // Track the picker's current cycle id so the pre-submit lock badge can
  // surface as soon as the user lands on a deadline-locked cycle, rather
  // than only after the Server Action rejects. Initialised from the
  // ManagerAppraisalWorkspace's selectedCycleId / existing review.
  const [activeCycleId, setActiveCycleId] = useState<string>(
    selectedCycleId ?? review?.cycleId ?? "",
  );

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (employees.length === 0 || cycles.length === 0) {
    return (
      <EmptyFormState
        title="Reviews are not ready"
        text="You need at least one employee in scope and one visible active cycle before submitting appraisals."
      />
    );
  }

  const isLocked =
    review?.status === "manager_submitted" || review?.status === "acknowledged";

  const matchedCycle =
    cycles.find((cycle) => cycle.id === activeCycleId) ?? null;
  const deadlineLocked = matchedCycle ? isCycleDeadlineLocked(matchedCycle, businessTimeZone) : false;
  const submissionDeadline = matchedCycle?.submissionDeadline ?? null;

  if (isLocked && review) {
    // FormMessage survives the lock swap by living outside the form. After a
    // successful submit, the next render hits this branch and the success
    // toast remains visible until the user interacts again.
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <LockedManagerReviewSummary
          review={review}
          deadlineLocked={deadlineLocked}
          submissionDeadline={submissionDeadline}
        />
      </div>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <FormMessage state={state} />
      {deadlineLocked && (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-4">
          <DeadlineLockedBadge deadline={submissionDeadline} />
          <p className="text-sm text-amber-800">
            Submissions for this cycle are locked. Contact an admin to extend the deadline.
          </p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <SearchableSelectField
          id="review-employee"
          name="employeeId"
          label="Employee"
          options={employees.map((employee) => ({ value: employee.id, label: employee.label }))}
          defaultValue={state.values?.employeeId ?? selectedEmployeeId ?? ""}
          emptyLabel="Select employee"
          error={state.fieldErrors?.employeeId?.[0]}
          required
        />
        <SearchableSelectField
          id="review-cycle"
          name="cycleId"
          label="Review cycle"
          options={cycles.map((cycle) => ({ value: cycle.id, label: cycle.title }))}
          defaultValue={state.values?.cycleId ?? selectedCycleId ?? ""}
          emptyLabel="Select cycle"
          error={state.fieldErrors?.cycleId?.[0]}
          onValueChange={setActiveCycleId}
          required
        />
        <SelectField id="review-score" name="score" label="Score" defaultValue={state.values?.score ?? review?.score?.toString() ?? ""} required error={state.fieldErrors?.score?.[0]}>
          <option value="" disabled>Select score</option>
          <option value="1">1 - Needs significant improvement</option>
          <option value="2">2 - Partially meets expectations</option>
          <option value="3">3 - Meets expectations</option>
          <option value="4">4 - Exceeds expectations</option>
          <option value="5">5 - Outstanding</option>
        </SelectField>
      </div>
      <TextArea id="review-strengths" name="managerStrengths" label="Strengths" defaultValue={state.values?.managerStrengths ?? review?.managerStrengths ?? ""} maxLength={1200} required error={state.fieldErrors?.managerStrengths?.[0]} />
      <TextArea id="review-improvements" name="managerImprovements" label="Improvement areas" defaultValue={state.values?.managerImprovements ?? review?.managerImprovements ?? ""} maxLength={1200} required error={state.fieldErrors?.managerImprovements?.[0]} />
      <TextArea id="review-next" name="managerNextSteps" label="Next steps" defaultValue={state.values?.managerNextSteps ?? review?.managerNextSteps ?? ""} maxLength={1200} required error={state.fieldErrors?.managerNextSteps?.[0]} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" name="intent" value="draft" size="sm" variant="outline" disabled={pending || deadlineLocked}>
          {pending ? "Saving..." : "Save draft"}
        </Button>
        <Button type="submit" name="intent" value="submit" size="sm" disabled={pending || deadlineLocked}>
          {pending ? "Submitting..." : "Submit appraisal"}
        </Button>
        <InlineSaveStatus state={state} />
      </div>
    </form>
  );
}

function LockedManagerReviewSummary({
  review,
  deadlineLocked = false,
  submissionDeadline = null,
}: {
  review: PerformanceReview;
  deadlineLocked?: boolean;
  submissionDeadline?: string | null;
}) {
  const isAcknowledged = review.status === "acknowledged";
  const canReopen = review.status === "manager_submitted" && !deadlineLocked;
  return (
    <div className="space-y-3 rounded-md border border-t-[2px] border-t-primary/40 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            isAcknowledged
              ? "inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700"
              : "inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary"
          }
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          {isAcknowledged ? "Acknowledged" : "Submitted"}
        </span>
        {deadlineLocked && <DeadlineLockedBadge deadline={submissionDeadline} />}
        {review.submittedAt && (
          <span className="text-xs text-muted-foreground">
            Submitted {new Date(review.submittedAt).toLocaleString()}
          </span>
        )}
        {isAcknowledged && review.acknowledgedAt && (
          <span className="text-xs text-muted-foreground">
            · Acknowledged {new Date(review.acknowledgedAt).toLocaleString()}
          </span>
        )}
      </div>
      {review.score != null && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-bold text-amber-800">
            <Star className="h-3.5 w-3.5 fill-amber-500 stroke-amber-500" aria-hidden="true" />
            Score {review.score}/5
          </span>
        </div>
      )}
      <dl className="grid gap-3 md:grid-cols-2">
        <SummaryRow label="Employee" value={normalizeUnknown(review.employeeName)} />
        <SummaryRow label="Review cycle" value={normalizeUnknown(review.cycleTitle)} />
      </dl>
      <SummaryParagraph label="Strengths" value={review.managerStrengths} />
      <SummaryParagraph label="Improvement areas" value={review.managerImprovements} />
      <SummaryParagraph label="Next steps" value={review.managerNextSteps} />
      {canReopen ? (
        <ReopenManagerReviewFormButton reviewId={review.id} />
      ) : isAcknowledged ? (
        <p className="text-xs text-muted-foreground">
          Acknowledged appraisals are final and cannot be re-opened.
        </p>
      ) : null}
    </div>
  );
}

function ReopenManagerReviewFormButton({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = useActionState(reopenManagerReview, initial);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="reviewId" value={reviewId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Re-opening..." : "Edit"}
      </Button>
      <InlineSaveStatus state={state} />
    </form>
  );
}

export function ManagerAppraisalWorkspace({
  employee,
  cycle,
  review,
  goals,
  businessTimeZone,
}: {
  employee: EmployeeOption | null;
  cycle: PerformanceCycle | null;
  review: PerformanceReview | null;
  goals: PerformanceGoal[];
  businessTimeZone: string;
}) {
  if (!employee || !cycle) {
    return (
      <EmptyFormState
        title="Select a cycle and person"
        text="Choose a review cycle, then select a direct report to open the appraisal workspace."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
      <section className="space-y-4 rounded-md border bg-muted/40 p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">{formatEnum(review?.status) ?? "Not started"}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-normal text-foreground">{employee.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{cycle.title}</p>
        </div>

        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Employee self-review</p>
          {review?.selfReview ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{review.selfReview}</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No self-review has been submitted for this cycle.</p>
          )}
        </div>

        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Cycle goals</p>
          {goals.length > 0 ? (
            <ul className="mt-2 space-y-3">
              {goals.map((goal) => (
                <li key={goal.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-sm font-medium text-foreground">{goal.title}</p>
                    <span className="text-xs font-medium text-muted-foreground">{goal.progress}%</span>
                  </div>
                  {goal.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{goal.description}</p>
                  )}
                  {goal.employeeProgressNote && (
                    <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                      {goal.employeeProgressNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No goals are linked to this person for the selected cycle.</p>
          )}
        </div>
      </section>

      <section className="rounded-md border bg-card p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Manager appraisal</p>
            <h3 className="mt-1 text-base font-semibold tracking-normal text-foreground">Rating and feedback</h3>
          </div>
          <span className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
            {formatEnum(review?.status) ?? "Not started"}
          </span>
        </div>
        <ManagerReviewForm
          employees={[employee]}
          cycles={[cycle]}
          selectedEmployeeId={employee.id}
          selectedCycleId={cycle.id}
          review={review}
          businessTimeZone={businessTimeZone}
        />
      </section>
    </div>
  );
}

export function SelfReviewForm({
  review,
  deadlineLocked = false,
  submissionDeadline = null,
}: {
  review: PerformanceReview;
  deadlineLocked?: boolean;
  submissionDeadline?: string | null;
}) {
  const [state, action, pending] = useActionState(submitSelfReview, initial);
  const router = useRouter();
  // Refresh the route on each successful submit so the read-only summary (and the
  // rest of the page) picks up fresh server props. The action itself does NOT
  // revalidatePath — doing so in-response wedges this hook's pending transition on
  // the heavy /performance tree. Keyed off the state OBJECT (fresh per dispatch), not
  // state.success, so it fires on consecutive resubmits too. See handover Session 173.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);
  const isSubmitted =
    review.status === "self_reviewed" ||
    review.status === "manager_submitted" ||
    review.status === "acknowledged";
  // state.success covers the just-submitted case: revalidation is deferred
  // (after()) so the `review` prop stays stale until the next navigation, but a
  // successful self-review submit means the row is now self_reviewed — so the
  // Edit/reopen control must be available immediately off state.success too.
  const canReopen = (review.status === "self_reviewed" || state.success) && !deadlineLocked;
  const [editing, setEditing] = useState(!isSubmitted && !deadlineLocked);

  // After a successful save, flip back to the read-only summary so the user
  // sees the locked state. Key off the useActionState object identity (which is
  // a fresh object per dispatch) rather than state.success: a resubmit (Edit →
  // Save again) returns success === true twice in a row, so a boolean diff can't
  // fire the second time and the form would stay stuck editable. Setting state
  // during render (vs in an effect) lets React discard the in-progress render
  // and re-render immediately — avoids the react-hooks/set-state-in-effect
  // warning. Same pattern as PublicHolidayRow (public-holidays-admin-panel.tsx).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setEditing(false);
  }

  // editing folds isSubmitted + deadlineLocked via useState(!isSubmitted && !deadlineLocked),
  // plus state.success (race window between action return and server prop update).
  if (!editing) {
    const lockedLabel =
      review.status === "acknowledged" ? "Closed (acknowledged)"
      : review.status === "manager_submitted" ? "Closed (manager submitted)"
      : review.status === "self_reviewed" || state.success ? "Submitted"
      : "Pending self-review";
    return (
      <div className="space-y-2">
        {/* FormMessage survives the lock swap by living outside the form, so
            the "Self-review saved." toast remains visible after submit. */}
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">
            {lockedLabel}
          </span>
          {deadlineLocked && <DeadlineLockedBadge deadline={submissionDeadline} />}
        </div>
        {canReopen ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : deadlineLocked ? (
          <p className="text-xs text-muted-foreground">
            Submission deadline has passed. Contact an admin to extend.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Self-review is closed after manager submission.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reviewId" value={review.id} />
      <FormMessage state={state} />
      <TextArea
        id={`self-review-${review.id}`}
        name="selfReview"
        label="Self-review comment"
        defaultValue={state.values?.selfReview ?? review.selfReview ?? ""}
        maxLength={1200}
        required
        error={state.fieldErrors?.selfReview?.[0]}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Save self-review"}
        </Button>
        {canReopen && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
            Discard changes
          </Button>
        )}
      </div>
    </form>
  );
}

export function AcknowledgeReviewForm({ reviewId }: { reviewId: string }) {
  const [state, action, pending] = useActionState(acknowledgeReview, initial);
  const router = useRouter();
  // Refresh on success so the review swaps to its acknowledged summary (action
  // doesn't revalidatePath — see SelfReviewForm). State object as dep → fires per submit.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <FormMessage state={state} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Acknowledging..." : "Acknowledge review"}
        </Button>
        <InlineSaveStatus state={state} />
      </div>
    </form>
  );
}

function FormMessage({ state }: { state: PerformanceActionState }) {
  if (!state.message) return null;

  return (
    <p
      role={state.success ? "status" : "alert"}
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-sm ${
        state.success
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      }`}
    >
      {state.message}
    </p>
  );
}

// C2 (phase 13 batch 8): inline save feedback shown next to the submit
// button so users don't have to scroll to the top of the form. The
// existing FormMessage banner stays at the top of the form as a
// secondary anchor.
function InlineSaveStatus({ state }: { state: PerformanceActionState }) {
  if (!state.message) return null;
  return (
    <span
      role={state.success ? "status" : "alert"}
      aria-live={state.success ? "polite" : "assertive"}
      className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
    >
      {state.message}
    </span>
  );
}

function EmptyFormState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
