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
  ["./src/reporter.ts", {
    serverUrl: process.env.CREEVEY_SERVER_URL ?? "ws://localhost:3000",
  }],
]
```

## Artifacts

Upload these files as CI artifacts:
- `screenshots/` - all screenshots
- `creevey-offline-report-*.json` - event data for each worker

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_WORKER_INDEX` | Worker index for file naming | `0` |
| `CREEVEY_SERVER_URL` | WebSocket server URL | `ws://localhost:3000` |
