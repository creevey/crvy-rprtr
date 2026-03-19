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

function loadReport(): void {
  try {
    const reportPath = "./report.json";
    const file = Bun.file(reportPath);
    if (file.size > 0) {
      const data = file.json() as { tests?: Record<string, TestData>; isUpdateMode?: boolean };
      reportData.tests = data.tests ?? {};
      reportData.isUpdateMode = data.isUpdateMode ?? false;
    }
  } catch {
    console.log("No report.json found, using empty state");
  }
}

function saveReport(): void {
  Bun.write("./report.json", JSON.stringify(reportData, null, 2));
}

loadReport();

function handleWebSocketMessage(msg: WebSocketMessage): void {
  switch (msg.type) {
    case "test-begin": {
      const { id, title, location } = msg.data as { id: string; title: string; location: { file: string; line: number } };
      if (!reportData.tests[id]) {
        reportData.tests[id] = {
          id,
          storyId: id,
          storyPath: [],
          browser: "",
          title,
          location,
          status: "running",
        };
      }
      break;
    }
    case "test-end": {
      const data = msg.data as { id: string; status: "passed" | "failed" | "skipped"; attachments: Array<{ name: string; path: string; contentType: string }>; error?: string; duration?: number };
      const test = reportData.tests[data.id];
      if (test) {
        test.attachments = data.attachments;
        test.status = mapStatus(data.status);
        test.results = [{
          status: data.status === "passed" ? "success" : "failed",
          retries: 0,
          error: data.error,
          duration: data.duration,
        }];
      }
      broadcastToBrowsers({ type: "test-update", data });
      break;
    }
    case "run-end": {
      reportData.isRunning = false;
      broadcastToBrowsers({ type: "run-end", data: msg.data });
      break;
    }
  }
}

function broadcastToBrowsers(msg: object): void {
  const payload = JSON.stringify(msg);
  wsClients.forEach((ws) => {
    ws.send(payload);
  });
}

function mapStatus(status: "passed" | "failed" | "skipped"): TestData["status"] {
  switch (status) {
    case "passed": return "success";
    case "failed": return "failed";
    case "skipped": return "pending";
    default: return "unknown";
  }
}

Bun.serve({
  port: 3000,
  routes: {
    "/": async () => {
      const html = Bun.file("./index.html");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
    "/test-page": async () => {
      const html = Bun.file("./tests/test-page.html");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
    "/src/client/styles.css": async () => {
      const css = Bun.file("./src/client/styles.css");
      return new Response(css, { headers: { "Content-Type": "text/css" } });
    },
    "/src/:path*": async (req) => {
      const path = req.params["path*"];
      const filePath = `./src/${path}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType = filePath.endsWith(".ts") || filePath.endsWith(".tsx")
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
          saveReport();
        }

        return Response.json({ success: true });
      } catch {
        return Response.json({ success: false, error: "Invalid request" }, { status: 400 });
      }
    },
    "/api/approve-all": async () => {
      Object.values(reportData.tests).forEach((test) => {
        if (test && test.results) {
          test.approved = {};
          const lastResult = test.results[test.results.length - 1];
          if (lastResult?.images) {
            Object.keys(lastResult.images).forEach((imageName) => {
              (test.approved as Record<string, number>)[imageName] = test.results!.length - 1;
            });
          }
        }
      });
      saveReport();
      return Response.json({ success: true });
    },
    "/api/images/:path*": async (req) => {
      const path = req.params["path*"];
      const imagePath = `./images/${path}`;
      const file = Bun.file(imagePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return Response.json({ error: "Image not found" }, { status: 404 });
    },
    "/screenshots/:path*": async (req) => {
      const path = req.params["path*"];
      const screenshotPath = `${reportData.screenshotDir}/${path}`;
      const file = Bun.file(screenshotPath);
      if (await file.exists()) {
        return new Response(file);
      }
      return Response.json({ error: "Screenshot not found" }, { status: 404 });
    },
    "/dist/:path*": async (req) => {
      const path = req.params["path*"];
      const filePath = `./dist/${path}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const contentType = filePath.endsWith(".css") ? "text/css" 
          : filePath.endsWith(".js") ? "application/javascript"
          : filePath.endsWith(".svelte") ? "text/plain"
          : "application/octet-stream";
        return new Response(file, { headers: { "Content-Type": contentType } });
      }
      return new Response("Not Found", { status: 404 });
    },
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
      console.log("WebSocket connected. Clients:", wsClients.size);
    },
    message(ws, message) {
      try {
        const msg = JSON.parse(message.toString()) as WebSocketMessage;
        handleWebSocketMessage(msg);
      } catch (e) {
        console.error("Invalid WebSocket message:", e);
      }
    },
    close(ws) {
      wsClients.delete(ws);
      console.log("WebSocket disconnected. Clients:", wsClients.size);
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Creevey Reporter started at http://localhost:3000");
