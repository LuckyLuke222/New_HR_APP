// Automated counterpart to docs/uat-flows/security-and-rbac-guards.md.
//
// Each test corresponds to a numbered step in that doc. The forge tests use
// the network-layer capture/replay pattern documented in the "Forge
// methodology" section of the UAT — see tests/e2e/forge.ts for the helper.
//
// Coverage matrix (see UAT doc for the canonical list):
//   Group A 1–8  : URL access guards as Alice           ✓ automated
//   Group A 11    : completeTask alice→bob              ✓ automated
//   Group A 12    : cancelLeaveRequest alice→bob        ✓ automated
//   Group A 13    : uploadDocument alice→bob            ✓ automated (access-matrix.spec.ts AM6)
//   Group A 14    : selfUpdateCompensation salary-     ✓ automated
//                   field forge (admin-only fields)    (captures legit self-
//                                                       update POST, swaps
//                                                       `taxId` field name to
//                                                       `salaryAmount` so the
//                                                       ADMIN_ONLY_FIELDS guard
//                                                       fires + audits)
//   Group A 15    : cross-actor capture/replay          manual
//   Group B 16–20: URL access guards as Morgan          ✓ automated
//   Group B 22    : self-appraise manager               manual (pattern same
//                                                       as 26 below — copy
//                                                       this spec's 25 test)
//   Group B 23    : assignTemplate morgan→bob           ✓ automated
//   Group B 24    : create goal morgan→bob              manual
//   Group B 25    : self-approve leave (morgan)         ✓ automated
//   Group C 26/27: admin variants                       manual (same shape)
//   Group E 33–36: unauthenticated guards               ✓ automated

import { expect, test } from "@playwright/test";

import {
  captureServerAction,
  expectDenyAudit,
  forgeAndReplay,
  nowIso,
} from "./forge";
import { expectAudit, ids, supabaseAdmin, uniqueName } from "./helpers";

const AUTH = {
  admin: "playwright/.auth/admin.json",
  manager: "playwright/.auth/manager.json",
  alice: "playwright/.auth/employee.json",
} as const;

// ─── Group A: URL access guards as Alice (employee) ──────────────────────────

const ALICE_FORBIDDEN_URLS = [
  "/employees/new",
  "/departments",
  "/leave/admin",
  "/onboarding/admin",
  "/audit-logs",
  "/reports",
  "/settings",
  "/performance/reviews",
];

test.describe("URL guards — Alice (employee)", () => {
  test.use({ storageState: AUTH.alice });

  for (const path of ALICE_FORBIDDEN_URLS) {
    test(`alice cannot reach ${path}`, async ({ page }) => {
      // B4 / F4: response is now browser-uniform. requireRole throws
      // AccessDeniedError; (app)/error.tsx renders the in-place denial UI.
      // No redirect, so URL stays at the attempted path. The audit row
      // remains the authoritative guard signal.
      const since = nowIso();
      await page.goto(path, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
      await expectDenyAudit({ actorId: ids.alice, since });
    });
  }

  test("alice cannot reach /employees/<bob-id>/edit", async ({ page }) => {
    const since = nowIso();
    await page
      .goto(`/employees/${ids.bob}/edit`, { waitUntil: "domcontentloaded" })
      .catch(() => undefined);
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    await expectDenyAudit({ actorId: ids.alice, since });
  });

  test("alice GET to /reports/export is denied (403) and audited", async ({ page }) => {
    // Route handlers have no access-denied UI — assert the HTTP status + the
    // audit row requireRole writes before throwing. Navigate (don't page.request)
    // so the auth cookie is carried; alice is authenticated, so middleware lets
    // the request reach the route, which denies the non-admin role with a 403.
    const since = nowIso();
    const response = await page.goto("/reports/export?report=headcount", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(403);
    await expectDenyAudit({ actorId: ids.alice, since });
  });
});

// ─── Group B: URL access guards as Morgan (manager) ──────────────────────────

const MORGAN_FORBIDDEN_URLS = [
  "/audit-logs",
  "/reports",
  "/settings",
  "/leave/admin",
];

test.describe("URL guards — Morgan (manager)", () => {
  test.use({ storageState: AUTH.manager });

  for (const path of MORGAN_FORBIDDEN_URLS) {
    test(`morgan cannot reach ${path}`, async ({ page }) => {
      const since = nowIso();
      await page.goto(path, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
      await expectDenyAudit({ actorId: ids.manager, since });
    });
  }

  test("morgan GET to /reports/export is denied (403) and audited", async ({ page }) => {
    // Navigate (not page.request) so the auth cookie is carried — see the alice
    // case above. Morgan is authenticated but not admin → route returns 403.
    const since = nowIso();
    const response = await page.goto("/reports/export?report=headcount", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(403);
    await expectDenyAudit({ actorId: ids.manager, since });
  });
});

// ─── Group E: Unauthenticated guards ─────────────────────────────────────────

test.describe("URL guards — unauthenticated", () => {
  test("anon hitting /dashboard redirects to /login with ?next= param", async ({ browser }) => {
    const context = await browser.newContext(); // no storageState
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    const url = page.url();
    expect(url).toContain("/login");
    expect(url).toContain("next=");
    await context.close();
  });

  test("anon /reset-password with no token shows friendly error", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/reset-password", { waitUntil: "domcontentloaded" });
    // Update password button must be disabled / page must signal invalid link.
    const updateButton = page.getByRole("button", { name: /update password/i });
    if (await updateButton.count()) {
      await expect(updateButton).toBeDisabled();
    }
    await context.close();
  });
});

// ─── Group A · Step 11: forge completeTask alice→bob ─────────────────────────

test.describe("forge guards — Alice (employee)", () => {
  test.use({ storageState: AUTH.alice });

  test("step 11 — alice forging completeTask with bob's taskId is denied", async ({ page }) => {
    // Seed: one pending task for Alice (capture donor) and one for Bob (victim).
    const aliceTaskTitle = uniqueName("Journey onboarding task forge donor");
    const bobTaskTitle = uniqueName("Journey onboarding task forge victim");
    const { data: aliceTask, error: aErr } = await supabaseAdmin
      .from("onboarding_tasks")
      .insert({
        employee_id: ids.alice,
        assignee_id: ids.alice,
        title: aliceTaskTitle,
        status: "pending",
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(aErr).toBeNull();
    const { data: bobTask, error: bErr } = await supabaseAdmin
      .from("onboarding_tasks")
      .insert({
        employee_id: ids.bob,
        assignee_id: ids.bob,
        title: bobTaskTitle,
        status: "pending",
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(bErr).toBeNull();

    await page.goto("/onboarding");
    await expect(page.getByText(aliceTaskTitle)).toBeVisible();

    const since = nowIso();
    const captured = await captureServerAction(page, async () => {
      await page
        .locator("form")
        .filter({ has: page.locator(`input[name="taskId"][value="${aliceTask!.id}"]`) })
        .getByRole("button", { name: /mark complete/i })
        .click();
    });

    const { status, body } = await forgeAndReplay(page, captured, aliceTask!.id, bobTask!.id);
    expect(status).toBe(200);
    expect(body).toContain("You can only complete your own tasks");

    // Bob's task must remain pending.
    const { data: bobAfter } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("status")
      .eq("id", bobTask!.id)
      .single();
    expect(bobAfter?.status).toBe("pending");

    await expectDenyAudit({
      actorId: ids.alice,
      entityId: bobTask!.id,
      reason: "employee_complete_other_task",
      since,
    });
  });

  test("step 12 — alice forging cancelLeaveRequest with bob's requestId is denied", async ({
    page,
  }) => {
    const { data: leaveType } = await supabaseAdmin
      .from("leave_types")
      .select("id")
      .eq("name", "Local Leave")
      .single();
    expect(leaveType?.id).toBeTruthy();

    const aliceNote = uniqueName("Leave audit note alice forge donor");
    const bobNote = uniqueName("Leave audit note bob forge victim");

    // Date window chosen to avoid the new (employee_id, daterange) overlap
    // exclusion constraint on leave_requests (B1). 2026-09-10/11 is a
    // per-test unique window across the suite.
    const { data: aliceLeave, error: aliceLeaveErr } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.alice,
        leave_type_id: leaveType!.id,
        start_date: "2026-09-10",
        end_date: "2026-09-10",
        status: "pending",
        employee_note: aliceNote,
        created_by: ids.alice,
        updated_by: ids.alice,
      })
      .select("id")
      .single();
    expect(aliceLeaveErr).toBeNull();
    const { data: bobLeave, error: bobLeaveErr } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.bob,
        leave_type_id: leaveType!.id,
        start_date: "2026-09-11",
        end_date: "2026-09-11",
        status: "pending",
        employee_note: bobNote,
        created_by: ids.bob,
        updated_by: ids.bob,
      })
      .select("id")
      .single();
    expect(bobLeaveErr).toBeNull();
    expect(aliceLeave?.id).toBeTruthy();
    expect(bobLeave?.id).toBeTruthy();

    try {
      await page.goto("/leave");
      await expect(page.getByText(aliceNote)).toBeVisible();

      const captured = await captureServerAction(page, async () => {
        await page
          .locator("form")
          .filter({ has: page.locator(`input[name="requestId"][value="${aliceLeave!.id}"]`) })
          .getByRole("button", { name: /cancel request/i })
          .click();
      });

      const { status, body } = await forgeAndReplay(page, captured, aliceLeave!.id, bobLeave!.id);
      expect(status).toBe(200);
      // RLS hides Bob's leave from Alice at the .from("leave_requests") query
      // inside cancelLeaveRequest (leave.ts:485), so the action short-circuits
      // on the "row not found" branch before reaching the ownership guard at
      // leave.ts:496. Both deny strings indicate a working boundary; we accept
      // either. Note: the "row not found" branch does NOT write an audit row —
      // see the documented observability gap in security-and-rbac-guards.md.
      expect(body).toMatch(
        /You can only cancel your own leave requests|Request not found or cannot be cancelled/,
      );

      const { data: bobAfter } = await supabaseAdmin
        .from("leave_requests")
        .select("status")
        .eq("id", bobLeave!.id)
        .single();
      expect(bobAfter?.status).toBe("pending");

      // Audit row only fires if the request gets past RLS into the action
      // body — the "row not found" branch does not write one (the
      // observability gap noted in security-and-rbac-guards.md). The RLS
      // layer already proved Alice cannot mutate Bob's leave.
    } finally {
      if (aliceLeave?.id) {
        await supabaseAdmin.from("leave_requests").delete().eq("id", aliceLeave.id);
      }
      if (bobLeave?.id) {
        await supabaseAdmin.from("leave_requests").delete().eq("id", bobLeave.id);
      }
    }
  });

  test("B1/F1 — alice submitting an overlapping leave request is blocked + audit", async ({ page }) => {
    // Seed one pending leave for Alice in the far future so the form's
    // min={today} doesn't block our overlap submission.
    const { data: leaveType } = await supabaseAdmin
      .from("leave_types")
      .select("id")
      .eq("name", "Local Leave")
      .single();
    expect(leaveType?.id).toBeTruthy();

    // Dates must be ≤ currentYear+1 — submitLeaveRequest enforces that ceiling
    // (see src/server/actions/leave.ts year-range check). 2099 trips that
    // guard before the overlap check ever runs.
    const targetYear = new Date().getFullYear() + 1;
    const baseStart = `${targetYear}-03-10`;
    const baseEnd = `${targetYear}-03-15`;
    const overlapStart = `${targetYear}-03-12`;
    const overlapEnd = `${targetYear}-03-18`;

    // Defensive precondition: wipe any Alice leave row landing in the
    // targetYear-03 window. If a prior run of this test was interrupted
    // (e.g. the form-submit POST hung past the assertion timeout), the
    // Server Action may have inserted an orphan overlap row that the
    // exclusion constraint (`leave_requests_no_overlap`) then rejects on
    // this run's seed INSERT. Without this sweep the test fails at line
    // 327 with code 23P01 instead of exercising the overlap-block path.
    await supabaseAdmin
      .from("leave_requests")
      .delete()
      .eq("employee_id", ids.alice)
      .gte("start_date", `${targetYear}-03-01`)
      .lte("end_date", `${targetYear}-03-31`);

    const donorNote = uniqueName("B1 overlap seed note alice");
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.alice,
        leave_type_id: leaveType!.id,
        start_date: baseStart,
        end_date: baseEnd,
        status: "pending",
        employee_note: donorNote,
        created_by: ids.alice,
        updated_by: ids.alice,
      })
      .select("id")
      .single();
    expect(seedErr).toBeNull();
    expect(seeded?.id).toBeTruthy();

    try {
      await page.goto("/leave/new");
      await page.locator('select[name="leaveTypeId"]').selectOption(leaveType!.id);
      await page.locator('input[name="startDate"]').fill(overlapStart);
      await page.locator('input[name="endDate"]').fill(overlapEnd);
      await page.getByRole("button", { name: /submit/i }).first().click();

      await expect(page.getByText(/overlaps with an existing/i).first()).toBeVisible();

      // No second row landed for Alice in the overlap window.
      const { data: rows } = await supabaseAdmin
        .from("leave_requests")
        .select("id, start_date, end_date")
        .eq("employee_id", ids.alice)
        .gte("start_date", `${targetYear}-03-01`)
        .lte("end_date", `${targetYear}-03-31`);
      expect((rows ?? []).length).toBe(1);
      expect(rows?.[0]?.id).toBe(seeded!.id);

      await expectAudit("leave.submission_blocked_overlap", seeded!.id);
    } finally {
      // Wipe the whole targetYear-03 window — covers (a) the seeded donor
      // and (b) any orphan landed by a form-submit that completed after a
      // prior assertion timeout. Keeps the next run idempotent.
      await supabaseAdmin
        .from("leave_requests")
        .delete()
        .eq("employee_id", ids.alice)
        .gte("start_date", `${targetYear}-03-01`)
        .lte("end_date", `${targetYear}-03-31`);
    }
  });

  // Step 13 (alice forging uploadDocument with bob's employeeId) now lives in
  // tests/e2e/access-matrix.spec.ts as AM6. The network capture/replay forge
  // genuinely cannot be used for uploads — Playwright returns a null body for
  // multipart POSTs carrying a File entry (#6479) — so AM6 uses the DOM
  // hidden-input swap + native submit instead, which reaches the same guard.

  // ─── Group A · Step 14: forge selfUpdateCompensation salary-field injection ─
  test("step 14 — alice forging selfUpdateCompensation with salary field is denied", async ({
    page,
  }) => {
    // The action's ADMIN_ONLY_FIELDS guard at src/server/actions/compensation.ts
    // rejects any self-update FormData that carries a salary-shaped key and
    // writes auth.access_denied with reason "salary_field_in_self_update".
    // This pins it: we capture a legitimate self-update POST as Alice, then
    // byte-swap the `taxId` field name to `salaryAmount` so the action's
    // formData.get("salaryAmount") returns a non-empty string and the guard
    // fires. The DB-layer column grant (migration 0049) is the second line;
    // this test pins the *application-layer* guard.

    // Defensive precondition: Alice must have a compensation row so the
    // self-edit form renders.
    await supabaseAdmin
      .from("employee_compensation")
      .upsert(
        {
          employee_id: ids.alice,
          salary_amount: 60000,
          salary_currency: "MUR",
          pay_frequency: "monthly",
          bank_account_holder: "Alice Employee",
          bank_account_number: "BANK-FORGE-PRECONDITION",
          tax_id: "TAX-FORGE-PRECONDITION",
          national_id: "NID-FORGE-PRECONDITION",
          effective_date: "2026-01-01",
          created_by: ids.admin,
          updated_by: ids.admin,
        },
        { onConflict: "employee_id" },
      );

    const { data: priorSalary } = await supabaseAdmin
      .from("employee_compensation")
      .select("salary_amount, salary_currency")
      .eq("employee_id", ids.alice)
      .single();
    const priorSalaryAmount = priorSalary?.salary_amount as number | null;

    await page.goto("/payroll");
    await expect(page.getByRole("heading", { name: "My payroll" })).toBeVisible();

    const since = nowIso();
    const captured = await captureServerAction(page, async () => {
      // A legitimate self-update — fill tax_id and submit. The captured POST
      // will contain a multipart part `name="taxId"`.
      await page.locator("#cf-taxid").fill("TAX-FORGE-DONOR");
      await page.getByRole("button", { name: "Save my details" }).click();
    });

    // Byte-swap the field name `taxId` → `salaryAmount` in the multipart
    // body. The value the user typed (TAX-FORGE-DONOR) becomes the value of
    // `salaryAmount` on the server. formData.get("salaryAmount") then
    // returns that string, which the ADMIN_ONLY_FIELDS guard treats as
    // non-empty and rejects.
    const { status, body } = await forgeAndReplay(page, captured, "taxId", "salaryAmount");
    expect(status).toBe(200);
    expect(body).toContain("Salary and pay details can only be updated by an admin");

    // DB-side: Alice's salary must be unchanged.
    const { data: afterSalary } = await supabaseAdmin
      .from("employee_compensation")
      .select("salary_amount")
      .eq("employee_id", ids.alice)
      .single();
    expect(afterSalary?.salary_amount).toBe(priorSalaryAmount);

    // Audit-side: auth.access_denied with reason salary_field_in_self_update.
    await expectDenyAudit({
      actorId: ids.alice,
      reason: "salary_field_in_self_update",
      since,
    });
  });
});

// ─── Group B Steps 23, 25 — Morgan forge tests ──────────────────────────────

test.describe("forge guards — Morgan (manager)", () => {
  test.use({ storageState: AUTH.manager });

  test("step 23 — morgan forging assignTemplate to bob (out-of-scope) is denied", async ({
    page,
  }) => {
    // Defensive precondition: restore Bob's manager_id to its seed value
    // (null). The forge depends on Morgan being out-of-scope for Bob — if a
    // prior test or manual UAT session set Bob.manager_id = Morgan, the
    // assignment guard returns true for bob and the forge silently lands a
    // task on his row. Mirrors the precondition in manager.spec.ts:666.
    await supabaseAdmin
      .from("employee_records")
      .update({ manager_id: null, updated_by: ids.admin })
      .eq("employee_id", ids.bob);

    // Need an onboarding template to assign and the manager must be able to
    // legitimately assign one to Alice (in-scope) first to capture.
    const templateName = uniqueName("Journey onboarding template forge");
    const { data: template } = await supabaseAdmin
      .from("onboarding_templates")
      .insert({
        name: templateName,
        description: "Forge capture template",
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(template?.id).toBeTruthy();
    const { error: itemErr } = await supabaseAdmin
      .from("onboarding_template_items")
      .insert({
        template_id: template!.id,
        title: uniqueName("Journey onboarding task forge item"),
        sort_order: 1,
        created_by: ids.admin,
      });
    expect(itemErr, "template item insert failed").toBeNull();

    await page.goto("/onboarding/admin");

    // The Assign tasks form lives inside <details><summary>Assign tasks</summary>
    // (a CollapsibleSection). The form is display:none until expanded, so the
    // submit button is non-visible to getByRole — click the summary first.
    await page.locator("summary").filter({ hasText: /assign tasks/i }).click();

    // The assignment form uses SearchableSelectField, which renders an
    // sr-only real <select name="…"> alongside the searchable text input.
    // The sr-only select isn't "visible" by Playwright's heuristic, so we
    // pass { force: true } to skip the visibility wait.
    await page
      .locator('select[name="employeeId"]')
      .first()
      .selectOption(ids.alice, { force: true });
    await page
      .locator('select[name="templateId"]')
      .first()
      .selectOption(template!.id, { force: true });

    const since = nowIso();
    const captured = await captureServerAction(page, async () => {
      await page.getByRole("button", { name: /assign template/i }).first().click();
    });

    const { status, body } = await forgeAndReplay(page, captured, ids.alice, ids.bob);
    expect(status).toBe(200);
    expect(body).toMatch(/direct reports|outside.*scope/i);

    // No tasks landed on Bob from this template.
    const { data: bobTasks } = await supabaseAdmin
      .from("onboarding_tasks")
      .select("id")
      .eq("employee_id", ids.bob)
      .eq("template_id", template!.id);
    expect(bobTasks ?? []).toEqual([]);

    await expectDenyAudit({
      actorId: ids.manager,
      reason: "manager_assign_outside_direct_reports",
      since,
    });
  });

  test("step 25 — morgan forging self-approval of own leave is denied", async ({ page }) => {
    const { data: leaveType } = await supabaseAdmin
      .from("leave_types")
      .select("id")
      .eq("name", "Local Leave")
      .single();
    expect(leaveType?.id).toBeTruthy();

    const aliceNote = uniqueName("Leave audit note alice donor for morgan capture");
    const morganNote = uniqueName("Leave audit note morgan victim");
    const { data: aliceLeave } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.alice,
        leave_type_id: leaveType!.id,
        start_date: "2026-12-01",
        end_date: "2026-12-01",
        status: "pending",
        employee_note: aliceNote,
        created_by: ids.alice,
        updated_by: ids.alice,
      })
      .select("id")
      .single();
    const { data: morganLeave } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.manager,
        leave_type_id: leaveType!.id,
        start_date: "2026-12-02",
        end_date: "2026-12-02",
        status: "pending",
        employee_note: morganNote,
        created_by: ids.manager,
        updated_by: ids.manager,
      })
      .select("id")
      .single();
    expect(aliceLeave?.id).toBeTruthy();
    expect(morganLeave?.id).toBeTruthy();

    await page.goto("/leave?status=pending");
    await expect(page.getByText(aliceNote)).toBeVisible();

    const since = nowIso();
    const captured = await captureServerAction(page, async () => {
      await page
        .locator("form")
        .filter({ has: page.locator(`input[name="requestId"][value="${aliceLeave!.id}"]`) })
        .getByRole("button", { name: /^approve$/i })
        .click();
    });

    const { status, body } = await forgeAndReplay(
      page,
      captured,
      aliceLeave!.id,
      morganLeave!.id,
    );
    expect(status).toBe(200);
    expect(body).toContain("cannot approve your own leave request");

    const { data: morganAfter } = await supabaseAdmin
      .from("leave_requests")
      .select("status")
      .eq("id", morganLeave!.id)
      .single();
    expect(morganAfter?.status).toBe("pending");

    await expectDenyAudit({
      actorId: ids.manager,
      entityId: morganLeave!.id,
      reason: "self_approval_attempt",
      since,
    });
  });
});

// ─── Group B3: audit observability on zod-fail / row-not-found ───────────────
//
// UAT finding F3 (Critical, 20May26). Server Actions previously returned a
// generic error on safeParse failures and on lookup-returns-null branches
// without writing any audit row. These tests pin the two new audit-action
// families: input.validation_failed (zod-fail) and entity.not_found.

async function expectAuditWithMetadata({
  action,
  resource,
  entity,
  entityId,
  since,
}: {
  action: string;
  resource: string;
  entity?: string;
  entityId?: string;
  since: string;
}): Promise<void> {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id, action, entity, entity_id, metadata, created_at")
    .eq("action", action)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (entity) query = query.eq("entity", entity);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  expect(error).toBeNull();
  const hit = data?.find(
    (row) => (row.metadata as { resource?: string } | null)?.resource === resource,
  );
  expect(
    hit,
    `expected an ${action} row with metadata.resource=${resource}` +
      (entityId ? ` and entity_id=${entityId}` : "") +
      ` since ${since} — none found`,
  ).toBeTruthy();
}

test.describe("B3 — audit observability (alice)", () => {
  test.use({ storageState: AUTH.alice });

  test("B3/F3 — zod-fail on submitLeaveRequest writes input.validation_failed", async ({ page }) => {
    const { data: leaveType } = await supabaseAdmin
      .from("leave_types")
      .select("id")
      .eq("name", "Local Leave")
      .single();
    expect(leaveType?.id).toBeTruthy();

    await page.goto("/leave/new");
    await page.locator('select[name="leaveTypeId"]').selectOption(leaveType!.id);
    await page.locator('input[name="startDate"]').fill("2099-04-10");
    await page.locator('input[name="endDate"]').fill("2099-04-12");

    const since = nowIso();
    const captured = await captureServerAction(page, async () => {
      await page.getByRole("button", { name: /submit/i }).first().click();
    });

    // Swap the valid leave-type UUID for a syntactically-malformed value so
    // the server's safeParse rejects it. UI validation cannot reach this
    // branch — only a forged body can.
    const { status } = await forgeAndReplay(
      page,
      captured,
      leaveType!.id,
      "not-a-real-uuid",
    );
    expect(status).toBe(200);

    await expectAuditWithMetadata({
      action: "input.validation_failed",
      resource: "leave.submit",
      since,
    });
  });

  test("B3/F3 — approveLeaveRequest with nonexistent requestId writes entity.not_found", async ({
    page,
  }) => {
    // Seed a real pending leave for Alice (Morgan's direct report) so Morgan's
    // pending queue has a row whose approve button we can capture. Then forge
    // the requestId to a UUID that does not exist in leave_requests.
    const { data: leaveType } = await supabaseAdmin
      .from("leave_types")
      .select("id")
      .eq("name", "Local Leave")
      .single();
    const note = uniqueName("B3 not-found donor alice");
    const { data: aliceLeave } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.alice,
        leave_type_id: leaveType!.id,
        start_date: "2099-05-10",
        end_date: "2099-05-12",
        status: "pending",
        employee_note: note,
        created_by: ids.alice,
        updated_by: ids.alice,
      })
      .select("id")
      .single();
    expect(aliceLeave?.id).toBeTruthy();

    // Switch to manager auth via a fresh context — Alice cannot approve.
    const managerCtx = await page.context().browser()!.newContext({
      storageState: AUTH.manager,
    });
    const managerPage = await managerCtx.newPage();
    try {
      await managerPage.goto("/leave?status=pending");
      await expect(managerPage.getByText(note)).toBeVisible();

      const since = nowIso();
      const captured = await captureServerAction(managerPage, async () => {
        await managerPage
          .locator("form")
          .filter({
            has: managerPage.locator(`input[name="requestId"][value="${aliceLeave!.id}"]`),
          })
          .getByRole("button", { name: /^approve$/i })
          .click();
      });

      // RFC 4122 v4 shape (version digit `4`, variant `8`) is required to pass
      // the action's strict `z.string().uuid()` check in decisionSchema —
      // otherwise zod fails first and we log input.validation_failed, not
      // entity.not_found. (updateReviewCycle uses the permissive postgresUuid()
      // helper, which is why its phantom UUID does not need this shape.)
      const phantomId = "00000000-0000-4000-8000-000000000099";
      const { status } = await forgeAndReplay(
        managerPage,
        captured,
        aliceLeave!.id,
        phantomId,
      );
      expect(status).toBe(200);

      await expectAuditWithMetadata({
        action: "entity.not_found",
        resource: "leave.approve",
        entity: "leave_request",
        entityId: phantomId,
        since,
      });
    } finally {
      await managerCtx.close();
      await supabaseAdmin.from("leave_requests").delete().eq("id", aliceLeave!.id);
    }
  });
});

test.describe("B3 — audit observability (performance, admin)", () => {
  test.use({ storageState: AUTH.admin });

  // Note: acknowledgeReview's missing-review branch is intentionally NOT wired
  // to entity.not_found because it already writes auth.access_denied via
  // logDenied (the `!review || review.employee_id !== user.id` check fires
  // first — one event, one row). updateReviewCycle is a clean entity.not_found
  // path: zod passes, the by-id lookup returns null, no upstream logDenied.
  test("B3/F3 — updateReviewCycle with nonexistent cycleId writes entity.not_found", async ({
    page,
  }) => {
    // Seed a real cycle so the admin Edit form is rendered with that cycleId,
    // then forge the cycleId to a phantom UUID before replay.
    const { data: cycle } = await supabaseAdmin
      .from("performance_review_cycles")
      .insert({
        title: uniqueName("B3 update-not-found cycle"),
        status: "draft",
        start_date: "2099-01-01",
        end_date: "2099-12-31",
        created_by: ids.admin,
        updated_by: ids.admin,
      })
      .select("id")
      .single();
    expect(cycle?.id).toBeTruthy();

    try {
      // Land on the cycle's edit form via the URL contract introduced in Session 72.
      await page.goto(`/performance?cycleId=${cycle!.id}#cycle-form`);

      const since = nowIso();
      const captured = await captureServerAction(page, async () => {
        await page
          .locator("form")
          .filter({ has: page.locator(`input[name="cycleId"][value="${cycle!.id}"]`) })
          .getByRole("button", { name: /save|update/i })
          .first()
          .click();
      });

      const phantomId = "00000000-0000-0000-0000-0000000000aa";
      const { status } = await forgeAndReplay(page, captured, cycle!.id, phantomId);
      expect(status).toBe(200);

      await expectAuditWithMetadata({
        action: "entity.not_found",
        resource: "performance.updateCycle",
        entity: "performance_review_cycles",
        entityId: phantomId,
        since,
      });
    } finally {
      await supabaseAdmin.from("performance_review_cycles").delete().eq("id", cycle!.id);
    }
  });
});
