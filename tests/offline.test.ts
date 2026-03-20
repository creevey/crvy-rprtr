import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { rm } from "fs/promises";
import { readFile } from "fs/promises";

const TEST_WORKER_INDEX = "99";
const TEST_REPORT_PATH = `./creevey-offline-report-${TEST_WORKER_INDEX}.json`;

describe("Offline Mode", () => {
  const originalWorkerIndex = process.env.TEST_WORKER_INDEX;

  beforeEach(() => {
    process.env.TEST_WORKER_INDEX = TEST_WORKER_INDEX;
    try {
      if (existsSync(TEST_REPORT_PATH)) {
        unlinkSync(TEST_REPORT_PATH);
      }
    } catch {}
  });

  afterEach(async () => {
    try {
      if (existsSync(TEST_REPORT_PATH)) {
        await rm(TEST_REPORT_PATH);
      }
    } catch {}
    process.env.TEST_WORKER_INDEX = originalWorkerIndex;
  });

  test("reporter enters offline mode when WebSocket server unavailable", async () => {
    const { CreeveyReporter } = await import("../src/reporter");

    const reporter = new CreeveyReporter({
      serverUrl: "ws://localhost:9999",
      screenshotDir: "./test-offline-screenshots",
    });

    expect(reporter).toBeDefined();

    const reporterAny = reporter as unknown as {
      connect: () => void;
      isOfflineMode: boolean;
      offlineEvents: Array<{ type: string; data: unknown }>;
    };
    reporterAny.connect();

    await Bun.sleep(100);

    expect(reporterAny.isOfflineMode).toBe(true);
  });

  test("reporter queues events and writes offline report on end", async () => {
    const { CreeveyReporter } = await import("../src/reporter");

    const reporter = new CreeveyReporter({
      serverUrl: "ws://localhost:9999",
      screenshotDir: "./test-offline-screenshots",
    });

    const reporterAny = reporter as unknown as {
      connect: () => void;
      isOfflineMode: boolean;
      offlineEvents: Array<{ type: string; data: unknown }>;
      onEnd: (result: { status: string }) => Promise<void>;
    };
    reporterAny.connect();

    await Bun.sleep(100);

    expect(reporterAny.isOfflineMode).toBe(true);

    reporterAny.offlineEvents.push(
      { type: "test-begin", data: { id: "test-1", title: "Test 1" } },
      { type: "test-end", data: { id: "test-1", title: "Test 1", status: "passed" } }
    );

    await reporterAny.onEnd({ status: "passed" });

    expect(existsSync(TEST_REPORT_PATH)).toBe(true);

    const reportContent = await readFile(TEST_REPORT_PATH, "utf-8");
    const report = JSON.parse(reportContent);
    expect(report.version).toBe(1);
    expect(report.workers).toBe(100);
    expect(report.events).toHaveLength(3);
    expect(report.events[0].type).toBe("test-begin");
    expect(report.events[1].type).toBe("test-end");
    expect(report.events[2].type).toBe("run-end");
  });

  test("offline report contains run-end event even with no other events", async () => {
    const { CreeveyReporter } = await import("../src/reporter");

    const reporter = new CreeveyReporter({
      serverUrl: "ws://localhost:9999",
      screenshotDir: "./test-offline-screenshots",
    });

    const reporterAny = reporter as unknown as {
      connect: () => void;
      isOfflineMode: boolean;
      offlineEvents: Array<{ type: string; data: unknown }>;
      onEnd: (result: { status: string }) => Promise<void>;
    };
    reporterAny.connect();

    await Bun.sleep(100);

    expect(reporterAny.isOfflineMode).toBe(true);

    await reporterAny.onEnd({ status: "passed" });

    expect(existsSync(TEST_REPORT_PATH)).toBe(true);

    const reportContent = await readFile(TEST_REPORT_PATH, "utf-8");
    const report = JSON.parse(reportContent);
    expect(report.version).toBe(1);
    expect(report.events).toHaveLength(1);
    expect(report.events[0].type).toBe("run-end");
  });
});
