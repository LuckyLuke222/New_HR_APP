import { expect, test } from "@playwright/test";
import {
  createSignedInClient,
  createPerformanceCycle,
  createPerformanceReview,
  expectAudit,
  ids,
  selectLocatorOptionByText,
  selectOptionByText,
  supabaseAdmin,
  uniqueName,
} from "./helpers";

// Admin can reach every route and sees all-employee data.
// Seed: 3 employees with records (manager, alice, bob) + admin profile.

// Per-test cleanup registry — tests that insert a `leave_types` row push its
// id; `test.afterEach` removes the leave_type and any referencing rows so
// transient artifacts don't leak into manual-review dropdowns.
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

test("admin reaches dashboard with admin metrics", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByText("Headcount")).toBeVisible();
  // "Pending leave" appears twice on admin dashboard since B1 added the
   // "Unrouted pending leave" panel — scope to the metric tile.
  await expect(page.getByText("Pending leave", { exact: true })).toBeVisible();
  await expect(page.getByText("Onboarding progress")).toBeVisible();
  // Action items + Recent updates panels (parity with employee/manager dashboards).
  await expect(
    page.getByRole("heading", { name: "Action items", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recent updates", exact: true }),
  ).toBeVisible();
  const operationalReport = page.locator("section").filter({ hasText: "Operational report" });
  await expect(
    operationalReport.getByRole("link", { name: /Starters, last 30 days/ }),
  ).toHaveAttribute("href", "/employees?recent=starters");
  await expect(
    operationalReport.getByRole("link", { name: /Leavers, last 30 days/ }),
  ).toHaveAttribute("href", "/employees?status=terminated");
  await expect(
    operationalReport.getByRole("link", { name: /Approved leave days, last 30 days/ }),
  ).toHaveAttribute("href", "/leave?status=approved");
});

test("B1/F6 — admin dashboard shows pending leave from employees with no manager", async ({ page }) => {
  // Create a disposable employee with no manager and seed a pending leave;
  // assert it surfaces in the new "Unrouted pending leave" admin panel.
  const email = `playwright-unrouted-${Date.now()}-${Math.random().toString(16).slice(2)}@kushhr.dev`;
  const fullName = `Unrouted Tester ${Date.now().toString().slice(-6)}`;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  expect(createError).toBeNull();
  const userId = created.user?.id as string;
  expect(userId).toBeTruthy();

  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(leaveType?.id).toBeTruthy();

  const { error: recErr } = await supabaseAdmin
    .from("employee_records")
    .insert({
      employee_id: userId,
      job_title: "Unrouted tester",
      employment_status: "active",
      employment_type: "full_time",
      manager_id: null,
      start_date: "2026-01-01",
      created_by: ids.admin,
      updated_by: ids.admin,
    });
  expect(recErr).toBeNull();

  const { data: leaveRow, error: leaveErr } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: userId,
      leave_type_id: leaveType!.id,
      start_date: "2099-07-10",
      end_date: "2099-07-12",
      status: "pending",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  expect(leaveErr).toBeNull();

  try {
    await page.goto("/dashboard");
    const unroutedPanel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Unrouted pending leave", exact: true }) });
    await expect(
      unroutedPanel.getByRole("heading", { name: "Unrouted pending leave", exact: true }),
    ).toBeVisible();
    await expect(unroutedPanel.getByText(fullName)).toBeVisible();
    await expect(unroutedPanel.getByText(/no manager assigned/i).first()).toBeVisible();
  } finally {
    if (leaveRow?.id) {
      await supabaseAdmin.from("leave_requests").delete().eq("id", leaveRow.id);
    }
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

test("admin reaches audit logs", async ({ page }) => {
  await page.goto("/audit-logs");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
});

test("admin audit actor filter accepts seeded Postgres UUIDs", async ({ page }) => {
  const action = `audit.uuid_filter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const { error: insertError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor: ids.alice,
      action,
      entity: "audit_filter_test",
      metadata: { source: "playwright" },
    });
  expect(insertError).toBeNull();

  await page.goto(`/audit-logs?actor=${ids.alice}&action=${encodeURIComponent(action)}`);
  await expect(page.getByRole("alert").filter({ hasText: "Actor filter ignored" })).toHaveCount(0);
  await expect(page.getByText(action)).toBeVisible();
  await expect(page.getByText("Alice Employee")).toBeVisible();
});

test("admin sees all employees in directory", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People Directory" })).toBeVisible();
  // Identify seed users by stable profile href (UUID), not display name —
  // admins can rename users during normal use, so display name is not stable.
  await expect(page.locator(`a[href="/employees/${ids.manager}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/employees/${ids.alice}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/employees/${ids.bob}"]`)).toBeVisible();
});

test("admin employee profile module tabs are wired", async ({ page }) => {
  for (const tab of ["documents", "leave", "audit"]) {
    await page.goto(`/employees/${ids.alice}?tab=${tab}`);
    await expect(page.getByText("This section will be wired")).toHaveCount(0);
  }

  await page.goto(`/employees/${ids.alice}?tab=documents`);
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

  await page.goto(`/employees/${ids.alice}?tab=leave`);
  await expect(page.getByRole("heading", { name: "Leave" })).toBeVisible();

  await page.goto(`/employees/${ids.alice}?tab=audit`);
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
});

test("admin generates employee password reset link", async ({ page, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL ?? "http://127.0.0.1:3100",
  });
  await page.goto(`/employees/${ids.alice}`);
  await page.getByRole("button", { name: "Generate password reset" }).click();
  await expect(page.getByText("Password reset link generated.")).toBeVisible();
  const resetLinkField = page.getByRole("textbox", { name: "Password reset link" });
  await expect(resetLinkField).toHaveValue(/token_hash=.*type=recovery/);
  const resetLink = await resetLinkField.inputValue();
  const resetUrl = new URL(resetLink);
  expect(resetUrl.searchParams.get("token_hash")?.length).toBeGreaterThan(20);
  expect(resetUrl.searchParams.get("type")).toBe("recovery");

  await page.getByRole("button", { name: "Copy password reset link" }).click();
  await expect(page.getByText("Copied.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(resetLink);
  await expectAudit("auth.password_reset_link_generated", ids.alice);
});

test("password reset recovery link updates the user password", async ({ browser, baseURL }) => {
  const email = `codex-reset-test-${Date.now()}-${Math.random().toString(16).slice(2)}@kushhr.dev`;
  const oldPassword = "TestPass123!";
  const newPassword = `ResetPass123!${Math.random().toString(16).slice(2, 8)}`;
  const context = await browser.newContext();
  const page = await context.newPage();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
    user_metadata: { full_name: "Codex Reset Test" },
  });
  expect(createError).toBeNull();
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    const redirectTo = new URL("/reset-password", baseURL ?? "http://127.0.0.1:3100").toString();
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    expect(linkError).toBeNull();
    const tokenHash = linkData.properties?.hashed_token;
    expect(tokenHash).toBeTruthy();

    await page.goto(`/reset-password?token_hash=${encodeURIComponent(tokenHash as string)}&type=recovery`);
    await expect(page.getByText("Reset link verified. Enter a new password.")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?message=password-updated/);
    await expect(page.getByText("Password updated. Sign in with your new password.")).toBeVisible();

    const client = await createSignedInClient(email, newPassword);
    await client.auth.signOut();
  } finally {
    await context.close();
    if (userId) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
  }
});

test("admin reaches performance pages", async ({ page }) => {
  await page.goto("/performance");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Performance" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Cycles" })).toHaveAttribute("data-state", "active");
  await expect(page.getByRole("link", { name: /Active goals:/ })).toHaveAttribute("href", "/performance?view=goals#performance-goals");
  await expect(page.getByRole("link", { name: /Visible cycles:/ })).toHaveAttribute("href", "/performance?view=cycles#review-cycles");
  await expect(page.getByRole("link", { name: /Submitted reviews:/ })).toHaveAttribute("href", "/performance?view=reviews#performance-reviews");
  await page.getByRole("link", { name: /Active goals:/ }).click();
  await expect(page.getByRole("tab", { name: "Goals" })).toHaveAttribute("data-state", "active");
  await page.getByRole("link", { name: /Submitted reviews:/ }).click();
  await expect(page.getByRole("tab", { name: "Reviews" })).toHaveAttribute("data-state", "active");
  await page.getByRole("link", { name: /Visible cycles:/ }).click();
  await expect(page.getByRole("tab", { name: "Cycles" })).toHaveAttribute("data-state", "active");

  await page.goto("/performance/reviews");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("admin reaches payroll", async ({ page }) => {
  await page.goto("/payroll");
  await expect(page).not.toHaveURL(/login|access-denied/);
  await expect(page.getByRole("heading", { name: "Payroll" })).toBeVisible();
});

test("admin employee pickers include regular employees", async ({ page }) => {
  await page.goto("/payroll");
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Alice Employee");
  await page.getByPlaceholder("Search employee").fill("Bob Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Bob Employee");

  await page.goto("/documents");
  await page.locator("#document-upload-panel summary").click();
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Alice Employee");
  await page.getByPlaceholder("Search employee").fill("Bob Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Bob Employee");

  await page.goto("/leave/admin");
  // B3/F6 — Leave balances panel is now default-closed; expand it first.
  await page
    .locator("details")
    .filter({ hasText: "Leave balances" })
    .locator("summary")
    .first()
    .click();
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Alice Employee");
  await page.getByPlaceholder("Search employee").fill("Bob Employee");
  await expect(page.getByPlaceholder("Search employee")).toHaveValue("Bob Employee");
});

test("admin can search payroll employee picker", async ({ page }) => {
  await page.goto("/payroll");
  await page.getByPlaceholder("Search employee").fill("Morgan Manager");
  await page.getByRole("button", { name: "Load" }).click();
  await expect(page.getByRole("heading", { name: "Compensation record" })).toBeVisible();
  await expect(page.locator("input[type='hidden'][name='employeeId']")).toHaveValue(ids.manager);
});

test("admin compensation edit preserves existing bank account number when left blank", async ({ page }) => {
  const bankAccountNumber = `BANK-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { error: seedError } = await supabaseAdmin
    .from("employee_compensation")
    .upsert(
      {
        employee_id: ids.manager,
        salary_amount: 90000,
        salary_currency: "USD",
        pay_frequency: "monthly",
        bank_name: "MauBank",
        bank_account_holder: "Morgan Manager",
        bank_account_number: bankAccountNumber,
        tax_id: "TAX-MANAGER",
        national_id: "NID-MANAGER",
        effective_date: "2026-01-01",
        notes: "Seeded compensation record",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id" },
    );
  expect(seedError).toBeNull();

  await page.goto(`/payroll?employeeId=${ids.manager}`);
  await expect(page.locator("#cf-accountno")).toHaveAttribute(
    "placeholder",
    "Enter new value to update; leave blank to keep current",
  );
  await page.locator("#cf-salary").fill("91000");
  await expect(page.locator("#cf-accountno")).toHaveValue("");
  await page.getByRole("button", { name: "Save compensation" }).click();
  // C2: message renders at top of form AND inline near the Save button, so .first().
  await expect(page.getByText("Compensation saved.").first()).toBeVisible();

  const { data: compensation, error } = await supabaseAdmin
    .from("employee_compensation")
    .select("salary_amount, bank_account_number")
    .eq("employee_id", ids.manager)
    .single();
  expect(error).toBeNull();
  expect(Number(compensation?.salary_amount)).toBe(91000);
  expect(compensation?.bank_account_number).toBe(bankAccountNumber);
  await expectAudit("compensation.updated");
});

test("admin compensation rejects blank required fields at the Zod boundary", async ({ page }) => {
  // Seed a complete compensation row on Alice (separate from the manager record exercised
  // by the bank-account-preservation test, so the two specs can run in parallel without
  // racing on the same row), then clear required fields and submit. HTML5 `required` attrs
  // are bypassed via page.evaluate so we exercise the server-side Zod rule — the user-facing
  // guarantee should not depend on the browser.
  const { error: seedError } = await supabaseAdmin
    .from("employee_compensation")
    .upsert(
      {
        employee_id: ids.alice,
        salary_amount: 60000,
        salary_currency: "MUR",
        pay_frequency: "monthly",
        bank_name: "MauBank",
        bank_account_holder: "Alice Employee",
        bank_account_number: "BANK-VALIDATION-ALICE",
        tax_id: "TAX-ALICE",
        national_id: "NID-ALICE",
        effective_date: "2026-01-01",
        notes: "Seeded compensation record",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id" },
    );
  expect(seedError).toBeNull();

  await page.goto(`/payroll?employeeId=${ids.alice}`);
  await page.locator("#cf-taxid").fill("");
  await page.locator("#cf-nationalid").fill("");
  // Bypass browser-side `required` so the Server Action receives the blank values.
  await page.evaluate(() => {
    document.querySelectorAll("form input,form select").forEach((el) => {
      (el as HTMLInputElement | HTMLSelectElement).required = false;
    });
  });
  await page.getByRole("button", { name: "Save compensation" }).click();

  // C2: top banner + inline message duplicate the text, so .first().
  await expect(page.getByText("Check the highlighted fields.").first()).toBeVisible();
  await expect(page.getByText("Tax ID is required.")).toBeVisible();
  await expect(page.getByText("National ID is required.")).toBeVisible();
});

test("admin compensation rejects blank Account holder at the Zod boundary", async ({ page }) => {
  // Seed Bob with a complete row so we exercise the blank-account-holder path
  // independently of the Alice/Manager seeded specs above.
  const { error: seedError } = await supabaseAdmin
    .from("employee_compensation")
    .upsert(
      {
        employee_id: ids.bob,
        salary_amount: 50000,
        salary_currency: "MUR",
        pay_frequency: "monthly",
        bank_name: "MauBank",
        bank_account_holder: "Bob Employee",
        bank_account_number: "BANK-VALIDATION-BOB",
        tax_id: "TAX-BOB",
        national_id: "NID-BOB",
        effective_date: "2026-01-01",
        notes: "Seeded compensation record",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id" },
    );
  expect(seedError).toBeNull();

  await page.goto(`/payroll?employeeId=${ids.bob}`);
  await page.locator("#cf-holder").fill("");
  await page.evaluate(() => {
    document.querySelectorAll("form input,form select").forEach((el) => {
      (el as HTMLInputElement | HTMLSelectElement).required = false;
    });
  });
  await page.getByRole("button", { name: "Save compensation" }).click();

  await expect(page.getByText("Check the highlighted fields.").first()).toBeVisible();
  await expect(page.getByText("Account holder is required.")).toBeVisible();
});

test("admin can search document upload employee field", async ({ page }) => {
  const title = uniqueName("Admin Search Upload Doc");

  await page.goto("/documents");
  await page.locator("#document-upload-panel summary").click();
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await page.locator("#up-category").selectOption("policy");
  await page.locator("#up-title").fill(title);
  await page.locator("#up-file").setInputFiles({
    name: "admin-upload-policy.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nKushHR admin searchable upload check\n"),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Document uploaded.").first()).toBeVisible({
    timeout: 15000,
  });

  const fetchDocument = async () => {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, employee_id, category")
      .eq("title", title)
      .maybeSingle();
    expect(error).toBeNull();
    return data;
  };
  await expect.poll(fetchDocument, { timeout: 15000 }).not.toBeNull();
  const document = await fetchDocument();
  expect(document?.employee_id).toBe(ids.alice);
  expect(document?.category).toBe("policy");
  await expectAudit("document.uploaded", document?.id as string);
});

test("admin policy upload rejects non-PDF files at the server boundary", async ({ page }) => {
  const title = uniqueName("Admin Invalid Upload Doc");

  await page.goto("/documents");
  await page.locator("#document-upload-panel summary").click();
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await page.locator("#up-category").selectOption("policy");
  await page.locator("#up-title").fill(title);
  await page.locator("#up-file").setInputFiles({
    name: "policy-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Policy text files are not allowed for the policy category."),
  });
  await page.getByRole("button", { name: "Upload document" }).click();

  await expect(page.getByText("Policy uploads must be PDF.").first()).toBeVisible();
  const { data: document, error } = await supabaseAdmin
    .from("documents")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  expect(error).toBeNull();
  expect(document).toBeNull();
});

test("admin delete document requires a two-click inline confirm (B2)", async ({ page }) => {
  // B2 / F2 (Session 151): the SoftDeleteDocumentForm replaced its
  // window.confirm dialog with an inline two-step confirm. First click on
  // Delete arms the button (visible label flips to "Click again to confirm",
  // accessible name flips to "Confirm delete document"); only the second
  // click soft-deletes the row. Pin guards against regression to a one-click
  // delete or back to a popup dialog. SoftDeleteDocumentForm is admin-only
  // (`documents/page.tsx:150` gate), so this pin lives in admin.spec.ts.
  const title = uniqueName("Admin Delete Pin Doc");
  const { data: seeded, error: seedError } = await supabaseAdmin
    .from("documents")
    .insert({
      employee_id: ids.alice,
      uploaded_by: ids.admin,
      category: "policy",
      title,
      // Storage object intentionally not created — the action's best-effort
      // remove() is a no-op for a missing path and the DB soft-delete still
      // succeeds. Keeps the pin focused on the UI two-step contract.
      storage_path: `${ids.alice}/policy/uat-delete-pin-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
      file_size: 100,
      mime_type: "application/pdf",
    })
    .select("id")
    .single();
  expect(seedError).toBeNull();
  expect(seeded?.id).toBeTruthy();

  try {
    await page.goto("/documents");
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible();

    // First click — arms the button. Form must NOT submit; row must remain.
    const deleteButton = row.getByRole("button", { name: "Delete document" });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Armed state: accessible name flips to "Confirm delete document" and the
    // visible label becomes "Click again to confirm".
    const armedButton = row.getByRole("button", { name: "Confirm delete document" });
    await expect(armedButton).toBeVisible();
    await expect(armedButton).toHaveText(/Click again to confirm/);
    await expect(row).toBeVisible(); // still there — not deleted yet

    // Second click — commits the soft-delete. Row should disappear from the
    // table (useActionState success → component returns null) and the audit
    // row should land.
    await armedButton.click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
    await expectAudit("document.deleted", seeded?.id as string);

    // DB invariant: deleted_at populated (soft-delete, not hard-delete).
    const { data: postRow } = await supabaseAdmin
      .from("documents")
      .select("id, deleted_at")
      .eq("id", seeded?.id as string)
      .single();
    expect(postRow?.deleted_at).not.toBeNull();
  } finally {
    // Hard-delete the seed row even if the soft-delete assertion failed mid-flight.
    if (seeded?.id) {
      await supabaseAdmin.from("documents").delete().eq("id", seeded.id);
    }
  }
});

test("admin reaches onboarding admin panel", async ({ page }) => {
  await page.goto("/onboarding/admin");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("admin can search onboarding assignment selectors", async ({ page }) => {
  const templateName = uniqueName("Admin Search Onboarding Template");
  const taskTitle = uniqueName("Admin Search Template Task");

  const { data: template, error: templateError } = await supabaseAdmin
    .from("onboarding_templates")
    .insert({
      name: templateName,
      description: "Created by Playwright to verify searchable onboarding selectors.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(templateError).toBeNull();

  const { error: itemError } = await supabaseAdmin
    .from("onboarding_template_items")
    .insert({
      template_id: template?.id,
      title: taskTitle,
      description: "Searchable template assignment coverage.",
      sort_order: 1,
      created_by: ids.admin,
    });
  expect(itemError).toBeNull();

  await page.goto("/onboarding/admin");
  await page.locator("#assign-tasks-panel summary").click();
  await page.locator("#at-employee").fill("Alice Employee");
  await page.locator("#at-template").fill(templateName);
  await page.getByRole("button", { name: "Assign template" }).click();
  await expect(page.getByText("1 task assigned.").first()).toBeVisible();

  const { data: task, error } = await supabaseAdmin
    .from("onboarding_tasks")
    .select("id, employee_id, template_id, title")
    .eq("employee_id", ids.alice)
    .eq("template_id", template?.id)
    .eq("title", taskTitle)
    .single();
  expect(error).toBeNull();
  expect(task?.employee_id).toBe(ids.alice);
  expect(task?.template_id).toBe(template?.id);
  await expectAudit("onboarding.tasks_assigned");
});

test("admin reaches leave admin panel", async ({ page }) => {
  await page.goto("/leave/admin");
  await expect(page).not.toHaveURL(/login|access-denied/);
});

test("admin can search leave balance employee and type fields", async ({ page }) => {
  const typeName = uniqueName("Admin Search Balance Type");
  const balance = 12.5;
  const year = 2027;

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify searchable leave balance fields.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  if (leaveType?.id) createdLeaveTypeIds.push(leaveType.id as string);

  await page.goto("/leave/admin");
  // B3/F6 — Leave balances panel is now default-closed; expand it first.
  await page
    .locator("details")
    .filter({ hasText: "Leave balances" })
    .locator("summary")
    .first()
    .click();
  // C5: form is always-visible. C6: leave type is now a native <select>.
  await page.getByPlaceholder("Search employee").fill("Alice Employee");
  await page.locator("#lb-type").selectOption({ label: typeName });
  await page.locator("#lb-balance").fill(String(balance));
  await page.locator("#lb-year").fill(String(year));
  // Session 114: adjustment_reason is now required (3..500 chars).
  await page.locator("#lb-reason").fill("Playwright search-field regression");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Balance updated.")).toBeVisible();

  const { data: savedBalance, error } = await supabaseAdmin
    .from("leave_balances")
    .select("employee_id, leave_type_id, balance, year")
    .eq("employee_id", ids.alice)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", year)
    .single();
  expect(error).toBeNull();
  expect(savedBalance?.employee_id).toBe(ids.alice);
  expect(savedBalance?.leave_type_id).toBe(leaveType?.id);
  expect(Number(savedBalance?.balance)).toBe(balance);
  await expectAudit("leave_balance.updated");
});

test("admin employee form preserves submitted values when create fails on duplicate email", async ({ page }) => {
  const jobTitle = `Form Preserve Title ${Date.now()}`;
  await page.goto("/employees/new");
  await page.getByLabel("Full name").fill("Duplicate Email Tester");
  await page.getByLabel("Work email").fill("admin@kushhr.dev");
  await page.locator('select[name="role"]').selectOption("employee");
  await page.getByLabel("Job title").fill(jobTitle);
  await page.getByLabel("Start date").fill("2026-05-01");
  await page.getByLabel("Work location").fill("Port Louis Office");
  await page.getByPlaceholder("Search department").click();
  await page.getByPlaceholder("Search department").pressSequentially("Engineering");
  await page.getByPlaceholder("Search manager").click();
  await page.getByPlaceholder("Search manager").pressSequentially("Morgan Manager");
  await page.getByRole("button", { name: "Create employee" }).click();

  // Toast (prefixed) and field-level error both quote the duplicate-email reason.
  await expect(
    page.getByText("Could not create employee: An account with this email already exists."),
  ).toBeVisible();
  await expect(page.getByText("An account with this email already exists.").first()).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Duplicate Email Tester");
  await expect(page.getByLabel("Work email")).toHaveValue("admin@kushhr.dev");
  await expect(page.getByLabel("Job title")).toHaveValue(jobTitle);
  await expect(page.getByLabel("Start date")).toHaveValue("2026-05-01");
  await expect(page.getByLabel("Work location")).toHaveValue("Port Louis Office");
});

test("admin sees role and job title guidance", async ({ page }) => {
  await page.goto("/employees/new");
  await expect(
    page.getByText(
      "Role controls app permissions. Use Manager only for people who should approve direct-report workflows; keep the job title aligned so the profile is easy to review.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Job title is HR profile text. It does not grant access by itself; access changes only when the Role field changes.",
    ),
  ).toBeVisible();
});

test("admin can search employee department and manager fields", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const employeeName = `Journey Employee ${suffix}`;
  const employeeEmail = `journey-${suffix}@kushhr.dev`;

  // Session 112 follow-up: this is the SECOND test that creates a Journey
  // Employee; the first (line 985) was wrapped in try/finally already. Same
  // cascade pattern here so we don't leak the second journey user per run.
  let journeyUserId: string | undefined;

  try {
  await page.goto("/employees/new");
  await page.getByLabel("Full name").fill(employeeName);
  await page.getByLabel("Work email").fill(employeeEmail);
  // `getByLabel("Role")` collides with the Work-location helper line ("Change if the role…"),
  // so target the role select by name to keep this independent of helper-text wording.
  await page.locator('select[name="role"]').selectOption("employee");
  await page.getByLabel("Job title").fill("QA Search Analyst");
  await page.getByLabel("Start date").fill("2026-05-01");
  await page.getByPlaceholder("Search department").click();
  await page.getByPlaceholder("Search department").pressSequentially("Engineering");
  // E1: picking Engineering auto-prefills the manager field with Morgan
  // Manager (the dept's manager). The previous version of this test
  // re-typed "Morgan Manager" into the manager input, which after the
  // prefill produced "Morgan ManagerMorgan Manager" (no match) and the
  // submission landed without a manager_id. Now we just verify the
  // prefill is in place before submitting.
  await expect(page.locator("input[name='managerIdSearch']")).toHaveValue(
    "Morgan Manager",
  );
  await page.getByRole("button", { name: "Create employee" }).click();
  // 15s timeout: createUser is the heaviest write in the suite (round-trip to
  // GoTrue's admin API) and the first one of a run hits a cold/contended stack
  // on the self-host single-container target. Matches the settings-save budget.
  await expect(page.getByText("Employee created.")).toBeVisible({ timeout: 15_000 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("work_email", employeeEmail)
    .single();
  expect(profile?.id).toBeTruthy();
  journeyUserId = profile?.id as string | undefined;

  const { data: record } = await supabaseAdmin
    .from("employee_records")
    .select("manager_id, department_id, job_title")
    .eq("employee_id", profile?.id)
    .single();
  expect(record?.manager_id).toBe(ids.manager);
  expect(record?.job_title).toBe("QA Search Analyst");

  const { data: department } = await supabaseAdmin
    .from("departments")
    .select("name")
    .eq("id", record?.department_id)
    .single();
  expect(department?.name).toBe("Engineering");
  } finally {
    if (journeyUserId) {
      const tablesByEmployee = [
        "performance_reviews",
        "performance_goals",
        "leave_requests",
        "leave_balances",
        "employee_compensation",
        "employee_records",
        "onboarding_tasks",
        "documents",
      ];
      for (const table of tablesByEmployee) {
        await supabaseAdmin.from(table).delete().eq("employee_id", journeyUserId);
      }
      await supabaseAdmin.from("documents").delete().eq("uploaded_by", journeyUserId);
      await supabaseAdmin.from("profiles").delete().eq("id", journeyUserId);
      await supabaseAdmin.auth.admin.deleteUser(journeyUserId);
    }
  }
});

// B2 (F2): the Manager field on the Edit Employee form must reject free-text.
// Before the fix, typing a non-matching string left the visible input showing
// that text while the hidden <select> carried "" — a UI lie that, combined
// with parseEmployeeForm's `||Search` fallback, let the raw query reach the
// schema. After the fix: strict-match-on-blur clears the input, and the form
// only submits the resolved UUID from the hidden <select>.
test("admin manager field rejects free-text on edit (B2/F2)", async ({ page }) => {
  await page.goto(`/employees/${ids.alice}/edit`);
  const managerInput = page.locator("input[name='managerIdSearch']");
  await expect(managerInput).toBeVisible();

  // Type something that doesn't match any manager option, then blur.
  await managerInput.click();
  await managerInput.fill("");
  await managerInput.pressSequentially("Not a real manager");
  await managerInput.blur();

  // Strict-match: visible input clears to empty, hidden <select> stays "".
  await expect(managerInput).toHaveValue("");
  await expect(page.locator("select[name='managerId']")).toHaveValue("");

  // Sanity: a real partial name still resolves to the option on blur.
  await managerInput.click();
  await managerInput.pressSequentially("Morgan");
  await managerInput.blur();
  await expect(managerInput).toHaveValue("Morgan Manager");
  await expect(page.locator("select[name='managerId']")).toHaveValue(ids.manager);
});

test("admin reaches departments", async ({ page }) => {
  await page.goto("/departments");
  await expect(page).not.toHaveURL(/login|access-denied/);
  // Exact match: admins can create additional departments during normal use
  // (e.g. "People Operations"), so non-exact substring matches collide.
  await expect(
    page.getByRole("cell", { name: "Engineering", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Operations", exact: true }),
  ).toBeVisible();
});

test("admin creates performance cycle and employee goal", async ({ page }) => {
  const cycleTitle = uniqueName("Admin Cycle");
  const goalTitle = uniqueName("Admin Goal");

  await page.goto("/performance");
  await page.locator("#cycle-form summary").click();
  await page.getByLabel("Cycle title").fill(cycleTitle);
  await page.locator("#cycle-status").selectOption("active");
  await page.getByLabel("Start date").fill("2026-01-01");
  await page.getByLabel("End date").fill("2026-12-31");
  await page.locator("#cycle-due").fill("2026-12-31");
  await page.getByRole("button", { name: "Create cycle" }).click();
  await expect(page.getByText("Review cycle created.").first()).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.locator("#goal-form summary").click();
  await page.locator("#goal-employee").fill("Alice Employee");
  await page.locator("#goal-cycle").fill(cycleTitle);
  await page.getByLabel("Goal title").fill(goalTitle);
  await page.locator("#goal-status").selectOption("in_progress");
  // Scope by id: /performance also renders one EmployeeGoalProgressForm
  // per existing goal, each with its own "Progress" labeled field, so
  // getByLabel("Progress") is no longer unique once any goal exists.
  await page.locator("#goal-progress").fill("35");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Goal created and submitted.").first()).toBeVisible();

  const { data: cycle } = await supabaseAdmin
    .from("performance_review_cycles")
    .select("id")
    .eq("title", cycleTitle)
    .single();
  const { data: goal } = await supabaseAdmin
    .from("performance_goals")
    .select("id, employee_id")
    .eq("title", goalTitle)
    .single();

  expect(goal?.employee_id).toBe(ids.alice);
  await expectAudit("performance.cycle_activated", cycle?.id as string);
  await expectAudit("performance.goal_created", goal?.id as string);
});

test("admin edits review cycle from the cycle list", async ({ page }) => {
  const cycleTitle = uniqueName("Admin Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const updatedTitle = `${cycleTitle} Updated`;

  await page.goto("/performance#review-cycles");
  const row = page.getByRole("row").filter({ hasText: cycleTitle });
  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(new RegExp(`cycleId=${cycleId}.*#cycle-form`));
  // Session 151: CollapsibleSection became controlled (`useState(defaultOpen=false)`),
  // so the URL hash no longer auto-opens the panel — expand it explicitly.
  await page.locator("#cycle-form > summary").click();
  await expect(page.getByLabel("Cycle title")).toHaveValue(cycleTitle);

  await page.getByLabel("Cycle title").fill(updatedTitle);
  await page.locator("#cycle-status").selectOption("closed");
  await page.getByLabel("End date").fill("2026-11-30");
  await page.getByRole("button", { name: "Save cycle" }).click();
  await expect(page.getByText("Review cycle updated.").first()).toBeVisible();

  const { data: cycle, error } = await supabaseAdmin
    .from("performance_review_cycles")
    .select("title, status, end_date")
    .eq("id", cycleId)
    .single();
  expect(error).toBeNull();
  expect(cycle).toMatchObject({
    title: updatedTitle,
    status: "closed",
    end_date: "2026-11-30",
  });
  await expectAudit("performance.cycle_closed", cycleId);
  await page.reload();
  await page.locator("#past-cycles summary").click();
  await expect(page.getByRole("row").filter({ hasText: updatedTitle })).toBeVisible();
});

test("admin confirms in-page before disabling an effective performance deadline lock", async ({ page }) => {
  const cycleTitle = uniqueName("Admin Locked Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const { error: lockError } = await supabaseAdmin
    .from("performance_review_cycles")
    .update({ submission_deadline: "2026-05-01", submission_lock_enabled: true })
    .eq("id", cycleId);
  expect(lockError).toBeNull();

  await page.goto(`/performance?view=cycles&cycleId=${cycleId}#cycle-form`);
  await expect(page.getByText("Employees can still acknowledge submitted appraisals.")).toBeVisible();
  await expect(page.locator("#cycle-submission-lock")).toBeChecked();
  await page.locator("#cycle-submission-deadline").fill("2026-12-31");
  await expect(page.getByRole("button", { name: "Unlock and save" })).toHaveCount(0);
  await page.locator("#cycle-submission-deadline").fill("2026-05-01");
  await page.locator("#cycle-submission-lock").uncheck();

  await expect(
    page.getByText("Disabling this hard-lock immediately allows goal, appraisal, and self-review authored changes again."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save cycle" })).toBeDisabled();
  await page.getByRole("button", { name: "Keep hard-lock" }).click();
  await expect(page.locator("#cycle-submission-lock")).toBeChecked();
  await expect(page.getByRole("button", { name: "Unlock and save" })).toHaveCount(0);

  const { data: unchanged } = await supabaseAdmin
    .from("performance_review_cycles")
    .select("submission_lock_enabled")
    .eq("id", cycleId)
    .single();
  expect(unchanged?.submission_lock_enabled).toBe(true);

  await page.locator("#cycle-submission-lock").uncheck();
  await page.getByRole("button", { name: "Unlock and save" }).click();
  await expect(page.getByText("Review cycle updated.").first()).toBeVisible();
  await expect(page.locator("#cycle-submission-lock")).not.toBeChecked();

  const { data: unlocked } = await supabaseAdmin
    .from("performance_review_cycles")
    .select("submission_lock_enabled")
    .eq("id", cycleId)
    .single();
  expect(unlocked?.submission_lock_enabled).toBe(false);
  await expectAudit("performance.cycle_lock_disabled", cycleId);

  await page.reload();
  await expect(page.locator("#cycle-submission-lock")).not.toBeChecked();
});

test("admin performance goal rejects blank required fields at the Zod boundary", async ({ page }) => {
  const goalTitle = uniqueName("Admin Blank Goal");

  await page.goto("/performance");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.locator("#goal-form summary").click();
  await page.locator("#goal-employee").fill("Alice Employee");
  await page.locator("#goal-employee").blur();
  await page.getByLabel("Goal title").fill(goalTitle);
  // Scope by id (see note in the goal-create test above).
  await page.locator("#goal-progress").fill("");
  await page.evaluate(() => {
    document.querySelectorAll("input, select, textarea").forEach((element) => {
      element.removeAttribute("required");
    });
  });
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("Check the highlighted fields.").first()).toBeVisible();
  await expect(page.getByText("Select a review cycle.")).toBeVisible();
  await expect(page.getByText("Progress is required.")).toBeVisible();
});

test("admin leave balance rejects blank required fields at the Zod boundary", async ({ page }) => {
  await page.goto("/leave/admin");
  // B3/F6 — Leave balances panel is now default-closed; expand it first.
  await page
    .locator("details")
    .filter({ hasText: "Leave balances" })
    .locator("summary")
    .first()
    .click();
  // C5: form is always-visible. C6: leave type is now a native <select>.
  await page.locator("#lb-employee").fill("Alice Employee");
  await page.locator("#lb-employee").blur();
  await page.locator("#lb-type").selectOption({ label: "Local Leave" });
  await page.locator("#lb-balance").fill("");
  await page.locator("#lb-year").fill("");
  await page.evaluate(() => {
    document.querySelectorAll("input, select, textarea").forEach((element) => {
      element.removeAttribute("required");
    });
  });
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  await expect(page.getByText("Balance is required.")).toBeVisible();
  await expect(page.getByText("Year is required.")).toBeVisible();
});

test("admin onboarding individual task rejects blank title at the Zod boundary", async ({ page }) => {
  await page.goto("/onboarding/admin");
  await page.locator("#assign-tasks-panel summary").click();
  await page.getByRole("button", { name: "Individual task" }).click();
  await page.locator("#it-employee").fill("Alice Employee");
  await page.locator("#it-employee").blur();
  await page.evaluate(() => {
    document.querySelectorAll("input, select, textarea").forEach((element) => {
      element.removeAttribute("required");
    });
  });
  await page.getByRole("button", { name: "Assign task" }).click();

  await expect(page.getByText("Check the highlighted fields.").first()).toBeVisible();
  await expect(page.getByText("Title is required.")).toBeVisible();
});

test("admin approves manager leave request", async ({ page }) => {
  const typeName = uniqueName("Admin Approves Manager Leave");
  const managerNote = uniqueName("Manager leave for admin approval");
  const leaveYear = 2026;
  const startingBalance = 5;

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: typeName,
      description: "Created by Playwright to verify admin approval of manager leave.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  if (leaveType?.id) createdLeaveTypeIds.push(leaveType.id as string);

  const { error: balanceError } = await supabaseAdmin
    .from("leave_balances")
    .insert({
      employee_id: ids.manager,
      leave_type_id: leaveType?.id,
      year: leaveYear,
      balance: startingBalance,
      created_by: ids.admin,
      updated_by: ids.admin,
    });
  expect(balanceError).toBeNull();

  const { data: request, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.manager,
      leave_type_id: leaveType?.id,
      start_date: "2026-09-14",
      end_date: "2026-09-15",
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
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toBeHidden();

  const { data: approvedRequest } = await supabaseAdmin
    .from("leave_requests")
    .select("status, approver_id")
    .eq("id", request?.id)
    .single();
  expect(approvedRequest?.status).toBe("approved");
  expect(approvedRequest?.approver_id).toBe(ids.admin);

  const { data: balance } = await supabaseAdmin
    .from("leave_balances")
    .select("balance")
    .eq("employee_id", ids.manager)
    .eq("leave_type_id", leaveType?.id)
    .eq("year", leaveYear)
    .single();
  expect(Number(balance?.balance)).toBe(startingBalance - 2);
  await expectAudit("leave.approved", request?.id as string);
});

test("admin cannot self-appraise via crafted form", async ({ page }) => {
  const cycleTitle = uniqueName("Admin Self Appraise Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);

  await page.goto("/performance/reviews");
  // SearchableSelectField renders a visible <input name="employeeIdSearch"> and
  // a React-controlled sr-only <select name="employeeId"> that carries the
  // form value. The crafted attack injects the admin UUID into the hidden
  // select via React's prototype value setter (so React picks up the new
  // value), and disables HTML5 `required` on the visible input so the
  // browser does not block the forged submit before it reaches the server.
  //
  // Wait for the client to hydrate before mutating the React-controlled
  // select. Under Next.js dev HMR the cycle dropdown may render its options
  // late on a freshly-compiled page; in parallel test runs the React state
  // we're about to inject can be lost if hydration is still in flight.
  const cycleSelect = page.locator('select[name="cycleId"]');
  await expect(cycleSelect.locator("option")).not.toHaveCount(0);
  const employeeSelect = page.locator('select[name="employeeId"]');
  await expect(async () => {
    await employeeSelect.evaluate((el, value) => {
      const select = el as HTMLSelectElement;
      if (!Array.from(select.options).some((o) => o.value === value)) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.text = "Crafted admin self";
        select.appendChild(opt);
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )!.set!;
      setter.call(select, value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, ids.admin);
    await expect(employeeSelect).toHaveValue(ids.admin, { timeout: 1500 });
  }).toPass({ timeout: 15000 });
  await page.locator('input[name="employeeIdSearch"]').evaluate((el) => {
    (el as HTMLInputElement).removeAttribute("required");
  });
  await selectLocatorOptionByText(
    page.locator('select[name="cycleId"]'),
    cycleTitle,
  );
  await page.locator("#review-score").selectOption("5");
  await page.locator("#review-strengths").fill("Attempted crafted self appraisal.");
  await page.locator("#review-improvements").fill("This should be blocked by separation of duties.");
  await page.locator("#review-next").fill("No review row should be created.");

  // Right before submit: re-inject the crafted admin option and re-plant the
  // DOM value WITHOUT dispatching events. Earlier state-changing interactions
  // (cycle select, score, etc.) trigger React re-renders that wipe the
  // SearchableSelectField's vDOM <option> children — and after the wipe, the
  // <select>'s DOM value can no longer point at admin. No event dispatch
  // here means React doesn't get a chance to re-render before the click;
  // React 19's form action reads FormData from current DOM at submit time.
  // Also re-clear `required` on the search input for the same reason.
  await employeeSelect.evaluate((el, value) => {
    const select = el as HTMLSelectElement;
    if (!Array.from(select.options).some((o) => o.value === value)) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.text = "Crafted admin self";
      select.appendChild(opt);
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!;
    setter.call(select, value);
  }, ids.admin);
  await page.locator('input[name="employeeIdSearch"]').evaluate((el) => {
    (el as HTMLInputElement).removeAttribute("required");
  });

  await page.getByRole("button", { name: "Submit appraisal" }).click();
  await expect(page.getByText("You can only appraise employees in your scope.").first()).toBeVisible();

  const { data: reviews, error } = await supabaseAdmin
    .from("performance_reviews")
    .select("id")
    .eq("employee_id", ids.admin)
    .eq("cycle_id", cycleId);
  expect(error).toBeNull();
  expect(reviews).toHaveLength(0);
});

test("admin appraisal preserves existing self-review and assigned manager", async ({ page }) => {
  const cycleTitle = uniqueName("Admin Existing Review Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const selfReview = uniqueName("Employee self-review to preserve");
  const reviewId = await createPerformanceReview({
    employeeId: ids.alice,
    managerId: ids.manager,
    cycleId,
    status: "self_reviewed",
  });

  const { error: seedError } = await supabaseAdmin
    .from("performance_reviews")
    .update({ self_review: selfReview, updated_by: ids.alice })
    .eq("id", reviewId);
  expect(seedError).toBeNull();

  await page.goto("/performance/reviews");
  // Target the sr-only <select name="employeeId"> behind SearchableSelectField,
  // by stable UUID rather than display name (admins may rename users).
  await page.locator('select[name="employeeId"]').selectOption(ids.alice);
  await selectLocatorOptionByText(
    page.locator('select[name="cycleId"]'),
    cycleTitle,
  );
  await page.locator("#review-score").selectOption("4");
  await page.locator("#review-strengths").fill("Strong customer follow-through.");
  await page.locator("#review-improvements").fill("Keep refining estimation.");
  await page.locator("#review-next").fill("Lead the next planning review.");
  await page.getByRole("button", { name: "Submit appraisal" }).click();
  await expect(page.getByText("Manager appraisal submitted.").first()).toBeVisible();

  const { data: review, error } = await supabaseAdmin
    .from("performance_reviews")
    .select("status, score, self_review, manager_id, updated_by")
    .eq("id", reviewId)
    .single();
  expect(error).toBeNull();
  expect(review?.status).toBe("manager_submitted");
  expect(review?.score).toBe(4);
  expect(review?.self_review).toBe(selfReview);
  expect(review?.manager_id).toBe(ids.manager);
  expect(review?.updated_by).toBe(ids.admin);
  await expectAudit("performance.review_manager_submitted", reviewId);
});

test("new hire journey creates employee, assigns onboarding, and employee completes task", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const employeeName = `Journey Employee ${suffix}`;
  const employeeEmail = `journey-${suffix}@kushhr.dev`;
  const taskTitle = uniqueName("Journey onboarding task");
  const password = "TestPass123!";

  // Capture for the finally cleanup. Resolved inside the try after the
  // profile is created; the finally checks `journeyUserId` is truthy.
  let journeyUserId: string | undefined;

  try {
  await page.goto("/employees/new");
  await page.getByLabel("Full name").fill(employeeName);
  await page.getByLabel("Work email").fill(employeeEmail);
  await page.getByLabel("Phone").fill("+230 5555 0101");
  // See note above: `getByLabel("Role")` collides with Work-location helper text.
  await page.locator('select[name="role"]').selectOption("employee");
  await page.getByLabel("Job title").fill("QA Journey Analyst");
  await selectOptionByText(page, "Employment status", "Active");
  await selectOptionByText(page, "Employment type", "Full time");
  await page.getByLabel("Start date").fill("2026-05-01");
  await page.getByLabel("Work location").fill("Mauritius");
  await page.getByPlaceholder("Search department").fill("Engineering");
  await page.getByPlaceholder("Search manager").fill("Morgan Manager");
  await page.getByRole("button", { name: "Create employee" }).click();
  // 15s timeout: same heavy-createUser cold-stack exposure as the create at :760.
  await expect(page.getByText("Employee created. Generate a password reset link before first login.")).toBeVisible({ timeout: 15_000 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name, work_email")
    .eq("work_email", employeeEmail)
    .single();
  expect(profile?.display_name).toBe(employeeName);
  expect(profile?.role).toBe("employee");
  journeyUserId = profile?.id as string | undefined;
  await expectAudit("employee.created", profile?.id as string);

  const { data: record } = await supabaseAdmin
    .from("employee_records")
    .select("manager_id, job_title")
    .eq("employee_id", profile?.id)
    .single();
  expect(record?.manager_id).toBe(ids.manager);
  expect(record?.job_title).toBe("QA Journey Analyst");

  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    profile?.id as string,
    { password },
  );
  expect(passwordError).toBeNull();

  await page.goto("/onboarding/admin");
  await page.locator("#assign-tasks-panel summary").click();
  await page.getByRole("button", { name: "Individual task" }).click();
  await page.locator("#it-employee").fill(employeeName);
  await page.locator("#it-title").fill(taskTitle);
  await page.locator("#it-desc").fill("Confirm the new hire can receive and complete assigned work.");
  await page.locator("#it-due").fill("2026-05-08");
  await page.getByRole("button", { name: "Assign task" }).click();
  await expect(page.getByText("Task assigned.").first()).toBeVisible();

  const { data: task } = await supabaseAdmin
    .from("onboarding_tasks")
    .select("id, employee_id, status")
    .eq("employee_id", profile?.id)
    .eq("title", taskTitle)
    .single();
  expect(task?.status).toBe("pending");
  await expectAudit("onboarding.task_assigned", task?.id as string);

  const employeeContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const employeePage = await employeeContext.newPage();
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
  await employeePage.goto(`${baseURL}/login`);
  await employeePage.getByLabel("Email").fill(employeeEmail);
  await employeePage.getByLabel("Password").fill(password);
  await employeePage.getByRole("button", { name: "Sign in" }).click();
  await expect(employeePage).toHaveURL(/dashboard/);
  // Session 111 dropped the top-header "displayName · role" strip; the
  // greeting now carries the signed-in identity. First name = displayName
  // split on the first whitespace ("Journey Employee 2026…" → "Journey").
  await expect(employeePage.getByTestId("dashboard-greeting")).toContainText(
    employeeName.split(/\s+/)[0],
  );

  await employeePage.goto(`${baseURL}/onboarding`);
  const taskRow = employeePage.getByRole("row").filter({ hasText: taskTitle });
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name: "Mark complete" }).click();
  // Wait for the Mark-complete form to drop (a cleaner signal than text)
  // before asserting the status. completeTask → revalidatePath → server
  // refetch → re-render can run past Playwright's 5s default under load,
  // so give the chain a wider window — the DB row is already updated by
  // the time the action returns; this is purely a UI-render wait.
  await expect(
    taskRow.getByRole("button", { name: "Mark complete" }),
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(taskRow.getByText("completed")).toBeVisible();
  await employeeContext.close();

  const { data: completedTask } = await supabaseAdmin
    .from("onboarding_tasks")
    .select("status, completed_at")
    .eq("id", task?.id)
    .single();
  expect(completedTask?.status).toBe("completed");
  expect(completedTask?.completed_at).toBeTruthy();
  await expectAudit("onboarding.task_completed", task?.id as string);
  } finally {
    // Session 112 — explicit per-test cleanup. The pre-suite
    // `npm run cleanup:e2e-data` would normally catch the journey-prefixed
    // email + profile, but if the script aborts mid-run the journey user
    // accumulates. Deleting here means each run leaves zero residue
    // regardless of whether the cleanup script later succeeds.
    if (journeyUserId) {
      // Delete dependent rows first (RESTRICT FKs to profiles.id), then
      // the profile, then the auth user. Errors are swallowed so a
      // partially-completed test still cleans what it can.
      const tablesByEmployee = [
        "performance_reviews",
        "performance_goals",
        "leave_requests",
        "leave_balances",
        "employee_compensation",
        "employee_records",
        "onboarding_tasks",
        "documents",
      ];
      for (const table of tablesByEmployee) {
        await supabaseAdmin.from(table).delete().eq("employee_id", journeyUserId);
      }
      // documents.uploaded_by also RESTRICTs the profile delete.
      await supabaseAdmin.from("documents").delete().eq("uploaded_by", journeyUserId);
      await supabaseAdmin.from("profiles").delete().eq("id", journeyUserId);
      await supabaseAdmin.auth.admin.deleteUser(journeyUserId);
    }
  }
});

test("admin Settings page renders all three sections and persists changes", async ({ page }) => {
  // Capture current settings so we can restore at the end of the test.
  const { data: before } = await supabaseAdmin
    .from("app_settings")
    .select("company_name, company_address, company_logo_url, local_leave_default_days, sick_leave_default_days, working_days, timezone, currency")
    .eq("singleton", true)
    .single();

  try {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Company" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Leave policy defaults" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Working week, timezone, currency" })).toBeVisible();

    const newName = uniqueName("Acme HR");
    await page.locator("#company-name").fill(newName);
    await page.locator("#local-leave-default").fill("18");
    await page.locator("#sick-leave-default").fill("11");
    await page.locator("#settings-timezone").fill("UTC");
    await page.locator("#settings-currency").selectOption("USD");
    await page.getByRole("button", { name: "Save settings" }).click();
    // "Settings saved." now appears in two places (top Alert + inline near-Save
    // status). Either is sufficient to confirm the save echoed. 15s timeout: the
    // save cascades app_settings -> profile -> auth user and runs slow on the
    // self-host single-container stack.
    await expect(page.getByText("Settings saved.").first()).toBeVisible({ timeout: 15_000 });

    const { data: after } = await supabaseAdmin
      .from("app_settings")
      .select("company_name, local_leave_default_days, sick_leave_default_days, timezone, currency")
      .eq("singleton", true)
      .single();
    expect(after).toMatchObject({
      company_name: newName,
      local_leave_default_days: 18,
      sick_leave_default_days: 11,
      timezone: "UTC",
      currency: "USD",
    });

    await expectAudit("app_settings.updated");
  } finally {
    if (before) {
      await supabaseAdmin
        .from("app_settings")
        .update(before)
        .eq("singleton", true);
    }
  }
});

test("admin Settings rejects invalid logo URL, timezone, and currency at the Zod boundary", async ({ page }) => {
  await page.goto("/settings");
  await page.locator("#company-logo").fill("not-a-url");
  await page.locator("#settings-timezone").fill("Mauritius/Somewhere");
  await page.locator("#settings-currency").evaluate((select) => {
    const el = select as HTMLSelectElement;
    const opt = document.createElement("option");
    opt.value = "DOLLARS";
    opt.text = "DOLLARS";
    el.appendChild(opt);
    el.value = "DOLLARS";
  });
  await page.getByRole("button", { name: "Save settings" }).click();
  // Error message renders in both the top Alert and the inline near-Save status.
  await expect(page.getByText("Check the highlighted fields.").first()).toBeVisible();
  await expect(page.getByText("Logo URL must start with http:// or https://.")).toBeVisible();
  await expect(page.getByText("Timezone must be a valid IANA timezone.")).toBeVisible();
  await expect(page.getByText("Currency must be a 3-letter ISO code (e.g. MUR).")).toBeVisible();
});

test("admin rollover seeds Local + Sick leave balances for next year and is idempotent", async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;

  // Wipe Alice's next-year Local/Sick balances so we can observe the rollover create them.
  const { data: types } = await supabaseAdmin
    .from("leave_types")
    .select("id, name")
    .in("name", ["Local Leave", "Sick Leave"])
    .eq("is_active", true);
  const typeIds = (types ?? []).map((t) => t.id as string);

  await supabaseAdmin
    .from("leave_balances")
    .delete()
    .eq("employee_id", ids.alice)
    .eq("year", nextYear)
    .in("leave_type_id", typeIds);

  try {
    await page.goto("/leave/admin");
    await page.getByRole("button", { name: new RegExp(`Roll over to ${nextYear}`) }).click();
    await expect(page.getByText(new RegExp(`Rolled over .* for ${nextYear}`))).toBeVisible();

    const { data: after } = await supabaseAdmin
      .from("leave_balances")
      .select("leave_type_id, balance, year")
      .eq("employee_id", ids.alice)
      .eq("year", nextYear)
      .in("leave_type_id", typeIds);
    expect(after?.length).toBe(typeIds.length);

    // Idempotence: clicking again should not change Alice's existing balances.
    const aliceBefore = new Map((after ?? []).map((r) => [r.leave_type_id as string, Number(r.balance)]));
    await page.getByRole("button", { name: new RegExp(`Roll over to ${nextYear}`) }).click();
    await expect(page.getByText(/Skipped \d+ \(already present\)/)).toBeVisible();

    const { data: afterTwo } = await supabaseAdmin
      .from("leave_balances")
      .select("leave_type_id, balance")
      .eq("employee_id", ids.alice)
      .eq("year", nextYear)
      .in("leave_type_id", typeIds);
    for (const row of afterTwo ?? []) {
      expect(aliceBefore.get(row.leave_type_id as string)).toBe(Number(row.balance));
    }

    await expectAudit("leave.balances_rolled_over");
  } finally {
    await supabaseAdmin
      .from("leave_balances")
      .delete()
      .eq("employee_id", ids.alice)
      .eq("year", nextYear)
      .in("leave_type_id", typeIds);
  }
});

test("admin balance form is always visible and saves via native leave-type dropdown (C5+C6)", async ({ page }) => {
  await page.goto("/leave/admin");
  // B3/F6 — Leave balances panel is now default-closed; expand it first. The
  // form is still rendered inline at the top of the panel content (C5+C6),
  // just inside a collapsed <details> wrapper.
  await page
    .locator("details")
    .filter({ hasText: "Leave balances" })
    .locator("summary")
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Set or update balance" })).toBeVisible();
  // Native <select> exposes a tag name and options[].
  const select = page.locator("#lb-type");
  await expect(select).toHaveJSProperty("tagName", "SELECT");

  const controls = [
    page.locator("#lb-employee"),
    select,
    page.locator("#lb-balance"),
    page.locator("#lb-year"),
    page.locator("#lb-save"),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
  }

  const boxes = await Promise.all(
    controls.map(async (control) => {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      return box!;
    }),
  );
  const tops = boxes.map((box) => box.y);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
});

test("admin create-employee form prefills manager from selected department (E1)", async ({ page }) => {
  // The Engineering department's manager is Morgan Manager (seed). When
  // an admin picks Engineering on /employees/new, the Manager field
  // should auto-fill with Morgan; admin can still override.
  const { data: engDept } = await supabaseAdmin
    .from("departments")
    .select("id, manager_id")
    .eq("name", "Engineering")
    .single();
  expect(engDept?.manager_id).toBe(ids.manager);

  await page.goto("/employees/new");
  // SearchableSelectField is keyed by name=...Search for its visible text input.
  await page.locator("input[name='departmentIdSearch']").fill("Engineering");
  await page.locator("input[name='departmentIdSearch']").blur();
  await expect(page.locator("input[name='managerIdSearch']")).toHaveValue(
    "Morgan Manager",
  );
});

// ─── Batch 1 regressions (manual UAT 2026-05-13) ────────────────────────────
// These three tests pin fixes that the existing 110-test suite did not catch.
// Each seeds its own auth user / audit row via service role to stay safe under
// parallel execution. Cleanup runs in `finally` so a failure mid-test doesn't
// leak rows into manual review.

// A1: terminating an employee from /employees/[id]/edit must persist the new
// Status across both the edit form re-render and the profile detail page.
// Pre-fix: React's successful form-action reset pushed the native Status
// select back to its initial Active option while the action success message
// remained visible.
test("A1 — terminate-save persists Status on edit and profile pages", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `a1-terminate-${suffix}@kushhr.dev`;
  const fullName = `A1 Terminate Subject ${suffix}`;

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  expect(createError).toBeNull();
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    const { error: insertError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: userId,
        job_title: "A1 QA Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: "2026-01-01",
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertError).toBeNull();

    await page.goto(`/employees/${userId}/edit`);
    await selectOptionByText(page, "Employment status", "Terminated");
    // End date auto-defaults to today when Status flips to Terminated.
    const today = new Date().toISOString().slice(0, 10);
    await expect(page.getByLabel("End date")).toHaveValue(today);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Employee updated.")).toBeVisible();

    // In-place post-save: the form must still display the canonical saved
    // values without relying on a route reload or native form reset.
    await expect(page.locator('select[name="employmentStatus"]')).toHaveValue("terminated");
    await expect(page.getByLabel("End date")).toHaveValue(today);

    // DB row reflects the new status (the durable contract).
    const { data: savedRecord } = await supabaseAdmin
      .from("employee_records")
      .select("employment_status, end_date")
      .eq("employee_id", userId)
      .single();
    expect(savedRecord?.employment_status).toBe("terminated");
    expect(savedRecord?.end_date).toBe(today);

    // Reload the edit page: the revalidated RSC must render Terminated.
    // (Pre-fix the edit route was not revalidated, so a reload still showed Active.)
    await page.goto(`/employees/${userId}/edit`);
    await expect(page.locator('select[name="employmentStatus"]')).toHaveValue("terminated");
    await expect(page.getByLabel("End date")).toHaveValue(today);

    // Profile detail page surfaces the new status.
    await page.goto(`/employees/${userId}`);
    const profileSection = page.locator("section").filter({ hasText: "Profile" }).first();
    await expect(profileSection.getByText("terminated")).toBeVisible();
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId as string);
  }
});

// A2: the dashboard Leavers card must count terminations whose end_date is
// NULL but whose updated_at is within the last 30 days. Pre-fix the .gte
// predicate excluded null end_date rows entirely.
test("A2 — Leavers DAL predicate counts null end_date inside the 30d window only", async () => {
  // Pre-fix the Leavers query used .gte("end_date", sinceDate), which silently
  // excluded rows where end_date IS NULL — exactly the state created by a
  // termination without a manually-entered end date. The fix adds an OR
  // fallback that catches null-end_date rows whose updated_at is in window.
  //
  // We don't read the dashboard card here: under fullyParallel other tests
  // mutate employee_records concurrently, so dashboard counts are unstable.
  // Instead we re-run the DAL's exact OR predicate scoped to our own seeded
  // rows, which is parallel-safe and pins the filter logic directly.

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { data: inUser } = await supabaseAdmin.auth.admin.createUser({
    email: `a2-in-${suffix}@kushhr.dev`,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `A2 In ${suffix}` },
  });
  const inUserId = inUser.user?.id;
  expect(inUserId).toBeTruthy();

  const { data: outUser } = await supabaseAdmin.auth.admin.createUser({
    email: `a2-out-${suffix}@kushhr.dev`,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `A2 Out ${suffix}` },
  });
  const outUserId = outUser.user?.id;
  expect(outUserId).toBeTruthy();

  try {
    // The set_updated_at BEFORE UPDATE trigger overrides updated_at on every
    // UPDATE, so to control updated_at we set it on INSERT and never UPDATE
    // the row. Row 1: updated_at = now (in-window). Row 2: updated_at = 40
    // days ago (out-of-window).
    const fortyDaysAgo = new Date();
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
    const fortyDaysAgoIso = fortyDaysAgo.toISOString();

    const { error: insertInError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: inUserId,
        job_title: "A2 In-window",
        employment_status: "terminated",
        employment_type: "full_time",
        start_date: "2025-01-01",
        end_date: null,
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertInError).toBeNull();

    const { error: insertOutError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: outUserId,
        job_title: "A2 Out-of-window",
        employment_status: "terminated",
        employment_type: "full_time",
        start_date: "2024-01-01",
        end_date: null,
        work_location: "Mauritius",
        created_at: fortyDaysAgoIso,
        updated_at: fortyDaysAgoIso,
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertOutError).toBeNull();

    // Re-run the dashboard DAL's exact OR predicate (see src/server/dal/dashboard.ts).
    const now = new Date();
    const thirty = new Date(now);
    thirty.setDate(now.getDate() - 30);
    const sinceDate = thirty.toISOString().slice(0, 10);
    const sinceIso = thirty.toISOString();

    const { data: matched, error: queryError } = await supabaseAdmin
      .from("employee_records")
      .select("employee_id")
      .eq("employment_status", "terminated")
      .or(`end_date.gte.${sinceDate},and(end_date.is.null,updated_at.gte.${sinceIso})`)
      .in("employee_id", [inUserId as string, outUserId as string]);
    expect(queryError).toBeNull();

    const matchedIds = (matched ?? []).map((r) => r.employee_id);
    expect(matchedIds).toContain(inUserId);
    expect(matchedIds).not.toContain(outUserId);
  } finally {
    await supabaseAdmin.from("employee_records").delete().in("employee_id", [inUserId, outUserId]);
    await supabaseAdmin.from("profiles").delete().in("id", [inUserId, outUserId]);
    if (inUserId) await supabaseAdmin.auth.admin.deleteUser(inUserId);
    if (outUserId) await supabaseAdmin.auth.admin.deleteUser(outUserId);
  }
});

// A3: /audit-logs must expose an Entity ID filter (UUID of the target record)
// and ignore invalid UUIDs with an amber banner. The DAL has supported the
// filter for a while; this pins the UI wiring.
test("A3 — audit logs Entity ID filter narrows results and rejects invalid UUIDs", async ({ page }) => {
  const action = `audit.entity_filter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const entityId = crypto.randomUUID();

  const { error: insertError } = await supabaseAdmin.from("audit_logs").insert({
    actor: ids.admin,
    action,
    entity: "audit_filter_test",
    entity_id: entityId,
    metadata: { source: "playwright-a3" },
  });
  expect(insertError).toBeNull();

  try {
    await page.goto(`/audit-logs?entityId=${entityId}`);
    await expect(page.getByRole("alert").filter({ hasText: "Entity ID filter ignored" })).toHaveCount(0);
    await expect(page.getByText(action)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.goto(`/audit-logs?entityId=not-a-uuid&action=${encodeURIComponent(action)}`);
    await expect(
      page.getByRole("alert").filter({ hasText: "Entity ID filter ignored" }),
    ).toBeVisible();
  } finally {
    await supabaseAdmin.from("audit_logs").delete().eq("action", action);
  }
});

// B3 follow-up: quick-filter shortcuts for forge-probe detection. Two
// one-click buttons on /audit-logs prefill URL params for the new audit
// families (input.validation_failed, entity.not_found) scoped to today.

test("B3 quick filter — Suspicious input shortcut prefills action + today", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor: ids.admin,
      action: "input.validation_failed",
      entity: "server_action",
      entity_id: null,
      metadata: {
        resource: "playwright.quick_filter_test",
        fields: ["entityId"],
        issue_codes: ["invalid_format"],
      },
    })
    .select("id")
    .single();
  expect(insertError).toBeNull();
  expect(inserted?.id).toBeTruthy();

  try {
    await page.goto("/audit-logs");
    // Quick-filter panel is collapsed by default — expand it first.
    await page.getByText("SECURITY CONTROLS (FUTURE USE)").click();
    await page.getByRole("button", { name: /suspicious input/i }).click();
    // URL params are serialised in form-input order (from, to, action), so
    // assert each param independently instead of pinning order in one regex.
    await expect(page).toHaveURL(/action=input\.validation_failed/);
    await expect(page).toHaveURL(new RegExp(`from=${today}`));
    await expect(
      page.locator('[data-quick-filter="active"]', { hasText: /suspicious input/i }),
    ).toBeVisible();
    // The seeded row appears in the filtered table.
    await expect(page.locator("tbody tr").first()).toBeVisible();
  } finally {
    await supabaseAdmin.from("audit_logs").delete().eq("id", inserted!.id);
  }
});

test("B3 quick filter — Missing-entity probes shortcut prefills action + today", async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  const phantomId = crypto.randomUUID();

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      actor: ids.admin,
      action: "entity.not_found",
      entity: "leave_request",
      entity_id: phantomId,
      metadata: { resource: "playwright.quick_filter_test" },
    })
    .select("id")
    .single();
  expect(insertError).toBeNull();
  expect(inserted?.id).toBeTruthy();

  try {
    await page.goto("/audit-logs");
    await page.getByText("SECURITY CONTROLS (FUTURE USE)").click();
    await page.getByRole("button", { name: /missing-entity probes/i }).click();
    await expect(page).toHaveURL(/action=entity\.not_found/);
    await expect(page).toHaveURL(new RegExp(`from=${today}`));
    await expect(
      page.locator('[data-quick-filter="active"]', { hasText: /missing-entity probes/i }),
    ).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
  } finally {
    await supabaseAdmin.from("audit_logs").delete().eq("id", inserted!.id);
  }
});

// ─── Batch 2 regressions (manual UAT 2026-05-13) ────────────────────────────
// B1: phone empty-state. B2: enum capitalisation in display layer.

// B1: the create/edit Phone input defaults to "+230 " for the Mauritius
// country code. Saving without typing digits would otherwise persist
// "+230" as a value, which then renders on the profile as a partial-looking
// value rather than "no phone on file". Save-side fix strips country-code-
// only strings to null; display also tolerates legacy "+230" rows.
test("B1 — country-code-only phone is stripped to null on save and displays as Not set", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `b1-phone-${suffix}@kushhr.dev`;

  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `B1 Phone ${suffix}` },
  });
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    const { error: insertError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: userId,
        job_title: "B1 QA Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: "2026-01-01",
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertError).toBeNull();

    // Pre-seed phone as the prefix-only legacy value to verify display
    // tolerates existing rows that were saved before the B1 fix.
    await supabaseAdmin.from("profiles").update({ phone: "+230" }).eq("id", userId);

    await page.goto(`/employees/${userId}`);
    const profileSection = page.locator("section").filter({ hasText: "Profile" }).first();
    const phoneRow = profileSection.locator("div").filter({ has: page.getByText("Phone", { exact: true }) }).first();
    await expect(phoneRow).toContainText("Not set");
    await expect(phoneRow).not.toContainText("+230");

    // Save-side: edit the employee, leave Phone at the default "+230 ",
    // submit. The action's phoneToNull preprocess should persist null.
    await page.goto(`/employees/${userId}/edit`);
    // Form prefills phone from existing value; reset to the default prefix.
    await page.getByLabel("Phone").fill("+230 ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Employee updated.")).toBeVisible();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .single();
    expect(profile?.phone).toBeNull();
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

// B2: enum values were rendered verbatim ("manager", "terminated", "full_time")
// on the profile detail page. Fix capitalises and replaces underscores at the
// display layer.
test("B2 — profile detail capitalises Role, Employment status, and Employment type", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `b2-enum-${suffix}@kushhr.dev`;

  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `B2 Enum ${suffix}` },
  });
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    // Seed a manager with full_time employment so all three enum values
    // exercise the formatEnum path.
    await supabaseAdmin.from("profiles").update({ role: "manager" }).eq("id", userId);
    const { error: insertError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: userId,
        job_title: "B2 QA Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: "2026-01-01",
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertError).toBeNull();

    await page.goto(`/employees/${userId}`);
    // Use role=definition (the <dd> element) to scope to displayed values,
    // not the <dt> labels (which also include the word "Manager").
    const profileValues = page
      .locator("section")
      .filter({ hasText: "Profile" })
      .first()
      .getByRole("definition");
    await expect(profileValues.filter({ hasText: /^Manager$/ })).toHaveCount(1);
    await expect(profileValues.filter({ hasText: /^Active$/ })).toHaveCount(1);
    // Lowercase enum names must not leak through.
    await expect(profileValues.filter({ hasText: /^manager$/ })).toHaveCount(0);
    await expect(profileValues.filter({ hasText: /^active$/ })).toHaveCount(0);

    const jobValues = page
      .locator("section")
      .filter({ hasText: "Job" })
      .first()
      .getByRole("definition");
    await expect(jobValues.filter({ hasText: /^Full time$/ })).toHaveCount(1);
    await expect(jobValues.filter({ hasText: /^full_time$/ })).toHaveCount(0);
    await expect(jobValues.filter({ hasText: /^full time$/ })).toHaveCount(0);
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

test("C1 — Settings save shows inline status next to the Save button", async ({ page }) => {
  const { data: before } = await supabaseAdmin
    .from("app_settings")
    .select("company_name, company_address, company_logo_url, local_leave_default_days, sick_leave_default_days, working_days, timezone, currency")
    .eq("singleton", true)
    .single();

  try {
    await page.goto("/settings");
    const saveButton = page.getByRole("button", { name: "Save settings" });
    const buttonRow = saveButton.locator("..");

    await saveButton.click();

    // Inline status sits in the same flex row as the Save button. 15s timeout:
    // the save runs slow on the self-host single-container stack (see :1419).
    await expect(buttonRow.getByText("Settings saved.")).toBeVisible({ timeout: 15_000 });
  } finally {
    if (before) {
      await supabaseAdmin
        .from("app_settings")
        .update(before)
        .eq("singleton", true);
    }
  }
});

test("C2 — Operational report cards use the shared MetricCard surface", async ({ page }) => {
  await page.goto("/dashboard");
  const operationalReport = page
    .locator("section")
    .filter({ hasText: "Operational report" });
  const startersLink = operationalReport.getByRole("link", {
    name: /Starters, last 30 days/,
  });
  await expect(startersLink).toBeVisible();

  // MetricCard surface assertion. Session 111 dropped the visible border in
  // favour of `shadow-sm`; the legacy ReportItem used `bg-muted/40`. Asserting
  // `bg-white` + `shadow-sm` together is enough to distinguish the shared
  // MetricCard from the old surface.
  const cardSurface = startersLink.locator("div").first();
  await expect(cardSurface).toHaveClass(/bg-white/);
  await expect(cardSurface).toHaveClass(/shadow-sm/);
});

test("C3 — People Directory Start Date renders as DD/MM/YY", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `c3-date-${suffix}@kushhr.dev`;

  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `C3 Date ${suffix}` },
  });
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    const { error: insertError } = await supabaseAdmin
      .from("employee_records")
      .insert({
        employee_id: userId,
        job_title: "C3 Date Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: "2026-03-15",
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      });
    expect(insertError).toBeNull();

    await page.goto(`/employees?q=C3 Date ${suffix}`);
    const row = page.getByRole("row", { name: new RegExp(`C3 Date ${suffix}`) });
    // Compact en-GB DD/MM/YY for 2026-03-15 is "15/03/26".
    await expect(row.getByText("15/03/26", { exact: true })).toBeVisible();
    // The old "15 Mar 2026" long form must not appear in the row-dense table.
    await expect(row.getByText("15 Mar 2026", { exact: true })).toHaveCount(0);
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

test("D1 — People Directory defaults to status=Active and hides terminated employees", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const termEmail = `d1-term-${suffix}@kushhr.dev`;

  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email: termEmail,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `D1 Term ${suffix}` },
  });
  const termId = created.user?.id;
  expect(termId).toBeTruthy();

  try {
    await supabaseAdmin.from("employee_records").insert({
      employee_id: termId,
      job_title: "D1 Term Subject",
      employment_status: "terminated",
      employment_type: "full_time",
      start_date: "2024-01-01",
      end_date: "2026-02-01",
      work_location: "Mauritius",
      created_by: ids.admin,
      updated_by: ids.admin,
    });

    await page.goto("/employees");
    // Default status=Active: the terminated user must not appear.
    await expect(
      page.locator(`a[href="/employees/${termId}"]`),
    ).toHaveCount(0);
    // Status select reflects the Active default.
    await expect(page.locator('select[name="status"]')).toHaveValue("active");

    // Opting into status=all reveals the terminated row.
    await page.goto("/employees?status=all");
    await expect(
      page.locator(`a[href="/employees/${termId}"]`),
    ).toBeVisible();
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", termId);
    await supabaseAdmin.from("profiles").delete().eq("id", termId);
    if (termId) await supabaseAdmin.auth.admin.deleteUser(termId);
  }
});

test("D1 — Role filter narrows the People Directory to the chosen role", async ({ page }) => {
  // Seed managers/Alice/Bob are active by definition. Filter to role=manager
  // and assert: the manager seed row appears, the employee seed rows do not.
  await page.goto("/employees?role=manager");
  await expect(page.locator(`a[href="/employees/${ids.manager}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/employees/${ids.alice}"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="/employees/${ids.bob}"]`)).toHaveCount(0);

  // role=employee inverts the assertion.
  await page.goto("/employees?role=employee");
  await expect(page.locator(`a[href="/employees/${ids.alice}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/employees/${ids.bob}"]`)).toBeVisible();
  await expect(page.locator(`a[href="/employees/${ids.manager}"]`)).toHaveCount(0);
});

test("D1 — Department filter narrows the People Directory to one department", async ({ page }) => {
  // Find Alice's current department; if none assigned, assign a dedicated one
  // for this test and restore at the end.
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deptName = `D1 Dept ${suffix}`;
  const { data: dept } = await supabaseAdmin
    .from("departments")
    .insert({ name: deptName })
    .select("id")
    .single();
  const deptId = dept?.id as string | undefined;
  expect(deptId).toBeTruthy();

  const { data: aliceBefore } = await supabaseAdmin
    .from("employee_records")
    .select("department_id")
    .eq("employee_id", ids.alice)
    .single();
  const aliceOriginalDept = aliceBefore?.department_id as string | null;

  try {
    await supabaseAdmin
      .from("employee_records")
      .update({ department_id: deptId })
      .eq("employee_id", ids.alice);

    await page.goto(`/employees?departmentId=${deptId}`);
    await expect(page.locator(`a[href="/employees/${ids.alice}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/employees/${ids.bob}"]`)).toHaveCount(0);
  } finally {
    await supabaseAdmin
      .from("employee_records")
      .update({ department_id: aliceOriginalDept })
      .eq("employee_id", ids.alice);
    if (deptId)
      await supabaseAdmin.from("departments").delete().eq("id", deptId);
  }
});

test("D2 — Starters dashboard card deep-links to ?recent=starters preset", async ({ page }) => {
  await page.goto("/dashboard");
  const operationalReport = page
    .locator("section")
    .filter({ hasText: "Operational report" });
  const startersLink = operationalReport.getByRole("link", {
    name: /Starters, last 30 days/,
  });
  await expect(startersLink).toHaveAttribute("href", "/employees?recent=starters");
});

test("D2 — /employees?recent=starters scopes the directory to last-30-days starters", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const recentEmail = `d2-recent-${suffix}@kushhr.dev`;
  const oldEmail = `d2-old-${suffix}@kushhr.dev`;

  const { data: recent } = await supabaseAdmin.auth.admin.createUser({
    email: recentEmail,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `D2 Recent ${suffix}` },
  });
  const { data: old } = await supabaseAdmin.auth.admin.createUser({
    email: oldEmail,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `D2 Old ${suffix}` },
  });
  const recentId = recent.user?.id;
  const oldId = old.user?.id;
  expect(recentId).toBeTruthy();
  expect(oldId).toBeTruthy();

  const today = new Date();
  const within30 = new Date(today);
  within30.setUTCDate(within30.getUTCDate() - 5);
  const outside30 = new Date(today);
  outside30.setUTCDate(outside30.getUTCDate() - 120);

  try {
    await supabaseAdmin.from("employee_records").insert([
      {
        employee_id: recentId,
        job_title: "D2 Recent Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: within30.toISOString().slice(0, 10),
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      {
        employee_id: oldId,
        job_title: "D2 Old Subject",
        employment_status: "active",
        employment_type: "full_time",
        start_date: outside30.toISOString().slice(0, 10),
        work_location: "Mauritius",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
    ]);

    await page.goto("/employees?recent=starters");
    // Preset banner confirms the scoped view.
    await expect(
      page.getByText(/Showing people who started in the last 30 days/),
    ).toBeVisible();
    await expect(page.locator(`a[href="/employees/${recentId}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/employees/${oldId}"]`)).toHaveCount(0);
  } finally {
    await supabaseAdmin
      .from("employee_records")
      .delete()
      .in("employee_id", [recentId, oldId].filter(Boolean) as string[]);
    await supabaseAdmin
      .from("profiles")
      .delete()
      .in("id", [recentId, oldId].filter(Boolean) as string[]);
    if (recentId) await supabaseAdmin.auth.admin.deleteUser(recentId);
    if (oldId) await supabaseAdmin.auth.admin.deleteUser(oldId);
  }
});

test("D3 — Dashboard 'Needs attention' card links to /employees?attention=1 and counts active anomalies", async ({ page }) => {
  // Seed an active employee with no manager + no department + no work email
  // (multiple anomalies, so this user contributes exactly +1 to the count).
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `d3-attn-${suffix}@kushhr.dev`;
  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `D3 Attn ${suffix}` },
  });
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    // Clear work_email so the "no_work_email" rule fires; default profile
    // row created by handle_new_user trigger has display_name/work_email set
    // from auth metadata.
    await supabaseAdmin
      .from("profiles")
      .update({ work_email: null, role: "employee" })
      .eq("id", userId);
    await supabaseAdmin.from("employee_records").insert({
      employee_id: userId,
      job_title: "D3 Attn Subject",
      employment_status: "active",
      employment_type: "full_time",
      start_date: "2026-01-01",
      work_location: "Mauritius",
      department_id: null,
      manager_id: null,
      created_by: ids.admin,
      updated_by: ids.admin,
    });

    await page.goto("/dashboard");
    const operationalReport = page
      .locator("section")
      .filter({ hasText: "Operational report" });
    const card = operationalReport.getByRole("link", { name: /Needs attention/ });
    await expect(card).toHaveAttribute("href", "/employees?attention=1");
    // The seeded user is at least one matching row, so the count must be ≥ 1.
    const countText = await card.locator("p").nth(1).textContent();
    expect(Number(countText)).toBeGreaterThanOrEqual(1);
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

test("D3 — /employees?attention=1 shows the row with reason badges (admin)", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `d3-drill-${suffix}@kushhr.dev`;
  const { data: created } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: `D3 Drill ${suffix}` },
  });
  const userId = created.user?.id;
  expect(userId).toBeTruthy();

  try {
    // No manager + no department (no_manager + no_department reasons).
    await supabaseAdmin
      .from("profiles")
      .update({ role: "employee" })
      .eq("id", userId);
    await supabaseAdmin.from("employee_records").insert({
      employee_id: userId,
      job_title: "D3 Drill Subject",
      employment_status: "active",
      employment_type: "full_time",
      start_date: "2026-01-01",
      work_location: "Mauritius",
      department_id: null,
      manager_id: null,
      created_by: ids.admin,
      updated_by: ids.admin,
    });

    await page.goto("/employees?attention=1");
    await expect(
      page.getByText(/Showing active employees with at least one data-quality flag/),
    ).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(`D3 Drill ${suffix}`) });
    await expect(row.getByText("No manager")).toBeVisible();
    await expect(row.getByText("No department")).toBeVisible();
  } finally {
    await supabaseAdmin.from("employee_records").delete().eq("employee_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  }
});

test("D4 — sidebar toggle expands + collapses and persists across reload", async ({ page }) => {
  await page.goto("/dashboard");
  const aside = page.getByRole("complementary", { name: "Primary" });
  await expect(aside).toBeVisible();

  // Default is collapsed (~64px slim column).
  await expect
    .poll(async () =>
      aside.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width),
    )
    .toBeLessThan(120);

  // Expand and verify width grows past the min expanded width (192px).
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect
    .poll(async () =>
      aside.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width),
    )
    .toBeGreaterThanOrEqual(192);
  expect(
    await page.evaluate(() => window.localStorage.getItem("kushhr.sidebar.collapsed")),
  ).toBe("0");

  // Expanded preference persists across reload.
  await page.reload();
  await expect
    .poll(async () =>
      page
        .getByRole("complementary", { name: "Primary" })
        .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width),
    )
    .toBeGreaterThanOrEqual(192);

  // Collapse again and verify localStorage flip.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect
    .poll(async () =>
      page
        .getByRole("complementary", { name: "Primary" })
        .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width),
    )
    .toBeLessThan(120);
  expect(
    await page.evaluate(() => window.localStorage.getItem("kushhr.sidebar.collapsed")),
  ).toBe("1");

  // Reset state so subsequent tests see the default (collapsed, no explicit pref).
  await page.evaluate(() => window.localStorage.removeItem("kushhr.sidebar.collapsed"));
});

test("D4 — dashboard greeting renders Hi {firstName} 👋 for the signed-in user", async ({ page }) => {
  await page.goto("/dashboard");
  const greeting = page.getByTestId("dashboard-greeting");
  await expect(greeting).toBeVisible();
  await expect(greeting).toHaveText(/^Hi \S+\s*👋$/);
});

test("B5 — admin goal save denied once the cycle submission deadline has passed", async ({ page }) => {
  // The ManagerReviewForm's pre-submit lock panel (NEEDS-FIX 1 fix) blocks the
  // /performance/reviews UI before a submit can be attempted against a locked
  // cycle. To exercise the server-side guard (assertCycleNotDeadlineLocked)
  // end-to-end we use the GoalForm path: the form has no pre-submit lock
  // branch for *new* goals — the deadline guard only fires inside
  // savePerformanceGoal. Both paths share the same private helper, so a goal
  // probe confirms the server guard for every wired call site.
  const cycleTitle = uniqueName("Admin Deadline Cycle");
  const cycleId = await createPerformanceCycle(cycleTitle);
  const goalTitle = uniqueName("B5 Deadline Probe Goal");

  // Move the cycle into the locked state (deadline in the past + lock enabled).
  // Direct DB write — the cycle Create/Edit form fields are exercised by the
  // existing cycle pins; this pin is about the Server Action boundary.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { error: updateErr } = await supabaseAdmin
    .from("performance_review_cycles")
    .update({ submission_deadline: yesterday, submission_lock_enabled: true })
    .eq("id", cycleId);
  expect(updateErr).toBeNull();

  await page.goto("/performance");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.locator("#goal-form summary").click();
  await page.locator("#goal-employee").fill("Alice Employee");
  await page.locator("#goal-cycle").fill(cycleTitle);
  await page.getByLabel("Goal title").fill(goalTitle);
  await page.locator("#goal-status").selectOption("in_progress");
  await page.locator("#goal-progress").fill("25");

  const saveBtn = page.getByRole("button", { name: "Submit" });
  await saveBtn.scrollIntoViewIfNeeded();
  await saveBtn.click({ force: true });

  await expect(
    page.getByText(/Submission deadline passed \(/).first(),
  ).toBeVisible();

  // No goal row should have been created against the locked cycle.
  const { data: goals } = await supabaseAdmin
    .from("performance_goals")
    .select("id")
    .eq("cycle_id", cycleId)
    .eq("title", goalTitle);
  expect(goals ?? []).toHaveLength(0);

  // Audit row exists with reason=deadline_passed in metadata.
  const { data: deniedAudit } = await supabaseAdmin
    .from("audit_logs")
    .select("metadata")
    .eq("action", "auth.access_denied")
    .eq("entity", "performance_goals")
    .order("created_at", { ascending: false })
    .limit(10);
  const matched = (deniedAudit ?? []).some(
    (row) =>
      ((row.metadata as Record<string, unknown> | null) ?? {}).reason ===
        "deadline_passed" &&
      ((row.metadata as Record<string, unknown> | null) ?? {}).cycle_id === cycleId,
  );
  expect(matched).toBe(true);
});

// Phase 13 / Session 143: public_holidays admin CRUD (migration 0040 + Server
// Action createPublicHoliday). Pins the inline-add path + audit log shape.
test("admin creates a public holiday inline", async ({ page }) => {
  const holidayName = uniqueName("UAT Holiday");
  const holidayDate = "2099-07-14"; // Far future so no collision with seed.
  const createdHolidayIds: string[] = [];

  try {
    await page.goto("/leave/admin");
    // B3/F6 — Public Holidays panel is now a default-closed <details>.
    const panel = page.locator("details").filter({ hasText: "Public holidays" });
    await expect(panel).toBeVisible();
    await panel.locator("summary").first().click();
    await panel.locator("#ph-date").fill(holidayDate);
    await panel.locator("#ph-name").fill(holidayName);
    await panel.getByRole("button", { name: "Add" }).click();
    await expect(panel.getByText("Holiday added.")).toBeVisible();

    const { data: row } = await supabaseAdmin
      .from("public_holidays")
      .select("id, date, name, country_code, is_active, is_tentative")
      .eq("name", holidayName)
      .single();
    expect(row?.date).toBe(holidayDate);
    expect(row?.country_code).toBe("MU");
    expect(row?.is_active).toBe(true);
    expect(row?.is_tentative).toBe(false);
    createdHolidayIds.push(row?.id as string);

    await expectAudit("holiday.created", row?.id as string);
  } finally {
    if (createdHolidayIds.length > 0) {
      await supabaseAdmin
        .from("public_holidays")
        .delete()
        .in("id", createdHolidayIds);
    }
  }
});

// Phase 13 / Session 143: CSV bulk upload (Server Action
// bulkUploadPublicHolidays). Pins the additive-only behaviour — duplicates of
// already-active rows are skipped, audit log captures the counts.
test("admin bulk uploads public holidays from CSV with duplicates", async ({ page }) => {
  const stamp = Date.now();
  const fresh1 = `2099-08-01,UAT Bulk One ${stamp},MU,false`;
  const fresh2 = `2099-08-02,UAT Bulk Two ${stamp},MU,true`;
  // Pre-insert a row so its restatement in the CSV registers as a duplicate.
  const dupName = `UAT Bulk Dup ${stamp}`;
  const dupDate = "2099-08-03";
  const { data: dupRow } = await supabaseAdmin
    .from("public_holidays")
    .insert({
      date: dupDate,
      name: dupName,
      country_code: "MU",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  const createdHolidayIds: string[] = [dupRow?.id as string];

  try {
    const csv = [
      "date,name,countryCode,tentative",
      fresh1,
      fresh2,
      `${dupDate},${dupName},MU,false`,
    ].join("\n");

    await page.goto("/leave/admin");
    // B3/F6 — Public Holidays panel is now a default-closed <details>.
    const panel = page.locator("details").filter({ hasText: "Public holidays" });
    await expect(panel).toBeVisible();
    await panel.locator("summary").first().click();

    await panel.locator('input[type="file"]').setInputFiles({
      name: "bulk.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    // Preview renders 3 rows: 2 inserts (green) + 1 duplicate-in-file detection.
    // The seeded-DB duplicate is caught at commit (additive-only).
    await expect(panel.getByText(/to insert/)).toBeVisible();
    await panel.getByRole("button", { name: /Commit/ }).click();
    await expect(panel.getByText(/Added \d+ holiday\(s\)\. Skipped \d+ duplicate\(s\)\./)).toBeVisible();

    const { data: inserted } = await supabaseAdmin
      .from("public_holidays")
      .select("id, name")
      .in("name", [`UAT Bulk One ${stamp}`, `UAT Bulk Two ${stamp}`]);
    expect((inserted ?? []).length).toBe(2);
    for (const row of inserted ?? []) createdHolidayIds.push(row.id as string);

    await expectAudit("holiday.bulk_uploaded");
  } finally {
    if (createdHolidayIds.length > 0) {
      await supabaseAdmin
        .from("public_holidays")
        .delete()
        .in("id", createdHolidayIds);
    }
  }
});

// Phase 13 / Session 147 — UAT leave-request-lifecycle B3/F5: after saving a
// Public Holiday row edit, the row must auto-exit edit mode (Save button gone)
// and surface a persistent success confirmation in the read view.
test("B3/F5 — Public Holiday row auto-exits edit mode after successful save", async ({
  page,
}) => {
  const originalName = uniqueName("B3F5 Original");
  const renamedName = uniqueName("B3F5 Renamed");
  const holidayDate = "2099-09-15";
  const createdHolidayIds: string[] = [];

  // Pre-clean any prior leftover under the test date so a crashed previous run
  // does not block the insert.
  await supabaseAdmin.from("public_holidays").delete().eq("date", holidayDate);

  const { data: seeded, error: seedError } = await supabaseAdmin
    .from("public_holidays")
    .insert({
      date: holidayDate,
      name: originalName,
      country_code: "MU",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  if (seedError || !seeded) throw seedError ?? new Error("seed failed");
  createdHolidayIds.push(seeded.id as string);

  try {
    await page.goto("/leave/admin");
    const panel = page.locator("details").filter({ hasText: "Public holidays" });
    await expect(panel).toBeVisible();
    await panel.locator("summary").first().click();

    // Expand the 2099 year group so the seeded row is visible.
    await panel.locator("summary").filter({ hasText: "2099" }).first().click();

    // Pin the row by date (always visible in both read AND edit modes); the
    // name flips between visible text and an input value, so filtering by it
    // would lose the row the moment Edit is clicked.
    const row = panel.locator("li").filter({ hasText: holidayDate });
    await expect(row.getByText(originalName)).toBeVisible();

    await row.getByRole("button", { name: "Edit" }).click();
    const nameInput = row.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(renamedName);
    await row.getByRole("button", { name: "Save" }).click();

    // F5 pass criteria: Save button disappears (row back to read mode) and
    // the renamed value is visible. Success confirmation persists in read view.
    await expect(row.getByRole("button", { name: "Save" })).toHaveCount(0);

    // Server Action's revalidatePath re-renders the nested 2099 year-group
    // <details>; the inner panel is uncontrolled (rule-of-three follow-up in
    // public-holidays-admin-panel.tsx:53-57 not yet done) so it collapses
    // back to closed, hiding the renamed row. Re-expand it so the visibility
    // assertions below see a non-display:none ancestor.
    const yearGroup = panel.locator("details").filter({ hasText: "2099" });
    if (!(await yearGroup.first().evaluate((el) => (el as HTMLDetailsElement).open))) {
      await yearGroup.locator("summary").first().click();
    }

    await expect(row.getByText(renamedName)).toBeVisible();
    await expect(row.getByText("Holiday updated.")).toBeVisible();
  } finally {
    if (createdHolidayIds.length > 0) {
      await supabaseAdmin
        .from("public_holidays")
        .delete()
        .in("id", createdHolidayIds);
    }
  }
});

// B4-bis (F3 follow-on): admin dashboard gains the Team leave calendar panel.
// Confirms admin sees the company-wide approved-leave panel and rows link
// into /leave/calendar.
test("B4-bis — admin dashboard shows Team leave calendar panel with company-wide approved leave", async ({ page }) => {
  const note = uniqueName("B4-bis admin dashboard");
  const start = new Date();
  start.setDate(start.getDate() + 4);
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
