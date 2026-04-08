# @creevey/playwright-reporter

Playwright reporter with a visual regression UI for comparing and approving screenshot test diffs.

## Installation

```bash
npm install --save-dev @creevey/playwright-reporter
```

> **Requires:** [Bun](https://bun.sh) runtime for the UI server, Playwright ≥1.40

## Setup

Add the reporter to your `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['@creevey/playwright-reporter', { screenshotDir: './screenshots' }]],
})
```

## Viewing Results

Start the UI server to view and approve screenshot diffs:

```bash
bunx creevey-reporter
```

Open http://localhost:3000 in your browser.

Every test run also writes a browser-openable static artifact:

- `./creevey-report.html`

Open `creevey-report.html` directly from CI artifacts or your filesystem to review results without starting a server. The static artifact is self-contained except for screenshot image files, and it is read-only; use the server-backed UI to approve screenshots.

To open downloaded CI artifacts with the full approval UI, point the CLI at the artifact directory:

```bash
bunx creevey-reporter ./artifacts
```

## Reporter Options

| Option              | Type     | Default                                    | Description                                        |
| ------------------- | -------- | ------------------------------------------ | -------------------------------------------------- |
| `serverUrl`         | `string` | `"ws://localhost:3000"`                    | WebSocket URL of the Creevey server                |
| `screenshotDir`     | `string` | `"./screenshots"`                          | Directory for saving screenshot artifacts          |
| `offlineReportPath` | `string` | `"./creevey-offline-report-{worker}.json"` | Path for offline report when server is unavailable |
| `reportHtmlPath`    | `string` | `"./creevey-report.html"`                  | Path for the browser-openable static report HTML   |

## Server CLI Options

```bash
bunx creevey-reporter [artifact-dir] [options]
```

If `artifact-dir` is provided, the CLI treats it as the directory containing:

- `report.json`
- `screenshots/`
- `creevey-offline-report*.json`

Explicit flags override the paths derived from `artifact-dir`.

| Option                 | Short | Default             | Description                                                |
| ---------------------- | ----- | ------------------- | ---------------------------------------------------------- |
| `--port`               | `-p`  | `3000`              | Server port                                                |
| `--screenshot-dir`     | `-s`  | `./screenshots`     | Screenshot directory path                                  |
| `--report-path`        | `-r`  | `./report.json`     | Report JSON file path                                      |
| `--offline-report-dir` | —     | dirname(reportPath) | Directory scanned for `creevey-offline-report*.json` files |

## How It Works

1. **During test runs:** The Playwright reporter sends test results to the server via WebSocket in real-time and records the same run for artifact export.
2. **After tests complete:** A static `creevey-report.html` artifact is written for direct browser viewing, and offline report JSON is also written if the server was unavailable.
3. **In the browser:** The UI shows all screenshot tests with side-by-side, swap, slide, and blend diff views.
4. **Approving changes:** Start the UI server and click "Approve" to accept a new screenshot as the baseline. The server copies the actual image to the expected snapshot location.

## Offline Mode

When the server isn't running during tests, the reporter automatically falls back to offline mode:

- Test events are queued in memory
- On test completion, events are written to `creevey-offline-report-{workerIndex}.json`
- On test completion, a self-contained `creevey-report.html` is written for direct browser review
- When the server starts, it loads and merges all `creevey-offline-report*.json` files from the offline report directory

## Programmatic API

```ts
import { startServer } from '@creevey/playwright-reporter/server'

await startServer({
  port: 3000,
  screenshotDir: './screenshots',
  reportPath: './report.json',
  offlineReportDir: './artifacts',
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
