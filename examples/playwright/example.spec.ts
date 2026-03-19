import { test, expect } from "@playwright/test";

test("homepage looks correct", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page).toHaveScreenshot("homepage.png");
});
