#!/usr/bin/env node

/**
 * Playwright artifact cleanup.
 *
 * Session 112 rewrite (2026-05-14): the previous version aborted on the
 * FIRST error (e.g. a stale storage path that no longer exists) and skipped
 * every later step — leaving journey employees, performance cycles, etc.
 * in the database. This version:
 *
 *   1. Wraps every delete in `tryStep()` so a failure is logged but does
 *      not abort the run. Failures collect into `failures[]` and are
 *      printed at the end with non-zero exit only if anything failed.
 *   2. Broadens the test-user pattern from `journey-%@kushhr.dev` to any
 *      hyphen-bearing `@kushhr.dev` email — the four seeded accounts
 *      (admin, manager, alice, bob) have no hyphen so they're safe.
 *   3. Cascades every FK to `profiles.id` before the profile delete,
 *      including `documents.uploaded_by` (RESTRICT), which the previous
 *      version missed.
 *   4. Always runs the profile + auth-user cleanup at the end, regardless
 *      of upstream failures — so even if one delete step trips, the next
 *      run starts from a clean slate for that batch of test users.
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");

const BUCKET = "hr-documents";
const SEEDED_IDS = new Set([
  "a0000000-0000-0000-0000-000000000001",
  "b0000000-0000-0000-0000-000000000002",
  "c0000000-0000-0000-0000-000000000003",
  "d0000000-0000-0000-0000-000000000004",
]);

const performanceCyclePrefixes = [
  "Self Review Cycle",
  "Ack Review Cycle",
  "Admin Cycle",
  "Admin Self Appraise Cycle",
  "Admin Existing Review Cycle",
  "Manager Cycle",
  "Manager Edit Goal Cycle",
  "Manager Workspace Cycle",
  "Hidden Manager Draft Cycle",
  "Acknowledged Review Cycle",
  "Goal Transfer Cycle",
  "Employee Goal Progress Cycle",
  "Employee Goal Guard Cycle",
  "RLS Active Empty Cycle",
  "RLS Draft Empty Cycle",
  "B5 Goal Lock Cycle",
  "B5 Review Reopen Cycle",
];

// Generic catch-all: every Playwright helper that creates a review cycle
// sets description = "Created by Playwright" (visible as the cycle subtitle
// in the UI). Matching on this in addition to the title prefixes catches
// any future Playwright-created cycle without needing to extend the prefix
// list per test. Manual exploration cycles do not set this description, so
// they remain untouched.
const PLAYWRIGHT_CYCLE_DESCRIPTION = "Created by Playwright";

const performanceGoalPrefixes = [
  "Admin Goal",
  "Admin Blank Goal",
  "Seeded Goal",
  "Manager Goal",
  "Manager Editable Goal",
  "Workspace Goal",
  "Goal Transfer Test",
  "Employee Goal Progress",
  "Employee Goal Guard",
];

const leaveTypePrefixes = [
  "Admin Approves Manager Leave",
  "Admin Search Balance Type",
  "Manager Own Leave",
  "Manager Cancel Own Leave",
  "Reject Note Leave",
  "Insufficient Balance Leave",
  "Multi Year Leave",
  "No Balance Leave",
  "Manager Self-Service Leave",
];

const leaveRequestNotePrefixes = [
  "Leave audit note",
  "Manager approval note",
  "Manager leave for admin approval",
  "Manager own leave submit note",
  "Manager own leave cancel note",
  "Manager direct RLS own leave",
  "Reject note employee request",
  "Reject note should persist",
  "Insufficient balance approval note",
  "Missing balance approval note",
  "Cross-year approval note",
];

const documentTitlePrefixes = [
  "Employee Policy Doc",
  "Bob Confidential Document",
  "Admin Search Upload Doc",
  "Admin Delete Pin Doc",
];

const onboardingTitlePrefixes = [
  "Journey onboarding task",
  "Bob Onboarding Task",
  "Admin Search Template Task",
  "Manager Clickable Onboarding Task",
];

const onboardingTemplatePrefixes = [
  "Admin Search Onboarding Template",
];

const failures = [];

function readEnv() {
  const env = Object.fromEntries(
    fs
      .readFileSync(".env.local", "utf8")
      .split(/\n/)
      .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );

  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[key]) throw new Error(`Missing ${key} in .env.local`);
  }

  return env;
}

function likeAny(column, prefixes) {
  return prefixes.map((prefix) => `${column}.like.${prefix}%`).join(",");
}

async function tryStep(label, work) {
  try {
    const value = await work();
    return value;
  } catch (error) {
    failures.push({ label, error: error.message ?? String(error) });
    return null;
  }
}

async function selectOrEmpty(label, builder) {
  const { data, error } = await builder;
  if (error) {
    failures.push({ label, error: error.message });
    return [];
  }
  return data ?? [];
}

async function deleteByIds(supabase, table, ids) {
  if (!ids || ids.length === 0) return 0;
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  return count ?? ids.length;
}

async function deleteIn(supabase, table, column, ids) {
  if (!ids || ids.length === 0) return 0;
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .in(column, ids);
  if (error) throw new Error(`delete ${table} by ${column}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const env = readEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  // ---------- Discovery ----------

  // Broadened test-user pattern: any hyphen-bearing @kushhr.dev email.
  // The four seeded accounts (admin/manager/alice/bob @kushhr.dev) have no
  // hyphen so they are excluded by construction. The SEEDED_IDS filter is
  // kept as belt-and-braces.
  const testProfiles = await selectOrEmpty(
    "select test profiles",
    supabase
      .from("profiles")
      .select("id, work_email, display_name")
      .like("work_email", "%-%@kushhr.dev"),
  );
  const testUserIds = testProfiles
    .map((profile) => profile.id)
    .filter((id) => id && !SEEDED_IDS.has(id));

  const leaveTypes = await selectOrEmpty(
    "select leave types",
    supabase.from("leave_types").select("id, name").or(likeAny("name", leaveTypePrefixes)),
  );
  const leaveTypeIds = leaveTypes.map((t) => t.id);

  const leaveRequestsByNote = await selectOrEmpty(
    "select leave requests by note",
    supabase
      .from("leave_requests")
      .select("id, employee_note")
      .or(likeAny("employee_note", leaveRequestNotePrefixes)),
  );

  const performanceCycles = await selectOrEmpty(
    "select performance cycles",
    supabase
      .from("performance_review_cycles")
      .select("id, title")
      .or(
        `${likeAny("title", performanceCyclePrefixes)},description.ilike.${PLAYWRIGHT_CYCLE_DESCRIPTION}%`,
      ),
  );
  const performanceCycleIds = performanceCycles.map((c) => c.id);

  const performanceGoalsByTitle = await selectOrEmpty(
    "select performance goals by title",
    supabase
      .from("performance_goals")
      .select("id, title")
      .or(likeAny("title", performanceGoalPrefixes)),
  );

  const documentsByTitle = await selectOrEmpty(
    "select documents by title",
    supabase
      .from("documents")
      .select("id, storage_path, title")
      .or(likeAny("title", documentTitlePrefixes)),
  );
  const documentsForTestUsers =
    testUserIds.length === 0
      ? []
      : await selectOrEmpty(
          "select test-user documents (employee_id)",
          supabase
            .from("documents")
            .select("id, storage_path, title")
            .in("employee_id", testUserIds),
        );
  const documentsUploadedByTestUsers =
    testUserIds.length === 0
      ? []
      : await selectOrEmpty(
          "select test-user documents (uploaded_by)",
          supabase
            .from("documents")
            .select("id, storage_path, title")
            .in("uploaded_by", testUserIds),
        );
  const documents = Array.from(
    new Map(
      [...documentsByTitle, ...documentsForTestUsers, ...documentsUploadedByTestUsers].map(
        (d) => [d.id, d],
      ),
    ).values(),
  );

  const onboardingTasksByTitle = await selectOrEmpty(
    "select onboarding tasks by title",
    supabase
      .from("onboarding_tasks")
      .select("id, title")
      .or(likeAny("title", onboardingTitlePrefixes)),
  );
  const onboardingTasksForTestUsers =
    testUserIds.length === 0
      ? []
      : await selectOrEmpty(
          "select test-user onboarding tasks",
          supabase
            .from("onboarding_tasks")
            .select("id, title")
            .in("employee_id", testUserIds),
        );
  const onboardingTasks = Array.from(
    new Map(
      [...onboardingTasksByTitle, ...onboardingTasksForTestUsers].map((t) => [t.id, t]),
    ).values(),
  );

  const onboardingTemplates = await selectOrEmpty(
    "select onboarding templates",
    supabase
      .from("onboarding_templates")
      .select("id, name")
      .or(likeAny("name", onboardingTemplatePrefixes)),
  );
  const onboardingTemplateIds = onboardingTemplates.map((t) => t.id);

  console.table([
    { label: "test profiles (hyphen @kushhr.dev)", count: testProfiles.length },
    { label: "playwright leave types", count: leaveTypes.length },
    { label: "playwright leave requests by note", count: leaveRequestsByNote.length },
    { label: "playwright performance cycles", count: performanceCycles.length },
    { label: "playwright performance goals (by title)", count: performanceGoalsByTitle.length },
    { label: "playwright documents (title + test-user emp/upl)", count: documents.length },
    { label: "playwright onboarding tasks", count: onboardingTasks.length },
    { label: "playwright onboarding templates", count: onboardingTemplates.length },
  ]);

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to delete these artifacts.");
    return;
  }

  // ---------- Deletion (error-tolerant, ordered) ----------

  const deleted = [];

  // Documents: storage objects + rows.
  if (documents.length > 0) {
    const paths = documents.map((d) => d.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await tryStep("remove storage objects", async () => {
        const { error } = await supabase.storage.from(BUCKET).remove(paths);
        if (error) throw new Error(error.message);
        deleted.push(["storage objects", paths.length]);
      });
    }
    await tryStep("delete documents", async () => {
      deleted.push([
        "documents",
        await deleteByIds(supabase, "documents", documents.map((d) => d.id)),
      ]);
    });
  }

  // Onboarding tasks (by title or test-user employee_id).
  await tryStep("delete onboarding_tasks", async () => {
    deleted.push([
      "onboarding_tasks",
      await deleteByIds(supabase, "onboarding_tasks", onboardingTasks.map((t) => t.id)),
    ]);
  });

  // Onboarding template fan-out (tasks pointing at the template, then template items, then template).
  if (onboardingTemplateIds.length > 0) {
    await tryStep("delete onboarding_tasks by template_id", async () => {
      deleted.push([
        "onboarding_tasks by template",
        await deleteIn(supabase, "onboarding_tasks", "template_id", onboardingTemplateIds),
      ]);
    });
    await tryStep("delete onboarding_template_items", async () => {
      deleted.push([
        "onboarding_template_items",
        await deleteIn(supabase, "onboarding_template_items", "template_id", onboardingTemplateIds),
      ]);
    });
    await tryStep("delete onboarding_templates", async () => {
      deleted.push([
        "onboarding_templates",
        await deleteByIds(supabase, "onboarding_templates", onboardingTemplateIds),
      ]);
    });
  }

  // Test-user FK cascade — every table that references profiles(id) via
  // RESTRICT or by employee_id. Each step is independent so a failure on
  // one table does NOT block the others.
  if (testUserIds.length > 0) {
    for (const table of [
      "performance_reviews",
      "performance_goals",
      "leave_requests",
      "leave_balances",
      "employee_compensation",
      "employee_records",
    ]) {
      await tryStep(`delete ${table} (employee_id ∈ test users)`, async () => {
        deleted.push([
          `${table} by employee_id`,
          await deleteIn(supabase, table, "employee_id", testUserIds),
        ]);
      });
    }

    // documents.uploaded_by → profiles(id) ON DELETE RESTRICT — previously
    // unhandled. Catch any docs the title sweep missed.
    await tryStep("delete documents (uploaded_by ∈ test users)", async () => {
      deleted.push([
        "documents by uploaded_by",
        await deleteIn(supabase, "documents", "uploaded_by", testUserIds),
      ]);
    });

    // onboarding_tasks.employee_id (cleanup in case earlier prefix sweep missed any).
    await tryStep("delete onboarding_tasks (employee_id ∈ test users)", async () => {
      deleted.push([
        "onboarding_tasks by employee_id",
        await deleteIn(supabase, "onboarding_tasks", "employee_id", testUserIds),
      ]);
    });
  }

  // Performance cycle fan-out (reviews + goals pointing at the cycle).
  if (performanceCycleIds.length > 0) {
    await tryStep("delete performance_reviews by cycle_id", async () => {
      deleted.push([
        "performance_reviews by cycle",
        await deleteIn(supabase, "performance_reviews", "cycle_id", performanceCycleIds),
      ]);
    });
    await tryStep("delete performance_goals by cycle_id", async () => {
      deleted.push([
        "performance_goals by cycle",
        await deleteIn(supabase, "performance_goals", "cycle_id", performanceCycleIds),
      ]);
    });
  }

  await tryStep("delete performance_goals by title", async () => {
    deleted.push([
      "performance_goals by title",
      await deleteByIds(
        supabase,
        "performance_goals",
        performanceGoalsByTitle.map((g) => g.id),
      ),
    ]);
  });
  await tryStep("delete performance_review_cycles", async () => {
    deleted.push([
      "performance_review_cycles",
      await deleteByIds(supabase, "performance_review_cycles", performanceCycleIds),
    ]);
  });

  // Leave fan-out.
  if (leaveTypeIds.length > 0) {
    await tryStep("delete leave_requests by leave_type_id", async () => {
      deleted.push([
        "leave_requests by leave type",
        await deleteIn(supabase, "leave_requests", "leave_type_id", leaveTypeIds),
      ]);
    });
    await tryStep("delete leave_balances by leave_type_id", async () => {
      deleted.push([
        "leave_balances by leave type",
        await deleteIn(supabase, "leave_balances", "leave_type_id", leaveTypeIds),
      ]);
    });
  }
  await tryStep("delete leave_requests by note", async () => {
    deleted.push([
      "leave_requests by note",
      await deleteByIds(
        supabase,
        "leave_requests",
        leaveRequestsByNote.map((r) => r.id),
      ),
    ]);
  });
  await tryStep("delete leave_types", async () => {
    deleted.push(["leave_types", await deleteByIds(supabase, "leave_types", leaveTypeIds)]);
  });

  // Profile + auth user cleanup — ALWAYS runs, regardless of upstream
  // failures. If a profile delete fails because something still references
  // it (e.g. a stray document with uploaded_by = this profile that the
  // earlier sweep missed), the failure is logged and the next user is
  // attempted. Per-user loop so one stuck user doesn't take down the rest.
  if (testUserIds.length > 0) {
    let profilesDeleted = 0;
    let authDeleted = 0;
    let profileFailures = 0;
    let authFailures = 0;

    for (const id of testUserIds) {
      const profileOk = await tryStep(`delete profile ${id}`, async () => {
        const { error } = await supabase.from("profiles").delete().eq("id", id);
        if (error) throw new Error(error.message);
        profilesDeleted += 1;
        return true;
      });
      if (!profileOk) {
        profileFailures += 1;
        continue;
      }
      const authOk = await tryStep(`delete auth user ${id}`, async () => {
        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) throw new Error(error.message);
        authDeleted += 1;
        return true;
      });
      if (!authOk) authFailures += 1;
    }

    deleted.push(["profiles deleted", profilesDeleted]);
    deleted.push(["auth users deleted", authDeleted]);
    if (profileFailures || authFailures) {
      deleted.push(["profile delete failures", profileFailures]);
      deleted.push(["auth delete failures", authFailures]);
    }
  }

  console.table(deleted.map(([label, count]) => ({ label, count })));

  if (failures.length > 0) {
    console.error(`\n${failures.length} step(s) failed:`);
    console.table(failures);
    process.exitCode = 1;
  } else {
    console.log("\nAll cleanup steps completed without errors.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
