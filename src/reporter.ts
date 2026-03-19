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
  private isConnected = false;

  constructor(options: CreeveyReporterOptions = {}) {
    this.serverUrl = options.serverUrl ?? "ws://localhost:3000";
    this.screenshotDir = options.screenshotDir ?? "./screenshots";
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
        this.isConnected = true;
        console.log("[CreeveyReporter] Connected to Creevey server");
      };
      this.ws.onerror = (error) => {
        console.error("[CreeveyReporter] WebSocket error:", error);
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        console.log("[CreeveyReporter] Disconnected from Creevey server");
      };
    } catch (e) {
      console.error("[CreeveyReporter] Failed to connect:", e);
    }
  }

  onTestBegin(test: TestCase): void {
    this.send({
      type: "test-begin",
      data: {
        id: test.id,
        title: test.title,
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

  onEnd(result: FullResult): void {
    this.send({
      type: "run-end",
      data: {
        status: result.status,
      },
    });
    if (this.ws) {
      this.ws.close();
    }
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export default CreeveyReporter;
