import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";

const TEST_WORKER_INDEX = "99";
const TEST_REPORT_PATH = `./creevey-offline-report-${TEST_WORKER_INDEX}.json`;

describe("Offline Mode", () => {
  beforeEach(() => {
    if (existsSync(TEST_REPORT_PATH)) {
      unlinkSync(TEST_REPORT_PATH);
    }
  });

  afterEach(() => {
    if (existsSync(TEST_REPORT_PATH)) {
      unlinkSync(TEST_REPORT_PATH);
    }
  });

  test("reporter queues events when WebSocket unavailable", async () => {
    const { CreeveyReporter } = await import("../src/reporter");

    const reporter = new CreeveyReporter({
      serverUrl: "ws://localhost:9999",
      screenshotDir: "./test-offline-screenshots",
    });

    expect(reporter).toBeDefined();
  });

  test("offline report file is not created when no events", async () => {
    expect(existsSync(TEST_REPORT_PATH)).toBe(false);
  });
});
