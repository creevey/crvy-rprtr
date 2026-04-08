# Offline Mode

When the Creevey server is unavailable (e.g., CI matrix builds), the Playwright reporter operates in offline mode to generate local report files for later review.

## How It Works

1. Reporter attempts WebSocket connection to server
2. If connection fails, reporter enters **offline mode**
3. Events are queued locally during test execution
4. On `onEnd`, reporter writes `creevey-offline-report-{workerIndex}.json`
5. On `onEnd`, reporter also writes `creevey-report.html` for direct browser viewing

## Server-Side Loading

When the Creevey server starts, it automatically scans the offline report directory for `creevey-offline-report*.json` files and merges them into the active `reportData`.

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

## Artifacts

Upload these files as CI artifacts:

- `creevey-report.html` - browser-openable static report
- `screenshots/` - all screenshots
- `creevey-offline-report-*.json` - event data for each worker

To reopen those artifacts with the full approval UI:

```bash
bunx creevey-reporter \
  --report-path ./artifacts/report.json \
  --screenshot-dir ./artifacts/screenshots \
  --offline-report-dir ./artifacts
```

## Limitations

- Offline events are only written to file when `onEnd()` is called
- If WebSocket reconnects after being offline, queued events stay in memory and are NOT sent to the server
- For matrix CI, each worker writes its own offline report file
- The static `creevey-report.html` artifact is read-only and does not apply approvals by itself

## Environment Variables

| Variable             | Description                  | Default               |
| -------------------- | ---------------------------- | --------------------- |
| `TEST_WORKER_INDEX`  | Worker index for file naming | `0`                   |
| `CREEVEY_SERVER_URL` | WebSocket server URL         | `ws://localhost:3000` |
