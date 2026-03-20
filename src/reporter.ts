import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from "@playwright/test/reporter";
import { mkdir, copyFile } from "fs/promises";
import { join } from "path";

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
    this.workerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? "0", 10);
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
    const storyPath: string[] = [];
    let suite: Suite | undefined = test.parent;
    while (suite && suite.type === "describe") {
      storyPath.unshift(suite.title);
      suite = suite.parent;
    }
    this.send({
      type: "test-begin",
      data: {
        id: test.id,
        title: test.title,
        storyPath,
        testName: test.title,
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

    for (const attachment of result.attachments) {
      if (attachment.contentType === "image/png" && attachment.path) {
        try {
          await mkdir(testScreenshotDir, { recursive: true });
          const fileName = `${attachment.name}.png`;
          const destPath = join(testScreenshotDir, fileName);
          await copyFile(attachment.path, destPath);
          savedAttachments.push({
            name: attachment.name,
            path: `${testId}/${fileName}`,
            contentType: attachment.contentType,
          });
          console.log(`[CreeveyReporter] Saved screenshot: ${destPath}`);
        } catch (e) {
          console.error(`[CreeveyReporter] Failed to save screenshot: ${attachment.path}`, e);
          savedAttachments.push({
            name: attachment.name,
            path: attachment.path,
            contentType: attachment.contentType,
          });
        }
      }
    }

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

      await Bun.write(this.offlineReportPath, JSON.stringify(report, null, 2));
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else if (this.isOfflineMode) {
      const msgObj = msg as { type?: string; data?: unknown };
      this.offlineEvents.push({ type: msgObj.type ?? "unknown", data: msgObj.data });
    } else {
      this.queue.push(payload);
    }
  }
}

export default CreeveyReporter;
