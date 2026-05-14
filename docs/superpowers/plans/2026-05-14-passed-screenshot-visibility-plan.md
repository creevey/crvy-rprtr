# Passed Screenshot Visibility Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep passed Playwright screenshot assertions visible in Crvy Rprtr with truthful baseline-only or declared-only UX, and refresh the UI when report or screenshot artifacts appear after server startup.

**Architecture:** Extend the reporter payload with declared screenshot names, classify image records in the shared state layer as `comparison`, `baseline-only`, or `declared-only`, and add a debounced filesystem reload path in the server that re-merges report data and broadcasts sync updates. The UI continues to use the existing results views for comparisons, but adds explicit empty states and labels for the two passed-test fallback modes.

**Tech Stack:** TypeScript, Bun, Playwright reporter API, Svelte, `fs.watch`, Bun test

---

### Task 1: Add explicit visual-source metadata to shared report state

**Files:**

- Create: `tests/report-state.test.ts`
- Modify: `src/types.ts`
- Modify: `src/schemas.ts`
- Modify: `src/report-utils.ts`
- Modify: `src/report-state.ts`

- [ ] **Step 1: Write a failing state-layer test for baseline-only and declared-only records**

```ts
import { describe, expect, test } from 'bun:test'

import { applyTestBeginEvent, applyTestEndEvent, createMutableReportState } from '../src/report-state'

describe('report-state visual classification', () => {
  test('marks baseline-only and declared-only screenshot assertions explicitly', () => {
    const state = createMutableReportState('./screenshots')

    applyTestBeginEvent(state, {
      id: 'test-1',
      title: 'visual pass',
      titlePath: ['Suite'],
      browser: 'chromium',
      location: { file: 'tests/example.spec.ts', line: 10 },
    })

    applyTestEndEvent(
      state,
      {
        id: 'test-1',
        status: 'passed',
        attachments: [
          {
            name: 'header-expected',
            path: 'test-1/header-expected',
            contentType: 'image/png',
          },
        ],
        visualNames: ['header', 'footer'],
      },
      { screenshotsBaseUrl: '/screenshots/' },
    )

    const images = state.reportData.tests['test-1']?.results?.[0]?.images ?? {}
    expect(images['header']?.source).toBe('baseline-only')
    expect(images['header']?.expect).toBe('/screenshots/test-1/header-expected')
    expect(images['footer']?.source).toBe('declared-only')
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails before implementation**

Run: `bun test tests/report-state.test.ts`
Expected: FAIL because `visualNames` and `source` are not implemented yet.

- [ ] **Step 3: Update the shared types and schemas to represent visual-source state**

```ts
export type VisualSource = 'comparison' | 'baseline-only' | 'declared-only'

export interface Images {
  actual?: string
  expect?: string
  diff?: string
  error?: string
  source?: VisualSource
}
```

And extend the test-end schema with screenshot declaration names:

```ts
export const TestEndDataSchema = z.object({
  id: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  attachments: z.array(AttachmentSchema),
  visualNames: z.array(z.string()).default([]),
  error: z.string().optional(),
  duration: z.number().optional(),
})
```

- [ ] **Step 4: Implement image classification in `report-utils.ts` and `report-state.ts`**

```ts
function classifyImage(image: Images): VisualSource {
  if (image.actual || image.diff) return 'comparison'
  if (image.expect) return 'baseline-only'
  return 'declared-only'
}

function mergeDeclaredImages(
  images: Partial<Record<string, Images>>,
  visualNames: string[],
): Partial<Record<string, Images>> {
  for (const name of visualNames) {
    const current = images[name] ?? {}
    images[name] = { ...current, source: classifyImage(current) }
  }
  return images
}
```

Use `mergeDeclaredImages(...)` inside `applyTestEndEvent(...)` after attachment conversion and before writing `test.results`.

- [ ] **Step 5: Run the focused state test again**

Run: `bun test tests/report-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/report-state.test.ts src/types.ts src/schemas.ts src/report-utils.ts src/report-state.ts
git commit -m "feat: classify passed visual assertions in report state"
```

---

### Task 2: Emit declared screenshot names from the reporter even when no files resolve

**Files:**

- Modify: `src/reporter.ts`
- Modify: `src/reporter-utils.ts`
- Modify: `tests/offline.test.ts`

- [ ] **Step 1: Add a failing reporter test that expects declared screenshot names in the payload**

```ts
test('includes visualNames for passed screenshot assertions without attachments', async () => {
  const sent: unknown[] = []
  const reporter = new CrvyRprtr({ screenshotDir: './test-offline-screenshots' }) as any
  reporter.send = (message: unknown) => sent.push(message)

  await reporter.onTestEnd(
    {
      id: 'test-1',
      title: 'visual pass',
      location: { file: 'tests/example.spec.ts', line: 10 },
      parent: { project: () => ({ name: 'chromium' }) },
    },
    {
      status: 'passed',
      errors: [],
      duration: 100,
      attachments: [],
      steps: [{ title: 'expect.toHaveScreenshot(header.png)', steps: [] }],
    },
  )

  expect((sent[0] as any).data.visualNames).toEqual(['header.png'])
})
```

- [ ] **Step 2: Run the focused reporter test to verify it fails**

Run: `bun test tests/offline.test.ts`
Expected: FAIL because the test-end payload does not include `visualNames` yet.

- [ ] **Step 3: Update the reporter to always send extracted screenshot names**

```ts
async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
  const visualNames = extractScreenshotNames(result.steps)
  const savedAttachments = await this.saveAttachments(test.id, result)
  await this.copySnapshotBaselines(test, visualNames, savedAttachments)

  this.send({
    type: 'test-end',
    data: {
      id: test.id,
      title: test.title,
      status: result.status,
      attachments: savedAttachments,
      visualNames,
      error: result.errors[0]?.message,
      duration: result.duration,
    },
  })
}
```

Also make `extractScreenshotNames(...)` normalize nested step names and strip a trailing `.png` only where Crvy Rprtr needs a base name for attachment matching.

- [ ] **Step 4: Run reporter tests again**

Run: `bun test tests/offline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/reporter.ts src/reporter-utils.ts tests/offline.test.ts
git commit -m "feat: emit declared screenshot names for passed visual assertions"
```

---

### Task 3: Add debounced report and screenshot directory refresh in the server

**Files:**

- Create: `src/server/report-watch.ts`
- Create: `tests/report-watch.test.ts`
- Modify: `src/server/app.ts`

- [ ] **Step 1: Write a failing test for debounced watcher scheduling**

```ts
import { describe, expect, mock, test } from 'bun:test'

import { createDebouncedRefresh } from '../src/server/report-watch'

describe('report-watch', () => {
  test('coalesces rapid refresh requests into one reload', async () => {
    const reload = mock(async () => {})
    const refresh = createDebouncedRefresh(reload, 25)

    refresh()
    refresh()
    refresh()

    await Bun.sleep(60)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the watcher test to verify it fails**

Run: `bun test tests/report-watch.test.ts`
Expected: FAIL because `report-watch.ts` does not exist yet.

- [ ] **Step 3: Implement the watcher helper and wire it into `createServerApp(...)`**

```ts
export function createDebouncedRefresh(reload: () => Promise<void>, delayMs = 50): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void reload()
    }, delayMs)
  }
}
```

In `src/server/app.ts`, watch:

```ts
watch(offlineReportDir, { recursive: false }, scheduleRefresh)
watch(reportData.screenshotDir, { recursive: true }, scheduleRefresh)
```

And implement `reloadFromDisk()` to re-run `loadReport(...)` and `loadOfflineReports(...)`, then broadcast `{ type: 'sync', data: reportData }`.

- [ ] **Step 4: Run the new watcher test and the existing offline merge test**

Run: `bun test tests/report-watch.test.ts tests/offline-reports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/report-watch.ts src/server/app.ts tests/report-watch.test.ts
git commit -m "feat: watch report and screenshot artifacts for live refresh"
```

---

### Task 4: Make the UI honest about baseline-only and declared-only passed visuals

**Files:**

- Modify: `src/client/components/Sidebar.svelte`
- Modify: `src/client/components/ResultsPage.svelte`
- Modify: `src/client/components/SideBySideView.svelte`
- Modify: `src/client/helpers/status.ts`

- [ ] **Step 1: Add a focused helper test for visual visibility if the test only has declared screenshot names**

Create `tests/status.test.ts` with:

```ts
import { describe, expect, test } from 'bun:test'

import { hasScreenshots } from '../src/client/helpers/status'

describe('status helpers', () => {
  test('treats declared-only visual entries as visible screenshots', () => {
    expect(
      hasScreenshots({
        id: 'test-1',
        title: 'visual pass',
        titlePath: [],
        browser: 'chromium',
        results: [{ status: 'success', retries: 0, images: { header: { source: 'declared-only' } } }],
      } as any),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the helper test to verify it fails if needed**

Run: `bun test tests/status.test.ts`
Expected: FAIL if the helper still depends on concrete URLs only.

- [ ] **Step 3: Update the results and sidebar views with explicit passed-visual messaging**

Add a baseline-only note in `ResultsPage.svelte`:

```svelte
{#if image?.source === 'baseline-only'}
  <div class="text-xs text-fg-muted">
    Baseline copied from snapshot. Playwright did not emit a passed actual image.
  </div>
{/if}
```

And a declared-only empty state:

```svelte
{#if image?.source === 'declared-only'}
  <div class="text-center text-fg-muted">
    Screenshot assertion detected, but no artifact was emitted for this passed comparison.
  </div>
{/if}
```

Keep approval disabled unless `image.actual` exists for a failed comparison.

- [ ] **Step 4: Run the UI-adjacent helper tests**

Run: `bun test tests/status.test.ts tests/report-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Sidebar.svelte src/client/components/ResultsPage.svelte src/client/components/SideBySideView.svelte src/client/helpers/status.ts tests/status.test.ts
git commit -m "feat: label baseline-only and declared-only passed visuals in the UI"
```

---

### Task 5: Document the Phase 1 behavior and verify the whole slice

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a short README section describing passed screenshot modes**

```md
## Passed Screenshot Modes

Crvy Rprtr can show passed Playwright screenshot assertions in two fallback modes:

- `baseline-only`: the reporter copied the expected snapshot into the screenshot directory.
- `declared-only`: the assertion was detected, but Playwright did not emit an artifact and Crvy Rprtr could not resolve a file.

For exact passed `actual` images, use the future helper-based capture mode.
```

- [ ] **Step 2: Run the focused Bun test suite for this slice**

Run: `bun test tests/report-state.test.ts tests/offline.test.ts tests/offline-reports.test.ts tests/report-watch.test.ts tests/status.test.ts`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe passed screenshot fallback modes"
```

---

### Task 6: Review spec coverage

- [ ] Spec coverage check:
  - [x] Keep passed screenshot assertions visible without test changes — Tasks 1, 2, and 4
  - [x] Distinguish baseline-only versus full comparisons — Tasks 1 and 4
  - [x] Live-refresh from report and screenshot directories — Task 3
  - [x] Preserve approval behavior for failed comparisons — Task 4
  - [x] Document Phase 1 behavior — Task 5

**Placeholder scan:** No TBD/TODO placeholders remain. Each code-changing task includes a concrete snippet, exact files, and exact commands.

**Type consistency:** `visualNames` is introduced in schemas, emitted by the reporter, and consumed by report-state. `source` is introduced in shared image types and used consistently in state and UI tasks.

**Deferred work:** The helper-based Phase 2 for exact passed `actual` capture is intentionally not included in this implementation plan. If needed, create a separate plan for the helper API and adoption path.
