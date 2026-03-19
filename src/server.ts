import type { TestData } from "./types.ts";

interface ReportData {
  isRunning: boolean;
  tests: Record<string, TestData>;
  browsers: string[];
  isUpdateMode: boolean;
}

const reportData: ReportData = {
  isRunning: false,
  tests: {},
  browsers: ["chromium"],
  isUpdateMode: false,
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

Bun.serve({
  port: 3000,
  routes: {
    "/": async () => {
      const html = Bun.file("./index.html");
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
    "/src/client/styles.css": async () => {
      const css = Bun.file("./src/client/styles.css");
      return new Response(css, { headers: { "Content-Type": "text/css" } });
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
  },
  websocket: {
    open(_ws) {
      console.log("WebSocket connected");
    },
    message(_ws, message) {
      console.log("WebSocket message:", message);
    },
    close(_ws) {
      console.log("WebSocket closed");
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Creevey Reporter started at http://localhost:3000");
