import { expect, test } from "@playwright/test";

test("protected dashboard redirects anonymous users to login", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("protected app routes redirect anonymous users to login", async ({ page }) => {
  const protectedRoutes = [
    "/audit-logs",
    "/departments",
    "/documents",
    "/employees",
    "/employees/new",
    "/leave",
    "/leave/admin",
    "/leave/new",
    "/onboarding",
    "/onboarding/admin",
    "/performance",
    "/performance/reviews",
    "/payroll",
    "/settings",
  ];

  for (const route of protectedRoutes) {
    await page.goto(route);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(route)}$`),
    );
  }
});

test("login page renders on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
});

test("password reset pages render", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Set new password" })).toBeVisible();
  await expect(page.getByLabel("New password")).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
});

test("reset password explains incomplete token links", async ({ page }) => {
  await page.goto("/reset-password?token_hash=dad19");
  await expect(
    page.getByText("Reset link is incomplete. Copy the full latest reset link and try again."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password" })).toBeDisabled();
});

test("forgot password request shows non-enumerating success", async ({ page }) => {
  let recoverRequestBody: Record<string, unknown> | null = null;

  await page.route(/\/auth\/v1\/recover/, async (route) => {
    recoverRequestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto("/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(`manual-reset-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText("If that email belongs to a KushHR account, a reset link has been sent."),
  ).toBeVisible();
  expect(recoverRequestBody).toMatchObject({
    email: expect.stringContaining("@example.com"),
    code_challenge: null,
    code_challenge_method: null,
  });
});

test("forgot password cannot native-submit before hydration", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();

  try {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`manual-reset-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByLabel("Email")).toHaveValue(/@example\.com$/);
  } finally {
    await context.close();
  }
});

test("forgot password explains invalid demo email addresses", async ({ page }) => {
  await page.route(/\/auth\/v1\/recover/, async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "email_address_invalid",
        msg: "Email address \"alice@kushhr.dev\" is invalid",
      }),
    });
  });

  await page.goto("/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill("alice@kushhr.dev");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText(
      "Enter an email address that can receive mail. Demo @kushhr.dev seed accounts cannot receive reset emails.",
    ),
  ).toBeVisible();
});

test("authenticated user visiting /login?next=/X is redirected to X, not /dashboard", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login?next=%2Faudit-logs");
  await page.getByLabel("Email").fill("admin@kushhr.dev");
  await page.getByLabel("Password").fill("TestPass123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/audit-logs$/);

  // Now visit /login again while authenticated with a different next.
  await page.goto("/login?next=%2Femployees");
  await page.waitForURL(/\/employees$/);

  // Without a next, default to /dashboard.
  await page.goto("/login");
  await page.waitForURL(/\/dashboard$/);

  await context.close();
});

test("login form signs in via uncontrolled inputs (autofill-compatible)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");

  // Simulate a browser autofill that bypasses React's synthetic onChange by
  // setting the DOM value directly without dispatching events. With controlled
  // inputs this would be wiped on the next render; with uncontrolled inputs
  // FormData reads the actual DOM value on submit.
  await page.evaluate(() => {
    const email = document.querySelector<HTMLInputElement>('input[name="email"]')!;
    const password = document.querySelector<HTMLInputElement>('input[name="password"]')!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(email, "admin@kushhr.dev");
    setter.call(password, "TestPass123!");
  });
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard$/);

  await context.close();
});

test("login next param cannot open-redirect to external or protocol-relative URLs", async ({ browser }) => {
  async function expectUnsafeNextFallsBack(next: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email").fill("admin@kushhr.dev");
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard/);
    expect(new URL(page.url()).host).not.toBe("example.org");
    await context.close();
  }

  await expectUnsafeNextFallsBack("https://example.org/phish");
  await expectUnsafeNextFallsBack("//example.org/phish");
  await expectUnsafeNextFallsBack("/\\example.org/phish");
});
