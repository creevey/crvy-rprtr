# Template-Aware Approval Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Approve and Approve All write actual screenshots to the same exact Playwright-aware snapshot targets used for passed-baseline display.

**Architecture:** Reuse the existing snapshot resolver from the server approval routes, persist the minimal resolver metadata needed for later approval decisions, and remove hardcoded default snapshot path construction from approval logic. Single and bulk approval should both use exact-only resolution and report unresolved images instead of guessing.

**Tech Stack:** TypeScript, Bun, Playwright reporter data model, Bun test, server routes, shared snapshot resolver

---

## File Structure

- `src/types.ts` — extend result/image metadata so approval routes can reconstruct resolver inputs later.
- `src/schemas.ts` — keep runtime payload parsing aligned with the new internal approval metadata shape if needed.
- `src/report-utils.ts` — preserve resolver metadata when attachment-derived image records are built.
- `src/report-state.ts` — merge screenshot declaration metadata into report state so server approval can resolve targets after the run.
- `src/server/app.ts` — thread Playwright snapshot resolver options into the server-side routes context.
- `src/server/routes.ts` — replace hardcoded approval path construction with exact resolver-backed routing for single and bulk approval.
- `tests/report-state.test.ts` — verify approval metadata survives report-state processing.
- `tests/offline.test.ts` — verify single-approve resolver behavior if the route tests share offline fixtures.
- `tests/server-routes.test.ts` — focused route-level approval routing tests for custom templates, unnamed, duplicates, slash-name ambiguity, and mixed bulk results.

---

### Task 1: Persist resolver metadata in report state for later approval decisions

**Files:**

- Modify: `src/types.ts`
- Modify: `src/report-utils.ts`
- Modify: `src/report-state.ts`
- Modify: `tests/report-state.test.ts`

- [ ] **Step 1: Add a failing report-state test proving approval metadata survives a passed visual assertion**

```ts
import { describe, expect, test } from 'bun:test'

import { applyTestBeginEvent, applyTestEndEvent, createMutableReportState } from '../src/report-state'

describe('report-state approval metadata', () => {
  test('stores resolver metadata for named and unnamed screenshots', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-approval-meta',
      title: 'visual pass',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 10 },
    })

    applyTestEndEvent(
      state,
      {
        id: 'test-approval-meta',
        status: 'passed',
        attachments: [],
        visualNames: ['header', '__unnamed-screenshot-1'],
        visualDeclarations: [
          {
            visualName: 'header',
            kind: 'named',
            declaredName: 'header',
            snapshotBaseName: 'header',
            occurrenceIndex: 1,
          },
          {
            visualName: '__unnamed-screenshot-1',
            kind: 'unnamed',
            occurrenceIndex: 1,
          },
        ],
        duration: 5,
      },
      { screenshotsBaseUrl: '/screenshots/' },
    )

    const result = state.reportData.tests['test-approval-meta']?.results?.[0]

    expect(result?.visualDeclarations).toEqual([
      {
        visualName: 'header',
        kind: 'named',
        declaredName: 'header',
        snapshotBaseName: 'header',
        occurrenceIndex: 1,
      },
      {
        visualName: '__unnamed-screenshot-1',
        kind: 'unnamed',
        occurrenceIndex: 1,
      },
    ])
  })
})
```

- [ ] **Step 2: Run the focused state test to confirm it fails first**

Run: `bun test tests/report-state.test.ts`
Expected: FAIL because `visualDeclarations` is not yet part of the stored result shape.

- [ ] **Step 3: Extend the shared result model to preserve declaration metadata**

```ts
// src/types.ts
import type { ScreenshotDeclaration } from './reporter-utils.ts'

export interface TestResult {
  status: TestResultStatus
  retries: number
  images?: Partial<Record<string, Images>>
  visualDeclarations?: readonly ScreenshotDeclaration[]
  error?: string
  duration?: number
}
```

```ts
// src/report-state.ts
test.results = [
  {
    status: resultStatus,
    retries: 0,
    images,
    visualDeclarations: data.visualDeclarations,
    error: data.error,
    duration: data.duration,
  },
]
```

If needed, thread `visualDeclarations` through the report-state helper functions without changing existing display behavior.

- [ ] **Step 4: Run the state test again**

Run: `bun test tests/report-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the approval-metadata state change**

```bash
git add src/types.ts src/report-utils.ts src/report-state.ts tests/report-state.test.ts
git commit -m "feat: persist approval resolver metadata in report state"
```

---

### Task 2: Emit full visual declaration metadata from the reporter payload

**Files:**

- Modify: `src/schemas.ts`
- Modify: `src/reporter.ts`
- Modify: `tests/offline.test.ts`

- [ ] **Step 1: Add a failing offline reporter test that expects `visualDeclarations` in the payload**

```ts
test('includes visualDeclarations in the test-end payload', async () => {
  const { CrvyRprtr } = await import('../src/reporter')

  const reporter = new CrvyRprtr({
    screenshotDir: TEST_SCREENSHOT_DIR,
    reportHtmlPath: TEST_ARTIFACT_PATH,
  })

  const sent: unknown[] = []
  const reporterAny = reporter as unknown as {
    send: (message: unknown) => void
    onTestEnd: (test: object, result: object) => Promise<void>
  }
  reporterAny.send = (message: unknown): void => {
    sent.push(message)
  }

  await reporterAny.onTestEnd(
    {
      id: 'test-visual-declarations',
      title: 'visual pass',
      location: { file: TEST_FILE, line: 10 },
      parent: {
        project: () => createProject('chromium'),
      },
    },
    {
      status: 'passed',
      errors: [],
      duration: 100,
      attachments: [],
      steps: [
        {
          title: 'outer step',
          steps: [
            { title: 'Expect "toHaveScreenshot(header.png)"', steps: [] },
            { title: 'Expect "toHaveScreenshot"', steps: [] },
          ],
        },
      ],
    },
  )

  expect((sent[0] as { data: { visualDeclarations: unknown[] } }).data.visualDeclarations).toEqual([
    {
      visualName: 'header',
      kind: 'named',
      declaredName: 'header',
      snapshotBaseName: 'header',
      occurrenceIndex: 1,
    },
    {
      visualName: '__unnamed-screenshot-1',
      kind: 'unnamed',
      occurrenceIndex: 1,
    },
  ])
})
```

- [ ] **Step 2: Run the offline reporter test to verify it fails**

Run: `bun test tests/offline.test.ts`
Expected: FAIL because `visualDeclarations` is not emitted yet.

- [ ] **Step 3: Add `visualDeclarations` to the test-end schema and reporter payload**

```ts
// src/schemas.ts
export const ScreenshotDeclarationSchema = z.discriminatedUnion('kind', [
  z.object({
    visualName: z.string(),
    kind: z.literal('named'),
    declaredName: z.string(),
    snapshotBaseName: z.string(),
    occurrenceIndex: z.number(),
  }),
  z.object({
    visualName: z.string(),
    kind: z.literal('unnamed'),
    occurrenceIndex: z.number(),
  }),
])

export const TestEndDataSchema = z.object({
  id: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  attachments: z.array(AttachmentSchema),
  visualNames: z.array(z.string()).default([]),
  visualDeclarations: z.array(ScreenshotDeclarationSchema).default([]),
  error: z.string().optional(),
  duration: z.number().optional(),
})
```

```ts
// src/reporter.ts
this.send({
  type: 'test-end',
  data: {
    id: test.id,
    title: test.title,
    status: result.status,
    attachments: savedAttachments,
    visualNames: screenshotDeclarations.map(({ visualName }) => visualName),
    visualDeclarations: screenshotDeclarations,
    error: result.errors.length > 0 ? result.errors[0]?.message : undefined,
    duration: result.duration,
  },
})
```

- [ ] **Step 4: Run the offline reporter suite again**

Run: `bun test tests/offline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the reporter payload change**

```bash
git add src/schemas.ts src/reporter.ts tests/offline.test.ts
git commit -m "feat: emit approval resolver metadata from reporter"
```

---

### Task 3: Make server routes use resolver-backed exact approval targets

**Files:**

- Modify: `src/server/app.ts`
- Modify: `src/server/routes.ts`
- Create: `tests/server-routes.test.ts`

- [ ] **Step 1: Write failing route-level tests for template-aware approval routing**

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'

import type { TestData } from '../src/types'
import { handleHttpRequest, type RoutesContext } from '../src/server/routes'

const TMP_DIR = join(process.cwd(), 'test-approval-routing')
const SCREENSHOT_DIR = join(TMP_DIR, 'screenshots')
const SNAPSHOT_DIR = join(TMP_DIR, 'snapshots')
const TEST_FILE = join(TMP_DIR, 'tests/example.spec.ts')

function createContext(tests: Record<string, TestData>): RoutesContext {
  return {
    reportData: {
      isRunning: false,
      tests,
      browsers: ['chromium'],
      isUpdateMode: false,
      screenshotDir: SCREENSHOT_DIR,
    },
    staticDir: './dist',
    saveReport: async () => {},
    approvalRouting: {
      configDir: process.cwd(),
      playwrightSnapshotDir: SNAPSHOT_DIR,
      playwrightToHaveScreenshotPathTemplate: '{snapshotDir}/{projectName}/{testFilePath}/{arg}{ext}',
    },
  }
}

afterEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true })
})

describe('approval routing', () => {
  test('approve writes to the resolver-selected custom-template target', async () => {
    await mkdir(join(SCREENSHOT_DIR, 'test-1'), { recursive: true })
    await mkdir(join(SNAPSHOT_DIR, 'chromium', 'tests/example.spec.ts'), { recursive: true })
    await writeFile(join(SCREENSHOT_DIR, 'test-1', 'header-actual.png'), 'actual image')
    await writeFile(join(SNAPSHOT_DIR, 'chromium', 'tests/example.spec.ts', 'header.png'), 'baseline image')

    const response = await handleHttpRequest(
      createContext({
        'test-1': {
          id: 'test-1',
          title: 'visual pass',
          titlePath: ['Suite'],
          browser: 'chromium',
          location: { file: TEST_FILE, line: 10 },
          results: [
            {
              status: 'failed',
              retries: 0,
              images: {
                header: {
                  actual: '/screenshots/test-1/header-actual.png',
                },
              },
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
      }),
      new Request('http://localhost/api/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'test-1', retry: 0, image: 'header' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await readFile(join(SNAPSHOT_DIR, 'chromium', 'tests/example.spec.ts', 'header.png'), 'utf-8')).toBe(
      'actual image',
    )
  })
})
```

- [ ] **Step 2: Run the route test to verify it fails**

Run: `bun test tests/server-routes.test.ts`
Expected: FAIL because routes still hardcode default approval targets and `RoutesContext` does not expose resolver options.

- [ ] **Step 3: Thread resolver options into server context and replace hardcoded approval paths**

Add an approval-routing config to the server context in `src/server/app.ts`:

```ts
export interface ServerOptions {
  port?: number
  screenshotDir?: string
  reportPath?: string
  staticDir?: string
  playwrightSnapshotDir?: string
  playwrightSnapshotPathTemplate?: string
  playwrightToHaveScreenshotPathTemplate?: string
}
```

Extend `RoutesContext` in `src/server/routes.ts`:

```ts
import { resolveBaselineTargets } from '../snapshot-path-resolver.ts'
import type { ScreenshotDeclaration } from '../reporter-utils.ts'

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
  approvalRouting: {
    configDir: string
    playwrightSnapshotDir?: string
    playwrightSnapshotPathTemplate?: string
    playwrightToHaveScreenshotPathTemplate?: string
  }
}
```

Add a helper inside `src/server/routes.ts`:

```ts
function resolveApprovalTarget(ctx: RoutesContext, test: TestData, retry: number, imageName: string): string | null {
  const result = test.results?.[retry]
  const declarations = result?.visualDeclarations
  const declaration = declarations?.find((candidate) => candidate.visualName === imageName)
  if (!result || !declaration || !test.location?.file) {
    return null
  }

  const targets = resolveBaselineTargets({
    testFile: test.location.file,
    reporterTitlePath: ['', test.browser, test.location.file, ...test.titlePath, test.title],
    declarations: [declaration],
    config: {
      configDir: ctx.approvalRouting.configDir,
      testDir: dirname(test.location.file),
      snapshotDir: ctx.approvalRouting.playwrightSnapshotDir ?? dirname(test.location.file),
      projectName: test.browser,
      snapshotSuffix: process.platform,
      snapshotPathTemplate: ctx.approvalRouting.playwrightSnapshotPathTemplate,
      toHaveScreenshotPathTemplate: ctx.approvalRouting.playwrightToHaveScreenshotPathTemplate,
    },
    snapshotPathExists: (candidatePath) => existsSync(candidatePath),
  })

  return targets.length === 1 ? (targets[0]?.snapshotPath ?? null) : null
}
```

Update `handleApiApprove` and `handleApiApproveAll` to use this helper and to skip/fail unresolved images instead of using the old hardcoded path.

- [ ] **Step 4: Run the route tests again**

Run: `bun test tests/server-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the exact approval routing integration**

```bash
git add src/server/app.ts src/server/routes.ts tests/server-routes.test.ts
git commit -m "feat: reuse resolver for approval routing"
```

---

### Task 4: Handle unresolved bulk approvals explicitly and verify mixed outcomes

**Files:**

- Modify: `src/server/routes.ts`
- Modify: `tests/server-routes.test.ts`

- [ ] **Step 1: Add a failing mixed-outcome bulk-approval test**

```ts
test('approve-all reports mixed outcomes instead of guessing unresolved targets', async () => {
  await mkdir(join(SCREENSHOT_DIR, 'test-success'), { recursive: true })
  await mkdir(join(SCREENSHOT_DIR, 'test-ambiguous'), { recursive: true })
  await mkdir(join(SNAPSHOT_DIR, 'tests/example.spec.ts-snapshots', 'dir'), { recursive: true })
  await writeFile(join(SCREENSHOT_DIR, 'test-success', 'header-actual.png'), 'actual image')
  await writeFile(join(SCREENSHOT_DIR, 'test-ambiguous', 'dir-header-actual.png'), 'actual image')
  await writeFile(
    join(SNAPSHOT_DIR, 'tests/example.spec.ts-snapshots', `header-chromium-${process.platform}.png`),
    'old baseline',
  )
  await writeFile(
    join(SNAPSHOT_DIR, 'tests/example.spec.ts-snapshots', `dir-header-chromium-${process.platform}.png`),
    'string baseline',
  )
  await writeFile(
    join(SNAPSHOT_DIR, 'tests/example.spec.ts-snapshots', 'dir', `header-chromium-${process.platform}.png`),
    'array baseline',
  )

  const response = await handleHttpRequest(
    createContext({
      'test-success': {
        id: 'test-success',
        title: 'visual pass',
        titlePath: ['Suite'],
        browser: 'chromium',
        location: { file: TEST_FILE, line: 10 },
        results: [
          {
            status: 'failed',
            retries: 0,
            images: { header: { actual: '/screenshots/test-success/header-actual.png' } },
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
      'test-ambiguous': {
        id: 'test-ambiguous',
        title: 'visual pass',
        titlePath: ['Suite'],
        browser: 'chromium',
        location: { file: TEST_FILE, line: 10 },
        results: [
          {
            status: 'failed',
            retries: 0,
            images: { 'dir/header': { actual: '/screenshots/test-ambiguous/dir-header-actual.png' } },
            visualDeclarations: [
              {
                visualName: 'dir/header',
                kind: 'named',
                declaredName: 'dir/header',
                snapshotBaseName: 'dir/header',
                occurrenceIndex: 1,
              },
            ],
          },
        ],
      },
    }),
    new Request('http://localhost/api/approve-all', { method: 'POST' }),
  )

  const body = await response.json()
  expect(body).toEqual({ success: true, approved: 1, unresolved: 1, failed: 0 })
})
```

- [ ] **Step 2: Run the route tests to verify the bulk test fails first**

Run: `bun test tests/server-routes.test.ts`
Expected: FAIL because bulk approval still reports only generic success.

- [ ] **Step 3: Return structured mixed-outcome bulk results from `handleApiApproveAll`**

```ts
let approvedCount = 0
let unresolvedCount = 0
let failedCount = 0

// ...
if (snapshotPath === null) {
  unresolvedCount += 1
  return
}

baselineUpdates.push(
  copyFilePortable(actualPath, snapshotPath)
    .then(() => {
      approvedCount += 1
    })
    .catch(() => {
      failedCount += 1
    }),
)

return Response.json({
  success: failedCount === 0,
  approved: approvedCount,
  unresolved: unresolvedCount,
  failed: failedCount,
})
```

Ensure per-image approval state is only recorded when the corresponding copy succeeds.

- [ ] **Step 4: Run the route suite again**

Run: `bun test tests/server-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the bulk-approval result handling**

```bash
git add src/server/routes.ts tests/server-routes.test.ts
git commit -m "feat: report mixed approval routing outcomes"
```

---

### Task 5: Run final verification and keep docs honest

**Files:**

- Modify: `README.md` only if the implementation meaningfully changes user-visible approval semantics beyond the current documented limitation

- [ ] **Step 1: Update README only if needed**

If approval routing is now template-aware, replace the current limitation text with something accurate, for example:

```md
Approve and Approve All now reuse the same exact snapshot resolution as passed-baseline display. For slash-containing named screenshot titles, Crvy Rprtr only updates the baseline when one exact Playwright-equivalent target can be determined.
```

If the implementation still has a documented limitation, keep the README aligned with the actual behavior and avoid overclaiming.

- [ ] **Step 2: Run the focused verification commands**

Run: `bun test tests/report-state.test.ts tests/offline.test.ts tests/server-routes.test.ts tests/snapshot-path-resolver.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: PASS.

Run: `bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit the final approval-routing documentation/verification change**

```bash
git add README.md tests/report-state.test.ts tests/offline.test.ts tests/server-routes.test.ts src/server/app.ts src/server/routes.ts src/types.ts src/schemas.ts src/report-utils.ts src/report-state.ts
git commit -m "docs: align approval routing docs with resolver behavior"
```
