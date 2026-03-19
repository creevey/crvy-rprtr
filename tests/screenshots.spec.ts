import { test, expect } from "./creevey";

test.describe("Screenshot Tests", () => {
  test("test page renders correctly", async ({ page }) => {
    await page.goto("/test-page");
    await expect(page).toHaveTitle("Creevey Test Page");
    await expect(page.locator("h1")).toHaveText("Creevey Reporter");
  });

  test("test page matches screenshot", async ({ page }) => {
    await page.goto("/test-page");
    await expect(page).toHaveScreenshot("test-page.png");
  });

  test("approve button is visible", async ({ page }) => {
    await page.goto("/test-page");
    const approveBtn = page.locator(".approve-btn");
    await expect(approveBtn).toBeVisible();
    await expect(approveBtn).toHaveText("Approve Selected");
  });

  test("can select test and view screenshot", async ({ page }) => {
    await page.goto("/test-page");
    await page.click('[data-test="homepage"]');
    const screenshot = page.locator(".screenshot-container img");
    await expect(screenshot).toBeVisible();
    await expect(screenshot).toHaveAttribute("alt", "homepage");
  });
});