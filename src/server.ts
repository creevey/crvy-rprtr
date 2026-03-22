import type { TestData, WebSocketMessage } from "./types.ts";
import type { ServerWebSocket } from "bun";

const wsClients = new Set<ServerWebSocket>();

interface ReportData {
  isRunning: boolean;
  tests: Record<string, TestData>;
  browsers: string[];
  isUpdateMode: boolean;
  screenshotDir: string;
}

const reportData: ReportData = {
  isRunning: false,
  tests: {},
  browsers: ["chromium"],
  isUpdateMode: false,
  screenshotDir: "./screenshots",
};

async function loadReport(): Promise<void> {
  try {
    const reportPath = "./report.json";
    const file = Bun.file(reportPath);
    if (file.size > 0) {
      const data = (await file.json()) as {
        tests?: Record<string, TestData>;
        isUpdateMode?: boolean;
      };
      reportData.tests = data.tests ?? {};
      reportData.isUpdateMode = data.isUpdateMode ?? false;
    }
  } catch {
    console.log("No report.json found, using empty state");
  }
}

async function saveReport(): Promise<void> {
  await Bun.write("./report.json", JSON.stringify(reportData, null, 2));
}

interface OfflineReport {
  version: number;
  generatedAt: string;
  workers: number;
  events: Array<{
    type: "test-begin" | "test-end" | "run-end";
    data: unknown;
    timestamp: number;
    workerIndex: number;
  }>;
}

async function mergeOfflineReport(offlineReport: OfflineReport): Promise<void> {
  console.log(`[Server] Merging offline report from ${offlineReport.workers} worker(s)`);

  for (const event of offlineReport.events) {
    await handleWebSocketMessage({
      type: event.type,
      data: event.data,
    } as WebSocketMessage);
  }
}

async function loadOfflineReports(): Promise<void> {
  const workerIdx = parseInt(process.env.TEST_WORKER_INDEX ?? "0", 10);
  const patterns = [`creevey-offline-report-${workerIdx}.json`, "creevey-offline-report.json"];

  for (const file of patterns) {
    const f = Bun.file(file);
    if (f.size > 0) {
      try {
        const data = (await f.json()) as OfflineReport;
        if (data.version === 1 && Array.isArray(data.events)) {
          console.log(`[Server] Loading offline report: ${file}`);
          mergeOfflineReport(data);
        }
      } catch {
        // Skip invalid files
      }
    }
  }
}

await loadReport();
await loadOfflineReports();

async function handleWebSocketMessage(msg: WebSocketMessage): Promise<void> {
  switch (msg.type) {
    case "test-begin": {
      const { id, title, storyPath, testName, browser, location } = msg.data as {
        id: string;
        title: string;
        storyPath: string[];
        testName: string;
        browser: string;
        location: { file: string; line: number };
      };
      if (!reportData.tests[id]) {
        reportData.tests[id] = {
          id,
          storyId: id,
          storyPath: storyPath ?? [],
          browser: browser ?? "",
          testName: testName ?? title,
          title,
          location,
          status: "running",
        };
      }
      const label = testName ?? title;
      console.log(`  ▶ [${browser ?? "?"}] ${label}`);
      break;
    }
    case "test-end": {
      const data = msg.data as {
        id: string;
        status: "passed" | "failed" | "skipped";
        attachments: Array<{ name: string; path: string; contentType: string }>;
        error?: string;
        duration?: number;
      };
      const test = reportData.tests[data.id];
      if (test) {
        test.status = mapStatus(data.status);
        const images = attachmentsToImages(data.attachments);
        test.results = [
          {
            status: data.status === "passed" ? "success" : "failed",
            retries: 0,
            images,
            error: data.error,
            duration: data.duration,
          },
        ];
        const icon = data.status === "passed" ? "✓" : data.status === "skipped" ? "–" : "✗";
        const dur = data.duration != null ? ` (${data.duration}ms)` : "";
        const diffCount = Object.keys(images).length;
        const diffNote = diffCount > 0 ? ` [${diffCount} diff(s)]` : "";
        const errNote = data.error ? `\n    Error: ${data.error}` : "";
        console.log(`  ${icon} [${test.browser}] ${test.testName}${dur}${diffNote}${errNote}`);
      }
      broadcastToBrowsers({ type: "test-update", data });
      break;
    }
    case "run-end": {
      reportData.isRunning = false;
      await saveReport();
      const tests = Object.values(reportData.tests);
      const passed = tests.filter((t) => t?.status === "success").length;
      const failed = tests.filter((t) => t?.status === "failed").length;
      const pending = tests.filter((t) => t?.status === "pending").length;
      const diffs = tests.filter(
        (t) => t?.results?.some((r) => r.images && Object.keys(r.images).length > 0),
      ).length;
      console.log(
        `\nRun complete — ${passed} passed, ${failed} failed, ${pending} skipped${diffs > 0 ? `, ${diffs} with diffs` : ""}`,
      );
      broadcastToBrowsers({ type: "run-end", data: msg.data });
      break;
    }
  }
}

function attachmentsToImages(
  attachments: Array<{ name: string; path: string; contentType: string }>,
): Partial<Record<string, import("./types.ts").Images>> {
  const images: Partial<Record<string, import("./types.ts").Images>> = {};
  for (const attachment of attachments) {
    if (attachment.contentType !== "image/png") continue;
    const match = attachment.name.match(/^(.+?)-(actual|expected|diff)(?:\.png)?$/);
    if (!match) continue;
    const baseName = match[1] as string;
    const role = match[2] as string;
    if (!images[baseName]) images[baseName] = { actual: "" };
    const url = `/screenshots/${attachment.path}`;
    if (role === "actual") images[baseName]!.actual = url;
    else if (role === "expected") images[baseName]!.expect = url;
    else if (role === "diff") images[baseName]!.diff = url;
  }
  // Drop entries where comparison passed (has expected but no diff) — nothing to review.
  // Keep new screenshots (actual only, no expected) — they need approval too.
  for (const key of Object.keys(images)) {
    const img = images[key];
    if (!img?.diff && img?.expect) delete images[key];
  }
  return images;
}

function broadcastToBrowsers(msg: object): void {
  const payload = JSON.stringify(msg);
  wsClients.forEach((ws) => {
    ws.send(payload);
  });
}

function mapStatus(status: "passed" | "failed" | "skipped"): TestData["status"] {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "failed";
    case "skipped":
      return "pending";
    default:
      return "unknown";
  }
}

Bun.serve({
  port: 3000,
  routes: {
    "/": (req, server) => {
      if (server.upgrade(req)) return;
      const html = Bun.file("./index.html");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
    "/src/client/app.css": async () => {
      const css = Bun.file("./src/client/app.css");
      return new Response(css, { headers: { "Content-Type": "text/css" } });
    },
    "/src/*": async (req) => {
      const path = new URL(req.url).pathname.slice("/src/".length);
      const filePath = `./src/${path}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType =
          filePath.endsWith(".ts") || filePath.endsWith(".tsx")
            ? "application/javascript"
            : filePath.endsWith(".css")
              ? "text/css"
              : "text/plain";
        return new Response(file, { headers: { "Content-Type": contentType } });
      }
      return new Response("Not Found", { status: 404 });
    },
    "/api/report": async () => {
      return Response.json(reportData);
    },
    "/api/approve": async (req) => {
      try {
        const body = await req.json();
        const { id, retry, image } = body as { id: string; retry: number; image: string };

        if (reportData.tests[id]) {
          if (!reportData.tests[id].approved) {
            reportData.tests[id].approved = {};
          }
          (reportData.tests[id].approved as Record<string, number>)[image] = retry;
          await saveReport();
          const test = reportData.tests[id];
          console.log(`  ✔ Approved [${test?.browser}] ${test?.testName} — ${image}`);
        }

        return Response.json({ success: true });
      } catch {
        return Response.json({ success: false, error: "Invalid request" }, { status: 400 });
      }
    },
    "/api/approve-all": async () => {
      let approvedCount = 0;
      Object.values(reportData.tests).forEach((test) => {
        if (test && test.results) {
          test.approved = {};
          const lastResult = test.results[test.results.length - 1];
          if (lastResult?.images) {
            Object.keys(lastResult.images).forEach((imageName) => {
              (test.approved as Record<string, number>)[imageName] = test.results!.length - 1;
              approvedCount++;
            });
          }
        }
      });
      await saveReport();
      console.log(`  ✔ Approved all — ${approvedCount} image(s)`);
      return Response.json({ success: true });
    },
    "/api/images/*": async (req) => {
      const path = new URL(req.url).pathname.slice("/api/images/".length);
      const imagePath = `./images/${path}`;
      const file = Bun.file(imagePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return Response.json({ error: "Image not found" }, { status: 404 });
    },
    "/screenshots/*": async (req) => {
      const path = new URL(req.url).pathname.slice("/screenshots/".length);
      const screenshotPath = `${reportData.screenshotDir}/${path}`;
      const file = Bun.file(screenshotPath);
      if (await file.exists()) {
        return new Response(file);
      }
      return Response.json({ error: "Screenshot not found" }, { status: 404 });
    },
    "/dist/*": async (req) => {
      const path = new URL(req.url).pathname.slice("/dist/".length);
      const filePath = `./dist/${path}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType = filePath.endsWith(".css")
          ? "text/css"
          : filePath.endsWith(".js")
            ? "application/javascript"
            : filePath.endsWith(".svelte")
              ? "text/plain"
              : "application/octet-stream";
        return new Response(file, { headers: { "Content-Type": contentType } });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
    },
    message(_ws, message) {
      try {
        const msg = JSON.parse(message.toString()) as WebSocketMessage;
        handleWebSocketMessage(msg).catch((e) => {
          console.error("Error handling WebSocket message:", e);
        });
      } catch (e) {
        console.error("Invalid WebSocket message:", e);
      }
    },
    close(ws) {
      wsClients.delete(ws);
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Creevey Reporter started at http://localhost:3000");
