import { defineConfig, devices } from "@playwright/test";
import { CreeveyReporter } from "../src/reporter";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  reporter: [
    ["./src/reporter.ts", {
      serverUrl: "ws://localhost:9999",
    }],
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
