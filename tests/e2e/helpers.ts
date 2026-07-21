import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";

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

export const ids = {
  admin: "a0000000-0000-0000-0000-000000000001",
  manager: "b0000000-0000-0000-0000-000000000002",
  alice: "c0000000-0000-0000-0000-000000000003",
  bob: "d0000000-0000-0000-0000-000000000004",
};

export const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
export const supabasePublishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseAdmin = createClient(
  supabaseUrl,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export async function createSignedInClient(email: string, password = "TestPass123!") {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return client;
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

export async function createPerformanceCycle(title: string) {
  // The "Created by Playwright" description is load-bearing: the cleanup
  // script (`scripts/cleanup-playwright-artifacts.mjs`) matches on this as a
  // generic catch-all for review cycles whose titles don't fit the prefix
  // list. Do not change without updating the script's
  // PLAYWRIGHT_CYCLE_DESCRIPTION constant in lockstep.
  const { data, error } = await supabaseAdmin
    .from("performance_review_cycles")
    .insert({
      title,
      description: "Created by Playwright",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      due_date: "2026-12-31",
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function createPerformanceGoal({
  employeeId,
  cycleId,
  title,
}: {
  employeeId: string;
  cycleId: string;
  title: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("performance_goals")
    .insert({
      employee_id: employeeId,
      cycle_id: cycleId,
      title,
      description: "Created by Playwright",
      status: "in_progress",
      progress: 25,
      created_by: ids.admin,
      updated_by: ids.admin,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function createPerformanceReview({
  employeeId,
  managerId = ids.manager,
  cycleId,
  status,
  score = null,
}: {
  employeeId: string;
  managerId?: string;
  cycleId: string;
  status: "draft" | "self_reviewed" | "manager_submitted" | "acknowledged";
  score?: number | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("performance_reviews")
    .insert({
      employee_id: employeeId,
      manager_id: managerId,
      cycle_id: cycleId,
      status,
      score,
      manager_strengths: status === "manager_submitted" ? "Reliable delivery" : null,
      manager_improvements: status === "manager_submitted" ? "Keep sharpening prioritization" : null,
      manager_next_steps: status === "manager_submitted" ? "Own next cycle goal" : null,
      submitted_at: status === "manager_submitted" ? new Date().toISOString() : null,
      created_by: managerId,
      updated_by: managerId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

// `since` (ISO timestamp) bounds the lookup to rows created after the caller
// snapshotted time — pass it to avoid a false positive where a prior run's row
// satisfies the assertion. Mirrors the deny-audit `since` discipline.
export async function expectAudit(action: string, entityId?: string, since?: string) {
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1);

  if (entityId) query = query.eq("entity_id", entityId);
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  expect(error).toBeNull();
  expect(data?.length).toBeGreaterThan(0);
}

export async function selectOptionByText(page: Page, label: string, text: string) {
  const select = page.getByLabel(label);
  await select.waitFor();
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
  await expect(select).toHaveValue(value!);
}

export async function selectLocatorOptionByText(select: Locator, text: string) {
  await select.waitFor();
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
  await expect(select).toHaveValue(value!);
}
