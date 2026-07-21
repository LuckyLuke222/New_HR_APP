/**
 * Playwright global teardown — runs once after the full suite completes,
 * regardless of pass/fail. Invokes the same cleanup script the user runs
 * manually via `npm run cleanup:e2e-data`, eliminating the "between-runs
 * residue" pattern where each run left its newly-created artifacts behind
 * until the next pre-test cleanup.
 *
 * Session 112 follow-up (2026-05-14): the user observed that after a
 * `cleanup → test` cycle, test artifacts created during the run remained
 * visible in the UI until the next manual cleanup. Wiring the cleanup as
 * teardown means the database is empty (of test data) at the END of every
 * suite run, not just before.
 *
 * The cleanup script itself is error-tolerant (Session 112 rewrite), so a
 * failed step here does not fail the test suite — failures are logged and
 * the next pre-test cleanup still catches anything left behind.
 */

import { spawnSync } from "node:child_process";

async function globalTeardown(): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_CLEANUP === "1") {
    // Escape hatch for the rare case where the user wants to inspect leftover
    // state after a run (e.g. debugging a failing test's residual rows).
    console.log("[teardown] PLAYWRIGHT_SKIP_CLEANUP=1 — skipping cleanup.");
    return;
  }

  console.log("[teardown] Running npm run cleanup:e2e-data ...");
  const result = spawnSync(
    "node",
    ["scripts/cleanup-playwright-artifacts.mjs", "--execute"],
    { stdio: "inherit", cwd: process.cwd() },
  );
  if (result.status !== 0) {
    console.warn(
      `[teardown] cleanup exited with status ${result.status}. The next ` +
        "pre-test cleanup will retry. Not failing the suite.",
    );
  }
}

export default globalTeardown;
