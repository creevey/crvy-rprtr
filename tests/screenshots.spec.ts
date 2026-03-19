import { test, expect } from "@playwright/test";

test.describe("App UI", () => {
  test("renders empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Creevey Reporter");
    await expect(page).toHaveScreenshot("app-empty-state.png");
  });

  test("sidebar header shows title and status counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar-header h1")).toHaveText("Creevey Reporter");
    await expect(page.locator(".sidebar-header .tests-status")).toBeVisible();
  });
});
