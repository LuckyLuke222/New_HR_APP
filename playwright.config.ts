import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// If PLAYWRIGHT_BASE_URL isn't already in the environment, hydrate it from
// .env.local so the e2e suite has one durable, machine-local target. This makes
// the self-host container (kushhr-web on :3100, behind Caddy at
// https://kushhr.internal) the default target without an inline env var, and —
// because the `webServer` block below keys off the same var — flips webServer to
// undefined so Playwright never spawns host-dev on 3100 and reuses that
// container at the wrong origin (the port-3100 collision that mismatches the
// auth cookie name and silently redirects every authenticated test to /login).
if (!process.env.PLAYWRIGHT_BASE_URL) {
  try {
    const line = fs
      // Anchor to the config's own dir (always the repo root) so hydration
      // works regardless of the CWD `npx playwright test` is invoked from —
      // a CWD-relative path would silently ENOENT and re-open the 3100 collision.
      .readFileSync(path.resolve(__dirname, ".env.local"), "utf8")
      .split(/\n/)
      .find((l) => l.trim().startsWith("PLAYWRIGHT_BASE_URL="));
    if (line) process.env.PLAYWRIGHT_BASE_URL = line.slice(line.indexOf("=") + 1).trim();
  } catch {
    // No .env.local (e.g. CI) — fall back to the existing 127.0.0.1:3100 default.
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  // Session 112 follow-up: runs `npm run cleanup:e2e-data` after the full
  // suite so test artifacts don't survive until the next pre-test cleanup.
  // Set PLAYWRIGHT_SKIP_CLEANUP=1 to inspect residue when debugging.
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    // The self-host validation gate targets the Caddy front door
    // (`https://kushhr.internal`) which serves an internal-CA cert.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "rls",
      testMatch: /rls\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "manager",
      testMatch: /manager\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/manager.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "employee",
      testMatch: /employee\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/employee.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "reports",
      testMatch: /reports\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
    {
      // Security/RBAC suite — automates the forge-methodology steps from
      // docs/uat-flows/security-and-rbac-guards.md. Tests switch actor via
      // `test.use({ storageState })` inside each describe block, so the
      // project itself must not pin a storage state.
      name: "security",
      testMatch: /security-rbac-guards\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      // Access-matrix suite — executable mirror of docs/access-matrix.md §6.
      // Like `security`, each describe switches actor via test.use({ storageState }),
      // so the project itself must not pin a storage state.
      name: "access-matrix",
      testMatch: /access-matrix\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  // When PLAYWRIGHT_BASE_URL points at an external origin (the self-host gate
  // against the running container behind Caddy), don't spawn host-dev — the
  // suite must hit the deployed artifact, and stack-up is a prerequisite.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -H 127.0.0.1",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
