import { expect, test } from "@playwright/test";
import { expectDenyAudit, nowIso } from "./forge";
import {
  createPerformanceCycle,
  createPerformanceGoal,
  createPerformanceReview,
  expectAudit,
  ids,
  supabaseAdmin,
  uniqueName,
} from "./helpers";

// Manager: can reach most routes; blocked from audit-logs and payroll.
// Seed: manager is Morgan Manager; direct report is Alice Employee (not Bob).

// Per-test cleanup registry. Tests that insert a `leave_types` row push its
// id onto `createdLeaveTypeIds`; `test.afterEach` drains the registry and
// removes the leave_type plus any rows that reference it (leave_balances,
// leave_requests). This keeps the dropdown clean for manual review without
// depending on the offline `npm run cleanup:e2e-data` script.
// Workers run tests sequentially, so module-scoped state is per-worker safe.
let createdLeaveTypeIds: string[] = [];

test.beforeEach(() => {
  createdLeaveTypeIds = [];
});

test.afterEach(async () => {
  if (createdLeaveTypeIds.length === 0) return;
  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .in("leave_type_id", createdLeaveTypeIds);
  await supabaseAdmin
    .from("leave_balances")
    .delete()
    .in("leave_type_id", createdLeaveTypeIds);
  await supabaseAdmin
    .from("leave_types")
    .delete()
    .in("id", createdLeaveTypeIds);
  createdLeaveTypeIds = [];
});

test("manager reaches dashboard with manager metrics", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Direct reports", { exact: true })).toBeVisible();
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Pending approvals", { exact: true })).toBeVisible();
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Team out this week", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Action items", exact: true })).toBeVisible();
  // Recent updates panel — parity with employee/admin dashboards.
  await expect(
    page.getByRole("heading", { name: "Recent updates", exact: true }),
  ).toBeVisible();
});

test("manager is denied audit logs", async ({ page }) => {
  await page.goto("/audit-logs");
  // B4: URL preserved, Access Denied rendered in place via error boundary.
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("manager sees own + direct-report payroll summaries on /payroll", async ({ page }) => {
  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "Payroll" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My compensation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Direct reports" })).toBeVisible();
  // Bank/tax/national-id columns must not appear anywhere on the manager view.
  await expect(page.getByText(/bank account/i)).toHaveCount(0);
  await expect(page.getByText(/tax id/i)).toHaveCount(0);
  await expect(page.getByText(/national id/i)).toHaveCount(0);
  // No edit affordance: the admin compensation form is not rendered.
  await expect(page.getByRole("button", { name: "Save compensation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save my details" })).toHaveCount(0);
});

test("manager reaches employees directory", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People Directory" })).toBeVisible();
});

test("manager reaches onboarding", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("manager reaches performance pages", async ({ page }) => {
  await page.goto("/performance");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Appraisals" })).toHaveAttribute("data-state", "active");

  await page.goto("/performance/reviews");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("manager reaches leave", async ({ page }) => {
  await page.goto("/leave");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("manager leave out-this-week row filters to the selected employee", async ({ page }) => {
  const employeeNote = uniqueName("Manager out this week drilldown");
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const date = start.toISOString().slice(0, 10);

  const { data: localLeave, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(leaveTypeError).toBeNull();

  // Precondition: remove any existing Alice leave row whose date range
  // overlaps the test's target single day. Without this, a stale row from
  // a prior Playwright run can trip the leave_requests_no_overlap exclusion
  // constraint (B1 migration 0035) and mask the real test assertion.
  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .eq("employee_id", ids.alice)
    .lte("start_date", date)
    .gte("end_date", date);

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: localLeave?.id,
      start_date: date,
      end_date: date,
      status: "approved",
      approver_id: ids.manager,
      approved_at: new Date().toISOString(),
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();

  try {
    await page.goto("/leave");
    // Scope by the unique request id — parallel tests can leave other Alice
    // approved-leave rows in the same week, which makes the aria-label match
    // multiple rows.
    await page.locator(`a[href*="#leave-request-${request?.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`employeeId=${ids.alice}`));
    await expect(page).toHaveURL(/status=all/);
    await expect(page).toHaveURL(new RegExp(`#leave-request-${request?.id}`));
    const row = page.getByRole("row").filter({ hasText: employeeNote });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: "Alice Employee" })).toHaveAttribute(
      "href",
      `/employees/${ids.alice}`,
    );
  } finally {
    if (request?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", request.id);
    }
  }
});

test("manager sees direct report in employee directory", async ({ page }) => {
  await page.goto("/employees");
  await expect(page.getByText("Alice Employee")).toBeVisible();
});

test("manager onboarding progress rows reveal the matching task", async ({ page }) => {
  const taskTitle = uniqueName("Manager Clickable Onboarding Task");
  const { data: task, error: taskError } = await supabaseAdmin
    .from("onboarding_tasks")
    .insert({
      employee_id: ids.alice,
      assignee_id: ids.alice,
      title: taskTitle,
      status: "pending",
      created_by: ids.manager,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(taskError).toBeNull();

  try {
    await page.goto("/onboarding");
    const allTasks = page.locator("#all-tasks");
    await expect(allTasks).not.toHaveAttribute("open", "");
    await expect(page.getByText(taskTitle)).toBeHidden();

    const progress = page.locator("section").filter({ hasText: "Progress overview" });
    await progress.getByRole("link", { name: "Alice Employee" }).click();
    await expect(allTasks).toHaveAttribute("open", "");
    await expect(page.locator(`#onboarding-task-${task?.id}`)).toBeVisible();
  } finally {
    if (task?.id) {
      await supabaseAdmin.from("onboarding_tasks").delete().eq("id", task.id);
    }
  }
});

test("manager does not see leave-admin as gated route", async ({ page }) => {
  // /leave/admin is admin-only — manager should be denied
  await page.goto("/leave/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("manager creates direct-report goal and submits appraisal", async ({ page }) => {
  const cycleTitle = uniqueName("Manager Cycle");
  const managerGoalTitle = uniqueName("Manager Goal");
  const cycleId = await createPerformanceCycle(cycleTitle);

  await page.goto("/performance");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.locator("#goal-form summary").click();
  await page.locator("#goal-employee").fill("Alice Employee");
  await page.locator("#goal-employee").blur();
  await page.locator("#goal-cycle").fill(cycleTitle);
  await page.locator("#goal-cycle").blur();
  await page.locator("#goal-title").fill(managerGoalTitle);
  await page.locator("#goal-status").selectOption("in_progress");
  await page.locator("#goal-progress").fill("45");
  await expect(page.locator("#goal-employee")).toHaveValue("Alice Employee");
  await expect(page.locator("#goal-title")).toHaveValue(managerGoalTitle);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Goal created and submitted.").first()).toBeVisible({ timeout: 10_000 });

  const { data: goal } = await supabaseAdmin
    .from("performance_goals")
    .select("id, employee_id")
    .eq("title", managerGoalTitle)
    .single();
  expect(goal?.employee_id).toBe(ids.alice);
  await expectAudit("performance.goal_created", goal?.id as string);

  await page.goto("/performance");
  await page.getByRole("tab", { name: "Goals" }).click();
  const cycleGroup = page.locator("#performance-goals details").filter({ hasText: cycleTitle });
  await expect(cycleGroup).toBeAttached();
  await cycleGroup.locator("summary").click();
  await expect(cycleGroup.getByRole("link", { name: "Alice Employee" })).toHaveAttribute(
    "href",
    `/employees/${ids.alice}`,
  );

  await page.goto("/performance/reviews");
  await page.locator("#review-employee").fill("Alice Employee");
  await page.locator("#review-employee").blur();
  await page.locator("#review-cycle").fill(cycleTitle);
  await page.locator("#review-cycle").blur();
  await page.locator("#review-score").selectOption("3");
  await page.locator("#review-strengths").fill("Consistent delivery and clear communication.");
  await page.locator("#review-improvements").fill("Continue sharpening planning.");
  await page.locator("#review-next").fill("Own the next milestone.");
  await page.getByRole("button", { name: "Submit appraisal" }).click();
  await expect(page.getByText("Manager appraisal submitted.").first()).toBeVisible();

  const { data: review } = await supabaseAdmin
    .from("performance_reviews")
    .select("id, employee_id, score")
    .eq("employee_id", ids.alice)
    .eq("cycle_id", cycleId)
    .single();
  expect(review?.score).toBe(3);
  await expectAudit("performance.review_manager_submitted", review?.id as string);
});

test("manager reviews a cycle, saves an appraisal draft, then submits it", async ({ page }) => {
  const cycleTitle = uniqueName("Manager Workspace Cycle");
  const goalTitle = uniqueName("Workspace Goal");
  const selfReview = uniqueName("Workspace self-review");
  const cycleId = await createPerformanceCycle(cycleTitle);
  await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: goalTitle,
  });
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId,
    status: "self_reviewed",
  });
  await supabaseAdmin
    .from("performance_reviews")
    .update({ self_review: selfReview, updated_by: ids.alice })
    .eq("id", reviewId);

  await page.goto(`/performance?view=appraisals&reviewCycleId=${cycleId}#manager-appraisals`);
  const queue = page.locator("#manager-appraisals");
  await expect(queue.getByRole("link", { name: new RegExp(cycleTitle) })).toBeVisible();
  // Scope to the employee-row link by href — the panel also renders a
  // sibling cycle-picker row of links above, so a name-based match could
  // pick the wrong anchor on parallel runs.
  await queue.locator(`a[href*="reviewEmployeeId=${ids.alice}"]`).click();
  await expect(page).toHaveURL(new RegExp(`reviewEmployeeId=${ids.alice}`));

  const workspace = page.locator("#manager-appraisal-workspace");
  await expect(workspace.getByText(selfReview)).toBeVisible();
  await expect(workspace.getByText(goalTitle)).toBeVisible();

  await workspace.locator("#review-score").selectOption("4");
  await workspace.locator("#review-strengths").fill("Clear delivery and strong collaboration.");
  await workspace.locator("#review-improvements").fill("Keep sharpening prioritization.");
  await workspace.locator("#review-next").fill("Lead the next planning milestone.");
  await workspace.getByRole("button", { name: "Save draft" }).click();
  await expect(workspace.getByText("Manager appraisal draft saved.").first()).toBeVisible();

  const { data: draft } = await supabaseAdmin
    .from("performance_reviews")
    .select("status, score, submitted_at")
    .eq("id", reviewId)
    .single();
  expect(draft?.status).toBe("self_reviewed");
  expect(draft?.score).toBe(4);
  expect(draft?.submitted_at).toBeNull();
  await expectAudit("performance.review_manager_draft_saved", reviewId);

  await workspace.locator("#review-score").selectOption("4");
  await workspace.locator("#review-strengths").fill("Clear delivery and strong collaboration.");
  await workspace.locator("#review-improvements").fill("Keep sharpening prioritization.");
  await workspace.locator("#review-next").fill("Lead the next planning milestone.");
  await workspace.getByRole("button", { name: "Submit appraisal" }).click();
  await expect(workspace.getByText("Manager appraisal submitted.").first()).toBeVisible();

  const { data: submitted } = await supabaseAdmin
    .from("performance_reviews")
    .select("status, score, submitted_at")
    .eq("id", reviewId)
    .single();
  expect(submitted?.status).toBe("manager_submitted");
  expect(submitted?.score).toBe(4);
  expect(submitted?.submitted_at).toBeTruthy();
  await expectAudit("performance.review_manager_submitted", reviewId);
});

test("manager can edit a direct-report goal from the goals table", async ({ page }) => {
  const cycleTitle = uniqueName("Manager Edit Goal Cycle");
  const goalTitle = uniqueName("Manager Editable Goal");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const goalId = await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: goalTitle,
  });

  await page.goto("/performance");
  await page.getByRole("tab", { name: "Goals" }).click();
  const cycleGroup = page.locator("#performance-goals details").filter({ hasText: cycleTitle });
  await cycleGroup.locator("summary").click();
  await expect(cycleGroup.getByText(goalTitle)).toBeVisible();
  await cycleGroup.getByRole("link", { name: "Edit" }).click();

  await expect(page).toHaveURL(new RegExp(`goalId=${goalId}`));
  await expect(page.locator("#goal-id")).toHaveValue(goalId);
  await expect(page.locator("#goal-employee")).toHaveValue("Alice Employee");
  await expect(page.locator("#goal-employee")).toBeDisabled();
  await expect(page.locator("#goal-cycle")).toHaveValue(cycleTitle);
  await expect(page.locator("#goal-title")).toHaveValue(goalTitle);
  await expect(page.locator("#goal-progress")).toHaveValue("25");

  await page.locator("#goal-status").selectOption("completed");
  await page.locator("#goal-progress").fill("100");
  await page.locator("#goal-description").fill("Completed during manager review.");
  await page.getByRole("button", { name: "Re-submit" }).click();
  await expect(page.getByText("Goal submitted and locked.").first()).toBeVisible({ timeout: 10_000 });

  const { data: goal } = await supabaseAdmin
    .from("performance_goals")
    .select("status, progress, description")
    .eq("id", goalId)
    .single();
  expect(goal?.status).toBe("completed");
  expect(goal?.progress).toBe(100);
  expect(goal?.description).toBe("Completed during manager review.");
  await expectAudit("performance.goal_closed", goalId);
});

test("manager cannot reopen an acknowledged performance review", async ({ page }) => {
  const cycleTitle = uniqueName("Acknowledged Review Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    managerId: ids.manager,
    cycleId,
    status: "manager_submitted",
    score: 4,
  });

  const { error: acknowledgeError } = await supabaseAdmin
    .from("performance_reviews")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      self_review: "I read and acknowledged the submitted appraisal.",
      updated_by: ids.alice,
    })
    .eq("id", reviewId);
  expect(acknowledgeError).toBeNull();

  await page.goto("/performance/reviews");
  await page.locator("#review-employee").fill("Alice Employee");
  await page.locator("#review-employee").blur();
  await page.locator("#review-cycle").fill(cycleTitle);
  await page.locator("#review-cycle").blur();
  await page.locator("#review-score").selectOption("2");
  await page.locator("#review-strengths").fill("Attempted edit after acknowledgement.");
  await page.locator("#review-improvements").fill("This should not reopen the review.");
  await page.locator("#review-next").fill("The acknowledged appraisal should stay final.");
  await page.getByRole("button", { name: "Submit appraisal" }).click();
  await expect(page.getByText("Acknowledged reviews cannot be edited.").first()).toBeVisible();

  const { data: review, error } = await supabaseAdmin
    .from("performance_reviews")
    .select("status, score, manager_strengths, updated_by")
    .eq("id", reviewId)
    .single();
  expect(error).toBeNull();
  expect(review?.status).toBe("acknowledged");
  expect(review?.score).toBe(4);
  expect(review?.manager_strengths).toBe("Reliable delivery");
  expect(review?.updated_by).toBe(ids.alice);
});

test("manager submits own leave request", async ({ page }) => {
  const typeName = uniqueName("Manager Own Leave");
  const managerNote = uniqueName("Manager own leave submit note");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify manager self-service leave.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();
  createdLeaveTypeIds.push(leaveType!.id as string);

  // Batch 6 / E2: submitLeaveRequest now requires a balance row for
  // custom leave types (only Local/Sick get auto-seeded from Settings).
  await supabaseAdmin.from("leave_balances").insert({
    employee_id: ids.manager,
    leave_type_id: leaveType!.id,
    balance: 5,
    year: 2026,
    created_by: ids.admin,
    updated_by: ids.admin,
  });

  await page.goto("/leave/new");
  await page.getByLabel("Leave type").selectOption({ label: typeName });
  await page.locator("#startDate").fill("2026-09-07");
  await page.locator("#endDate").fill("2026-09-08");
  await page.locator("#employeeNote").fill(managerNote);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Leave request submitted.")).toBeVisible();

  const { data: request } = await supabaseAdmin
    .from("leave_requests")
    .select("id, employee_id, status")
    .eq("employee_note", managerNote)
    .single();
  expect(request?.employee_id).toBe(ids.manager);
  expect(request?.status).toBe("pending");
  await expectAudit("leave.submitted");
});

test("manager cancels own pending leave request", async ({ page }) => {
  const typeName = uniqueName("Manager Cancel Own Leave");
  const managerNote = uniqueName("Manager own leave cancel note");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify manager self-cancel leave.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();
  createdLeaveTypeIds.push(leaveType!.id as string);

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.manager,
      leave_type_id: leaveType?.id,
      start_date: "2026-10-12",
      end_date: "2026-10-12",
      status: "pending",
      employee_note: managerNote,
      created_by: ids.manager,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: managerNote });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Cancel request" }).click();
  await expect(row).toBeHidden();

  const { data: cancelledRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status")
    .eq("id", request?.id)
    .single();
  expect(cancelledRequest?.status).toBe("cancelled");
  await expectAudit("leave.cancelled", request?.id as string);
});

test("manager approves direct-report leave and balance is decremented", async ({ page }) => {
  const employeeNote = uniqueName("Manager approval note");
  const urgentReason = uniqueName("Manager approval note urgent reason");
  // Use year 2025 so this test never touches the 2026 seed balance that
  // the employee dashboard test asserts against (parallel test isolation).
  const leaveYear = 2025;
  const startingBalance = 20;

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      {
        employee_id: ids.alice,
        leave_type_id: leaveType?.id,
        year: leaveYear,
        balance: startingBalance,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType?.id,
      start_date: "2025-12-14",
      end_date: "2025-12-15",
      status: "pending",
      employee_note: employeeNote,
      is_urgent_local_leave: true,
      urgent_leave_reason: urgentReason,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();
  expect(request?.id).toBeTruthy();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: employeeNote });
  await expect(row).toBeVisible();
  await expect(row.getByText("Urgent Local Leave")).toBeVisible();
  await expect(row.getByText(urgentReason)).toBeVisible();
  // Working-days math (migration 0042): Dec 14 2025 is a Sunday, so the
  // Sun–Mon range counts as 1 working day, not 2 calendar days.
  await expect(row.getByText("Balance context: 2025: 20 days available; 1 working day requested.")).toBeVisible();
  await row.getByLabel("Approver note").fill("Approved by manager scenario test.");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toBeHidden();

  const { data: decidedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id")
    .eq("id", request?.id)
    .single();
  expect(decidedRequest?.status).toBe("approved");
  expect(decidedRequest?.approver_id).toBe(ids.manager);

  const { data: balance } = await supabaseAdmin
    .from("leave_balances")
    .select("balance")
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", leaveYear)
    .single();
  expect(Number(balance?.balance)).toBe(startingBalance - 1);

  const { error: restoreBalanceError } = await supabaseAdmin
    .from("leave_balances")
    .update({ balance: startingBalance, updated_by: ids.admin })
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", leaveYear);
  expect(restoreBalanceError).toBeNull();

  await expectAudit("leave.approved", request?.id as string);
});

test("manager rejection preserves approver note", async ({ page }) => {
  const typeName = uniqueName("Reject Note Leave");
  const employeeNote = uniqueName("Reject note employee request");
  const rejectionNote = uniqueName("Reject note should persist");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify leave rejection notes.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();
  createdLeaveTypeIds.push(leaveType!.id as string);

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType?.id,
      start_date: "2026-12-02",
      end_date: "2026-12-02",
      status: "pending",
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: employeeNote });
  await expect(row).toBeVisible();
  await row.getByLabel("Approver note").fill(rejectionNote);
  await row.getByRole("button", { name: "Reject" }).click();
  await expect(row).toBeHidden();

  const { data: rejectedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id, approver_note")
    .eq("id", request?.id)
    .single();
  expect(rejectedRequest?.status).toBe("rejected");
  expect(rejectedRequest?.approver_id).toBe(ids.manager);
  expect(rejectedRequest?.approver_note).toBe(rejectionNote);
  await expectAudit("leave.rejected", request?.id as string);
});

test("manager cannot transfer a direct-report goal to another employee via crafted form", async ({ page }) => {
  // Defensive precondition: restore Bob's manager_id to its seed value (null).
  // The forge depends on Morgan being out-of-scope for Bob — if a prior test
  // or manual UAT session set Bob.manager_id = Morgan, canManageEmployee
  // returns true for the forged value and the scope error never fires.
  await supabaseAdmin
    .from("employee_records")
    .update({ manager_id: null, updated_by: ids.admin })
    .eq("employee_id", ids.bob);

  const cycleTitle = uniqueName("Goal Transfer Cycle");
  const goalTitle = uniqueName("Goal Transfer Test");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const seededGoalId = await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: goalTitle,
  });

  await page.goto(`/performance?view=goals&goalId=${seededGoalId}#goal-form`);
  await expect(page.locator("#goal-id")).toHaveValue(seededGoalId);
  await expect(page.locator("#goal-title")).toHaveValue(goalTitle);
  await page.locator("#goal-progress").fill("60");

  // Rewrite the submitted hidden employee id, simulating a crafted form that
  // tries to reassign the goal away from Alice. Done LAST — earlier
  // interactions (progress fill) trigger React re-renders that re-apply the
  // controlled `value={draft.employeeId}` and reset DOM back to Alice.
  await page.locator("input[type='hidden'][name='employeeId']").evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, ids.bob);

  const since = nowIso();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("You can only manage goals for employees in your scope.").first()).toBeVisible();

  // Goal must still belong to Alice — employee_id is intentionally dropped from the UPDATE payload.
  const { data: goal } = await supabaseAdmin
    .from("performance_goals")
    .select("employee_id")
    .eq("id", seededGoalId)
    .single();
  expect(goal?.employee_id).toBe(ids.alice);

  // Step 5 — the §6.2 manager-scope deny must also be audited, not just blocked
  // in the UI: savePerformanceGoal writes auth.access_denied with reason
  // goal_outside_scope (performance.ts:421-426).
  await expectDenyAudit({ actorId: ids.manager, reason: "goal_outside_scope", since });
});

test("manager approval fails visibly when balance would go negative", async ({ page }) => {
  const typeName = uniqueName("Insufficient Balance Leave");
  const employeeNote = uniqueName("Insufficient balance approval note");
  const leaveYear = 2025;

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify insufficient-balance approval rejection.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();
  createdLeaveTypeIds.push(leaveType!.id as string);

  const startingBalance = 1;
  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      {
        employee_id: ids.alice,
        leave_type_id: leaveType?.id,
        year: leaveYear,
        balance: startingBalance,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  // 3-day request against a 1-day balance → trigger must reject the approval.
  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType?.id,
      start_date: "2025-11-03",
      end_date: "2025-11-05",
      status: "pending",
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();
  expect(request?.id).toBeTruthy();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: employeeNote });
  await expect(row).toBeVisible();
  // Working-days math (migration 0042): 2025-11-03 → 2025-11-05 is Mon–Wed,
  // no weekends or Mauritius holidays in range, so 3 working days.
  await expect(row.getByText(`Balance context: ${leaveYear}: 1 day available; 3 working days requested.`)).toBeVisible();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByRole("alert")).toContainText(`Insufficient ${leaveYear} ${typeName} balance: 1 day available, 3 days requested.`);
  await expect(row.getByText("pending")).toBeVisible();

  const { data: unchangedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id, approved_at")
    .eq("id", request?.id)
    .single();
  expect(unchangedRequest?.status).toBe("pending");
  expect(unchangedRequest?.approver_id).toBeNull();
  expect(unchangedRequest?.approved_at).toBeNull();

  const { data: balance } = await supabaseAdmin
    .from("leave_balances")
    .select("balance")
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", leaveYear)
    .single();
  expect(Number(balance?.balance)).toBe(startingBalance);
});

test("manager approval splits multi-year leave across yearly balances", async ({ page }) => {
  const typeName = uniqueName("Multi Year Leave");
  const employeeNote = uniqueName("Cross-year approval note");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify multi-year leave balance deductions.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();
  createdLeaveTypeIds.push(leaveType!.id as string);

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .insert([
      {
        employee_id: ids.alice,
        leave_type_id: leaveType?.id,
        year: 2025,
        balance: 5,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      {
        employee_id: ids.alice,
        leave_type_id: leaveType?.id,
        year: 2026,
        balance: 7,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
    ]);
  expect(balanceError).toBeNull();

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType?.id,
      start_date: "2025-12-30",
      end_date: "2026-01-02",
      status: "pending",
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: employeeNote });
  await expect(row).toBeVisible();
  // The request spans 2025-12-30 → 2026-01-02. Working-days math (migration
  // 0042): 2025 = Tue+Wed = 2 working days; 2026 = Thu+Fri but both are
  // seeded Mauritius public holidays (New Year's Day + New Year's Holiday)
  // so 0 working days. Total deducted = 2.
  await expect(
    row.getByText(
      "Balance context: 2025: 5 days available; 2 working days requested; 2026: 7 days available; 0 working days requested.",
    ),
  ).toBeVisible();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toBeHidden();

  const { data: approvedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id")
    .eq("id", request?.id)
    .single();
  expect(approvedRequest?.status).toBe("approved");
  expect(approvedRequest?.approver_id).toBe(ids.manager);

  const { data: balances, error } = await supabaseAdmin
    .from("leave_balances")
    .select("year, balance")
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .in("year", [2025, 2026])
    .order("year");
  expect(error).toBeNull();
  expect(balances).toEqual([
    { year: 2025, balance: 3 },
    { year: 2026, balance: 7 },
  ]);
  await expectAudit("leave.approved", request?.id as string);
});

test("manager approval fails visibly when direct report has no matching leave balance", async ({ page }) => {
  const typeName = uniqueName("No Balance Leave");
  const employeeNote = uniqueName("Missing balance approval note");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify missing-balance approval failure.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  if (leaveType?.id) createdLeaveTypeIds.push(leaveType.id as string);
  expect(leaveTypeError).toBeNull();
  expect(leaveType?.id).toBeTruthy();

  const { error: deleteBalanceError } = await supabaseAdmin
    .from("leave_balances")
    .delete()
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", 2026);
  expect(deleteBalanceError).toBeNull();

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType?.id,
      start_date: "2026-12-21",
      end_date: "2026-12-21",
      status: "pending",
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();
  expect(request?.id).toBeTruthy();

  await page.goto("/leave?status=pending");
  const row = page.getByRole("row").filter({ hasText: employeeNote });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row.getByRole("alert")).toContainText(`No 2026 ${typeName} balance exists for this employee.`);
  await expect(row.getByText("pending")).toBeVisible();

  const { data: unchangedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id, approved_at")
    .eq("id", request?.id)
    .single();
  expect(unchangedRequest?.status).toBe("pending");
  expect(unchangedRequest?.approver_id).toBeNull();
  expect(unchangedRequest?.approved_at).toBeNull();
});

// B5 (F5): goal definition submission lock — manager submits a goal with
// intent=submit, the goal row locks, the UI flips to a read-only summary with
// an Edit button, and the reopen path clears the lock + writes the audit pair.
test("manager submits goal definition then reopens it (B5)", async ({ page }) => {
  const cycleTitle = uniqueName("B5 Goal Lock Cycle");
  const goalTitle = uniqueName("B5 Lockable Goal");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const goalId = await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: goalTitle,
  });

  await page.goto(`/performance?view=goals&goalId=${goalId}#goal-form`);
  await expect(page.locator("#goal-title")).toHaveValue(goalTitle);
  await page.getByRole("button", { name: "Re-submit" }).click();
  await expect(page.getByText("Goal submitted and locked.").first()).toBeVisible({ timeout: 10_000 });

  const { data: locked } = await supabaseAdmin
    .from("performance_goals")
    .select("goal_definition_submitted_at, goal_definition_submitted_by")
    .eq("id", goalId)
    .single();
  expect(locked?.goal_definition_submitted_at).toBeTruthy();
  expect(locked?.goal_definition_submitted_by).toBe(ids.manager);
  await expectAudit("performance.goal_definition_submitted", goalId);

  // The form is now a locked summary — the editable inputs should no longer
  // be present and the Edit button should be visible.
  await page.goto(`/performance?view=goals&goalId=${goalId}#goal-form`);
  await expect(page.locator("#goal-title")).toHaveCount(0);
  await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // After successful reopen, the locked summary unmounts (taking its toast
  // with it) and the editable form returns. Asserting on the editable input
  // appearing is the stable signal; DB + audit row are the contract.
  await expect(page.locator("#goal-title")).toBeVisible();

  const { data: reopened } = await supabaseAdmin
    .from("performance_goals")
    .select("goal_definition_submitted_at, goal_definition_submitted_by")
    .eq("id", goalId)
    .single();
  expect(reopened?.goal_definition_submitted_at).toBeNull();
  expect(reopened?.goal_definition_submitted_by).toBeNull();
  await expectAudit("performance.goal_definition_reopened", goalId);
});

// B5 (F5): manager review submission lock — once submitted, the form renders
// a locked summary; reopen reverts status + clears submitted_at + audits.
test("manager reopens a submitted (not acknowledged) appraisal (B5)", async ({ page }) => {
  const cycleTitle = uniqueName("B5 Review Reopen Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId,
    status: "manager_submitted",
    score: 3,
  });
  // The seed self_review is null on a submitted review (per helper). Revert
  // path will therefore be back to "draft", not "self_reviewed".

  await page.goto(`/performance?view=appraisals&reviewCycleId=${cycleId}&reviewEmployeeId=${ids.alice}#manager-appraisal-workspace`);
  const workspace = page.locator("#manager-appraisal-workspace");
  await expect(workspace.getByText("Submitted", { exact: true }).first()).toBeVisible();
  // Editable inputs should be absent in locked mode.
  await expect(workspace.locator("#review-strengths")).toHaveCount(0);

  await workspace.getByRole("button", { name: "Edit", exact: true }).click();
  // After successful reopen, the locked summary unmounts and the editable
  // form returns. Editable input visibility is the stable signal.
  await expect(workspace.locator("#review-strengths")).toBeVisible();

  const { data: reopened } = await supabaseAdmin
    .from("performance_reviews")
    .select("status, submitted_at")
    .eq("id", reviewId)
    .single();
  expect(reopened?.status).toBe("draft");
  expect(reopened?.submitted_at).toBeNull();
  await expectAudit("performance.review_manager_reopened", reviewId);
});

test("manager appraisal draft survives selecting a deadline-locked cycle (B5 follow-up)", async ({ page }) => {
  const unlockedTitle = uniqueName("B5 Editable Cycle");
  const lockedTitle = uniqueName("B5 Locked Cycle");
  await createPerformanceCycle(unlockedTitle);
  const lockedCycleId = await createPerformanceCycle(lockedTitle);
  const { error: lockError } = await supabaseAdmin
    .from("performance_review_cycles")
    .update({ submission_deadline: "2026-05-01", submission_lock_enabled: true })
    .eq("id", lockedCycleId);
  expect(lockError).toBeNull();

  await page.goto("/performance/reviews");
  await page.locator("#review-employee").fill("Alice Employee");
  await page.locator("#review-cycle").fill(unlockedTitle);
  await page.locator("#review-score").selectOption("4");
  await page.locator("#review-strengths").fill("Draft text that must survive the lock warning.");
  await page.locator("#review-improvements").fill("Preserve this improvement text.");
  await page.locator("#review-next").fill("Preserve these next steps.");

  await page.locator("#review-cycle").fill(lockedTitle);
  await expect(page.getByText(/Locked — deadline passed/)).toBeVisible();
  await expect(page.locator("#review-strengths")).toHaveValue("Draft text that must survive the lock warning.");
  await expect(page.locator("#review-improvements")).toHaveValue("Preserve this improvement text.");
  await expect(page.locator("#review-next")).toHaveValue("Preserve these next steps.");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Submit appraisal" })).toBeDisabled();

  await page.locator("#review-cycle").fill(unlockedTitle);
  await expect(page.getByText(/Locked — deadline passed/)).toHaveCount(0);
  await expect(page.locator("#review-strengths")).toHaveValue("Draft text that must survive the lock warning.");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Submit appraisal" })).toBeEnabled();
});

// B5 (F5): forge resistance for reopenManagerReview / reopenGoalDefinition
// is structurally enforced (both read employee_id from DB before
// canManageEmployee). A proper UUID-swap forge pin belongs in
// tests/e2e/security-rbac-guards.spec.ts using the forge.ts helper —
// captured-then-swap is the only reliable Server Action forge methodology
// in Next.js 16 (Next-Action IDs are non-deterministic). Tracked in
// docs/follow-ups.md.

// B4 (F3): Dashboard "Out this week" panel rows link into /leave/calendar
// anchored at the month of the leave's start date.
test("B4/F3 — manager dashboard 'Out this week' row links into leave calendar", async ({ page }) => {
  const note = uniqueName("B4 dashboard who-is-out link");
  const start = new Date();
  start.setDate(start.getDate() + 2);
  const date = start.toISOString().slice(0, 10);
  const monthParam = date.slice(0, 7);

  const { data: localLeave, error: typeErr } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(typeErr).toBeNull();

  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .eq("employee_id", ids.alice)
    .lte("start_date", date)
    .gte("end_date", date);

  const { data: request, error: insertErr } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: localLeave?.id,
      start_date: date,
      end_date: date,
      status: "approved",
      approver_id: ids.manager,
      approved_at: new Date().toISOString(),
      employee_note: note,
      created_by: ids.alice,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(insertErr).toBeNull();

  try {
    await page.goto("/dashboard");
    // Scope to the actual <section> Panel by its <h2>, not a broad
    // "section, div" filter — the outer DashboardShell <main> also
    // contains "Team leave calendar" (via the panel inside it) and would
    // sweep in Alice links from sibling panels (Action items, Recent
    // updates) under parallel runs.
    const panel = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Team leave calendar" }),
    });
    const aliceLink = panel.locator(`a[href="/leave/calendar?month=${monthParam}"]`).first();
    await expect(aliceLink).toHaveAttribute("href", `/leave/calendar?month=${monthParam}`);
    await aliceLink.click();
    await expect(page).toHaveURL(new RegExp(`/leave/calendar\\?month=${monthParam}`));
  } finally {
    if (request?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", request.id);
    }
  }
});
