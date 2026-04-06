# Playwright Reporter Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Playwright screenshot tests with Creevey web UI via WebSocket connection, enabling real-time test result streaming and screenshot approval workflow.

**Architecture:** Custom `@playwright/test` reporter connects via WebSocket to Creevey server, streams test results with screenshot attachments. Server aggregates state and broadcasts updates to connected browsers.

**Tech Stack:** TypeScript, Bun.serve WebSocket, @playwright/test Reporter API

---

## Task 1: Update Types for Playwright Integration

**Files:**

- Modify: `src/types.ts`

**Step 1: Add Playwright-related types**

```typescript
// Add to src/types.ts

export interface Attachment {
  name: string
  path: string
  contentType: string
}

export interface Location {
  file: string
  line: number
}

export interface PlaywrightTestResult {
  id: string
  title: string
  location: Location
  status: 'passed' | 'failed' | 'skipped'
  attachments: Attachment[]
  error?: string
  duration?: number
}

export interface WebSocketMessage {
  type: 'test-begin' | 'test-end' | 'run-end' | 'approve' | 'sync'
  data: unknown
}

export interface TestBeginMessage {
  type: 'test-begin'
  data: { id: string; title: string; location: Location }
}

export interface TestEndMessage {
  type: 'test-end'
  data: PlaywrightTestResult
}

export interface RunEndMessage {
  type: 'run-end'
  data: { status: 'passed' | 'failed' | 'skipped'; count: number }
}
```

**Step 2: Extend TestData interface**

```typescript
// In TestData interface, add optional fields:
export interface TestData {
  id: string
  storyPath: string[]
  browser: string
  testName?: string
  storyId: string
  skip?: boolean | string
  retries?: number
  status?: TestStatus
  results?: TestResult[]
  approved?: Partial<Record<string, number>> | null
  // Playwright integration
  attachments?: Attachment[]
  title?: string
  location?: Location
}
```

**Step 3: Add screenshotDir to ReportData in server.ts**

Update `ReportData` interface in `src/server.ts`:

```typescript
interface ReportData {
  isRunning: boolean
  tests: Record<string, TestData>
  browsers: string[]
  isUpdateMode: boolean
  screenshotDir: string // New: directory for Playwright screenshots
}
```

---

## Task 2: Implement WebSocket Message Handler in Server

**Files:**

- Modify: `src/server.ts`

**Step 1: Add WebSocket clients tracking**

```typescript
// Add at top of server.ts
const wsClients = new Set<WebSocket>()
```

**Step 2: Update WebSocket handlers**

```typescript
Bun.serve({
  // ... existing routes ...
  websocket: {
    open(ws) {
      wsClients.add(ws)
      console.log('WebSocket connected. Clients:', wsClients.size)
    },
    message(ws, message) {
      try {
        const msg = JSON.parse(message) as WebSocketMessage
        handleWebSocketMessage(msg)
      } catch (e) {
        console.error('Invalid WebSocket message:', e)
      }
    },
    close(ws) {
      wsClients.remove(ws)
      console.log('WebSocket disconnected. Clients:', wsClients.size)
    },
  },
})

function handleWebSocketMessage(msg: WebSocketMessage): void {
  switch (msg.type) {
    case 'test-begin': {
      const { id, title, location } = msg.data as TestBeginMessage['data']
      if (!reportData.tests[id]) {
        reportData.tests[id] = {
          id,
          storyId: id,
          storyPath: [],
          browser: '',
          title,
          location,
          status: 'running',
        }
      }
      break
    }
    case 'test-end': {
      const data = msg.data as TestEndMessage['data']
      if (reportData.tests[data.id]) {
        reportData.tests[data.id].attachments = data.attachments
        reportData.tests[data.id].status = mapStatus(data.status)
        reportData.tests[data.id].results = [
          {
            status: data.status === 'passed' ? 'success' : 'failed',
            retries: 0,
            error: data.error,
            duration: data.duration,
          },
        ]
      }
      broadcastToBrowsers({ type: 'test-update', data })
      break
    }
    case 'run-end': {
      reportData.isRunning = false
      broadcastToBrowsers({ type: 'run-end', data: msg.data })
      break
    }
  }
}

function broadcastToBrowsers(msg: object): void {
  const payload = JSON.stringify(msg)
  wsClients.forEach((ws) => {
    ws.send(payload)
  })
}

function mapStatus(status: 'passed' | 'failed' | 'skipped'): TestStatus {
  switch (status) {
    case 'passed':
      return 'success'
    case 'failed':
      return 'failed'
    case 'skipped':
      return 'pending'
    default:
      return 'unknown'
  }
}
```

**Step 3: Add screenshot serving route**

```typescript
// Add to routes object in server.ts
"/screenshots/:path*": async (req) => {
  const path = req.params["path*"];
  const screenshotPath = `${reportData.screenshotDir}/${path}`;
  const file = Bun.file(screenshotPath);
  if (await file.exists()) {
    return new Response(file);
  }
  return Response.json({ error: "Screenshot not found" }, { status: 404 });
}
```

---

## Task 3: Update Client for Real-Time Updates

**Files:**

- Modify: `src/index.ts`

**Step 1: Add WebSocket connection for browser updates**

```typescript
// Add before mount() call
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
const wsUrl = `${wsProtocol}//${location.host}`

const ws = new WebSocket(wsUrl)
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'test-update' || msg.type === 'run-end') {
    window.location.reload()
  }
}
```

---

## Task 4: Create Playwright Reporter Package

**Files:**

- Create: `packages/playwright-reporter/index.ts`
- Create: `packages/playwright-reporter/package.json`

**Step 1: Create reporter package directory**

```bash
mkdir -p packages/playwright-reporter
```

**Step 2: Create package.json**

```json
{
  "name": "@creevey/playwright-reporter",
  "version": "0.0.1",
  "type": "module",
  "main": "index.ts",
  "types": "index.ts"
}
```

**Step 3: Write the reporter implementation**

```typescript
// packages/playwright-reporter/index.ts
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter'

export interface CreeveyReporterOptions {
  serverUrl: string
  screenshotDir?: string
  saveScreenshots?: boolean
}

interface AttachmentData {
  name: string
  path: string
  contentType: string
}

export class CreeveyReporter implements Reporter {
  private ws: WebSocket | null = null
  private serverUrl: string
  private screenshotDir: string
  private saveScreenshots: boolean
  private pendingAttachments: Map<string, AttachmentData[]> = new Map()

  constructor(options: CreeveyReporterOptions = {}) {
    this.serverUrl = options.serverUrl ?? 'ws://localhost:3000'
    this.screenshotDir = options.screenshotDir ?? './screenshots'
    this.saveScreenshots = options.saveScreenshots ?? true
  }

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    console.log(`[CreeveyReporter] Starting run with ${suite.allTests().length} tests`)
    this.connect()
  }

  private connect(): void {
    this.ws = new WebSocket(this.serverUrl)
    this.ws.onopen = () => {
      console.log('[CreeveyReporter] Connected to Creevey server')
    }
    this.ws.onerror = (error) => {
      console.error('[CreeveyReporter] WebSocket error:', error)
    }
    this.ws.onclose = () => {
      console.log('[CreeveyReporter] Disconnected from Creevey server')
    }
  }

  onTestBegin(test: TestCase): void {
    this.send({
      type: 'test-begin',
      data: {
        id: test.id,
        title: test.title,
        location: {
          file: test.location.file,
          line: test.location.line,
        },
      },
    })
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const attachments = result.attachments
      .filter((a) => a.contentType === 'image/png' && a.path)
      .map((a) => ({
        name: a.name,
        path: a.path!,
        contentType: a.contentType,
      }))

    this.send({
      type: 'test-end',
      data: {
        id: test.id,
        title: test.title,
        status: result.status,
        attachments,
        error: result.errors.length > 0 ? result.errors[0].message : undefined,
        duration: result.duration,
      },
    })
  }

  onEnd(result: FullResult): void {
    this.send({
      type: 'run-end',
      data: {
        status: result.status,
        count: result.tests.length,
      },
    })
    if (this.ws) {
      this.ws.close()
    }
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }
}

export default CreeveyReporter
```

---

## Task 5: Add Example Playwright Config

**Files:**

- Create: `examples/playwright/playwright.config.ts`
- Create: `examples/playwright/example.spec.ts`
- Create: `examples/playwright/package.json`

**Step 1: Create example package.json**

```json
{
  "name": "playwright-example",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui"
  },
  "dependencies": {
    "@creevey/playwright-reporter": "workspace:*",
    "@playwright/test": "^1.58.2"
  }
}
```

**Step 2: Create example playwright config**

```typescript
import { defineConfig, devices } from '@playwright/test'
import { CreeveyReporter } from '@creevey/playwright-reporter'

export default defineConfig({
  testDir: '.',
  reporter: [['./packages/playwright-reporter/index.ts', { serverUrl: 'ws://localhost:3000' }], ['html']],
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

**Step 3: Create example test**

```typescript
import { test, expect } from '@playwright/test'

test('homepage looks correct', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page).toHaveScreenshot('homepage.png')
})
```

---

## Task 6: Update package.json Scripts

**Files:**

- Modify: `package.json`

**Step 1: Add workspace script for running example**

```json
{
  "scripts": {
    "dev": "bun run --watch src/server.ts",
    "start": "bun src/server.ts",
    "lint": "oxlint",
    "fmt": "oxfmt --write",
    "typecheck": "tsc --noEmit",
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "example": "cd examples/playwright && bun run test"
  }
}
```

---

## Task 7: Run Tests to Verify

**Step 1: Start Creevey server**

```bash
bun src/server.ts
```

**Step 2: Run example tests (in separate terminal)**

```bash
cd examples/playwright && bun run test
```

**Step 3: Verify**

- WebSocket connection logged in server terminal
- Test results appear in web UI at http://localhost:3000
- Screenshots are saved and viewable

---

## Verification Commands

```bash
bun run typecheck    # Verify TypeScript compiles
bun run lint         # Verify linting passes
cd examples/playwright && bun playwright test  # Run example tests
```

---

## Dependencies

- `@playwright/test` (already in devDependencies)
- No new runtime dependencies needed

---

## Follow-up

After implementation, consider:

1. Adding retry logic for WebSocket reconnection
2. Implementing batch updates for large test suites
3. Adding authentication for WebSocket connections in production
