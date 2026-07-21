import { expect, test } from "@playwright/test";
import {
  createPerformanceCycle,
  createPerformanceGoal,
  createPerformanceReview,
  expectAudit,
  createSignedInClient,
  ids,
  supabaseUrl,
  supabaseAdmin,
  uniqueName,
} from "./helpers";

// Employee (Alice): can reach all-roles routes; blocked from admin-only and admin+manager routes.
// Seed: alice has Local Leave balance (20 days) and Sick Leave balance (10 days).

test("employee reaches dashboard with employee metrics", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Local Leave balance", { exact: true })).toBeVisible();
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Sick Leave balance", { exact: true })).toBeVisible();
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Open tasks", { exact: true })).toBeVisible();
  await expect(page.locator("section[aria-label='Key metrics']").getByText("Active goals", { exact: true })).toBeVisible();
  // Payroll Summary card was intentionally removed from the employee dashboard
  // — payroll data must be opened explicitly under /payroll.
  await expect(
    page.locator("section[aria-label='Key metrics']").getByText("Payroll summary", { exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { name: "Action items", exact: true })).toBeVisible();
});

test("employee dashboard shows seeded leave balance", async ({ page }) => {
  const { data: leaveTypes, error: leaveTypesError } = await supabaseAdmin
    .from("leave_types")
    .select("id, name")
    .in("name", ["Local Leave", "Sick Leave"]);
  expect(leaveTypesError).toBeNull();

  const localLeave = leaveTypes?.find((type) => type.name === "Local Leave");
  const sickLeave = leaveTypes?.find((type) => type.name === "Sick Leave");
  expect(localLeave?.id).toBeTruthy();
  expect(sickLeave?.id).toBeTruthy();

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      [
        {
          employee_id: ids.alice,
          leave_type_id: localLeave?.id,
          year: 2026,
          balance: 20,
          created_by: ids.admin,
          updated_by: ids.admin,
        },
        {
          employee_id: ids.alice,
          leave_type_id: sickLeave?.id,
          year: 2026,
          balance: 10,
          created_by: ids.admin,
          updated_by: ids.admin,
        },
      ],
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  await page.goto("/dashboard");
  const metrics = page.locator("section[aria-label='Key metrics']");
  const localCard = metrics.locator("a").filter({ hasText: "Local Leave balance" });
  const sickCard = metrics.locator("a").filter({ hasText: "Sick Leave balance" });
  await expect(localCard.getByText("20", { exact: true })).toBeVisible();
  await expect(sickCard.getByText("10", { exact: true })).toBeVisible();
  await expect(localCard.getByText("Days remaining (2026)")).toBeVisible();
});

test("employee dashboard shows recent updates", async ({ page }) => {
  const leaveNote = uniqueName("Leave audit note recent update");
  const taskTitle = uniqueName("Journey onboarding task recent update");
  const cycleTitle = uniqueName("Self Review Cycle recent update");

  const { data: localLeave, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(localLeave?.id).toBeTruthy();

  // Date window chosen to avoid the new (employee_id, daterange) overlap
  // exclusion constraint on leave_requests (B1). This is a per-test unique
  // window; no other spec seeds alice into 2027-02.
  const { data: leaveRow, error: leaveError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: localLeave?.id,
      start_date: "2027-02-05",
      end_date: "2027-02-06",
      status: "approved",
      approver_id: ids.manager,
      approved_at: new Date().toISOString(),
      employee_note: leaveNote,
      created_by: ids.alice,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(leaveError).toBeNull();

  const { data: taskRow, error: taskError } = await supabaseAdmin
    .from("onboarding_tasks")
    .insert({
      employee_id: ids.alice,
      assignee_id: ids.alice,
      title: taskTitle,
      status: "completed",
      completed_at: new Date().toISOString(),
      created_by: ids.admin,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(taskError).toBeNull();

  const cycleId = await createPerformanceCycle(cycleTitle);
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId,
    status: "manager_submitted",
    score: 4,
  });

  try {
    await page.goto("/dashboard");
    const updates = page.locator("section").filter({ hasText: "Recent updates" });
    await expect(updates.getByRole("heading", { name: "Recent updates" })).toBeVisible();
    await expect(
      updates.getByRole("link", { name: /Local Leave approved: 2027-02-05/ }).first(),
    ).toBeVisible();
    await expect(updates.getByText(taskTitle)).toBeVisible();
    await expect(updates.getByText(cycleTitle)).toBeVisible();
  } finally {
    await supabaseAdmin.from("performance_reviews").delete().eq("id", reviewId);
    await supabaseAdmin.from("performance_review_cycles").delete().eq("id", cycleId);
    if (taskRow?.id) {
      await supabaseAdmin.from("onboarding_tasks").delete().eq("id", taskRow.id);
    }
    if (leaveRow?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", leaveRow.id);
    }
  }
});

test("B2/F2 — employee dashboard recent updates surfaces pending leave with pending tone", async ({ page }) => {
  // B2/F2: newly-submitted (pending) leave must appear in Recent updates.
  // B2/F7: pending row carries `tone="pending"` so the renderer shows a
  // distinct amber/clock icon vs approved/rejected.
  //
  // Disjoint key vs other leave tests: Sick Leave 2027-04 window for Alice
  // (separate from Alice + Local Leave + 2027-02 used in the seeded
  // recent-updates test and the half-day / refund tests).
  const leaveNote = uniqueName("Pending recent update");
  const { data: sickLeave, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Sick Leave")
    .single();
  expect(leaveTypeError).toBeNull();
  expect(sickLeave?.id).toBeTruthy();

  const { data: leaveRow, error: leaveError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: sickLeave?.id,
      start_date: "2027-04-12",
      end_date: "2027-04-12",
      status: "pending",
      employee_note: leaveNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(leaveError).toBeNull();

  try {
    await page.goto("/dashboard");
    const updates = page.locator("section").filter({ hasText: "Recent updates" });
    await expect(updates.getByRole("heading", { name: "Recent updates" })).toBeVisible();

    const pendingRow = updates.getByRole("link", {
      name: /Sick Leave pending: .*Pending approval/,
    });
    await expect(pendingRow).toBeVisible();
    await expect(
      pendingRow.locator('[data-testid="recent-update-icon"][data-tone="pending"]'),
    ).toBeVisible();
  } finally {
    if (leaveRow?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", leaveRow.id);
    }
  }
});

test("employee is denied audit logs", async ({ page }) => {
  await page.goto("/audit-logs");
  // B4: URL preserved, Access Denied rendered in place via error boundary.
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("employee is denied create employee form", async ({ page }) => {
  await page.goto("/employees/new");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("employee sees limited searchable People Directory", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People Directory" })).toBeVisible();

  await expect(page.getByText("bob@kushhr.dev")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Work email" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Department" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Role" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Status" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Manager" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Start date" })).toHaveCount(0);

  await page.getByPlaceholder("Search name, email, job title, team").fill("bob@kushhr.dev");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("bob@kushhr.dev")).toBeVisible();
  await expect(page.getByText("alice@kushhr.dev")).toHaveCount(0);
});

test("employee People Directory RPC exposes only approved colleague fields", async () => {
  const client = await createSignedInClient("alice@kushhr.dev");
  const { data, error } = await client.rpc("get_people_directory");
  expect(error).toBeNull();

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const bob = rows.find((row) => row.id === ids.bob);
  expect(bob).toBeTruthy();
  expect(Object.keys(bob ?? {}).sort()).toEqual([
    "department_name",
    "display_name",
    "id",
    "job_title",
    "work_email",
  ]);
  expect(bob?.work_email).toBe("bob@kushhr.dev");
});

test("B7 peer profile view + self-profile link + tab consolidation", async ({ page }) => {
  // F8: "View my profile" link in the avatar menu lands on own profile.
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "View my profile" }).click();
  await expect(page).toHaveURL(new RegExp(`/employees/${ids.alice}`));
  await expect(page.getByRole("heading", { name: "Alice Employee" })).toBeVisible();

  // F10: Overview / Job tab labels are gone — replaced by a single Profile
  // section. Documents / Leave / Audit remain as tabs on the own / full view.
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Job" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Leave" })).toBeVisible();
  // Audit tab is admin-only; employee viewing own profile must not see it.
  await expect(page.getByRole("tab", { name: "Audit" })).toHaveCount(0);

  // F9: People Directory row for Bob is now a clickable link. Anchor by
  // href so the assertion is stable even if Bob's display_name changes
  // (the directory RPC returns whatever is in `profiles.display_name`).
  await page.goto("/employees");
  const bobLink = page.locator(`a[href="/employees/${ids.bob}"]`);
  await expect(bobLink).toBeVisible();
  const bobName = (await bobLink.textContent())?.trim() ?? "";
  expect(bobName.length).toBeGreaterThan(0);
  await bobLink.click();
  await expect(page).toHaveURL(new RegExp(`/employees/${ids.bob}`));

  // Peer view shows only the 5 allowed fields and no functional tabs.
  await expect(page.getByRole("heading", { name: bobName, level: 1 })).toBeVisible();
  for (const label of ["Department", "Manager", "Work email", "Work phone"]) {
    await expect(page.locator("dt", { hasText: new RegExp(`^${label}$`) })).toBeVisible();
  }
  // Sensitive / full-view fields are absent on the peer projection.
  await expect(page.locator("dt", { hasText: /^Role$/ })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: /^Employment status$/ })).toHaveCount(0);
  await expect(page.locator("dt", { hasText: /^Start date$/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Documents" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Leave" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Audit" })).toHaveCount(0);
});

test("employee cannot update password from reset page without recovery link", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(
    page.getByText("This reset link is invalid or has expired. Request a new one to continue."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Request a new reset link" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password" })).toBeDisabled();
});

test("employee is denied departments", async ({ page }) => {
  await page.goto("/departments");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("employee is denied leave admin", async ({ page }) => {
  await page.goto("/leave/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("employee is denied onboarding admin", async ({ page }) => {
  await page.goto("/onboarding/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("employee reaches leave page", async ({ page }) => {
  await page.goto("/leave");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("employee reaches payroll page", async ({ page }) => {
  await page.goto("/payroll");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "My payroll" })).toBeVisible();
});

test("employee reaches performance page", async ({ page }) => {
  await page.goto("/performance");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Goals" })).toHaveAttribute("data-state", "active");
  await page.getByRole("tab", { name: "Reviews" }).click();
  await expect(page.getByRole("tab", { name: "Reviews" })).toHaveAttribute("data-state", "active");
});

test("employee updates own goal progress", async ({ page }) => {
  const cycleTitle = uniqueName("Employee Goal Progress Cycle");
  const goalTitle = uniqueName("Employee Goal Progress");
  const progressNote = uniqueName("Employee progress note");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const goalId = await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: goalTitle,
  });

  await page.goto("/performance");
  await page.locator("details").filter({ hasText: cycleTitle }).locator("summary").click();
  await expect(page.getByText(goalTitle)).toBeVisible();
  await page.locator(`#goal-progress-${goalId}`).fill("100");
  await page.locator(`#goal-progress-note-${goalId}`).fill(progressNote);
  await page.locator(`form:has(#goal-progress-${goalId}) input[name="markComplete"]`).check();
  await page.locator(`form:has(#goal-progress-${goalId})`).getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("Goal progress saved.")).toBeVisible();

  const { data: goal } = await supabaseAdmin
    .from("performance_goals")
    .select("status, progress, employee_progress_note, employee_progress_updated_at, updated_by")
    .eq("id", goalId)
    .single();
  expect(goal?.status).toBe("completed");
  expect(goal?.progress).toBe(100);
  expect(goal?.employee_progress_note).toBe(progressNote);
  expect(goal?.employee_progress_updated_at).toBeTruthy();
  expect(goal?.updated_by).toBe(ids.alice);
  await expectAudit("performance.goal_employee_completed", goalId);
});

test("employee cannot update another employee goal via crafted form", async ({ page }) => {
  const cycleTitle = uniqueName("Employee Goal Guard Cycle");
  const ownGoalTitle = uniqueName("Employee Goal Guard Own");
  const otherGoalTitle = uniqueName("Employee Goal Guard Other");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const ownGoalId = await createPerformanceGoal({
    employeeId: ids.alice,
    cycleId,
    title: ownGoalTitle,
  });
  const otherGoalId = await createPerformanceGoal({
    employeeId: ids.bob,
    cycleId,
    title: otherGoalTitle,
  });

  await page.goto("/performance");
  await page.locator("details").filter({ hasText: cycleTitle }).locator("summary").click();
  await expect(page.getByText(ownGoalTitle)).toBeVisible();
  await expect(page.getByText(otherGoalTitle)).toHaveCount(0);
  const ownForm = page.locator(`form:has(#goal-progress-${ownGoalId})`);
  await ownForm.locator("input[name='goalId']").evaluate((el, value) => {
    (el as HTMLInputElement).value = value;
  }, otherGoalId);
  await ownForm.getByLabel("Progress", { exact: true }).fill("80");
  await page.locator(`#goal-progress-note-${ownGoalId}`).fill("Attempted forged update.");
  await ownForm.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("You can only update your own goals.")).toBeVisible();

  const { data: otherGoal } = await supabaseAdmin
    .from("performance_goals")
    .select("status, progress, employee_progress_note")
    .eq("id", otherGoalId)
    .single();
  expect(otherGoal?.status).toBe("in_progress");
  expect(otherGoal?.progress).toBe(25);
  expect(otherGoal?.employee_progress_note).toBeNull();
  await expectAudit("auth.access_denied");
});

test("employee reaches onboarding page", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("onboarding task row pins B6 invariants (F7 + F13)", async ({ page }) => {
  // F7: textarea uses a per-task autocomplete token so the browser will not
  // restore a previously cached completionNote value on a new task.
  // F13: "Mark complete" renders as a shadcn primary button, not a link.
  const taskTitle = uniqueName("B6 pin task");
  const { data: taskRow, error: taskError } = await supabaseAdmin
    .from("onboarding_tasks")
    .insert({
      employee_id: ids.alice,
      assignee_id: ids.alice,
      title: taskTitle,
      status: "pending",
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(taskError).toBeNull();

  try {
    await page.goto("/onboarding");
    const row = page.locator(`#onboarding-task-${taskRow!.id}`);
    await expect(row).toBeVisible();

    const textarea = row.locator('textarea[name="completionNote"]');
    await expect(textarea).toHaveAttribute("autocomplete", /^new-completion-note-/);

    const markComplete = row.getByRole("button", { name: /^Mark complete$/i });
    await expect(markComplete).toBeVisible();
    await expect(markComplete).toHaveClass(/bg-primary/);

    // uiux amendment: success path must render an emerald confirmation,
    // not silently flip the badge. The Button restyle raised the user's
    // expectation of immediate feedback on click.
    await markComplete.click();
    const successMsg = row.getByRole("alert").filter({ hasText: /task marked as complete/i });
    await expect(successMsg).toBeVisible();
    await expect(successMsg).toHaveClass(/text-emerald-700/);
  } finally {
    await supabaseAdmin.from("onboarding_tasks").delete().eq("id", taskRow!.id);
  }
});

test("employee can view own profile", async ({ page }) => {
  // Alice's ID is c0000000-0000-0000-0000-000000000003
  await page.goto("/employees/c0000000-0000-0000-0000-000000000003");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Alice Employee" })).toBeVisible();
});

test("employee self-view surfaces the assigned manager's name", async ({ page }) => {
  // Regression for phase-13 A2: profiles RLS used to hide the manager's
  // row from the employee, so the Manager field rendered as "Not set"
  // on Alice's own profile while admins/the manager saw it populated.
  // Migration 0031 grants the employee SELECT on their own manager's
  // profile row via the is_own_manager helper.
  await page.goto("/employees/c0000000-0000-0000-0000-000000000003");
  const managerRow = page
    .locator("dt", { hasText: /^Manager$/ })
    .locator("xpath=following-sibling::dd[1]");
  await expect(managerRow).toBeVisible();
  await expect(managerRow).not.toHaveText(/^Not set$/);
});

test("employee leave page shows own balances section", async ({ page }) => {
  await page.goto("/leave");
  // The cards section shows only the current year for the signed-in user
  // (historical years live in the future reporting module), so there is
  // exactly one card per leave type even when older-year balances exist
  // in the database.
  const balances = page.locator("section[aria-label='Your leave balances']");
  await expect(balances.getByText("Local Leave")).toBeVisible();
  await expect(balances.getByText("Sick Leave")).toBeVisible();
});

test("employee submits self-review and acknowledges manager review", async ({ page }) => {
  const selfCycleTitle = uniqueName("Self Review Cycle");
  const ackCycleTitle = uniqueName("Ack Review Cycle");
  const selfCycleId = await createPerformanceCycle(selfCycleTitle);
  const ackCycleId = await createPerformanceCycle(ackCycleTitle);
  const selfReviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId: selfCycleId,
    status: "draft",
  });
  const ackReviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId: ackCycleId,
    status: "manager_submitted",
    score: 4,
  });
  const { error: ackDeadlineError } = await supabaseAdmin
    .from("performance_review_cycles")
    .update({ submission_deadline: "2026-05-01", submission_lock_enabled: true })
    .eq("id", ackCycleId);
  expect(ackDeadlineError).toBeNull();

  await page.goto("/performance?view=reviews");

  const selfArticle = page.locator("article").filter({ hasText: selfCycleTitle });
  await selfArticle.getByLabel("Self-review comment").fill("I delivered my goals and improved collaboration.");
  await selfArticle.getByRole("button", { name: "Save self-review" }).click();
  await expect(selfArticle.getByText("Self-review saved.")).toBeVisible();
  await expectAudit("performance.review_self_submitted", selfReviewId);

  // Resubmit leg: Edit → change → save again must collapse back to the
  // Submitted summary without a manual refresh. Regression guard for the
  // consecutive-success "Saving…" hang (success === true twice in a row).
  await selfArticle.getByRole("button", { name: "Edit" }).click();
  await selfArticle.getByLabel("Self-review comment").fill("Updated: also mentored two new joiners.");
  await selfArticle.getByRole("button", { name: "Save self-review" }).click();
  await expect(selfArticle.getByText("Self-review saved.")).toBeVisible();
  await expect(selfArticle.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(selfArticle.getByLabel("Self-review comment")).toHaveCount(0);

  const ackArticle = page.locator("article").filter({ hasText: ackCycleTitle });
  await expect(ackArticle.getByText("Score 4/5")).toBeVisible();
  await expect(ackArticle.getByLabel("Self-review comment")).toHaveCount(0);
  await expect(ackArticle.getByRole("button", { name: "Acknowledge review" })).toBeVisible();
  await ackArticle.getByRole("button", { name: "Acknowledge review" }).click();
  // Assert the status badge specifically (exact match). After acknowledge the form
  // calls router.refresh(); during that window the form's dual success messages
  // ("Review acknowledged." in both the banner and the inline status) are briefly
  // present, so a loose getByText("acknowledged") hits 2 elements. The badge text
  // formatStatus("acknowledged") === "Acknowledged" appears once the refresh lands.
  await expect(ackArticle.getByText("Acknowledged", { exact: true })).toBeVisible();

  const { data: acknowledgedReview } = await supabaseAdmin
    .from("performance_reviews")
    .select("status")
    .eq("id", ackReviewId)
    .single();
  expect(acknowledgedReview?.status).toBe("acknowledged");
  await expectAudit("performance.review_acknowledged", ackReviewId);
});

test("employee cannot see manager appraisal draft before submission", async ({ page }) => {
  const cycleTitle = uniqueName("Hidden Manager Draft Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    cycleId,
    status: "draft",
    score: 2,
  });
  await supabaseAdmin
    .from("performance_reviews")
    .update({
      manager_strengths: "Draft-only strengths",
      manager_improvements: "Draft-only improvement areas",
      manager_next_steps: "Draft-only next steps",
      updated_by: ids.manager,
    })
    .eq("id", reviewId);

  await page.goto("/performance?view=reviews");
  const draftArticle = page.locator("article").filter({ hasText: cycleTitle });
  await expect(draftArticle.getByText("Score 2/5")).toHaveCount(0);
  await expect(draftArticle.getByText("Draft-only strengths")).toHaveCount(0);
  await expect(draftArticle.getByText("Draft-only improvement areas")).toHaveCount(0);
  await expect(draftArticle.getByText("Draft-only next steps")).toHaveCount(0);
  await expect(draftArticle.getByLabel("Self-review comment")).toBeVisible();

  await supabaseAdmin
    .from("performance_reviews")
    .update({ status: "manager_submitted", submitted_at: new Date().toISOString() })
    .eq("id", reviewId);

  await page.reload();
  const submittedArticle = page.locator("article").filter({ hasText: cycleTitle });
  await expect(submittedArticle.getByText("Score 2/5")).toBeVisible();
  await expect(submittedArticle.getByText("Draft-only strengths")).toBeVisible();
});

test("employee uploads and downloads document with signed URL protections", async ({ page, request }) => {
  test.setTimeout(90_000);
  const title = uniqueName("Employee Policy Doc");

  await page.goto("/documents");
  await page.locator("#document-upload-panel summary").click();
  await page.locator("#up-category").selectOption("policy");
  await page.locator("#up-title").fill(title);
  await page.locator("#up-file").setInputFiles({
    name: "policy-note.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nKushHR document runtime check\n"),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Document uploaded.").first()).toBeVisible();

  const { data: document } = await supabaseAdmin
    .from("documents")
    .select("id, storage_path")
    .eq("title", title)
    .single();
  expect(document?.id).toBeTruthy();
  expect(document?.storage_path).toBeTruthy();
  await expectAudit("document.uploaded", document?.id as string);

  await page.reload();
  const row = page.getByRole("row").filter({ hasText: title });
  const signedRequestPromise = page.context().waitForEvent("request", {
    predicate: (request) => request.url().includes("/storage/v1/object/sign/hr-documents/"),
  });
  const popupPromise = page.waitForEvent("popup");
  await row.getByRole("button", { name: "Download" }).click();
  const popup = await popupPromise;
  const signedRequest = await signedRequestPromise;
  const signedUrl = signedRequest.url();
  await popup.close();

  expect(signedUrl).toBeTruthy();
  const signedResponse = await request.get(signedUrl as string);
  expect(signedResponse.ok()).toBeTruthy();
  await expectAudit("document.downloaded", document?.id as string);

  const rawPath = String(document?.storage_path)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const rawResponse = await request.get(`${supabaseUrl}/storage/v1/object/hr-documents/${rawPath}`);
  expect([400, 401, 403, 404]).toContain(rawResponse.status());

  await page.waitForTimeout(61_000);
  const expiredResponse = await request.get(signedUrl as string);
  expect(expiredResponse.ok()).toBeFalsy();
});

test("employee submits leave and self-updates payroll details with audit logs", async ({ page }) => {
  const leaveNote = uniqueName("Leave audit note");
  const urgentReason = uniqueName("Leave audit note urgent reason");
  const newTaxId = `TAX-${uniqueName("ALICE")}`.slice(0, 60);
  const { data: localLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  await supabaseAdmin.from("leave_balances").upsert(
    {
      employee_id: ids.alice,
      leave_type_id: localLeave?.id,
      year: 2026,
      balance: 20,
      created_by: ids.admin,
      updated_by: ids.admin,
    },
    { onConflict: "employee_id,leave_type_id,year" },
  );

  await page.goto("/leave/new");
  await expect(page.getByText("Available 2026 balances")).toBeVisible();
  await expect(page.getByText("Local Leave: 20 days")).toBeVisible();
  await page.locator("#leaveTypeId").selectOption(localLeave?.id as string);
  await expect(page.locator("#leaveTypeId")).toHaveValue(localLeave?.id as string);
  await page.locator("#startDate").fill("2026-11-10");
  await page.locator("#endDate").fill("2026-11-11");
  await page.getByLabel("Flag as urgent Local Leave").check();
  await expect(page.locator("#urgentLeaveReason")).toHaveAttribute("required", "");
  await page.locator("#urgentLeaveReason").fill(urgentReason);
  await page.locator("#employeeNote").fill(leaveNote);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Leave request submitted.")).toBeVisible();

  const { data: leaveRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("id, employee_id, is_urgent_local_leave, urgent_leave_reason")
    .eq("employee_note", leaveNote)
    .single();
  expect(leaveRequest?.employee_id).toBe(ids.alice);
  expect(leaveRequest?.is_urgent_local_leave).toBe(true);
  expect(leaveRequest?.urgent_leave_reason).toBe(urgentReason);
  await expectAudit("leave.submitted");

  // Defensive precondition: Alice must have a compensation row for the
  // self-update form to render. Idempotent upsert so this test does not
  // depend on admin.spec.ts having seeded the row first.
  await supabaseAdmin
    .from("employee_compensation")
    .upsert(
      {
        employee_id: ids.alice,
        salary_amount: 60000,
        salary_currency: "MUR",
        pay_frequency: "monthly",
        bank_account_holder: "Alice Employee",
        bank_account_number: "BANK-SELF-UPDATE-PRECONDITION",
        tax_id: "TAX-SELF-UPDATE-PRECONDITION",
        national_id: "NID-SELF-UPDATE-PRECONDITION",
        effective_date: "2026-01-01",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id" },
    );

  // Snapshot Alice's compensation so we can restore it for the next spec run.
  const { data: priorComp } = await supabaseAdmin
    .from("employee_compensation")
    .select("tax_id, bank_account_holder")
    .eq("employee_id", ids.alice)
    .maybeSingle();

  await page.goto("/payroll");
  await expect(page.getByRole("heading", { name: "My payroll" })).toBeVisible();
  // Salary block is read-only — no salary input present.
  await expect(page.locator("#cf-salary")).toHaveCount(0);
  await page.locator("#cf-taxid").fill(newTaxId);
  await page.getByRole("button", { name: "Save my details" }).click();
  // CompensationForm renders the success message twice — once in the top
  // <Alert> block and once inline near the Save button (intentional design
  // so users don't have to scroll up). `.first()` defuses strict-mode.
  await expect(page.getByText("Your details were saved.").first()).toBeVisible();

  const { data: updatedComp } = await supabaseAdmin
    .from("employee_compensation")
    .select("employee_id, tax_id")
    .eq("employee_id", ids.alice)
    .single();
  expect(updatedComp?.tax_id).toBe(newTaxId);
  await expectAudit("compensation.self_updated");

  // Clean up the UI-submitted leave_request — the (employee_id, daterange)
  // overlap constraint (B1) would otherwise collide with any other spec
  // that pins alice into 2026-11-10/11 across runs.
  if (leaveRequest?.id) {
    await supabaseAdmin.from("leave_requests").delete().eq("id", leaveRequest.id);
  }
  // Restore Alice's prior tax_id so other specs keep their seed assumptions.
  if (priorComp?.tax_id) {
    await supabaseAdmin
      .from("employee_compensation")
      .update({ tax_id: priorComp.tax_id })
      .eq("employee_id", ids.alice);
  }
});


test("employee can request next-year Local Leave; balance is auto-seeded from Settings (E2)", async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;
  const noteText = uniqueName("Next-year auto-seed");

  // Find Local Leave type id; clean any pre-existing next-year Alice balance.
  const { data: localLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .eq("employee_id", ids.alice)
    .eq("employee_note", noteText);
  await supabaseAdmin
    .from("leave_balances")
    .delete()
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", localLeave?.id as string)
    .eq("year", nextYear);

  try {
    await page.goto("/leave/new");
    await page.locator("#leaveTypeId").selectOption(localLeave?.id as string);
    await page.locator("#startDate").fill(`${nextYear}-03-02`);
    await page.locator("#endDate").fill(`${nextYear}-03-03`);
    await page.locator("#employeeNote").fill(noteText);
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("Leave request submitted.")).toBeVisible();

    // Auto-seed: a next-year Local Leave balance must now exist for Alice.
    const { data: seeded } = await supabaseAdmin
      .from("leave_balances")
      .select("balance, year")
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", localLeave?.id as string)
      .eq("year", nextYear)
      .single();
    expect(seeded?.year).toBe(nextYear);
    expect(Number(seeded?.balance)).toBeGreaterThan(0);
  } finally {
    await supabaseAdmin
      .from("leave_requests")
      .delete()
      .eq("employee_id", ids.alice)
      .eq("employee_note", noteText);
    await supabaseAdmin
      .from("leave_balances")
      .delete()
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", localLeave?.id as string)
      .eq("year", nextYear);
  }
});

test("employee request is rejected when the requested year is more than one ahead (E2 horizon)", async ({ page }) => {
  const farYear = new Date().getFullYear() + 2;
  const { data: localLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();

  await page.goto("/leave/new");
  await page.locator("#leaveTypeId").selectOption(localLeave?.id as string);
  await page.locator("#startDate").fill(`${farYear}-01-05`);
  await page.locator("#endDate").fill(`${farYear}-01-06`);
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(
    page.getByText(/Leave can only be requested up to \d+/),
  ).toBeVisible();
});

// UAT F1 / B1: insufficient-balance check moved to submission time. Hard block
// — submit button disabled when single-year request exceeds available balance;
// server rejects with per-year insufficient message if the client guard is
// bypassed.
test("employee submit blocked when request exceeds balance", async ({ page }) => {
  // Use Sick Leave 2027 to avoid colliding with other parallel tests that
  // upsert Local Leave 2027 (half-day, refund). playwright.config.ts has
  // fullyParallel: true so balance writes on the same key race.
  const { data: sickLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Sick Leave")
    .single();
  expect(sickLeave?.id).toBeTruthy();

  const excYear = 2027;
  // 2027-03-15 (Mon) → 2027-03-17 (Wed) = 3 working days, no MU public holidays.
  const startDate = "2027-03-15";
  const endDate = "2027-03-17";

  // Pin Alice's 2027 Sick Leave balance to 1 day so the 3-day window exceeds.
  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      {
        employee_id: ids.alice,
        leave_type_id: sickLeave?.id,
        year: excYear,
        balance: 1,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  try {
    await page.goto("/leave/new");
    await page.locator("#leaveTypeId").selectOption(sickLeave?.id as string);
    await page.locator("#startDate").fill(startDate);
    await page.locator("#endDate").fill(endDate);

    // Client preview + exceeds-balance hint. Rendered text is "3 days working
    // days requested" (formatDays() returns "3 days", JSX appends "working days
    // requested") — match the substring that locks the count to "3 days".
    await expect(page.getByText(/3 days working days requested/)).toBeVisible();
    await expect(
      page.getByText(/Requested days exceed your 2027 balance/),
    ).toBeVisible();

    // Submit button disabled by the client gate.
    const submit = page.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeDisabled();

    // Defense-in-depth: force-enable + click → server returns the per-year
    // insufficient message.
    await submit.evaluate((el) => el.removeAttribute("disabled"));
    await submit.click();
    await expect(
      page.getByText(/Insufficient 2027 Sick Leave balance/),
    ).toBeVisible();
  } finally {
    await supabaseAdmin
      .from("leave_balances")
      .delete()
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", sickLeave?.id as string)
      .eq("year", excYear);
  }
});

// Phase 13 / Session 143: weekend + public-holiday exclusion (migration 0042).
// Pre-flight: a Sat–Sun range has 0 working days and must be blocked at the
// Server Action with the friendly "no working days" error.
test("employee submit blocked when range has zero working days", async ({ page }) => {
  const { data: localLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(localLeave?.id).toBeTruthy();

  await page.goto("/leave/new");
  await page.locator("#leaveTypeId").selectOption(localLeave?.id as string);
  // 2027-01-30 (Sat) + 2027-01-31 (Sun) — no working days.
  await page.locator("#startDate").fill("2027-01-30");
  await page.locator("#endDate").fill("2027-01-31");
  // Client-side preview should already read 0 days before submit.
  await expect(page.getByText(/0 days — this range has no working days/)).toBeVisible();
  await page.getByRole("button", { name: "Submit request" }).click();
  // Server-side guard surfaces the same message on the form.
  await expect(
    page.getByText(/This range has no working days/),
  ).toBeVisible();
});

// Phase 13 / Session 143: half-day request (migration 0042). Single-day only,
// 0.5 day deducted from leave_balances at approval.
test("employee submits half-day request and balance decrements by 0.5", async ({ page }) => {
  const employeeNote = uniqueName("Half-day UAT");
  // Create a unique leave type per run so this test's balance row cannot
  // collide with sibling tests under fullyParallel. Earlier attempts on Local
  // Leave 2027 raced with the refund test; Sick Leave 2027 raced with the
  // exceedance test's upsert + delete cycle. A bespoke type is the only key
  // guaranteed disjoint across parallel workers.
  const halfDayTypeName = uniqueName("Half-Day UAT Type");
  const { data: halfDayType, error: typeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: halfDayTypeName,
      description: "Created by Playwright to verify half-day request flow.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(typeError).toBeNull();
  expect(halfDayType?.id).toBeTruthy();

  const halfDayYear = 2027;
  const startingBalance = 10;
  const halfDayDate = "2027-02-09"; // Tue — not a Mauritius public holiday.

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      {
        employee_id: ids.alice,
        leave_type_id: halfDayType?.id,
        year: halfDayYear,
        balance: startingBalance,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  try {
    // Submit via the UI so the half-day checkbox flow is exercised end-to-end.
    await page.goto("/leave/new");
    await page.locator("#leaveTypeId").selectOption(halfDayType?.id as string);
    await page.locator("#startDate").fill(halfDayDate);
    await page.locator("#endDate").fill(halfDayDate);
    await page.locator("#employeeNote").fill(employeeNote);
    await page.getByLabel(/Half-day request/).check();
    await expect(page.getByText(/0\.5 days requested \(half day\)/)).toBeVisible();
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("Leave request submitted.")).toBeVisible();

    // Find the submitted request and promote it to approved via admin client so
    // the BEFORE UPDATE trigger fires and writes deducted_days = 0.5.
    const { data: request } = await supabaseAdmin
      .from("leave_requests")
      .select("id, is_half_day")
      .eq("employee_note", employeeNote)
      .single();
    expect(request?.is_half_day).toBe(true);

    const { error: approveError } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: "approved",
        approver_id: ids.manager,
        approved_at: new Date().toISOString(),
        updated_by: ids.manager,
      })
      .eq("id", request?.id as string);
    expect(approveError).toBeNull();

    // Confirm trigger wrote 0.5 to deducted_days AND debited the balance.
    const { data: approved } = await supabaseAdmin
      .from("leave_requests")
      .select("deducted_days")
      .eq("id", request?.id as string)
      .single();
    expect(Number(approved?.deducted_days)).toBe(0.5);

    const { data: postBalance } = await supabaseAdmin
      .from("leave_balances")
      .select("balance")
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", halfDayType?.id)
      .eq("year", halfDayYear)
      .single();
    expect(Number(postBalance?.balance)).toBe(startingBalance - 0.5);
  } finally {
    // Cleanup in dependency order: requests → balances → leave_type.
    await supabaseAdmin
      .from("leave_requests")
      .delete()
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", halfDayType?.id as string);
    await supabaseAdmin
      .from("leave_balances")
      .delete()
      .eq("leave_type_id", halfDayType?.id as string);
    await supabaseAdmin
      .from("leave_types")
      .delete()
      .eq("id", halfDayType?.id as string);
  }
});

// Phase 13 / Session 143: refund-on-cancel-of-approved (migration 0042 trigger
// handle_leave_refund + migration 0043 RLS expansion). Pins the regression
// caught during UAT R1 where RLS silently rejected the cancel UPDATE.
test("employee cancels approved leave and balance is refunded", async ({ page }) => {
  const employeeNote = uniqueName("Refund UAT");
  const { data: localLeave } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(localLeave?.id).toBeTruthy();

  const refundYear = 2027;
  const startingBalance = 8;
  // 2027-03-15 (Mon) + 2027-03-16 (Tue) — both working days, no MU holiday.
  const startDate = "2027-03-15";
  const endDate = "2027-03-16";

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .upsert(
      {
        employee_id: ids.alice,
        leave_type_id: localLeave?.id,
        year: refundYear,
        balance: startingBalance,
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );
  expect(balanceError).toBeNull();

  // Pre-clean any leftover row on this exact date range so the overlap
  // exclusion constraint (migration 0035) doesn't reject this insert.
  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .eq("employee_id", ids.alice)
    .eq("start_date", startDate)
    .eq("end_date", endDate);

  // Insert as pending then promote to approved via admin so the approval
  // trigger fires and freezes deducted_days = 2 on the row.
  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: localLeave?.id,
      start_date: startDate,
      end_date: endDate,
      status: "pending",
      employee_note: employeeNote,
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(requestError).toBeNull();

  try {
    const { error: approveError } = await supabaseAdmin
      .from("leave_requests")
      .update({
        status: "approved",
        approver_id: ids.manager,
        approved_at: new Date().toISOString(),
        updated_by: ids.manager,
      })
      .eq("id", request?.id as string);
    expect(approveError).toBeNull();

    const { data: approved } = await supabaseAdmin
      .from("leave_requests")
      .select("deducted_days")
      .eq("id", request?.id as string)
      .single();
    expect(Number(approved?.deducted_days)).toBe(2);

    const { data: midBalance } = await supabaseAdmin
      .from("leave_balances")
      .select("balance")
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", localLeave?.id)
      .eq("year", refundYear)
      .single();
    expect(Number(midBalance?.balance)).toBe(startingBalance - 2);

    // Now cancel via the UI as the employee — exercises the RLS policy + the
    // BEFORE UPDATE refund trigger together.
    await page.goto("/leave?status=approved");
    const row = page.getByRole("row").filter({ hasText: employeeNote });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Cancel/ }).click();
    await expect(row).toBeHidden();

    const { data: cancelled } = await supabaseAdmin
      .from("leave_requests")
      .select("status")
      .eq("id", request?.id as string)
      .single();
    expect(cancelled?.status).toBe("cancelled");

    const { data: postBalance } = await supabaseAdmin
      .from("leave_balances")
      .select("balance")
      .eq("employee_id", ids.alice)
      .eq("leave_type_id", localLeave?.id)
      .eq("year", refundYear)
      .single();
    expect(Number(postBalance?.balance)).toBe(startingBalance);

    await expectAudit("leave.cancelled", request?.id as string);
  } finally {
    // Cleanup the request row even on mid-flight crash so the overlap
    // exclusion constraint doesn't block the next run. Do NOT delete
    // leave_balances — it's shared with parallel tests.
    if (request?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", request.id);
    }
  }
});

// B4 (F3): Cross-role leave calendar — employees see company-wide approved
// leave for the chosen month (via security-definer RPC), and month
// navigation links update ?month=YYYY-MM.
test("B4/F3 — leave calendar shows company-wide approved leave for the current month", async ({ page }) => {
  const note = uniqueName("B4 calendar approved");
  const { data: localLeave, error: typeErr } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(typeErr).toBeNull();

  // Use a far-future month so test seeding never collides with other specs'
  // 2027 date windows. Bob is a peer; Alice viewing him exercises the
  // company-wide read (vanilla RLS would deny it).
  const start = "2030-06-10";
  const end = "2030-06-12";
  const monthParam = "2030-06";

  await supabaseAdmin
    .from("leave_requests")
    .delete()
    .eq("employee_id", ids.bob)
    .gte("start_date", "2030-06-01")
    .lte("end_date", "2030-06-30");

  const { data: request, error: insertErr } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.bob,
      leave_type_id: localLeave?.id,
      start_date: start,
      end_date: end,
      status: "approved",
      approver_id: ids.manager,
      approved_at: new Date().toISOString(),
      employee_note: note,
      created_by: ids.bob,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(insertErr).toBeNull();

  try {
    await page.goto(`/leave/calendar?month=${monthParam}`);
    await expect(page).not.toHaveURL(/login|access-denied/);
    await expect(page.getByTestId("calendar-month-label")).toHaveText("June 2030");

    for (const iso of [start, "2030-06-11", end]) {
      const cell = page.locator(`[data-testid="calendar-day"][data-date="${iso}"]`).first();
      await expect(cell.locator('[data-testid="calendar-entry"]').first()).toBeVisible();
    }
  } finally {
    if (request?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", request.id);
    }
  }
});

test("B4/F3 — leave calendar prev/next links navigate by month", async ({ page }) => {
  await page.goto("/leave/calendar?month=2030-06");
  await expect(page.getByTestId("calendar-month-label")).toHaveText("June 2030");
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/month=2030-05/);
  await expect(page.getByTestId("calendar-month-label")).toHaveText("May 2030");
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/month=2030-06/);
  await expect(page.getByTestId("calendar-month-label")).toHaveText("June 2030");
});

// B4-bis (F3 follow-on): employee dashboard gains the Team leave calendar
// panel. Confirms Alice (employee) sees company-wide approved leave on her
// dashboard via the security-definer RPC — vanilla RLS would deny this.
test("B4-bis — employee dashboard shows Team leave calendar panel with company-wide approved leave", async ({ page }) => {
  const note = uniqueName("B4-bis employee dashboard");
  const start = new Date();
  start.setDate(start.getDate() + 3);
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
    .eq("employee_id", ids.bob)
    .lte("start_date", date)
    .gte("end_date", date);

  const { data: request, error: insertErr } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.bob,
      leave_type_id: localLeave?.id,
      start_date: date,
      end_date: date,
      status: "approved",
      approver_id: ids.manager,
      approved_at: new Date().toISOString(),
      employee_note: note,
      created_by: ids.bob,
      updated_by: ids.manager,
    })
    .select("id")
    .single();
  expect(insertErr).toBeNull();

  try {
    await page.goto("/dashboard");
    const panel = page.locator("section, div").filter({ hasText: "Team leave calendar" }).first();
    await expect(panel.getByRole("heading", { name: "Team leave calendar" })).toBeVisible();
    const overflowToggle = panel.getByTestId("who-is-out-toggle");
    if (await overflowToggle.isVisible().catch(() => false)) {
      await overflowToggle.click();
    }
    const bobLink = panel.getByRole("link", { name: /^Bob\b/ }).first();
    await expect(bobLink).toHaveAttribute("href", `/leave/calendar?month=${monthParam}`);
    await bobLink.click();
    await expect(page).toHaveURL(new RegExp(`/leave/calendar\\?month=${monthParam}`));
  } finally {
    if (request?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", request.id);
    }
  }
});
