# @creevey/playwright-reporter

Playwright and Vitest screenshot reporters with a visual regression UI for comparing and approving screenshot test diffs.

## Installation

```bash
npm install --save-dev @creevey/playwright-reporter
```

> **Requires:** [Bun](https://bun.sh) runtime for the UI server, Playwright ≥1.40 and/or Vitest 4.x

## Setup

Add the reporter to your `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['@creevey/playwright-reporter', { screenshotDir: './screenshots' }]],
})
```

For Vitest Browser Mode, install Vitest's Playwright browser provider and add the reporter via the `./vitest` subpath:

```bash
npm install --save-dev vitest @vitest/browser-playwright
```

```ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { CreeveyVitestReporter } from '@creevey/playwright-reporter/vitest'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    reporters: [
      new CreeveyVitestReporter({
        screenshotDir: './screenshots',
      }),
    ],
  },
})
```

## Viewing Results

Start the UI server to view and approve screenshot diffs:

```bash
bunx creevey-reporter
```

Open http://localhost:3000 in your browser.

## Reporter Options

### Common options

| Option              | Type     | Default                                    | Description                                        |
| ------------------- | -------- | ------------------------------------------ | -------------------------------------------------- |
| `serverUrl`         | `string` | `"ws://localhost:3000"`                    | WebSocket URL of the Creevey server                |
| `screenshotDir`     | `string` | `"./screenshots"`                          | Directory for saving screenshot artifacts          |
| `offlineReportPath` | `string` | `"./creevey-offline-report-{worker}.json"` | Path for offline report when server is unavailable |

### Vitest-only options

| Option           | Type     | Default                 | Description                                                                   |
| ---------------- | -------- | ----------------------- | ----------------------------------------------------------------------------- |
| `referenceDir`   | `string` | `"__screenshots__"`     | Directory name for Vitest reference screenshots when default paths are used   |
| `attachmentsDir` | `string` | `".vitest-attachments"` | Directory name for Vitest actual/diff screenshots when default paths are used |

## Server CLI Options

```bash
bunx creevey-reporter [options]
```

| Option             | Short | Default         | Description               |
| ------------------ | ----- | --------------- | ------------------------- |
| `--port`           | `-p`  | `3000`          | Server port               |
| `--screenshot-dir` | `-s`  | `./screenshots` | Screenshot directory path |
| `--report-path`    | `-r`  | `./report.json` | Report JSON file path     |

## How It Works

1. **During test runs:** The Playwright or Vitest reporter sends normalized test results to the server via WebSocket in real-time. If the server isn't running, results are saved to an offline report file.
2. **After tests complete:** Start the UI server to load `report.json` and any offline reports.
3. **In the browser:** The UI shows all screenshot tests with side-by-side, swap, slide, and blend diff views.
4. **Approving changes:** Click "Approve" to accept a new screenshot as the baseline. The server copies the provider-specific approved image to the expected snapshot location.

## Vitest Support

- Supported in v1: `Vitest Browser Mode` + `expect(...).toMatchScreenshot()`
- Supported path layouts: Vitest defaults plus explicit `referenceDir` / `attachmentsDir`
- Not supported in v1: custom `resolveScreenshotPath` / `resolveDiffPath` callback resolvers
- First-run Vitest baselines can still be approved from the Creevey UI

## Offline Mode

When the server isn't running during tests, the reporter automatically falls back to offline mode:

- Test events are queued in memory
- On test completion, events are written to `creevey-offline-report-{workerIndex}.json`
- When the server starts, it loads and merges any offline reports

## Programmatic API

```ts
import { startServer } from '@creevey/playwright-reporter/server'

await startServer({
  port: 3000,
  screenshotDir: './screenshots',
  reportPath: './report.json',
})
```

## Development

```bash
bun install
bun run dev      # Start dev server with HMR
bun run build    # Build for production
bun run test     # Run tests
bun run lint     # Lint with oxlint
```

## License

MIT
