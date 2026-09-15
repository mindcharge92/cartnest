import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("public and protected entry screens remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/marketplace", "/login", "/register", "/cart", "/wishlist", "/vendor", "/checkout"]) {
    await page.goto(path);
    // Auth-protected pages deliberately render a prominent error state before
    // the protected main content exists, so accept either valid page shell.
    await expect(page.locator("main, [role='alert']").first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${path} horizontal overflow`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.locator("body")).not.toContainText("Application error");
  }
});

test("registration uses same-origin cookies and opens the authenticated account", async ({ page, baseURL }) => {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
    test.skip(true, "Creates synthetic users only on a local verification instance.");
  }
  await page.goto("/register");
  await page.getByLabel("Email", { exact: false }).fill(`browser-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: false }).fill("Browser-integration-123!");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "cartnest_access")?.httpOnly).toBe(true);
  expect(cookies.find((cookie) => cookie.name === "cartnest_csrf")?.httpOnly).toBe(false);
  await page.reload();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: /account/i }).first()).toBeVisible();
});

test("recovery consumes URL fragments without retaining tokens in the address bar", async ({ page }) => {
  await page.goto("/reset-password#token=local-browser-test");
  await expect(page.getByRole("button", { name: "Update password" })).toBeEnabled();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel("Reset token", { exact: true })).toHaveCount(0);
  await page.goto("/verify#token=local-browser-test");
  await expect(page.getByRole("button", { name: "Confirm verification" })).toBeEnabled();
  await expect(page).toHaveURL(/\/verify$/);
});
