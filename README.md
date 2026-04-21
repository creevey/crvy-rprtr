# @crvy/rprtr

Playwright and Vitest screenshot reporters with a visual regression UI for comparing and approving screenshot test diffs.

> **Pronunciation:** `crvy` sounds like "creevey," not "curvy."

## Installation

```bash
npm install --save-dev @crvy/rprtr
```

> **Requires:** Playwright ≥1.40 and/or Vitest 4.x, plus **Node 22+ or Bun** for the live UI server/CLI.

## Setup

Add the reporter to your `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['@crvy/rprtr', { screenshotDir: './screenshots' }]],
})
```

For Vitest Browser Mode, install Vitest's Playwright browser provider and add the reporter via the `./vitest` subpath:

```bash
npm install --save-dev @crvy/rprtr vitest @vitest/browser-playwright
```

```ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { CrvyRprtrVitestReporter } from '@crvy/rprtr/vitest'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    reporters: [
      new CrvyRprtrVitestReporter({
        screenshotDir: './screenshots',
      }),
    ],
  },
})
```

## Viewing Results

Start the UI server to view and approve screenshot diffs:

```bash
npx crvy-rprtr
```

Other package-manager launchers work too: `pnpm dlx crvy-rprtr`, `yarn dlx crvy-rprtr`, and `bunx crvy-rprtr`.

Open http://localhost:3000 in your browser.

Every test run also writes a browser-openable static artifact:

- `./crvy-rprtr.html`

Open `crvy-rprtr.html` directly from CI artifacts or your filesystem to review results without starting a server. The static artifact is self-contained except for screenshot image files, and it is read-only; use the server-backed UI to approve screenshots.

To open downloaded CI artifacts with the full approval UI, point the CLI at the artifact directory:

```bash
npx crvy-rprtr ./artifacts
```

## Reporter Options

### Common options

| Option              | Type     | Default                        | Description                                        |
| ------------------- | -------- | ------------------------------ | -------------------------------------------------- |
| `serverUrl`         | `string` | `"ws://localhost:3000"`        | WebSocket URL of the Crvy Rprtr server             |
| `screenshotDir`     | `string` | `"./screenshots"`              | Directory for saving screenshot artifacts          |
| `offlineReportPath` | `string` | `"./crvy-rprtr-{worker}.json"` | Path for offline report when server is unavailable |
| `reportHtmlPath`    | `string` | `"./crvy-rprtr.html"`          | Path for the browser-openable static report HTML   |

### Vitest-only options

| Option           | Type     | Default                 | Description                                                                   |
| ---------------- | -------- | ----------------------- | ----------------------------------------------------------------------------- |
| `referenceDir`   | `string` | `"__screenshots__"`     | Directory name for Vitest reference screenshots when default paths are used   |
| `attachmentsDir` | `string` | `".vitest-attachments"` | Directory name for Vitest actual/diff screenshots when default paths are used |

## Server CLI Options

```bash
npx crvy-rprtr [artifact-dir] [options]
```

If `artifact-dir` is provided, the CLI treats it as the directory containing:

- `report.json`
- `screenshots/`
- `crvy-rprtr-*.json`

Explicit flags override the paths derived from `artifact-dir`.

| Option             | Short | Default         | Description                                                                               |
| ------------------ | ----- | --------------- | ----------------------------------------------------------------------------------------- |
| `--port`           | `-p`  | `3000`          | Server port                                                                               |
| `--screenshot-dir` | `-s`  | `./screenshots` | Screenshot directory path                                                                 |
| `--report-path`    | `-r`  | `./report.json` | Report JSON file path or directory containing `report.json` and `crvy-rprtr-*.json` files |

## How It Works

1. **During test runs:** The Playwright or Vitest reporter sends normalized test results to the server via WebSocket in real-time and records the same run for artifact export.
2. **After tests complete:** A static `crvy-rprtr.html` artifact is written for direct browser viewing, and offline report JSON is also written if the server was unavailable.
3. **In the browser:** The UI shows all screenshot tests with side-by-side, swap, slide, and blend diff views.
4. **Approving changes:** Start the UI server and click "Approve" to accept a new screenshot as the baseline. The server copies the provider-specific approved image to the expected snapshot location.

## Vitest Support

- Supported in v1: `Vitest Browser Mode` + `expect(...).toMatchScreenshot()`
- Supported path layouts: Vitest defaults plus explicit `referenceDir` / `attachmentsDir`
- Not supported in v1: custom `resolveScreenshotPath` / `resolveDiffPath` callback resolvers
- First-run Vitest baselines can still be approved from the UI

## Offline Mode

When the server isn't running during tests, the reporter automatically falls back to offline mode:

- Test events are queued in memory
- On test completion, events are written to `crvy-rprtr-{index}.json`
- On test completion, a self-contained `crvy-rprtr.html` is written for direct browser review
- When the server starts, it loads and merges all `crvy-rprtr-*.json` files from the offline report directory

## Programmatic API

```ts
import { startServer } from '@crvy/rprtr/server'

await startServer({
  port: 3000,
  screenshotDir: './screenshots',
  reportPath: './artifacts',
})

await startServer({
  port: 3000,
  screenshotDir: './screenshots',
  reportPath: './artifacts/report.json',
})
```

The programmatic server API works in both Node 22+ and Bun.

## Development

```bash
bun install
bun run dev
bun run build
bun run test
bun run lint
```

## License

MIT
