// Admin reporting module — Phase 1 (skeleton, access, audit, 4 reports).
// Runs as the `reports` project with the admin storage state. Non-admin denial
// is covered in security-rbac-guards.spec.ts (/reports in the forbidden lists).
//
// Two-step model: selecting a report shows controls only (no query, no audit);
// the report.generated audit fires only on the explicit "Run report" submit.

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { expectAudit, supabaseAdmin } from "./helpers";

const REPORTS = [
  { key: "headcount", label: "Headcount summary" },
  { key: "starters", label: "Starters" },
  { key: "leavers", label: "Leavers" },
  { key: "needs-attention", label: "Employees needing attention" },
  { key: "leave-usage", label: "Leave usage" },
  { key: "absence-list", label: "Absence list" },
  { key: "onboarding-completion", label: "Onboarding completion" },
  { key: "review-completion", label: "Review completion" },
] as const;

test("admin reaches /reports landing", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  // Selector exposes every report as a link.
  for (const report of REPORTS) {
    await expect(page.getByRole("link", { name: report.label })).toBeVisible();
  }
});

test("selecting a report shows controls but does not generate or audit", async ({ page }) => {
  // Sentinel As-of this test alone uses. It never clicks Run and no other test
  // generates with this date, so any report.generated row carrying it would mean
  // a *select* wrongly audited. Scoping the assertion to this metadata value
  // (not a created_at window) makes it immune to sibling tests running reports
  // in parallel — the prior `gte(created_at, since)` query caught their audits.
  const SENTINEL_AS_OF = "2099-12-31";
  await page.goto(`/reports?report=headcount&asOf=${SENTINEL_AS_OF}`);
  await expect(page.getByRole("heading", { name: "Headcount summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready to run" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run report" })).toBeVisible();
  // No table until the user runs it.
  await expect(page.getByRole("columnheader", { name: "Headcount" })).toHaveCount(0);
  // No report.generated audit carrying our sentinel → selecting did not audit.
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("id")
    .eq("action", "report.generated")
    .eq("metadata->>asOf", SENTINEL_AS_OF);
  expect(data?.length ?? 0).toBe(0);
});

test("running the headcount report renders a table and writes report.generated audit", async ({ page }) => {
  // Snapshot time so the audit assertion can't match a prior run's row.
  const since = new Date().toISOString();
  await page.goto("/reports?report=headcount");
  await page.getByRole("button", { name: "Run report" }).click();
  // Seeded org (admin/manager/alice/bob are active) → at least one row.
  await expect(page.getByRole("columnheader", { name: "Headcount" })).toBeVisible();
  await expect(page.getByRole("cell").first()).toBeVisible();
  await expect(page.getByText("Unable to load report")).toHaveCount(0);
  await expectAudit("report.generated", undefined, since);
});

test("each report runs without a load error", async ({ page }) => {
  for (const report of REPORTS) {
    await page.goto(`/reports?report=${report.key}`);
    await page.getByRole("button", { name: "Run report" }).click();
    // Left the "Ready to run" state → the report generated.
    await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
    await expect(page.getByText("Unable to load report")).toHaveCount(0);
  }
});

test("leave usage grain toggle regroups without error", async ({ page }) => {
  await page.goto("/reports?report=leave-usage");
  // Default grain (Month) → Period column present after Run.
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Period" })).toBeVisible();
  await expect(page.getByText("Unable to load report")).toHaveCount(0);

  // Switch grain to Day and re-run → still groups by Period, no error.
  await page.locator('select[name="grain"]').selectOption("day");
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Period" })).toBeVisible();
  await expect(page.getByText("Unable to load report")).toHaveCount(0);
});

test("absence list status filter defaults to approved and regroups", async ({ page }) => {
  await page.goto("/reports?report=absence-list");
  // Four status checkboxes; Approved pre-checked, others not.
  await expect(page.locator('input[name="status"][value="approved"]')).toBeChecked();
  await expect(page.locator('input[name="status"][value="pending"]')).not.toBeChecked();
  await expect(page.locator('input[name="status"]')).toHaveCount(4);

  // Run with the default (approved) → Status column renders, no error.
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(page.getByText("Unable to load report")).toHaveCount(0);

  // Add Pending and re-run → still renders without error.
  await page.locator('input[name="status"][value="pending"]').check();
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await expect(page.getByText("Unable to load report")).toHaveCount(0);
});

test("charted reports render a themed chart; others render table-only", async ({ page }) => {
  // Headcount and leave-usage opt into a chart via meta.chart. The grain-toggle
  // and headcount tests already prove both have ≥1 seeded row in the defaults,
  // so the chart (rows > 0) renders. Assert presence + accessible label + the
  // theme token on the bar fill — never pixels.
  for (const { key, label } of [
    { key: "headcount", label: "Headcount chart" },
    { key: "leave-usage", label: "Days taken chart" },
  ]) {
    await page.goto(`/reports?report=${key}&generate=1`);
    const figure = page.getByRole("img", { name: label });
    await expect(figure).toBeVisible();
    // recharts draws an SVG surface inside the figure...
    await expect(figure.locator("svg")).toBeVisible();
    // ...and the single series uses the shared chart theme token, not a hardcoded
    // colour, so it tracks the palette like every other surface.
    await expect(
      figure.locator('[fill="var(--color-chart-1)"]').first(),
    ).toBeAttached();
  }

  // A non-charted report (no meta.chart) renders the table with no chart figure.
  await page.goto("/reports?report=starters&generate=1");
  await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
  await expect(page.locator('figure[role="img"]')).toHaveCount(0);
});

test("export — admin downloads a headcount CSV and it is audited", async ({ page }) => {
  const since = new Date().toISOString();
  // Drive the export through the real browser download, not page.request — a
  // non-navigational fetch can arrive at the auth middleware without the (large)
  // session cookie and get redirected to /login. Generating first surfaces the
  // Export CSV link (rows > 0); clicking it triggers the attachment download.
  await page.goto("/reports?report=headcount&generate=1");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;

  // suggestedFilename comes from Content-Disposition → proves attachment + the
  // date-stamped filename (today, since no as-of was supplied).
  expect(download.suggestedFilename()).toMatch(/^headcount-\d{4}-\d{2}-\d{2}\.csv$/);
  const body = readFileSync(await download.path(), "utf8");
  // Header row carries the column labels. The >1-line assertion relies on the
  // seeded org always having at least one on-the-books employee → ≥1 data row;
  // an empty org would legitimately yield a header-only CSV.
  expect(body).toMatch(/Department,Headcount/);
  expect(body.trim().split(/\r\n/).length).toBeGreaterThan(1);

  // Assert the action AND that the audit carries the report key in metadata —
  // a bare action check wouldn't catch a mis-keyed/omitted metadata block.
  await expectAudit("report.exported", undefined, since);
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("id")
    .eq("action", "report.exported")
    .eq("metadata->>report", "headcount")
    .gte("created_at", since);
  expect(data?.length ?? 0).toBeGreaterThan(0);
});

test("no report leaks a score or PII column", async ({ page }) => {
  for (const report of REPORTS) {
    await page.goto(`/reports?report=${report.key}`);
    await page.getByRole("button", { name: "Run report" }).click();
    await expect(page.getByRole("heading", { name: "Ready to run" })).toHaveCount(0);
    for (const forbidden of ["Score", "Bank", "Tax", "National ID", "Passport number"]) {
      await expect(page.getByRole("columnheader", { name: forbidden })).toHaveCount(0);
    }
  }
});
