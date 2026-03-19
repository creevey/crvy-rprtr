# Creevey Offline Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Creevey Playwright reporter to generate `report.json` locally when WebSocket server is unavailable (e.g., CI matrix builds without persistent server), allowing screenshot review later via the UI.

**Architecture:** Reporter falls back to local event queue and JSON file writes when WebSocket connection fails. Worker-index differentiation prevents file collisions in parallel/matrix CI. Server loads pre-existing report.json on startup to enable post-hoc review.

**Tech Stack:** TypeScript, Bun file I/O, @playwright/test Reporter API

---

## Task 1: Add Worker Index and Offline Types

**Files:**
- Modify: `src/types.ts`
- Modify: `packages/playwright-reporter/index.ts`

**Step 1: Add WorkerInfo and OfflineEvent types to types.ts**

```typescript
// Add to src/types.ts

export interface WorkerInfo {
  workerIndex: number;
  isParallel: boolean;
}

export interface OfflineEvent {
  type: "test-begin" | "test-end" | "run-end";
  data: unknown;
  timestamp: number;
  workerIndex: number;
}

export interface OfflineReport {
  version: number;
  generatedAt: string;
  workers: number;
  events: OfflineEvent[];
}
```

**Step 2: Add offlineReportPath and workerIndex to CreeveyReporterOptions**

```typescript
// In packages/playwright-reporter/index.ts, update CreeveyReporterOptions:
export interface CreeveyReporterOptions {
  serverUrl?: string;
  screenshotDir?: string;
  offlineReportPath?: string;  // New: path for offline report.json
  enableOffline?: boolean;     // New: enable offline mode when server unavailable
}
```

**Step 3: Add worker index detection in reporter constructor**

```typescript
// In packages/playwright-reporter/index.ts, add to class:
private workerIndex: number;
private offlineEvents: OfflineEvent[] = [];
private isOfflineMode = false;
private offlineReportPath: string;

// In constructor, after existing initialization:
this.workerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? "0", 10);
this.offlineReportPath = options.offlineReportPath ?? "./creevey-offline-report.json";
this.isOfflineMode = false;
```

**Step 4: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS (no new errors)

---

## Task 2: Implement Offline Event Queue

**Files:**
- Modify: `packages/playwright-reporter/index.ts`

**Step 1: Add offline event creation helper**

```typescript
// Add after class properties
private createOfflineEvent(type: "test-begin" | "test-end" | "run-end", data: unknown): OfflineEvent {
  return {
    type,
    data,
    timestamp: Date.now(),
    workerIndex: this.workerIndex,
  };
}
```

**Step 2: Modify send() to fallback to offline queue**

```typescript
// Replace existing send() method:
private send(msg: object): void {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(msg));
    return;
  }
  
  // Fallback: queue event for offline processing
  if (this.isOfflineMode) {
    this.offlineEvents.push(this.createOfflineEvent((msg as any).type, (msg as any).data));
  }
}
```

**Step 3: Add offline mode detection on WebSocket error/close**

```typescript
// Modify connect() method to set offline mode on failure:
private connect(): void {
  try {
    this.ws = new WebSocket(this.serverUrl);
    this.ws.onopen = () => {
      this.isConnected = true;
      this.isOfflineMode = false;
      console.log("[CreeveyReporter] Connected to Creevey server");
    };
    this.ws.onerror = (error) => {
      console.error("[CreeveyReporter] WebSocket error:", error);
      this.enableOfflineMode();
    };
    this.ws.onclose = () => {
      this.isConnected = false;
      if (!this.isOfflineMode) {
        this.enableOfflineMode();
      }
      console.log("[CreeveyReporter] Disconnected from Creevey server");
    };
  } catch (e) {
    console.error("[CreeveyReporter] Failed to connect:", e);
    this.enableOfflineMode();
  }
}

private enableOfflineMode(): void {
  if (!this.isOfflineMode) {
    this.isOfflineMode = true;
    console.log("[CreeveyReporter] Offline mode enabled - events will be queued");
  }
}
```

**Step 4: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 3: Write Offline Report on Test Run End

**Files:**
- Modify: `packages/playwright-reporter/index.ts`

**Step 1: Add writeOfflineReport method**

```typescript
// Add after enableOfflineMode()
private async writeOfflineReport(): Promise<void> {
  if (this.offlineEvents.length === 0) {
    console.log("[CreeveyReporter] No offline events to write");
    return;
  }

  try {
    const report: OfflineReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      workers: this.workerIndex + 1,
      events: this.offlineEvents,
    };
    
    await Bun.write(this.offlineReportPath, JSON.stringify(report, null, 2));
    console.log(`[CreeveyReporter] Wrote offline report: ${this.offlineReportPath}`);
  } catch (e) {
    console.error("[CreeveyReporter] Failed to write offline report:", e);
  }
}
```

**Step 2: Modify onEnd to write offline report**

```typescript
// Replace existing onEnd method:
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

  // Write offline report if in offline mode
  if (this.isOfflineMode) {
    this.writeOfflineReport();
  }
}
```

**Step 3: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 4: Write Tests for Offline Mode

**Files:**
- Create: `packages/playwright-reporter/offline.test.ts`

**Step 1: Create offline mode tests**

```typescript
// packages/playwright-reporter/offline.test.ts
import { test, expect, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import { CreeveyReporter } from "./index";

const TEST_REPORT_PATH = "./test-offline-report.json";

afterEach(() => {
  if (existsSync(TEST_REPORT_PATH)) {
    unlinkSync(TEST_REPORT_PATH);
  }
  if (existsSync("./screenshots")) {
    // Clean up test screenshots
  }
});

test("CreeveyReporter writes offline report when server unavailable", async () => {
  const reporter = new CreeveyReporter({
    serverUrl: "ws://localhost:9999", // Non-existent server
    offlineReportPath: TEST_REPORT_PATH,
    enableOffline: true,
  });

  // Trigger connection attempt which will fail
  // ... simulate onBegin/onTestEnd/onEnd
  
  expect(existsSync(TEST_REPORT_PATH)).toBe(true);
});

test("CreeveyReporter queues events when offline", async () => {
  const reporter = new CreeveyReporter({
    serverUrl: "ws://localhost:9999",
    offlineReportPath: TEST_REPORT_PATH,
  });

  // After WebSocket fails, events should be queued
  const report = existsSync(TEST_REPORT_PATH) 
    ? JSON.parse(await Bun.file(TEST_REPORT_PATH).text())
    : null;
  
  expect(report).not.toBeNull();
  expect(report.events).toBeDefined();
});
```

**Step 2: Run tests**

Run: `bun test packages/playwright-reporter/offline.test.ts`
Expected: FAIL (feature not implemented yet)

---

## Task 5: Add Server-Side Offline Report Loading

**Files:**
- Modify: `src/server.ts`

**Step 1: Add offline report merge function**

```typescript
// Add after loadReport() function
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

function mergeOfflineReport(offlineReport: OfflineReport): void {
  console.log(`[Server] Merging offline report from ${offlineReport.workers} workers`);
  
  for (const event of offlineReport.events) {
    handleWebSocketMessage({ type: event.type, data: event.data } as WebSocketMessage);
  }
}

function loadOfflineReports(): void {
  try {
    const offlineDir = ".";
    const files = Array.from({ length: 8 }, (_, i) => `creevey-offline-report-${i}.json`);
    files.push("creevey-offline-report.json");
    
    for (const file of files) {
      const f = Bun.file(file);
      if (f.size > 0) {
        try {
          const data = f.json() as OfflineReport;
          if (data.version === 1 && Array.isArray(data.events)) {
            console.log(`[Server] Loading offline report: ${file}`);
            mergeOfflineReport(data);
            // Optionally rename/move processed file
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch {
    console.log("[Server] No offline reports found");
  }
}
```

**Step 2: Call loadOfflineReports on server startup**

```typescript
// After loadReport(), add:
loadOfflineReports();
```

**Step 3: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 6: Update Server to Support Matrix CI Reports

**Files:**
- Modify: `packages/playwright-reporter/index.ts`

**Step 1: Add matrix worker file naming**

```typescript
// In constructor, set worker-specific report path:
const workerSuffix = process.env.TEST_WORKER_INDEX ?? "0";
this.offlineReportPath = options.offlineReportPath 
  ?? `./creevey-offline-report-${workerSuffix}.json`;
```

**Step 2: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 7: Integration Test with Matrix CI Scenario

**Files:**
- Create: `examples/playwright-matrix/`
- Create: `examples/playwright-matrix/playwright.config.ts`
- Create: `examples/playwright-matrix/matrix.spec.ts`

**Step 1: Create matrix example config**

```typescript
// examples/playwright-matrix/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  workers: 3,  // Simulate matrix with 3 workers
  reporter: [
    ["./packages/playwright-reporter/index.ts", { 
      serverUrl: "ws://localhost:9999",  // Wrong URL to trigger offline
      enableOffline: true,
    }],
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

**Step 2: Create matrix test file**

```typescript
// examples/playwright-matrix/matrix.spec.ts
import { test, expect } from "@playwright/test";

test("matrix test 1", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page).toHaveScreenshot("matrix-1.png");
});

test("matrix test 2", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page).toHaveScreenshot("matrix-2.png");
});
```

**Step 3: Test offline mode manually**

```bash
# Run without server - should create offline reports
cd examples/playwright-matrix && bun playwright test

# Verify offline reports exist
ls -la creevey-offline-report-*.json

# Start server and verify it loads reports
bun src/server.ts
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `README.md` (or create if doesn't exist)
- Add: `docs/offline-mode.md`

**Step 1: Create offline mode documentation**

```markdown
# Offline Mode

When the Creevey server is unavailable (e.g., CI matrix builds), the Playwright reporter can operate in offline mode to generate a local `report.json` file for later review.

## How It Works

1. Reporter attempts WebSocket connection to server
2. If connection fails, reporter enters **offline mode**
3. Events are queued locally during test execution
4. On `onEnd`, reporter writes `creevey-offline-report-{workerIndex}.json`

## Server-Side Loading

When the Creevey server starts, it automatically scans for and loads any offline reports, merging them into the active `reportData`.

## CI Integration

```typescript
// playwright.config.ts
reporter: [
  ["./packages/playwright-reporter/index.ts", { 
    serverUrl: process.env.CI ? "ws://creevey-server:3000" : "ws://localhost:3000",
    enableOffline: true,
  }],
]
```

## Artifacts

Upload these files as CI artifacts:
- `screenshots/` - all screenshots
- `creevey-offline-report-*.json` - event data for each worker
```

---

## Verification Commands

```bash
bun run typecheck    # Verify TypeScript compiles
bun run lint        # Verify linting passes
bun test            # Run all tests
```

---

## Dependencies

- No new runtime dependencies
- No changes to existing dependencies

---

## Follow-up Considerations

1. **Atomic writes**: Use temp files + rename for crash safety
2. **Report cleanup**: Option to delete offline reports after server loads them
3. **Compression**: gzip large offline reports
4. **Upload to object storage**: For long CI pipelines, stream reports to S3/GCS
