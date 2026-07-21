import { expect, test } from "@playwright/test";
import {
  createSignedInClient,
  ids,
  supabaseAdmin,
  uniqueName,
} from "./helpers";

// Per-test cleanup registry — see manager.spec.ts header for rationale.
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

test("direct RLS scopes profiles and employee records", async () => {
  // Defensive precondition: restore Bob's manager_id to its seed value
  // (null). The "manager sees only own + direct reports" assertion depends on
  // Morgan NOT managing Bob — if a prior test or manual UAT session set
  // Bob.manager_id = Morgan, the manager_select_direct_report_profiles RLS
  // policy (migration 0003) returns Bob too and the equality assertion
  // fails. Mirrors the precondition in manager.spec.ts:666 and
  // security-rbac-guards.spec.ts:417.
  await supabaseAdmin
    .from("employee_records")
    .update({ manager_id: null, updated_by: ids.admin })
    .eq("employee_id", ids.bob);

  const manager = await createSignedInClient("manager@kushhr.dev");
  const alice = await createSignedInClient("alice@kushhr.dev");

  const { data: managerProfiles, error: managerProfilesError } = await manager
    .from("profiles")
    .select("id")
    .in("id", [ids.manager, ids.alice, ids.bob]);
  expect(managerProfilesError).toBeNull();
  expect((managerProfiles ?? []).map((profile) => profile.id).sort()).toEqual([
    ids.alice,
    ids.manager,
  ].sort());

  const { data: aliceProfiles, error: aliceProfilesError } = await alice
    .from("profiles")
    .select("id")
    .in("id", [ids.alice, ids.bob]);
  expect(aliceProfilesError).toBeNull();
  expect((aliceProfiles ?? []).map((profile) => profile.id)).toEqual([ids.alice]);

  const { data: managerRecords, error: managerRecordsError } = await manager
    .from("employee_records")
    .select("employee_id")
    .in("employee_id", [ids.manager, ids.alice, ids.bob]);
  expect(managerRecordsError).toBeNull();
  expect((managerRecords ?? []).map((record) => record.employee_id).sort()).toEqual([
    ids.alice,
    ids.manager,
  ].sort());

  const { data: aliceRecords, error: aliceRecordsError } = await alice
    .from("employee_records")
    .select("employee_id")
    .in("employee_id", [ids.alice, ids.bob]);
  expect(aliceRecordsError).toBeNull();
  expect((aliceRecords ?? []).map((record) => record.employee_id)).toEqual([ids.alice]);
});

test("direct RLS scopes employee_compensation and blocks audit log access", async () => {
  // Migration 0049 + 0050 reshaped compensation access:
  // - Employee can read own row (full row, RLS).
  // - Manager has NO base-table SELECT — direct-report scope is enforced
  //   exclusively by the SECURITY DEFINER RPC
  //   `get_direct_report_compensation_summaries()` (migration 0050).
  // - Employee cannot read other employees' rows.

  // Seed-restore Bob's manager_id (matches the precondition in the test above).
  await supabaseAdmin
    .from("employee_records")
    .update({ manager_id: null, updated_by: ids.admin })
    .eq("employee_id", ids.bob);

  // Defensive precondition: ensure Alice has a compensation row so the RPC
  // assertion below (`rpcAlice.salary_amount` non-null) does not depend on
  // admin.spec.ts having run first to seed it. Idempotent upsert.
  await supabaseAdmin
    .from("employee_compensation")
    .upsert(
      {
        employee_id: ids.alice,
        salary_amount: 60000,
        salary_currency: "MUR",
        pay_frequency: "monthly",
        bank_account_holder: "Alice Employee",
        bank_account_number: "BANK-RLS-PRECONDITION",
        tax_id: "TAX-RLS-PRECONDITION",
        national_id: "NID-RLS-PRECONDITION",
        effective_date: "2026-01-01",
        created_by: ids.admin,
        updated_by: ids.admin,
      },
      { onConflict: "employee_id" },
    );

  const manager = await createSignedInClient("manager@kushhr.dev");
  const alice = await createSignedInClient("alice@kushhr.dev");
  const admin = await createSignedInClient("admin@kushhr.dev");

  // Manager base-table SELECT only returns Morgan's own row (via
  // employee_select_own_compensation). The direct-report scope policy was
  // dropped in migration 0050 — Alice's row is NOT visible on the base
  // table even though Alice is a direct report.
  const { data: managerCompensation, error: managerCompensationError } = await manager
    .from("employee_compensation")
    .select("employee_id, bank_account_number")
    .in("employee_id", [ids.manager, ids.alice, ids.bob]);
  expect(managerCompensationError).toBeNull();
  expect((managerCompensation ?? []).map((row) => row.employee_id)).toEqual([ids.manager]);

  // Manager direct-report scope is exposed only via the SECURITY DEFINER RPC.
  // Returns a row for Alice with salary fields, never bank/tax columns
  // (they are not in the function's return type).
  const { data: rpcRows, error: rpcError } = await manager
    .rpc("get_direct_report_compensation_summaries");
  expect(rpcError).toBeNull();
  const rpcAlice = ((rpcRows ?? []) as Array<{ employee_id: string; salary_amount: number | null }>)
    .find((row) => row.employee_id === ids.alice);
  expect(rpcAlice).toBeDefined();
  expect(rpcAlice?.salary_amount).not.toBeNull();
  // The return-type signature itself precludes bank/tax columns. Asserting
  // they are absent on the typed object is the closest a runtime test can
  // get to a column-projection check.
  expect((rpcAlice as Record<string, unknown>)?.bank_account_number).toBeUndefined();
  expect((rpcAlice as Record<string, unknown>)?.tax_id).toBeUndefined();
  expect((rpcAlice as Record<string, unknown>)?.national_id).toBeUndefined();

  // Alice sees only her own row.
  const { data: aliceCompensation, error: aliceCompensationError } = await alice
    .from("employee_compensation")
    .select("employee_id")
    .in("employee_id", [ids.alice, ids.bob, ids.manager]);
  expect(aliceCompensationError).toBeNull();
  expect((aliceCompensation ?? []).map((row) => row.employee_id)).toEqual([ids.alice]);

  // Alice cannot update salary even on her own row — column grants restrict
  // UPDATE to the non-salary subset (migration 0049).
  const { data: aliceSalaryUpdate, error: aliceSalaryUpdateError } = await alice
    .from("employee_compensation")
    .update({ salary_amount: 999_999 })
    .eq("employee_id", ids.alice)
    .select("employee_id");
  expect(aliceSalaryUpdateError).not.toBeNull();
  expect(aliceSalaryUpdate ?? []).toEqual([]);

  const { data: adminAuditRows, error: adminAuditError } = await admin
    .from("audit_logs")
    .select("id")
    .limit(1);
  expect(adminAuditError).toBeNull();
  expect(adminAuditRows?.length).toBeGreaterThan(0);

  const { data: aliceAuditRows, error: aliceAuditError } = await alice
    .from("audit_logs")
    .select("id")
    .limit(1);
  expect(aliceAuditError).toBeNull();
  expect(aliceAuditRows).toEqual([]);

  const { error: aliceAuditInsertError } = await alice
    .from("audit_logs")
    .insert({
      actor: ids.alice,
      action: "tamper.insert",
      entity: "audit_logs",
    });
  expect(aliceAuditInsertError).not.toBeNull();

  const originalAuditId = adminAuditRows?.[0]?.id as string;

  const { data: updateRows, error: updateError } = await admin
    .from("audit_logs")
    .update({ action: "tamper.attempt" })
    .eq("id", originalAuditId)
    .select("id");
  expect(updateError).toBeNull();
  expect(updateRows).toEqual([]);

  const { data: deleteRows, error: deleteError } = await admin
    .from("audit_logs")
    .delete()
    .eq("id", originalAuditId)
    .select("id");
  expect(deleteError).toBeNull();
  expect(deleteRows).toEqual([]);

  const { data: unchangedAuditRow, error: unchangedAuditError } = await admin
    .from("audit_logs")
    .select("id")
    .eq("id", originalAuditId)
    .single();
  expect(unchangedAuditError).toBeNull();
  expect(unchangedAuditRow?.id).toBe(originalAuditId);
});

test("direct RLS allows managers to submit and cancel their own leave", async () => {
  const manager = await createSignedInClient("manager@kushhr.dev");

  const { data: leaveType, error: leaveTypeError } = await supabaseAdmin
    .from("leave_types")
    .insert({
      name: uniqueName("Manager Self-Service Leave"),
      description: "Created by Playwright to verify manager self-service leave RLS.",
      is_active: true,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(leaveTypeError).toBeNull();
  if (leaveType?.id) createdLeaveTypeIds.push(leaveType.id as string);

  const { data: request, error: insertError } = await manager
    .from("leave_requests")
    .insert({
      employee_id: ids.manager,
      leave_type_id: leaveType?.id,
      start_date: "2026-08-03",
      end_date: "2026-08-03",
      status: "pending",
      employee_note: uniqueName("Manager direct RLS own leave"),
      created_by: ids.manager,
      updated_by: ids.manager,
    })
    .select("id, employee_id, status")
    .single();
  expect(insertError).toBeNull();
  expect(request?.employee_id).toBe(ids.manager);
  expect(request?.status).toBe("pending");

  const { data: cancelledRows, error: cancelError } = await manager
    .from("leave_requests")
    .update({ status: "cancelled", updated_by: ids.manager })
    .eq("id", request?.id)
    .eq("status", "pending")
    .select("id, status");
  expect(cancelError).toBeNull();
  expect(cancelledRows).toEqual([{ id: request?.id, status: "cancelled" }]);
});

test("direct RLS lets managers see active empty performance cycles only", async () => {
  const manager = await createSignedInClient("manager@kushhr.dev");
  const alice = await createSignedInClient("alice@kushhr.dev");

  const activeTitle = uniqueName("RLS Active Empty Cycle");
  const draftTitle = uniqueName("RLS Draft Empty Cycle");
  const { data: activeCycle, error: activeError } = await supabaseAdmin
    .from("performance_review_cycles")
    .insert({
      title: activeTitle,
      description: "Created by Playwright to verify manager active-cycle visibility.",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      due_date: "2026-12-31",
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(activeError).toBeNull();

  const { data: draftCycle, error: draftError } = await supabaseAdmin
    .from("performance_review_cycles")
    .insert({
      title: draftTitle,
      description: "Created by Playwright to verify manager draft-cycle remains hidden.",
      status: "draft",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      due_date: "2026-12-31",
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(draftError).toBeNull();

  const { data: managerCycles, error: managerError } = await manager
    .from("performance_review_cycles")
    .select("id")
    .in("id", [activeCycle?.id, draftCycle?.id]);
  expect(managerError).toBeNull();
  expect((managerCycles ?? []).map((cycle) => cycle.id)).toEqual([activeCycle?.id]);

  const { data: aliceCycles, error: aliceError } = await alice
    .from("performance_review_cycles")
    .select("id")
    .eq("id", activeCycle?.id);
  expect(aliceError).toBeNull();
  expect(aliceCycles).toEqual([]);
});

test("direct RLS blocks employee access to another employee document", async () => {
  const alice = await createSignedInClient("alice@kushhr.dev");
  const title = uniqueName("Bob Confidential Document");
  const { data: document, error: insertError } = await supabaseAdmin
    .from("documents")
    .insert({
      employee_id: ids.bob,
      uploaded_by: ids.admin,
      category: "policy",
      title,
      storage_path: `${ids.bob}/policy/${crypto.randomUUID()}.txt`,
      file_size: 12,
      mime_type: "text/plain",
      is_shared: false,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(insertError).toBeNull();

  const { data: visibleDocuments, error: selectError } = await alice
    .from("documents")
    .select("id")
    .eq("id", document?.id);
  expect(selectError).toBeNull();
  expect(visibleDocuments).toEqual([]);
});

test("direct RLS blocks forged onboarding task completion", async () => {
  const alice = await createSignedInClient("alice@kushhr.dev");
  const taskTitle = uniqueName("Bob Onboarding Task");

  const { data: task, error: insertError } = await supabaseAdmin
    .from("onboarding_tasks")
    .insert({
      employee_id: ids.bob,
      assignee_id: ids.bob,
      title: taskTitle,
      status: "pending",
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();
  expect(insertError).toBeNull();

  const { data: visibleTasks, error: selectError } = await alice
    .from("onboarding_tasks")
    .select("id")
    .eq("id", task?.id);
  expect(selectError).toBeNull();
  expect(visibleTasks).toEqual([]);

  const { error: updateError } = await alice
    .from("onboarding_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", task?.id);
  expect(updateError).not.toBeNull();
});

test("auth triggers create profiles and sync role changes to JWT metadata", async () => {
  const email = `playwright-trigger-${Date.now()}-${Math.random().toString(16).slice(2)}@kushhr.dev`;
  const fullName = "Playwright Trigger User";
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
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, display_name, work_email")
      .eq("id", userId)
      .single();
    expect(profileError).toBeNull();
    expect(profile).toMatchObject({
      id: userId,
      role: "employee",
      display_name: fullName,
      work_email: email,
    });

    const { error: roleError } = await supabaseAdmin
      .from("profiles")
      .update({ role: "manager" })
      .eq("id", userId);
    expect(roleError).toBeNull();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId as string);
        return data.user?.app_metadata?.role ?? null;
      })
      .toBe("manager");
  } finally {
    if (userId) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
  }
});

test("B1/F1 — EXCLUDE constraint rejects overlapping pending/approved leave_requests for the same employee", async () => {
  // Migration 0035 adds an EXCLUDE USING gist constraint scoped to
  // status IN ('pending','approved'). A second overlapping pending
  // direct-INSERT must fail with SQLSTATE 23P01.
  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("id")
    .eq("name", "Local Leave")
    .single();
  expect(leaveType?.id).toBeTruthy();

  const startA = "2098-06-10";
  const endA = "2098-06-15";
  const startB = "2098-06-12";
  const endB = "2098-06-18";

  const { data: rowA, error: aErr } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      employee_id: ids.alice,
      leave_type_id: leaveType!.id,
      start_date: startA,
      end_date: endA,
      status: "pending",
      created_by: ids.alice,
      updated_by: ids.alice,
    })
    .select("id")
    .single();
  expect(aErr).toBeNull();
  expect(rowA?.id).toBeTruthy();

  try {
    const { error: overlapErr } = await supabaseAdmin
      .from("leave_requests")
      .insert({
        employee_id: ids.alice,
        leave_type_id: leaveType!.id,
        start_date: startB,
        end_date: endB,
        status: "pending",
        created_by: ids.alice,
        updated_by: ids.alice,
      });
    expect(overlapErr).not.toBeNull();
    expect(overlapErr?.code).toBe("23P01");
  } finally {
    await supabaseAdmin.from("leave_requests").delete().eq("id", rowA!.id);
  }
});
