# @creevey/playwright-reporter — Package Publishing Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare `@creevey/playwright-reporter` for public npm distribution with proper exports, types, CLI, and documentation.

**Architecture:** The package has three consumer-facing surfaces: (1) a Playwright reporter class users configure in `playwright.config.ts`, (2) a UI server binary users run to view screenshot diff results, (3) TypeScript types. The build pipeline must produce: compiled JS for the reporter + server, bundled client-side JS/CSS for the UI, and `.d.ts` declaration files for type consumers.

**Tech Stack:** Bun (build + runtime), esbuild + esbuild-svelte (client bundle), TypeScript (type declarations via tsc), Playwright (peer dependency).

---

## Current State Analysis

### What exists

- `src/reporter.ts` — Playwright reporter class (`CreeveyReporter`, default export)
- `src/server.ts` — Bun.serve() UI server (run as standalone script)
- `src/index.ts` — Client-side Svelte app entry (loaded by browser)
- `src/types.ts` — All shared TypeScript interfaces/types
- `src/client/` — Svelte components, CSS, helpers
- `build.ts` — esbuild client build (outputs `dist/index.js` + `dist/index.css`)
- `index.html` — HTML shell for the UI

### What's missing for publishing

1. `"private": true` blocks publishing
2. No `"exports"` field — consumers can't import properly
3. No `"files"` field — entire repo would be published
4. No `"main"` / `"types"` fields
5. No `"license"`, `"description"`, `"keywords"`, `"repository"`, `"homepage"`, `"bugs"` metadata
6. No `"bin"` entry — server isn't launchable via CLI
7. `@playwright/test` is in `devDependencies` but should be `peerDependencies` (it's the host framework)
8. Build doesn't compile reporter/server to JS or emit `.d.ts` files
9. No `.npmignore` or `"files"` to control published content
10. README lacks setup/usage instructions for consumers
11. No LICENSE file
12. Server uses hardcoded relative paths (`./report.json`, `./screenshots`, `./index.html`, `./dist/`)

---

## Task Breakdown

### Task 1: Create LICENSE file

**Files:**

- Create: `LICENSE`

**Step 1: Create MIT LICENSE file**

```
MIT License

Copyright (c) 2026 Creevey Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT LICENSE"
```

---

### Task 2: Create a CLI entry point for the server

The server currently runs as `bun src/server.ts`. Consumers need a proper CLI binary they can run after installing the package. Create a thin `src/cli.ts` that resolves paths relative to `process.cwd()` and starts the server.

**Files:**

- Create: `src/cli.ts`
- Modify: `src/server.ts` — extract the `Bun.serve()` call into a `startServer(options)` function so it can be called programmatically from the CLI and from tests.

**Step 1: Refactor server.ts to export a `startServer` function**

Extract the current top-level `Bun.serve(...)` and the `loadReport()` / `loadOfflineReports()` calls into a function:

```ts
export interface ServerOptions {
  port?: number;
  screenshotDir?: string;
  reportPath?: string;
  /** Absolute path to the directory containing index.html and dist/ */
  staticDir?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const port = options.port ?? 3000;
  const screenshotDir = options.screenshotDir ?? "./screenshots";
  // ... move current top-level initialization logic here
  // ... move Bun.serve() here
  console.log(`Creevey Reporter started at http://localhost:${port}`);
}
```

Keep the current auto-start behavior when the file is run directly:

```ts
// Auto-start when run directly (not imported)
if (import.meta.main) {
  await startServer();
}
```

**Step 2: Create src/cli.ts**

```ts
#!/usr/bin/env bun
import { parseArgs } from "util";
import { startServer } from "./server.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: "3000" },
    "screenshot-dir": { type: "string", short: "s", default: "./screenshots" },
    "report-path": { type: "string", short: "r", default: "./report.json" },
  },
});

await startServer({
  port: parseInt(values.port ?? "3000", 10),
  screenshotDir: values["screenshot-dir"] ?? "./screenshots",
  reportPath: values["report-path"] ?? "./report.json",
});
```

**Step 3: Verify the server still starts**

Run: `bun src/cli.ts --port 3000`
Expected: Server starts, accessible at http://localhost:3000

**Step 4: Verify existing dev workflow still works**

Run: `bun src/server.ts`
Expected: Server starts (because `import.meta.main` is true)

**Step 5: Commit**

```bash
git add src/cli.ts src/server.ts
git commit -m "feat: extract startServer function and add CLI entry point"
```

---

### Task 3: Update build pipeline to produce publishable artifacts

The current `build.ts` only builds the client-side bundle. We need it to also:

1. Compile `reporter.ts` → `dist/reporter.js` + `dist/reporter.d.ts`
2. Compile `server.ts` → `dist/server.js` + `dist/server.d.ts`
3. Compile `cli.ts` → `dist/cli.js`
4. Compile `types.ts` → `dist/types.d.ts`
5. Copy `index.html` → `dist/index.html`

**Files:**

- Modify: `build.ts`
- Modify: `tsconfig.json` (add a `tsconfig.build.json` for declaration emit)
- Create: `tsconfig.build.json`

**Step 1: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "emitDeclarationOnly": true
  },
  "include": ["src/reporter.ts", "src/server.ts", "src/types.ts", "src/cli.ts"],
  "exclude": ["src/client/**", "src/index.ts", "node_modules"]
}
```

**Step 2: Update build.ts to compile server-side code**

Add esbuild entries for the server-side files (reporter, server, cli, types) alongside the existing client build:

```ts
// Build server-side JS (reporter, server, CLI)
await build({
  entryPoints: ["./src/reporter.ts", "./src/server.ts", "./src/cli.ts"],
  bundle: false,
  outdir: "./dist",
  format: "esm",
  target: "es2022",
  platform: "node",
  packages: "external",
});

// Generate .d.ts files via tsc
// Run: tsc --project tsconfig.build.json
```

Also add a step to copy `index.html` into `dist/`.

**Step 3: Run the build**

Run: `bun build.ts`
Expected: `dist/` contains `index.js`, `index.css`, `reporter.js`, `server.js`, `cli.js`, `index.html`

**Step 4: Verify types emit**

Run: `bunx tsc --project tsconfig.build.json`
Expected: `dist/` contains `reporter.d.ts`, `server.d.ts`, `types.d.ts`

**Step 5: Commit**

```bash
git add build.ts tsconfig.build.json
git commit -m "feat: build pipeline produces reporter, server, CLI, and type declarations"
```

---

### Task 4: Fix server static asset paths for installed package

When the package is installed in `node_modules`, the server needs to resolve `index.html` and `dist/` assets relative to the package root, not `process.cwd()`.

**Files:**

- Modify: `src/server.ts`

**Step 1: Resolve static assets relative to `import.meta.dir`**

In the `startServer` function, resolve `index.html` and `dist/*` paths relative to the package's own directory (`import.meta.dir` or a `staticDir` option), while resolving `report.json`, `screenshots/`, and `creevey-offline-report-*.json` relative to `process.cwd()`.

```ts
const packageDir = options.staticDir ?? import.meta.dir;
// index.html → resolve from packageDir
// dist/* → resolve from packageDir
// report.json → resolve from cwd
// screenshots/ → resolve from cwd
```

**Step 2: Update all file references in routes**

- `"/"` route: serve `path.join(packageDir, "index.html")` instead of `"./index.html"`
- `"/dist/*"` route: serve from `path.join(packageDir, "dist/", ...)` instead of `"./dist/..."`
- `"/api/report"` and screenshot routes: keep resolving from cwd (these are user project files)

**Step 3: Verify server works in development mode**

Run: `bun src/server.ts`
Expected: UI loads correctly at http://localhost:3000

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "fix: resolve static assets relative to package dir, user files relative to cwd"
```

---

### Task 5: Update package.json for publishing

**Files:**

- Modify: `package.json`

**Step 1: Add metadata fields**

```json
{
  "description": "Playwright reporter with visual regression UI for comparing and approving screenshot tests",
  "license": "MIT",
  "keywords": ["playwright", "reporter", "visual-regression", "screenshot", "testing", "creevey"],
  "repository": {
    "type": "git",
    "url": "https://github.com/creevey/creevey-reporter.git"
  },
  "homepage": "https://github.com/creevey/creevey-reporter",
  "bugs": {
    "url": "https://github.com/creevey/creevey-reporter/issues"
  }
}
```

> **Note:** Verify the actual GitHub repository URL before publishing. The above is a placeholder.

**Step 2: Remove `"private": true`**

Delete the `"private": true` line.

**Step 3: Add `"exports"` map**

```json
{
  "exports": {
    ".": {
      "types": "./dist/reporter.d.ts",
      "import": "./dist/reporter.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    },
    "./types": {
      "types": "./dist/types.d.ts"
    }
  }
}
```

Rationale:

- `"."` → the main export is the reporter (what users put in `playwright.config.ts`)
- `"./server"` → the server API (for programmatic use)
- `"./types"` → types-only export

**Step 4: Add `"main"` and `"types"` for backward compat**

```json
{
  "main": "./dist/reporter.js",
  "types": "./dist/reporter.d.ts"
}
```

**Step 5: Add `"bin"` for the CLI**

```json
{
  "bin": {
    "creevey-reporter": "./dist/cli.js"
  }
}
```

**Step 6: Add `"files"` to control published content**

```json
{
  "files": ["dist/", "LICENSE", "README.md"]
}
```

This ensures only the built artifacts, license, and readme are published. Source code, tests, screenshots, docs, and config files are excluded.

**Step 7: Move `@playwright/test` to peerDependencies**

```json
{
  "peerDependencies": {
    "@playwright/test": ">=1.40",
    "typescript": "^5"
  }
}
```

Remove `@playwright/test` from `devDependencies`.

**Step 8: Reassess dependencies**

The reporter runs in the Playwright test runner context (Node.js), the server runs in Bun. The client-side code is pre-bundled.

- Keep `svelte`, `tailwindcss`, `@tailwindcss/postcss`, `postcss` as **devDependencies** — they're build-time only (Svelte compiles to vanilla JS, Tailwind compiles to static CSS).
- Keep `esbuild`, `esbuild-svelte` in **devDependencies** — build tools.
- The reporter uses only `fs/promises` and `path` (Node.js built-ins) + `@playwright/test/reporter` types — no runtime dependencies needed for the reporter.
- The server uses `Bun.*` APIs — Bun is the expected runtime, not a dependency.

So the package should have **zero runtime `dependencies`** — everything is either a peer dep, a dev dep, or a built-in.

```json
{
  "dependencies": {},
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "@tailwindcss/postcss": "^4.2.2",
    "@types/bun": "latest",
    "esbuild": "^0.27.4",
    "esbuild-svelte": "^0.9.4",
    "oxfmt": "^0.41.0",
    "oxlint": "^1.56.0",
    "postcss": "^8.5.8",
    "svelte": "^5.54.0",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.9.3"
  }
}
```

**Step 9: Add `"engines"` field**

```json
{
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

**Step 10: Add prepublish script**

```json
{
  "scripts": {
    "prepublishOnly": "bun run build"
  }
}
```

**Step 11: Run `npm publish --dry-run`**

Run: `npm publish --dry-run`
Expected: Shows only `dist/`, `LICENSE`, `README.md`, `package.json`

**Step 12: Commit**

```bash
git add package.json
git commit -m "feat: configure package.json for npm publishing"
```

---

### Task 6: Validate package exports with `publint` and `arethetypeswrong`

**Files:** None (validation only)

**Step 1: Run publint**

Run: `bunx publint`
Expected: No errors. May have suggestions to address.

**Step 2: Run arethetypeswrong**

Run: `bunx @arethetypeswrong/cli --pack`
Expected: No resolution errors for any entry point.

**Step 3: Fix any issues found**

Address any reported problems in `package.json` or build output.

**Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: address publint and arethetypeswrong findings"
```

---

### Task 7: Rewrite README for consumers

**Files:**

- Modify: `README.md`

**Step 1: Write consumer-facing README**

Structure:

1. **Title + one-line description** — what this package does
2. **Screenshot** (optional) — show the UI
3. **Installation** — `npm install @creevey/playwright-reporter` + peer deps note
4. **Setup** — add reporter to `playwright.config.ts`
5. **Viewing Results** — run `bunx creevey-reporter` to start the UI server
6. **Reporter Options** — document `serverUrl`, `screenshotDir`, `offlineReportPath`
7. **Server CLI Options** — document `--port`, `--screenshot-dir`, `--report-path`
8. **How It Works** — brief explanation of the data flow (reporter → WebSocket → server → UI)
9. **Offline Mode** — explain fallback when server isn't running
10. **Approving Screenshots** — explain the approve workflow
11. **Programmatic API** — show `import { startServer } from '@creevey/playwright-reporter/server'`
12. **Development** — contributing instructions
13. **License** — MIT

Example key sections:

````markdown
# @creevey/playwright-reporter

Playwright reporter with a visual regression UI for comparing and approving screenshot test diffs.

## Installation

```bash
npm install --save-dev @creevey/playwright-reporter
```
````

> **Requires:** Bun runtime for the UI server, Playwright ≥1.40

## Setup

Add the reporter to your `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [
    [
      "@creevey/playwright-reporter",
      {
        screenshotDir: "./screenshots",
      },
    ],
  ],
});
```

## Viewing Results

Start the UI server to view and approve screenshot diffs:

```bash
bunx creevey-reporter
```

Open http://localhost:3000 in your browser.

````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for package consumers"
````

---

### Task 8: Verify end-to-end package consumption

**Files:**

- Create: `examples/playwright/` (example project showing real usage)

**Step 1: Create a minimal example project**

```
examples/
  playwright/
    package.json
    playwright.config.ts
    tests/
      example.spec.ts
```

The example's `playwright.config.ts` should reference the reporter by package name (using `npm link` or a relative path for local testing):

```ts
reporter: [['@creevey/playwright-reporter', { screenshotDir: './screenshots' }]],
```

**Step 2: Test the reporter works from the example**

Run:

```bash
cd examples/playwright
bun install
bunx playwright test
```

Expected: Reporter connects (or falls back to offline mode), screenshots saved, report.json created.

**Step 3: Test the server works from the example**

Run: `bunx creevey-reporter`
Expected: Server starts, UI loads, test results visible.

**Step 4: Commit**

```bash
git add examples/
git commit -m "chore: add example project for integration testing"
```

---

### Task 9: Pre-publish checklist and final validation

**Files:** None (validation only)

**Step 1: Run full build**

Run: `bun run build`
Expected: Clean build, no errors.

**Step 2: Run type check**

Run: `bun run typecheck`
Expected: No type errors.

**Step 3: Run lint**

Run: `bun run lint`
Expected: No lint errors.

**Step 4: Run tests**

Run: `bun run test`
Expected: All tests pass.

**Step 5: Run npm pack**

Run: `npm pack --dry-run`
Expected: Package contains only: `dist/`, `LICENSE`, `README.md`, `package.json`. No source, tests, screenshots, or docs.

**Step 6: Inspect package size**

Run: `npm pack` then `tar -tzf creevey-playwright-reporter-*.tgz | head -50`
Expected: Reasonable file list, no unexpected files.

**Step 7: Tag and publish**

```bash
git tag v0.1.0
git push origin main --tags
npm publish --access public
```

---

## Risk Assessment

| Risk                                                                                             | Probability | Impact | Mitigation                                                                                      |
| ------------------------------------------------------------------------------------------------ | ----------- | ------ | ----------------------------------------------------------------------------------------------- |
| Playwright ESM/CJS import issue (#36252) — reporter imported as CJS even though published as ESM | Medium      | High   | Test with real Playwright project. Consider dual CJS/ESM output if needed.                      |
| Server requires Bun runtime — consumers on Node.js can't run the UI                              | Medium      | Medium | Document Bun requirement clearly. Consider future Node.js compat layer.                         |
| Static assets not found when installed in node_modules                                           | Medium      | High   | Use `import.meta.dir` to resolve package-relative paths. Test with `npm link`.                  |
| Missing type declarations for Svelte/client code                                                 | Low         | Low    | Client code is pre-bundled; consumers don't import it. Only reporter/server/types need `.d.ts`. |
| Large package size from bundled client assets                                                    | Low         | Medium | Monitor with `npm pack`. Client JS + CSS should be <200KB.                                      |

## Dependency Summary

| Role    | Package                                            | Status                                      |
| ------- | -------------------------------------------------- | ------------------------------------------- |
| Peer    | `@playwright/test` ≥1.40                           | Required — host framework                   |
| Peer    | `typescript` ^5                                    | Optional — for type checking                |
| Dev     | `esbuild`                                          | Build tool for client + server JS           |
| Dev     | `esbuild-svelte`                                   | Svelte plugin for esbuild                   |
| Dev     | `svelte`                                           | UI framework (compiled away at build time)  |
| Dev     | `tailwindcss` + `@tailwindcss/postcss` + `postcss` | CSS framework (compiled away at build time) |
| Runtime | _(none)_                                           | Zero runtime dependencies                   |
