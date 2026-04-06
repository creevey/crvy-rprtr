import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  TestStep,
  FullResult,
} from "@playwright/test/reporter";
import { mkdir, copyFile, writeFile } from "fs/promises";
import { join } from "path";
import pLimit from "p-limit";

const MAX_CONCURRENT_FILE_OPS = 5;

function extractScreenshotNames(steps: TestStep[]): string[] {
  const names: string[] = [];
  for (const step of steps) {
    const match = step.title.match(/toHaveScreenshot\((.+?)\)/);
    if (match?.[1]) names.push(match[1]);
    if (step.steps.length) names.push(...extractScreenshotNames(step.steps));
  }
  return names;
}

export interface CreeveyReporterOptions {
  serverUrl?: string;
  screenshotDir?: string;
  offlineReportPath?: string;
}

interface AttachmentData {
  name: string;
  path: string;
  contentType: string;
}

export class CreeveyReporter implements Reporter {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private screenshotDir: string;
  private queue: string[] = [];
  private workerIndex: number;
  private offlineReportPath: string;
  private isOfflineMode = false;
  private offlineEvents: Array<{ type: string; data: unknown }> = [];

  constructor(options: CreeveyReporterOptions = {}) {
    this.serverUrl = options.serverUrl ?? "ws://localhost:3000";
    this.screenshotDir = options.screenshotDir ?? "./screenshots";
    this.workerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? "0", 10) || 0;
    this.offlineReportPath =
      options.offlineReportPath ?? `./creevey-offline-report-${this.workerIndex}.json`;
  }

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    console.log(`[CreeveyReporter] Starting run with ${suite.allTests().length} tests`);
    await mkdir(this.screenshotDir, { recursive: true });
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.serverUrl);
      this.ws.onopen = () => {
        console.log("[CreeveyReporter] Connected to Creevey server");
        if (this.isOfflineMode) {
          this.offlineEvents = [];
          this.isOfflineMode = false;
        }
        for (const msg of this.queue) this.ws!.send(msg);
        this.queue = [];
      };
      this.ws.onerror = (error) => {
        console.error("[CreeveyReporter] WebSocket error:", error);
        this.enableOfflineMode();
      };
      this.ws.onclose = () => {
        console.log("[CreeveyReporter] Disconnected from Creevey server");
        this.enableOfflineMode();
      };
    } catch (e) {
      console.error("[CreeveyReporter] Failed to connect:", e);
      this.enableOfflineMode();
    }
  }

  private enableOfflineMode(): void {
    if (!this.isOfflineMode) {
      this.isOfflineMode = true;
      console.log("[CreeveyReporter] Offline mode enabled - events will be queued to file");
    }
  }

  onTestBegin(test: TestCase): void {
    const titlePath: string[] = [];
    let suite: Suite | undefined = test.parent;
    while (suite && suite.type === "describe") {
      titlePath.unshift(suite.title);
      suite = suite.parent;
    }
    this.send({
      type: "test-begin",
      data: {
        id: test.id,
        title: test.title,
        titlePath,
        browser: test.parent.project()?.name ?? "chromium",
        location: {
          file: test.location.file,
          line: test.location.line,
        },
      },
    });
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const savedAttachments = await this.saveAttachments(test.id, result);

    if (result.status === "passed") {
      const snapshotNames = extractScreenshotNames(result.steps);
      if (snapshotNames.length > 0) {
        const projectName = test.parent.project()?.name ?? "chromium";
        const snapshotDir = `${test.location.file}-snapshots`;
        const testScreenshotDir = join(this.screenshotDir, this.sanitizeId(test.id));
        const limit = pLimit(MAX_CONCURRENT_FILE_OPS);

        const copyPromises = snapshotNames.map((name) =>
          limit(async () => {
            const baseName = name.replace(/\.png$/, "");
            const snapshotPath = join(
              snapshotDir,
              `${baseName}-${projectName}-${process.platform}.png`,
            );
            const destName = `${baseName}-expected`;
            const destPath = join(testScreenshotDir, destName);
            try {
              await mkdir(testScreenshotDir, { recursive: true });
              await copyFile(snapshotPath, destPath);
              savedAttachments.push({
                name: destName,
                path: `${this.sanitizeId(test.id)}/${destName}`,
                contentType: "image/png",
              });
              console.log(`[CreeveyReporter] Attached baseline: ${snapshotPath}`);
            } catch {
              // baseline not found yet (first run), skip
            }
          }),
        );

        await Promise.all(copyPromises);
      }
    }

    this.send({
      type: "test-end",
      data: {
        id: test.id,
        title: test.title,
        status: result.status,
        attachments: savedAttachments,
        error: result.errors.length > 0 ? result.errors[0]?.message : undefined,
        duration: result.duration,
      },
    });
  }

  private async saveAttachments(testId: string, result: TestResult): Promise<AttachmentData[]> {
    const savedAttachments: AttachmentData[] = [];
    const testScreenshotDir = join(this.screenshotDir, this.sanitizeId(testId));
    const limit = pLimit(MAX_CONCURRENT_FILE_OPS);

    const attachmentPromises = result.attachments
      .filter((attachment): attachment is typeof attachment & { path: string } =>
        attachment.contentType === "image/png" && attachment.path !== undefined
      )
      .map((attachment) =>
        limit(async () => {
          try {
            await mkdir(testScreenshotDir, { recursive: true });
            const fileName = attachment.name;
            const destPath = join(testScreenshotDir, fileName);
            await copyFile(attachment.path, destPath);
            const attachmentData: AttachmentData = {
              name: attachment.name,
              path: `${this.sanitizeId(testId)}/${fileName}`,
              contentType: attachment.contentType,
            };
            savedAttachments.push(attachmentData);
            console.log(`[CreeveyReporter] Saved screenshot: ${destPath}`);
          } catch (e) {
            console.error(`[CreeveyReporter] Failed to save screenshot: ${attachment.path}`, e);
            const fallbackData: AttachmentData = {
              name: attachment.name,
              path: attachment.path,
              contentType: attachment.contentType,
            };
            savedAttachments.push(fallbackData);
          }
        }),
      );

    await Promise.all(attachmentPromises);

    return savedAttachments;
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  private async writeOfflineReport(): Promise<void> {
    if (this.offlineEvents.length === 0) {
      console.log("[CreeveyReporter] No offline events to write");
      return;
    }

    try {
      const report = {
        version: 1,
        generatedAt: new Date().toISOString(),
        workers: this.workerIndex + 1,
        events: this.offlineEvents.map((e) => ({
          ...e,
          timestamp: Date.now(),
          workerIndex: this.workerIndex,
        })),
      };

      await writeFile(this.offlineReportPath, JSON.stringify(report, null, 2));
      console.log(`[CreeveyReporter] Wrote offline report: ${this.offlineReportPath}`);
    } catch (e) {
      console.error("[CreeveyReporter] Failed to write offline report:", e);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    this.send({
      type: "run-end",
      data: {
        status: result.status,
      },
    });

    if (this.isOfflineMode) {
      await this.writeOfflineReport();
    }

    await new Promise<void>((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      this.ws.onclose = () => resolve();
      setTimeout(() => {
        this.ws?.close();
        resolve();
      }, 1000);
      this.ws.close();
    });
  }

  private send(msg: object): void {
    const payload = JSON.stringify(msg);
    if (this.isOfflineMode) {
      const msgObj = msg as { type?: string; data?: unknown };
      this.offlineEvents.push({ type: msgObj.type ?? "unknown", data: msgObj.data });
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      this.queue.push(payload);
    }
  }
}

export default CreeveyReporter;
