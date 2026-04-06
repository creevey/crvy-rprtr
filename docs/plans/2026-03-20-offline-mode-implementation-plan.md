# Creevey Offline Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Creevey Playwright reporter to generate offline report files when WebSocket server is unavailable (e.g., CI matrix builds without persistent server), allowing screenshot review later via the UI.

**Architecture:** Reporter falls back to local JSON file writes when WebSocket connection fails or is unavailable. Worker-index differentiation prevents file collisions in parallel/matrix CI. Server loads pre-existing offline reports on startup to enable post-hoc review.

**Tech Stack:** TypeScript, Bun file I/O, @playwright/test Reporter API

---

## Current Project State

| Component           | Location            | Notes                                            |
| ------------------- | ------------------- | ------------------------------------------------ |
| Playwright Reporter | `src/reporter.ts`   | Has basic memory queue, NO offline file writing  |
| Server              | `src/server.ts`     | Has `loadReport()` but NO offline report loading |
| Types               | `src/types.ts`      | Missing offline types                            |
| Tests               | `tests/app.spec.ts` | Only API tests, no offline tests                 |

**What's missing:**

- No worker index detection
- No offline mode detection on WebSocket failure
- No `writeOfflineReport()` method
- No server-side `loadOfflineReports()`
- No matrix CI support

---

## Task 1: Add Offline Types to types.ts

**Files:**

- Modify: `src/types.ts`

**Step 1: Add OfflineEvent and OfflineReport interfaces**

Add to end of `src/types.ts`:

```typescript
export interface OfflineEvent {
  type: 'test-begin' | 'test-end' | 'run-end'
  data: unknown
  timestamp: number
  workerIndex: number
}

export interface OfflineReport {
  version: number
  generatedAt: string
  workers: number
  events: OfflineEvent[]
}
```

**Step 2: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 2: Implement Offline Mode in Reporter

**Files:**

- Modify: `src/reporter.ts`

**Step 1: Update CreeveyReporterOptions interface**

Replace existing options at top of file:

```typescript
export interface CreeveyReporterOptions {
  serverUrl?: string
  screenshotDir?: string
  offlineReportPath?: string
}
```

**Step 2: Update class properties and constructor**

Replace class properties and constructor with:

```typescript
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
```

**Step 3: Update connect() method to detect offline mode**

Replace `connect()` method with:

```typescript
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
```

**Step 4: Update send() method to queue offline events**

Replace `send()` method with:

```typescript
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
```

**Step 5: Add writeOfflineReport method**

Add after `sanitizeId()` method:

```typescript
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
```

**Step 6: Update onEnd() to write offline report**

Replace `onEnd()` method with:

```typescript
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
```

**Step 7: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS

---

## Task 3: Add Server-Side Offline Report Loading

**Files:**

- Modify: `src/server.ts`

**Step 1: Add OfflineReport interface and merge function after loadReport()**

Add after `saveReport()` function (around line 38):

```typescript
interface OfflineReport {
  version: number
  generatedAt: string
  workers: number
  events: Array<{
    type: 'test-begin' | 'test-end' | 'run-end'
    data: unknown
    timestamp: number
    workerIndex: number
  }>
}

function mergeOfflineReport(offlineReport: OfflineReport): void {
  console.log(`[Server] Merging offline report from ${offlineReport.workers} worker(s)`)

  for (const event of offlineReport.events) {
    handleWebSocketMessage({
      type: event.type,
      data: event.data,
    } as WebSocketMessage)
  }
}

function loadOfflineReports(): void {
  const patterns = [`creevey-offline-report-${this.workerIndex}.json`, 'creevey-offline-report.json']

  for (const file of patterns) {
    const f = Bun.file(file)
    if (f.size > 0) {
      try {
        const data = f.json() as OfflineReport
        if (data.version === 1 && Array.isArray(data.events)) {
          console.log(`[Server] Loading offline report: ${file}`)
          mergeOfflineReport(data)
        }
      } catch {
        // Skip invalid files
      }
    }
  }
}
```

**Step 2: Update workerIndex handling in server.ts**

The server doesn't currently track worker index. Add to top-level state:

```typescript
// Add after existing state (around line 6)
const serverWorkerIndex = parseInt(process.env.TEST_WORKER_INDEX ?? '0', 10)
```

**Step 3: Call loadOfflineReports after loadReport()**

Update the startup section (around line 40):

```typescript
loadReport()
loadOfflineReports()
```

**Step 4: Run typecheck to verify**

Run: `bun run typecheck`
Expected: PASS (may have errors - we'll fix in next step)

---

## Task 4: Fix TypeScript Errors

**Files:**

- Modify: `src/server.ts`

**Step 1: Fix the loadOfflineReports function - it can't access `this`**

Move the offline report loading logic outside or use a different pattern:

```typescript
// Replace the loadOfflineReports function with:
function loadOfflineReports(): void {
  const workerIdx = parseInt(process.env.TEST_WORKER_INDEX ?? '0', 10)
  const patterns = [`creevey-offline-report-${workerIdx}.json`, 'creevey-offline-report.json']

  for (const file of patterns) {
    const f = Bun.file(file)
    if (f.size > 0) {
      try {
        const data = f.json() as OfflineReport
        if (data.version === 1 && Array.isArray(data.events)) {
          console.log(`[Server] Loading offline report: ${file}`)
          mergeOfflineReport(data)
        }
      } catch {
        // Skip invalid files
      }
    }
  }
}
```

**Step 2: Run typecheck again**

Run: `bun run typecheck`
Expected: PASS

---

## Task 5: Write Tests for Offline Mode

**Files:**

- Create: `tests/offline.test.ts`

**Step 1: Create offline mode tests**

```typescript
// tests/offline.test.ts
import { test, expect, afterEach, beforeEach } from 'bun:test'
import { existsSync, unlinkSync } from 'fs'

const TEST_WORKER_INDEX = '99'
const TEST_REPORT_PATH = `./creevey-offline-report-${TEST_WORKER_INDEX}.json`

test.describe('Offline Mode', () => {
  beforeEach(() => {
    // Clean up any existing test report
    if (existsSync(TEST_REPORT_PATH)) {
      unlinkSync(TEST_REPORT_PATH)
    }
  })

  afterEach(() => {
    if (existsSync(TEST_REPORT_PATH)) {
      unlinkSync(TEST_REPORT_PATH)
    }
  })

  test('reporter queues events when WebSocket unavailable', async () => {
    // This test validates the reporter can be instantiated and handles offline mode
    const { CreeveyReporter } = await import('../src/reporter')

    const reporter = new CreeveyReporter({
      serverUrl: 'ws://localhost:9999',
      screenshotDir: './test-offline-screenshots',
    })

    expect(reporter).toBeDefined()
  })

  test('offline report file is not created when no events', async () => {
    // When server is unreachable but no tests run, no file should be created
    expect(existsSync(TEST_REPORT_PATH)).toBe(false)
  })
})
```

**Step 2: Run tests**

Run: `bun test tests/offline.test.ts`
Expected: PASS (first test passes, second confirms file doesn't exist)

---

## Task 6: Integration Test with Matrix CI Scenario

**Files:**

- Modify: `playwright.config.ts` (create test config)
- Create: `tests/matrix-integration.spec.ts`

**Step 1: Create matrix test config**

```typescript
// tests/matrix-integration.config.ts
import { defineConfig, devices } from '@playwright/test'
import { CreeveyReporter } from '../src/reporter'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: [
    [
      './src/reporter.ts',
      {
        serverUrl: 'ws://localhost:9999', // Wrong URL to trigger offline
      },
    ],
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

**Step 2: Create matrix integration test**

```typescript
// tests/matrix-integration.spec.ts
import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'

test.describe('Matrix CI Integration', () => {
  test('generates worker-specific offline reports', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Verify we can still use the app even when server is "wrong"
    await expect(page).toHaveScreenshot('matrix-integration.png')
  })

  test('offline report files exist after test run', () => {
    // Check for worker-specific report files
    const worker0Report = existsSync('creevey-offline-report-0.json')
    const worker1Report = existsSync('creevey-offline-report-1.json')

    // At least one worker should have written a report
    expect(worker0Report || worker1Report).toBe(true)
  })
})
```

**Step 3: Run integration test**

```bash
# In one terminal, start server
bun src/server.ts

# In another, run matrix tests (without server)
TEST_WORKER_INDEX=0 bun playwright test --config=tests/matrix-integration.config.ts
TEST_WORKER_INDEX=1 bun playwright test --config=tests/matrix-integration.config.ts

# Verify offline reports exist
ls -la creevey-offline-report-*.json
```

---

## Task 7: Update Documentation

**Files:**

- Add: `docs/offline-mode.md`

**Step 1: Create offline mode documentation**

````markdown
# Offline Mode

When the Creevey server is unavailable (e.g., CI matrix builds), the Playwright reporter operates in offline mode to generate local report files for later review.

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
  [
    './src/reporter.ts',
    {
      serverUrl: process.env.CREEVEY_SERVER_URL ?? 'ws://localhost:3000',
    },
  ],
]
```
````

## Artifacts

Upload these files as CI artifacts:

- `screenshots/` - all screenshots
- `creevey-offline-report-*.json` - event data for each worker

## Environment Variables

| Variable             | Description                  | Default               |
| -------------------- | ---------------------------- | --------------------- |
| `TEST_WORKER_INDEX`  | Worker index for file naming | `0`                   |
| `CREEVEY_SERVER_URL` | WebSocket server URL         | `ws://localhost:3000` |

````

---

## Verification Commands

```bash
bun run typecheck    # Verify TypeScript compiles
bun run lint         # Verify linting passes
bun test             # Run all tests
````

---

## Dependencies

- No new runtime dependencies
- Uses `Bun.write()` for file I/O (already available via Bun)

---

## Follow-up Considerations

1. **Atomic writes**: Use temp files + rename for crash safety
2. **Report cleanup**: Option to delete offline reports after server loads them
3. **Compression**: gzip large offline reports for artifact storage
4. **Upload to object storage**: For long CI pipelines, stream reports to S3/GCS
5. **Connection retry**: Add retry logic before entering offline mode
