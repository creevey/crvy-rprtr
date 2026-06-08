# CI-Gated Copying — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the reporter from copying screenshots on local runs. In CI (`process.env.CI`) produce a self-contained artifact (copies + static HTML + offline JSON) at `onEnd`; locally, emit Playwright-native paths and let the running server serve them via the routes added in Plan 2.

**Architecture:** A single `isCI()` boolean replaces offline-mode detection as the copy/artifact trigger. The reporter no longer copies in `onTestEnd`; instead it emits native attachment paths and, in CI only, buffers per-test inputs and performs copying + event path-rewrite + artifact writing in the awaited `onEnd`. The server resolves passing baselines on demand (declared-only → `/baseline/...` enrichment) and serves failure artifacts from absolute paths via `/file/...` (absolute paths produced by `attachmentsToImages`).

**Tech Stack:** TypeScript, Bun (`bun test`), Playwright reporter API.

**Context:** Plan 3 of 3 (Naming fix → Live-mode serving → **CI-gated copying**). **Requires Plan 2** (the `/file` and `/baseline` routes + `artifactRoots`) to be merged first — this plan makes the reporter emit native paths those routes serve. After this plan, `screenshotDir` is written only in CI.

---

## File Structure

- `src/ci.ts` — **create.** `isCI(env)` helper.
- `src/report-utils.ts` — **modify.** `attachmentsToImages` routes absolute attachment paths to `/file/<encoded>` URLs; relative paths keep `${baseUrl}${path}` (offline/static unchanged).
- `src/server/routes.ts` — **modify.** Refactor `resolveApprovalTarget(ctx, …)` into an exported pure `resolveBaselineSnapshotPath(routing, test, retry, imageName)`; keep a thin `resolveApprovalTarget` wrapper for existing callers.
- `src/server/handlers.ts` — **modify.** Add `approvalRouting` to `HandlerContext`; enrich declared-only images with `/baseline/...` URLs in `handleTestEnd` when the baseline resolves.
- `src/server/app.ts` — **modify.** Pass `approvalRouting` into the handler context.
- `src/reporter.ts` — **modify.** Add `ci` option/field; gate `connect()`; stop copying in `onTestEnd` (emit native paths, buffer in CI); copy + rewrite + write artifacts in `onEnd` only when CI; drop `hadOfflineMode`.
- `src/reporter-artifact-ops.ts` — **modify.** Add `rewriteTestEndAttachments(runEvents, testId, attachments)` helper.
- Tests: `tests/ci.test.ts` (create), `tests/report-utils.test.ts`, `tests/server-routes.test.ts`, `tests/offline.test.ts`.

---

### Task 1: `isCI()` helper

**Files:**

- Create: `src/ci.ts`
- Test: `tests/ci.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'bun:test'

import { isCI } from '../src/ci'

test('isCI is false when CI is unset', () => {
  expect(isCI({})).toBe(false)
})

test('isCI is false for falsy CI values', () => {
  expect(isCI({ CI: '' })).toBe(false)
  expect(isCI({ CI: 'false' })).toBe(false)
  expect(isCI({ CI: '0' })).toBe(false)
})

test('isCI is true for truthy CI values', () => {
  expect(isCI({ CI: 'true' })).toBe(true)
  expect(isCI({ CI: '1' })).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/ci.test.ts`
Expected: FAIL — module `../src/ci` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/ci.ts`:

```ts
export function isCI(env: Record<string, string | undefined> = process.env): boolean {
  const ci = env.CI
  return ci !== undefined && ci !== '' && ci !== 'false' && ci !== '0'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/ci.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ci.ts tests/ci.test.ts
git commit -m "feat: add isCI helper"
```

---

### Task 2: Route absolute attachment paths to `/file`

**Files:**

- Modify: `src/report-utils.ts` (`attachmentsToImages`, the `const url = ...` line ~70)
- Test: `tests/report-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/report-utils.test.ts` (it already imports from `'../src/report-utils'`):

```ts
import { isAbsolute, join } from 'path'

test('attachmentsToImages routes absolute paths to /file URLs', () => {
  const abs = join(process.cwd(), 'test-results', 't1', 'shot-actual.png')
  const images = attachmentsToImages([{ name: 'shot-actual.png', path: abs, contentType: 'image/png' }])
  expect(images['shot']?.actual).toBe(`/file/${encodeURIComponent(abs)}`)
})

test('attachmentsToImages keeps relative paths under the base url', () => {
  const images = attachmentsToImages([
    { name: 'shot-actual.png', path: 't1/shot-actual.png', contentType: 'image/png' },
  ])
  expect(images['shot']?.actual).toBe('/screenshots/t1/shot-actual.png')
})
```

(If `attachmentsToImages` is not already imported in that test file, add it to the import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/report-utils.test.ts -t "/file URLs"`
Expected: FAIL — absolute path currently becomes `/screenshots//abs/...`.

- [ ] **Step 3: Write minimal implementation**

In `src/report-utils.ts`, add `import { isAbsolute } from 'path'` at the top, and replace:

```ts
const url = `${baseUrl}${attachment.path}`
```

with:

```ts
const url = isAbsolute(attachment.path)
  ? `/file/${encodeURIComponent(attachment.path)}`
  : `${baseUrl}${attachment.path}`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/report-utils.test.ts -t "attachmentsToImages"`
Expected: PASS (both new tests plus existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/report-utils.ts tests/report-utils.test.ts
git commit -m "feat(report-utils): route absolute attachment paths to /file"
```

---

### Task 3: Extract `resolveBaselineSnapshotPath`

**Files:**

- Modify: `src/server/routes.ts` (`resolveApprovalTarget` lines ~77-102)
- Test: `tests/server-routes.test.ts` (existing approval + `/baseline` tests must still pass)

- [ ] **Step 1: Refactor into a pure resolver**

In `src/server/routes.ts`, define the routing type and the pure function, and make `resolveApprovalTarget` delegate. Replace the current `resolveApprovalTarget` with:

```ts
export type ApprovalRouting = NonNullable<RoutesContext['approvalRouting']>

export function resolveBaselineSnapshotPath(
  routing: ApprovalRouting | undefined,
  test: TestData,
  retry: number,
  imageName: string,
): string | null {
  const testFile = test.location?.file
  const declaration = test.results?.[retry]?.visualDeclarations?.find((candidate) => candidate.visualName === imageName)

  if (routing === undefined || testFile === undefined || declaration === undefined) {
    return null
  }

  const targets = resolveBaselineTargets({
    testFile,
    reporterTitlePath: reporterTitlePath(test),
    declarations: [declaration],
    config: {
      configDir: routing.configDir,
      testDir: routing.playwrightTestDir ?? dirname(testFile),
      snapshotDir: routing.playwrightSnapshotDir ?? dirname(testFile),
      projectName: test.browser,
      snapshotSuffix: process.platform,
      snapshotPathTemplate: routing.playwrightSnapshotPathTemplate,
      toHaveScreenshotPathTemplate: routing.playwrightToHaveScreenshotPathTemplate,
    },
    snapshotPathExists: existsSync,
  })

  return targets.length === 1 ? (targets[0]?.snapshotPath ?? null) : null
}

export function resolveApprovalTarget(
  ctx: RoutesContext,
  test: TestData,
  retry: number,
  imageName: string,
): string | null {
  return resolveBaselineSnapshotPath(ctx.approvalRouting, test, retry, imageName)
}
```

- [ ] **Step 2: Run tests to verify no regression**

Run: `bun test tests/server-routes.test.ts`
Expected: PASS — existing approval and Plan 2 `/baseline` tests are unaffected (the wrapper preserves behavior).

- [ ] **Step 3: Commit**

```bash
git add src/server/routes.ts
git commit -m "refactor(server): extract resolveBaselineSnapshotPath"
```

---

### Task 4: Enrich declared-only baselines on the server

**Files:**

- Modify: `src/server/handlers.ts` (`HandlerContext` interface; `handleTestEnd`)
- Modify: `src/server/app.ts` (`createHandlerContext`, `createServerApp`)
- Test: `tests/server-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/server-routes.test.ts` (it already imports `createServerApp`):

```ts
describe('declared-only baseline enrichment', () => {
  test('handleTestEnd sets a /baseline expect url when the baseline resolves', async () => {
    await mkdir(join(SNAPSHOT_DIR, 'chromium', 'example.spec.ts'), { recursive: true })
    await writeFile(join(SNAPSHOT_DIR, 'chromium', 'example.spec.ts', 'header.png'), 'baseline image')

    const app = await createServerApp({
      screenshotDir: SCREENSHOT_DIR,
      reportPath: join(TMP_DIR, 'report.json'),
      configDir: process.cwd(),
      playwrightTestDir: PLAYWRIGHT_TEST_DIR,
      playwrightSnapshotDir: SNAPSHOT_DIR,
      playwrightToHaveScreenshotPathTemplate: CUSTOM_TEMPLATE,
    })

    await app.handleWebSocketMessage(
      JSON.stringify({
        type: 'test-begin',
        data: {
          id: 't1',
          title: 'visual pass',
          titlePath: ['Suite'],
          browser: 'chromium',
          location: { file: TEST_FILE, line: 10 },
        },
      }),
    )
    await app.handleWebSocketMessage(
      JSON.stringify({
        type: 'test-end',
        data: {
          id: 't1',
          status: 'passed',
          attachments: [],
          visualNames: ['header'],
          visualDeclarations: [
            {
              visualName: 'header',
              kind: 'named',
              declaredName: 'header',
              snapshotBaseName: 'header',
              occurrenceIndex: 1,
            },
          ],
        },
      }),
    )

    const res = await app.handleRequest(new Request('http://localhost/api/report'))
    const body = (await res.json()) as {
      tests: Record<string, { results: { images: Record<string, { expect?: string; source?: string }> }[] }>
    }
    const image = body.tests['t1']?.results?.[0]?.images?.['header']
    expect(image?.source).toBe('baseline-only')
    expect(image?.expect).toBe(`/baseline/${encodeURIComponent('t1')}/0/${encodeURIComponent('header')}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server-routes.test.ts -t "declared-only baseline enrichment"`
Expected: FAIL — image stays `declared-only` with no `expect`.

- [ ] **Step 3: Implement enrichment**

In `src/server/handlers.ts`, extend imports and `HandlerContext`, and enrich in `handleTestEnd`:

```ts
import { applyTestBeginEvent, applyTestEndEvent, finalizeRunEvent } from '../report-state.ts'
import { resolveBaselineSnapshotPath, type ApprovalRouting } from './routes.ts'
import type { TestBeginData, TestEndData } from '../schemas.ts'
import type { ClientWebSocketMessage, TestData } from '../types.ts'
import { broadcastToBrowsers } from './utils.ts'
import type { RuntimeWebSocket } from './ws.ts'

export interface HandlerContext {
  reportData: {
    isRunning: boolean
    tests: Record<string, TestData>
    browsers: string[]
    isUpdateMode: boolean
    screenshotDir: string
  }
  wsClients: Set<RuntimeWebSocket>
  currentRunIds: Set<string>
  saveReport: () => Promise<void>
  approvalRouting?: ApprovalRouting
}

function enrichDeclaredBaselines(ctx: HandlerContext, test: TestData): void {
  const retry = (test.results?.length ?? 0) - 1
  const images = test.results?.[retry]?.images
  if (retry < 0 || images === undefined) {
    return
  }

  for (const [visualName, image] of Object.entries(images)) {
    if (image === undefined || image.source !== 'declared-only') {
      continue
    }

    const snapshotPath = resolveBaselineSnapshotPath(ctx.approvalRouting, test, retry, visualName)
    if (snapshotPath === null) {
      continue
    }

    image.expect = `/baseline/${encodeURIComponent(test.id)}/${retry}/${encodeURIComponent(visualName)}`
    image.source = 'baseline-only'
  }
}
```

Then in `handleTestEnd`, after the `const { test, diffCount } = result` line and before building the broadcast message, add:

```ts
enrichDeclaredBaselines(ctx, test)
```

In `src/server/app.ts`, thread the routing into the handler context. Update `createHandlerContext` to accept and set `approvalRouting`, and pass it from `createServerApp`:

```ts
function createHandlerContext(
  reportData: ReportData,
  wsClients: Set<RuntimeWebSocket>,
  currentRunIds: Set<string>,
  saveReport: () => Promise<void>,
  approvalRouting: HandlerContext['approvalRouting'],
): HandlerContext {
  return { reportData, wsClients, currentRunIds, saveReport, approvalRouting }
}
```

In `createServerApp`, the routes context already builds `approvalRouting` inside `createRoutesContext`; reuse the same object. Capture it before creating the handler-context factory:

```ts
const routesContext = createRoutesContext(reportData, staticDir, saveReport, options)
const getHandlerContext = (): HandlerContext =>
  createHandlerContext(reportData, wsClients, currentRunIds, saveReport, routesContext.approvalRouting)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server-routes.test.ts -t "declared-only baseline enrichment"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/handlers.ts src/server/app.ts tests/server-routes.test.ts
git commit -m "feat(server): enrich declared-only images with /baseline urls"
```

---

### Task 5: `rewriteTestEndAttachments` helper

**Files:**

- Modify: `src/reporter-artifact-ops.ts`
- Test: `tests/reporter-artifact-ops` coverage — add to an existing reporter test file or create `tests/reporter-artifact-ops.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/reporter-artifact-ops.test.ts`:

```ts
import { expect, test } from 'bun:test'

import { rewriteTestEndAttachments, type RunEvent } from '../src/reporter-artifact-ops'

test('rewriteTestEndAttachments replaces attachments on the matching test-end event', () => {
  const events: RunEvent[] = [
    { type: 'test-begin', data: { id: 't1' } },
    {
      type: 'test-end',
      data: { id: 't1', attachments: [{ name: 'old', path: '/abs/old.png', contentType: 'image/png' }] },
    },
    { type: 'test-end', data: { id: 't2', attachments: [] } },
  ]

  rewriteTestEndAttachments(events, 't1', [{ name: 'new', path: 't1/new.png', contentType: 'image/png' }])

  expect((events[1]!.data as { attachments: unknown[] }).attachments).toEqual([
    { name: 'new', path: 't1/new.png', contentType: 'image/png' },
  ])
  expect((events[2]!.data as { attachments: unknown[] }).attachments).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/reporter-artifact-ops.test.ts`
Expected: FAIL — `rewriteTestEndAttachments` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/reporter-artifact-ops.ts`, add (it already imports `AttachmentData` and defines `RunEvent`):

```ts
export function rewriteTestEndAttachments(runEvents: RunEvent[], testId: string, attachments: AttachmentData[]): void {
  for (const event of runEvents) {
    if (event.type === 'test-end' && (event.data as { id?: string }).id === testId) {
      ;(event.data as { attachments: AttachmentData[] }).attachments = attachments
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/reporter-artifact-ops.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reporter-artifact-ops.ts tests/reporter-artifact-ops.test.ts
git commit -m "feat(reporter): add rewriteTestEndAttachments helper"
```

---

### Task 6: Reporter — stop copying locally, copy in CI at onEnd

**Files:**

- Modify: `src/reporter.ts` (options ~21-29; fields ~31-46; `onBegin` ~59-64; `onTestEnd` ~128-149; `copySnapshotBaselines` ~172-191; `onEnd` ~193-211)
- Test: `tests/offline.test.ts`

- [ ] **Step 1: Read the existing offline test harness**

Open `tests/offline.test.ts` and identify how it constructs `CrvyRprtr`, drives `onBegin`/`onTestEnd`/`onEnd`, and how it currently asserts copied files / offline JSON. The suite drives the reporter without a server (offline). Under the new design, "offline" behavior is keyed off `ci`, so these tests must construct the reporter with `{ ci: true }` to keep producing the artifact. Note the test ids, fixture title paths, and attachment fixtures used.

- [ ] **Step 2: Update existing tests to set `ci: true` and assert native-vs-copied behavior**

For each test that asserts copied screenshots / offline JSON / static HTML, construct the reporter with `new CrvyRprtr({ ...existingOptions, ci: true })`. Add one new test asserting that with `{ ci: false }` (local), no files are written to `screenshotDir` and no `crvy-rprtr-*.json` / `crvy-rprtr.html` is produced, while the emitted `test-end` event carries the native (absolute) attachment paths. Use the suite's existing temp-dir + fixture helpers; assert with `fileExists`/`readdir` on the screenshot dir.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/offline.test.ts`
Expected: FAIL — reporter does not accept `ci`, still copies unconditionally, and `onEnd` writes artifacts regardless of mode.

- [ ] **Step 4: Implement the reporter changes**

In `src/reporter.ts`:

Add the import and option:

```ts
import { isCI } from './ci.ts'
import {
  type BaselineResolverInput,
  type RunEvent,
  copyResolvedBaseline,
  rewriteTestEndAttachments,
  sanitizeId,
  saveAttachments,
  writeOfflineReport,
  writeStaticArtifact,
} from './reporter-artifact-ops.ts'
```

```ts
export interface CrvyRprtrOptions {
  serverUrl?: string
  screenshotDir?: string
  offlineReportPath?: string
  reportHtmlPath?: string
  playwrightSnapshotDir?: string
  playwrightSnapshotPathTemplate?: string
  playwrightToHaveScreenshotPathTemplate?: string
  ci?: boolean
}
```

Add fields and a pending-buffer type; remove `hadOfflineMode`:

```ts
interface PendingPortableArtifact {
  testId: string
  status: TestResult['status']
  baselineInput: BaselineResolverInput | null
  nativeAttachments: AttachmentData[]
}
```

```ts
  private readonly ci: boolean
  private pendingArtifacts: PendingPortableArtifact[] = []
```

In the constructor add: `this.ci = options.ci ?? isCI()`.

In `onBegin`, gate the connect:

```ts
  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    this.configDir = config.configFile === undefined ? config.rootDir : dirname(config.configFile)
    log(`[CrvyRprtr] Starting run with ${suite.allTests().length} tests`)
    await mkdir(this.screenshotDir, { recursive: true })
    if (!this.ci) {
      this.connect()
    }
  }
```

Add a helper to collect native image attachments without copying (place near the class or as a module function):

```ts
function collectNativeImageAttachments(result: TestResult): AttachmentData[] {
  return result.attachments
    .filter(
      (attachment): attachment is typeof attachment & { path: string } =>
        attachment.contentType === 'image/png' && attachment.path !== undefined,
    )
    .map((attachment) => ({
      name: attachment.name,
      path: attachment.path,
      contentType: attachment.contentType ?? 'image/png',
    }))
}
```

Replace `onTestEnd` (note: this assumes Plan 1's `withResolvedVisualNames` wiring is present):

```ts
  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const reporterTitlePath = this.testMetadata.get(test.id)?.reporterTitlePath ?? this.reporterTitlePath(test)
    const screenshotDeclarations = withResolvedVisualNames(extractScreenshotDeclarations(result.steps), reporterTitlePath)
    const nativeAttachments = collectNativeImageAttachments(result)
    try {
      if (this.ci) {
        this.pendingArtifacts.push({
          testId: test.id,
          status: result.status,
          baselineInput: this.baselineInput(test, screenshotDeclarations),
          nativeAttachments,
        })
      }
      this.send({
        type: 'test-end',
        data: {
          id: test.id,
          title: test.title,
          status: result.status,
          attachments: nativeAttachments,
          visualNames: screenshotDeclarations.map(({ visualName }) => visualName),
          visualDeclarations: screenshotDeclarations,
          error: result.errors.length > 0 ? result.errors[0]?.message : undefined,
          duration: result.duration,
        },
      })
    } finally {
      this.testMetadata.delete(test.id)
    }
  }
```

Refactor `copySnapshotBaselines` to operate on a buffered input (so it can run at `onEnd`):

```ts
  private async copyBaselinesForInput(
    testId: string,
    status: TestResult['status'],
    baselineInput: BaselineResolverInput | null,
    savedAttachments: AttachmentData[],
  ): Promise<void> {
    if (status !== 'passed' || baselineInput === null) return
    const targets = resolveBaselineTargets(baselineInput)
    if (targets.length === 0) return
    const safeTestId = sanitizeId(testId)
    const testScreenshotDir = join(this.screenshotDir, safeTestId)
    const limit = pLimit(5)
    await Promise.all(
      targets.map((target) => limit(() => copyResolvedBaseline(safeTestId, testScreenshotDir, target, savedAttachments))),
    )
  }
```

Replace `onEnd` so copying + rewrite + artifact writing happen only in CI:

```ts
  async onEnd(result: FullResult): Promise<void> {
    this.send({ type: 'run-end', data: { status: result.status } })

    if (this.ci) {
      for (const pending of this.pendingArtifacts) {
        const savedAttachments = await saveAttachments(this.screenshotDir, pending.testId, {
          attachments: pending.nativeAttachments,
        })
        await this.copyBaselinesForInput(pending.testId, pending.status, pending.baselineInput, savedAttachments)
        rewriteTestEndAttachments(this.runEvents, pending.testId, savedAttachments)
      }
      await writeStaticArtifact(this.runEvents, this.screenshotDir, this.reportHtmlPath)
      await writeOfflineReport(this.runEvents, this.offlineReportPath, this.workerIndex)
    }

    await new Promise<void>((resolve) => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        resolve()
        return
      }
      this.ws.onclose = (): void => resolve()
      setTimeout(() => {
        this.ws?.close()
        resolve()
      }, 1000)
      this.ws.close()
    })
  }
```

Finally, remove the now-unused `hadOfflineMode` field and its assignment in `enableOfflineMode` (leave `isOfflineMode` and `enableOfflineMode` intact for the live-mode send/queue path).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/offline.test.ts`
Expected: PASS — CI-mode tests still produce copies + artifacts; the new local-mode test confirms zero writes and native paths in events.

- [ ] **Step 6: Commit**

```bash
git add src/reporter.ts tests/offline.test.ts
git commit -m "feat(reporter): gate screenshot copying and artifacts on CI"
```

---

### Task 7: CLI — expose `outputDir` to the server

**Files:**

- Modify: `src/cli.ts`
- Test: manual (CLI wiring)

- [ ] **Step 1: Inspect the CLI**

Open `src/cli.ts` and find where `startServer(options)` is invoked and how flags map to `ServerOptions`. Confirm whether the server can already receive `outputDir` from a flag or config.

- [ ] **Step 2: Add the `outputDir` flag**

Add an `--output-dir <path>` flag (defaulting to Playwright's `./test-results`) that maps to `ServerOptions.outputDir`, matching the existing flag-parsing style in the file. This populates the server's `artifactRoots` so live mode can serve failure artifacts from Playwright's output directory.

- [ ] **Step 3: Verify the server starts and serves a native artifact**

Run the CLI server pointing `--output-dir` at a directory containing a PNG, then request `/file/<encoded-abs-path>` and confirm a 200. (Document the exact command in the PR description.)

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat(cli): add --output-dir for live native artifact serving"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 2: Lint, typecheck, format**

Run: `bun run lint && bun run typecheck && bun run format:check`
Expected: all pass.

- [ ] **Step 3: End-to-end smoke (manual)**

- Local: run the server, run a screenshot suite without `CI`; confirm `screenshots/` stays empty, failing tests render via `/file`, passing tests render via `/baseline`.
- CI: run the suite with `CI=1`; confirm `screenshots/<id>/` is populated, `crvy-rprtr.html` and `crvy-rprtr-<n>.json` are written and reference relative paths.

---

## Self-Review

**Spec coverage:** Implements spec Sections "Mode Detection" (`isCI`, `ci` option, gated connect — Tasks 1, 6), "Live Mode: zero-copy serving" (`attachmentsToImages` → `/file`, declared-only → `/baseline` enrichment — Tasks 2, 4), and "CI Mode: portable artifact" (buffer + `onEnd` copy + path rewrite + artifact write — Tasks 5, 6). D1 (no local-no-server artifact) and D2 (artifacts CI-only) are realized by gating all artifact writing on `this.ci` in `onEnd`. Cleanup is intentionally absent per spec (local writes nothing; CI is ephemeral).

**Placeholder scan:** Tasks 6 (Step 1/2) and 7 instruct reading existing fixtures/CLI before editing, with precise rules for what to change — these are deliberate "read the existing harness" steps, not placeholders, because the exact fixture strings and CLI flag-parsing style live in files the implementer must match.

**Type consistency:** `isCI(env?)`, `resolveBaselineSnapshotPath(routing, test, retry, imageName)`, `ApprovalRouting`, `rewriteTestEndAttachments(runEvents, testId, attachments)`, `PendingPortableArtifact`, and `collectNativeImageAttachments(result)` are defined once and used consistently. `HandlerContext.approvalRouting?: ApprovalRouting` matches `RoutesContext['approvalRouting']`. The reporter reuses `saveAttachments`, `copyResolvedBaseline`, `resolveBaselineTargets`, and `withResolvedVisualNames` (the last from Plan 1).

**Cross-plan dependency:** Task 6 assumes Plan 1's `withResolvedVisualNames` wiring in `onTestEnd`; Tasks 2/4 assume Plan 2's `/file` and `/baseline` routes and `artifactRoots`. Land Plans 1 and 2 first.
