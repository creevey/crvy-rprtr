# Live-Mode Serving Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server the ability to serve screenshot images from Playwright-native locations — passing baselines from the canonical `…-snapshots/` dir and failure artifacts from absolute filesystem paths — guarded by a root allowlist.

**Architecture:** Add two HTTP routes to the server. `/baseline/:testId/:retry/:visualName` resolves the baseline via the existing `resolveBaselineTargets` machinery (already used for approvals) and streams it. `/file/:encodedAbsolutePath` serves an absolute path only if it resolves inside one of an allowlisted set of roots, preventing arbitrary-file reads. This plan is purely **additive** — nothing references the new routes yet, so behavior is unchanged. Plan 3 wires the reporter and report URLs to use them.

**Tech Stack:** TypeScript, Bun (`bun test`), Bun.serve HTTP routing.

**Context:** This is Plan 2 of 3 (Naming fix → **Live-mode serving** → CI-gated copying). It depends on nothing from Plan 1 and changes no existing behavior. It must land before Plan 3, which switches the reporter to emit native paths that these routes serve.

---

## File Structure

- `src/server/routes.ts` — **modify.** Add `artifactRoots?: readonly string[]` to `RoutesContext`. Export the existing `resolveApprovalTarget` (currently file-private) for reuse by the baseline route. Add `handleBaseline` and `handleFile` handlers plus their dispatch in `handleHttpRequest`. Add a path-containment helper.
- `src/server/app.ts` — **modify.** Add `outputDir?` to `ServerOptions`; populate `artifactRoots` on the routes context from `screenshotDir`, `playwrightSnapshotDir`, `playwrightTestDir`, and `outputDir`.
- `tests/server-routes.test.ts` — **modify.** Add tests for both routes (in-root served, out-of-root 404, baseline resolved, missing 404).

No new files. No schema/type changes to wire data — routes read from the already-populated `RoutesContext`.

---

### Task 1: Path-containment helper + allowlist field

**Files:**

- Modify: `src/server/routes.ts` (imports at top; `RoutesContext` interface lines ~9-26)
- Test: `tests/server-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/server-routes.test.ts` (it already imports from `'../src/server/routes'`). Add `isPathWithinRoots` to that import, then:

```ts
describe('isPathWithinRoots', () => {
  const root = join(process.cwd(), 'allowed')

  test('accepts a file inside an allowed root', () => {
    expect(isPathWithinRoots(join(root, 'sub', 'a.png'), [root])).toBe(true)
  })

  test('accepts the root itself', () => {
    expect(isPathWithinRoots(root, [root])).toBe(true)
  })

  test('rejects a path outside every root', () => {
    expect(isPathWithinRoots(join(process.cwd(), 'other', 'a.png'), [root])).toBe(false)
  })

  test('rejects traversal escaping the root', () => {
    expect(isPathWithinRoots(join(root, '..', 'secret.png'), [root])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server-routes.test.ts -t "isPathWithinRoots"`
Expected: FAIL — `isPathWithinRoots is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/server/routes.ts`, extend the path import and add the helper. Change the import:

```ts
import { dirname, isAbsolute, join, relative, resolve } from 'path'
```

Add the field to `RoutesContext`:

```ts
export interface RoutesContext {
  reportData: {
    isRunning: boolean
    tests: Record<string, TestData>
    browsers: string[]
    isUpdateMode: boolean
    screenshotDir: string
  }
  staticDir: string
  saveReport: () => Promise<void>
  artifactRoots?: readonly string[]
  approvalRouting?: {
    configDir: string
    playwrightTestDir?: string
    playwrightSnapshotDir?: string
    playwrightSnapshotPathTemplate?: string
    playwrightToHaveScreenshotPathTemplate?: string
  }
}
```

Add the exported helper near the top (after `isWebSocketUpgradeRequest`):

```ts
export function isPathWithinRoots(target: string, roots: readonly string[]): boolean {
  const resolvedTarget = resolve(target)
  return roots.some((root) => {
    const rel = relative(resolve(root), resolvedTarget)
    return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
  })
}
```

Add `sep` to the path import:

```ts
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server-routes.test.ts -t "isPathWithinRoots"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/server-routes.test.ts
git commit -m "feat(server): add isPathWithinRoots allowlist helper"
```

---

### Task 2: `/file/:encoded` allowlisted artifact route

**Files:**

- Modify: `src/server/routes.ts` (`handleHttpRequest` dispatch lines ~260-300)
- Test: `tests/server-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/server-routes.test.ts`. The existing `createContext` helper builds a `RoutesContext`; extend a local context with `artifactRoots`. Add:

```ts
describe('GET /file', () => {
  const ROOT = join(TMP_DIR, 'allowed')

  test('serves a file inside an allowed root', async () => {
    await mkdir(ROOT, { recursive: true })
    await writeFile(join(ROOT, 'a.png'), 'image-bytes')
    const ctx = { ...createContext({}), artifactRoots: [ROOT] }

    const res = await handleHttpRequest(
      ctx,
      new Request(`http://localhost/file/${encodeURIComponent(join(ROOT, 'a.png'))}`),
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('image-bytes')
  })

  test('returns 404 for a path outside every allowed root', async () => {
    await mkdir(TMP_DIR, { recursive: true })
    await writeFile(join(TMP_DIR, 'secret.png'), 'secret')
    const ctx = { ...createContext({}), artifactRoots: [ROOT] }

    const res = await handleHttpRequest(
      ctx,
      new Request(`http://localhost/file/${encodeURIComponent(join(TMP_DIR, 'secret.png'))}`),
    )

    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server-routes.test.ts -t "GET /file"`
Expected: FAIL — route returns the catch-all 404 for the first case (status 200 expected, got 404 with "Not Found" body), or the handler is absent.

- [ ] **Step 3: Write minimal implementation**

In `src/server/routes.ts`, add the handler (near `handleScreenshots`):

```ts
async function handleFile(ctx: RoutesContext, req: Request): Promise<Response> {
  const encoded = new URL(req.url).pathname.slice('/file/'.length)
  let absolutePath: string
  try {
    absolutePath = resolve(decodeURIComponent(encoded))
  } catch {
    return new Response('Not Found', { status: 404 })
  }

  if (!isPathWithinRoots(absolutePath, ctx.artifactRoots ?? [])) {
    return new Response('Not Found', { status: 404 })
  }

  const file = await respondWithFile(absolutePath)
  return file ?? new Response('Not Found', { status: 404 })
}
```

Add the dispatch in `handleHttpRequest`, before the `/screenshots/` branch:

```ts
if (pathname.startsWith('/file/')) {
  return handleFile(ctx, req)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server-routes.test.ts -t "GET /file"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/server-routes.test.ts
git commit -m "feat(server): add allowlisted /file artifact route"
```

---

### Task 3: `/baseline/:testId/:retry/:visualName` route

**Files:**

- Modify: `src/server/routes.ts` (export `resolveApprovalTarget`; add `handleBaseline` + dispatch)
- Test: `tests/server-routes.test.ts`

- [ ] **Step 1: Write the failing test**

The existing "approval routing" tests in `tests/server-routes.test.ts` already set up a baseline on disk via `createContext` + `SNAPSHOT_DIR`. Add a sibling test that serves the resolved baseline. Model the test data on the existing approval test (named declaration `header`, custom template `{snapshotDir}/{projectName}/{testFilePath}/{arg}{ext}`):

```ts
describe('GET /baseline', () => {
  test('resolves and serves the baseline for a stored declaration', async () => {
    await mkdir(join(SNAPSHOT_DIR, 'chromium', 'example.spec.ts'), { recursive: true })
    await writeFile(join(SNAPSHOT_DIR, 'chromium', 'example.spec.ts', 'header.png'), 'baseline image')

    const tests: Record<string, TestData> = {
      'test-1': {
        id: 'test-1',
        title: 'visual pass',
        titlePath: ['Suite'],
        browser: 'chromium',
        location: { file: TEST_FILE, line: 10 },
        results: [
          {
            status: 'success',
            retries: 0,
            images: { header: { source: 'declared-only' } },
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
        ],
      },
    }

    const res = await handleHttpRequest(createContext(tests), new Request('http://localhost/baseline/test-1/0/header'))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('baseline image')
  })

  test('returns 404 when the test is unknown', async () => {
    const res = await handleHttpRequest(createContext({}), new Request('http://localhost/baseline/missing/0/header'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server-routes.test.ts -t "GET /baseline"`
Expected: FAIL — catch-all 404 for the success case (expected 200).

- [ ] **Step 3: Write minimal implementation**

In `src/server/routes.ts`, export the existing helper (change `function resolveApprovalTarget` to `export function resolveApprovalTarget`). Add the handler:

```ts
async function handleBaseline(ctx: RoutesContext, req: Request): Promise<Response> {
  const segments = new URL(req.url).pathname.slice('/baseline/'.length).split('/')
  const [testId, retryRaw, ...visualNameParts] = segments
  if (testId === undefined || retryRaw === undefined || visualNameParts.length === 0) {
    return new Response('Not Found', { status: 404 })
  }

  const retry = Number(retryRaw)
  const visualName = decodeURIComponent(visualNameParts.join('/'))
  const test = ctx.reportData.tests[testId]
  if (test === undefined || !Number.isInteger(retry)) {
    return new Response('Not Found', { status: 404 })
  }

  const snapshotPath = resolveApprovalTarget(ctx, test, retry, visualName)
  if (snapshotPath === null) {
    return new Response('Not Found', { status: 404 })
  }

  const file = await respondWithFile(snapshotPath)
  return file ?? new Response('Not Found', { status: 404 })
}
```

Add the dispatch in `handleHttpRequest`, before `/screenshots/`:

```ts
if (pathname.startsWith('/baseline/')) {
  return handleBaseline(ctx, req)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server-routes.test.ts -t "GET /baseline"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/server-routes.test.ts
git commit -m "feat(server): add /baseline resolve-on-demand route"
```

---

### Task 4: Populate `artifactRoots` and add `outputDir` option

**Files:**

- Modify: `src/server/app.ts` (`ServerOptions` lines ~31-40; `createRoutesContext` lines ~262-282)
- Test: `tests/server-routes.test.ts` (a small integration check via `createServerApp`, which is already imported)

- [ ] **Step 1: Write the failing test**

Add to `tests/server-routes.test.ts`:

```ts
describe('createServerApp artifact serving', () => {
  test('serves a file under the configured outputDir', async () => {
    const outputDir = join(TMP_DIR, 'test-results')
    await mkdir(outputDir, { recursive: true })
    await writeFile(join(outputDir, 'shot.png'), 'native-bytes')

    const app = await createServerApp({
      screenshotDir: SCREENSHOT_DIR,
      outputDir,
      reportPath: join(TMP_DIR, 'report.json'),
    })

    const res = await app.handleRequest(
      new Request(`http://localhost/file/${encodeURIComponent(join(outputDir, 'shot.png'))}`),
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('native-bytes')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/server-routes.test.ts -t "createServerApp artifact serving"`
Expected: FAIL — `outputDir` is not an accepted option and `artifactRoots` is unset, so the route returns 404.

- [ ] **Step 3: Write minimal implementation**

In `src/server/app.ts`, add to `ServerOptions`:

```ts
  outputDir?: string
```

In `createRoutesContext`, build and attach `artifactRoots` (filter out undefined):

```ts
function createRoutesContext(
  reportData: ReportData,
  staticDir: string,
  saveReport: () => Promise<void>,
  options: ServerOptions,
): RoutesContext {
  const artifactRoots = [
    reportData.screenshotDir,
    options.outputDir,
    options.playwrightSnapshotDir,
    options.playwrightTestDir,
  ].filter((root): root is string => root !== undefined && root !== '')

  return {
    reportData,
    staticDir,
    saveReport,
    artifactRoots,
    approvalRouting: {
      configDir: options.configDir ?? process.cwd(),
      playwrightTestDir: options.playwrightTestDir,
      playwrightSnapshotDir: options.playwrightSnapshotDir,
      playwrightSnapshotPathTemplate: options.playwrightSnapshotPathTemplate,
      playwrightToHaveScreenshotPathTemplate: options.playwrightToHaveScreenshotPathTemplate,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/server-routes.test.ts -t "createServerApp artifact serving"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts tests/server-routes.test.ts
git commit -m "feat(server): wire artifactRoots and outputDir option"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `bun test`
Expected: PASS. No existing behavior changed (routes are additive; nothing emits `/file` or `/baseline` URLs yet).

- [ ] **Step 2: Lint, typecheck, format**

Run: `bun run lint && bun run typecheck && bun run format:check`
Expected: all pass.

---

## Self-Review

**Spec coverage:** Implements the spec's "Live Mode → Server changes" routes — `/baseline/...` resolve-on-demand and allowlisted native-artifact serving — plus the allowlist roots (`outputDir`, `snapshotDir`, `testDir`, `screenshotDir`). The image-URL-routing that _uses_ these routes is Plan 3, as noted in the spec ("In live mode, image URLs … point at these routes").

**Placeholder scan:** None. Tasks 3's test reuses constants (`SNAPSHOT_DIR`, `TEST_FILE`, `CUSTOM_TEMPLATE`) already defined at the top of `tests/server-routes.test.ts`; the implementer should confirm those names match the file.

**Type consistency:** `isPathWithinRoots(target: string, roots: readonly string[]): boolean`, `resolveApprovalTarget(ctx, test, retry, imageName): string | null` (now exported, signature unchanged), and `RoutesContext.artifactRoots?: readonly string[]` are used consistently across tasks. `outputDir` is a `string | undefined` option threaded into `artifactRoots`.
