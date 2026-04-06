# Playwright Reporter Integration Design

## Context

Creevey is a screenshot testing reporter that allows teams to compare, review, and approve screenshots from visual regression tests. The goal is to integrate Playwright's screenshot testing capabilities with the Creevey web UI.

## Requirements

- **Communication**: WebSocket connection from Playwright tests to Creevey web app
- **Architecture**: Separate server (Creevey web app runs independently on port 3000)
- **Image Storage**: Persistent storage in project directory
- **Protocol**: JSON events over WebSocket

## Architecture

```
┌─────────────────┐       WebSocket        ┌─────────────────┐
│  Playwright     │◄──────────────────────► │  Creevey Web    │
│  Test Runner    │   JSON Events          │  App (Bun)      │
│                 │                         │  Port 3000      │
└────────┬────────┘                         └────────┬────────┘
         │                                            │
         │ saves                                     │ serves
         ▼                                            ▼
┌─────────────────┐                         ┌─────────────────┐
│  screenshots/  │                         │  images/        │
│  (test results) │                         │  (approved)     │
└─────────────────┘                         └─────────────────┘
```

## WebSocket Protocol

### Inbound Messages (Reporter → Server)

```typescript
// Test starts
{ type: "test-begin", data: { id: string, title: string, location: { file: string, line: number } } }

// Test completes
{
  type: "test-end",
  data: {
    id: string,
    status: "passed" | "failed" | "skipped",
    attachments: Array<{ name: string, path: string, contentType: string }>,
    error?: string,
    duration?: number
  }
}

// All tests done
{ type: "run-end", data: { status: "passed" | "failed" | "skipped", count: number } }
```

### Outbound Messages (Server → Reporter)

```typescript
// Screenshot approved in web UI
{ type: "approve", data: { testId: string, imageName: string, retry: number, approved: boolean } }

// Request full report
{ type: "sync", data: { requestId: string } }
```

## Data Model

### CreeveyTest (updated)

```typescript
interface CreeveyTest extends TestData {
  checked: boolean
  // New fields for Playwright
  attachments?: Attachment[]
  title?: string // Playwright test title
  location?: Location // File location of test
}

interface Attachment {
  name: string
  path: string // Absolute path to saved screenshot
  contentType: string
}
```

### ReportData (updated)

```typescript
interface ReportData {
  isRunning: boolean
  tests: Record<string, TestData>
  browsers: string[]
  isUpdateMode: boolean
  // Playwright-specific
  screenshotDir: string // Directory where screenshots are saved
}
```

## File Structure

```
project-under-test/
├── playwright.config.ts
├── screenshots/              # Screenshots from Playwright tests
│   └── {test-id}/
│       ├── actual.png
│       ├── expected.png      # If exists (approved screenshot)
│       └── diff.png          # If comparison failed
├── playwright-reporter.ts    # Custom Creevey reporter
└── ...
```

## Reporter Implementation

```typescript
// playwright-reporter.ts
import type { Reporter, FullConfig, Suite, TestCase, TestResult } from '@playwright/test/reporter'

interface CreeveyReporterOptions {
  serverUrl: string
  screenshotDir?: string
}

class CreeveyReporter implements Reporter {
  private ws: WebSocket
  private screenshotDir: string

  constructor(options: CreeveyReporterOptions) {
    this.screenshotDir = options.screenshotDir ?? './screenshots'
    this.ws = new WebSocket(options.serverUrl)
  }

  onBegin(config: FullConfig, suite: Suite) {
    console.log(`Starting run with ${suite.allTests().length} tests`)
  }

  async onTestEnd(test: TestCase, result: TestResult) {
    // Extract screenshot attachments
    const attachments = result.attachments
      .filter((a) => a.contentType === 'image/png')
      .map((a) => ({
        name: a.name,
        path: a.path ?? '', // Path set by Playwright when using toHaveScreenshot
        contentType: a.contentType,
      }))

    // Save screenshots to disk and get paths
    const savedAttachments = await this.saveScreenshots(test.id, attachments)

    // Send to Creevey server
    this.ws.send(
      JSON.stringify({
        type: 'test-end',
        data: {
          id: test.id,
          status: result.status,
          attachments: savedAttachments,
          error: result.errors[0]?.message,
          duration: result.duration,
        },
      }),
    )
  }

  onEnd(result: { status: string }) {
    this.ws.send(
      JSON.stringify({
        type: 'run-end',
        data: { status: result.status },
      }),
    )
    this.ws.close()
  }
}
```

## Web Server Changes

### New WebSocket Handler

```typescript
// In Bun.serve({ websocket: { ... } })
message(ws, message) {
  const msg = JSON.parse(message);
  switch (msg.type) {
    case 'test-begin':
      // Add test to running state
      break;
    case 'test-end':
      // Store test data, update UI
      broadcastTestUpdate(msg.data);
      break;
    case 'run-end':
      // Mark run as complete
      break;
  }
}
```

### New API Endpoints

- `GET /api/report` - Returns current report state (updated to include new fields)
- `POST /api/approve` - Approve a screenshot (existing)
- `GET /screenshots/:path*` - Serve screenshots from Playwright output directory

## Security Considerations

- WebSocket connections should be validated (origin check in production)
- Screenshot paths should be sanitized to prevent directory traversal
- Consider authentication if Creevey server is exposed

## Testing Strategy

1. Unit test reporter logic with mocked WebSocket
2. Integration test with actual Playwright run
3. E2E test of full flow: Playwright test → WebSocket → Web UI update

## Alternatives Considered

### File-based Approach

Simpler but lacks real-time updates. Requires polling or file watching. Rejected in favor of WebSocket for live experience.

### Binary Protocol

More efficient for large screenshots but harder to debug. JSON was chosen for simplicity and debuggability.
