import { test, expect } from "@playwright/test";
import { existsSync } from "fs";

test.describe("Matrix CI Integration", () => {
  test("generates worker-specific offline reports", async ({ page }) => {
    await page.goto("http://localhost:3000");

    await expect(page).toHaveScreenshot("matrix-integration.png");
  });

  test("offline report files exist after test run", () => {
    const worker0Report = existsSync("creevey-offline-report-0.json");
    const worker1Report = existsSync("creevey-offline-report-1.json");

    expect(worker0Report || worker1Report).toBe(true);
  });
});
