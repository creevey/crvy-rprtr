import { test, expect } from "@playwright/test";

test.describe("Matrix CI Integration", () => {
  test("displays matrix view", async ({ page }) => {
    await page.goto("http://localhost:3000");

    await expect(page).toHaveScreenshot("matrix-integration.png");
  });
});
