import { test, expect } from "@playwright/test";

test.describe("App UI", () => {
  test("renders app", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Creevey Reporter");
    await expect(page).toHaveScreenshot("app.png");
  });

  test("sidebar header shows title and status counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-header h1")).toHaveText("Creevey Reporter");
    await expect(page.locator(".sidebar-header .tests-status")).toBeVisible();
  });
});
