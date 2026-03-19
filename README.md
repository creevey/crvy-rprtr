# Creevey Reporter

Web UI for comparing and approving Playwright screenshot tests.

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

## Usage

1. Place `report.json` in the project root with test data
2. Place screenshot images in `./images/`
3. Run `bun run start` to start the server
4. Open http://localhost:3000

## Report Format

```json
{
  "isRunning": false,
  "isUpdateMode": false,
  "tests": {
    "test-id": {
      "id": "test-id",
      "storyPath": ["Component", "Stories"],
      "browser": "chromium",
      "testName": "Visual regression",
      "storyId": "component--stories",
      "status": "failed",
      "results": [
        {
          "status": "failed",
          "retries": 1,
          "images": {
            "chromium": {
              "actual": "/api/images/actual.png",
              "expect": "/api/images/expect.png",
              "diff": "/api/images/diff.png"
            }
          }
        }
      ]
    }
  }
}
```
