import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  reporter: [
    ["../../packages/playwright-reporter/index.ts", { serverUrl: "ws://localhost:3000" }],
    ["html"],
  ],
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
