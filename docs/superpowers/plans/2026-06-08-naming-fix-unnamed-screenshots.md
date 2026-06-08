# Naming Fix for Unnamed Screenshots — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unnamed `toHaveScreenshot()` declarations adopt Playwright's real auto-generated name so the reporter stops emitting a phantom `__unnamed-screenshot-N` entry alongside the real image.

**Architecture:** The resolver already reconstructs Playwright's auto-name internally (`anonymousName`) but only uses it to locate the source baseline, then keys artifacts off the synthetic `__unnamed-screenshot-N`. We expose that reconstruction and have the reporter rewrite each unnamed declaration's `visualName` to the real name _before_ emitting events or copying baselines. Because the declared name then equals the attachment-derived name, `mergeDeclaredImages` collapses them into one entry. The synthetic name remains only as a fallback when the title path is unavailable.

**Tech Stack:** TypeScript, Bun (`bun test`), Playwright reporter API, Zod schemas.

**Context:** This is Plan 1 of 3 (Naming fix → Live-mode serving → CI-gated copying). It is independent and ships on its own. It fixes the originally-reported bug where a failing or passing unnamed screenshot test renders both a real image and a `declared-only` `__unnamed-screenshot-N` placeholder.

---

## File Structure

- `src/snapshot-path-resolver.ts` — **modify.** Export two new pure functions: `playwrightAnonymousVisualName(reporterTitlePath, occurrenceIndex)` (the real auto-name without extension, or `null` when the title path carries no test title) and `withResolvedVisualNames(declarations, reporterTitlePath)` (returns declarations with unnamed `visualName`s rewritten). Existing internal `anonymousName` is refactored to reuse the new base helper. No behavior change to existing exports.
- `src/reporter.ts` — **modify.** In `onTestEnd`, pass the extracted declarations through `withResolvedVisualNames` before using them for event data and baseline copying.
- `tests/snapshot-path-resolver.test.ts` — **modify.** Add tests for `playwrightAnonymousVisualName` and `withResolvedVisualNames`.
- `tests/offline.test.ts` — **modify.** Update the existing expectation that asserts `['__unnamed-screenshot-1']` so an unnamed screenshot with a known title path now reports its real auto-name.

No new files. No schema changes (the declaration shape is unchanged; only the `visualName` value differs).

---

### Task 1: Expose the real auto-name from the resolver

**Files:**

- Modify: `src/snapshot-path-resolver.ts` (the `anonymousName` / `reporterTitlesWithoutProjectAndFile` region, lines ~215-222)
- Test: `tests/snapshot-path-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/snapshot-path-resolver.test.ts` (the file already imports from `'../src/snapshot-path-resolver'` and defines `REPORTER_TITLE_PATH = ['', 'chromium', 'example.spec.ts', 'Suite', 'visual pass']`). Add `playwrightAnonymousVisualName` to the existing import line, then append:

```ts
describe('playwrightAnonymousVisualName', () => {
  test('reconstructs Playwright auto-name without extension', () => {
    expect(playwrightAnonymousVisualName(REPORTER_TITLE_PATH, 1)).toBe('Suite-visual-pass-1')
  })

  test('increments with occurrence index', () => {
    expect(playwrightAnonymousVisualName(REPORTER_TITLE_PATH, 2)).toBe('Suite-visual-pass-2')
  })

  test('returns null when the title path has no test title', () => {
    expect(playwrightAnonymousVisualName(['', 'chromium', 'example.spec.ts'], 1)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/snapshot-path-resolver.test.ts -t "playwrightAnonymousVisualName"`
Expected: FAIL — `playwrightAnonymousVisualName is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

In `src/snapshot-path-resolver.ts`, replace the existing `anonymousName` function (and keep `reporterTitlesWithoutProjectAndFile`) with:

```ts
function reporterTitlesWithoutProjectAndFile(reporterTitlePath: readonly string[]): readonly string[] {
  return reporterTitlePath.slice(3).filter((part) => part !== '')
}

function anonymousName(reporterTitlePath: readonly string[], occurrenceIndex: number): string {
  const rawAnonymousName = `${reporterTitlesWithoutProjectAndFile(reporterTitlePath).join(' ')} ${occurrenceIndex}.png`
  return sanitizeFilePathBeforeExtension(trimLongString(rawAnonymousName), '.png')
}

export function playwrightAnonymousVisualName(
  reporterTitlePath: readonly string[],
  occurrenceIndex: number,
): string | null {
  if (reporterTitlesWithoutProjectAndFile(reporterTitlePath).length === 0) {
    return null
  }

  return removeExtension(anonymousName(reporterTitlePath, occurrenceIndex), '.png')
}
```

(`removeExtension`, `sanitizeFilePathBeforeExtension`, and `trimLongString` already exist earlier in the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/snapshot-path-resolver.test.ts -t "playwrightAnonymousVisualName"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/snapshot-path-resolver.ts tests/snapshot-path-resolver.test.ts
git commit -m "feat(resolver): expose playwrightAnonymousVisualName"
```

---

### Task 2: Add `withResolvedVisualNames`

**Files:**

- Modify: `src/snapshot-path-resolver.ts`
- Test: `tests/snapshot-path-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/snapshot-path-resolver.test.ts` and add `withResolvedVisualNames` to the import from `'../src/snapshot-path-resolver'`:

```ts
describe('withResolvedVisualNames', () => {
  test('rewrites unnamed declarations to the real auto-name', () => {
    expect(
      withResolvedVisualNames(
        [{ visualName: '__unnamed-screenshot-1', kind: 'unnamed', occurrenceIndex: 1 }],
        REPORTER_TITLE_PATH,
      ),
    ).toEqual([{ visualName: 'Suite-visual-pass-1', kind: 'unnamed', occurrenceIndex: 1 }])
  })

  test('leaves named declarations untouched', () => {
    const named = {
      visualName: 'header',
      kind: 'named' as const,
      declaredName: 'header',
      snapshotBaseName: 'header',
      occurrenceIndex: 1,
    }
    expect(withResolvedVisualNames([named], REPORTER_TITLE_PATH)).toEqual([named])
  })

  test('keeps the synthetic name when the title path has no test title', () => {
    const unnamed = { visualName: '__unnamed-screenshot-1', kind: 'unnamed' as const, occurrenceIndex: 1 }
    expect(withResolvedVisualNames([unnamed], ['', 'chromium', 'example.spec.ts'])).toEqual([unnamed])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/snapshot-path-resolver.test.ts -t "withResolvedVisualNames"`
Expected: FAIL — `withResolvedVisualNames is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/snapshot-path-resolver.ts`, add (the file already imports `ScreenshotDeclaration` from `./reporter-utils.ts`):

```ts
export function withResolvedVisualNames(
  declarations: readonly ScreenshotDeclaration[],
  reporterTitlePath: readonly string[],
): ScreenshotDeclaration[] {
  return declarations.map((declaration) => {
    if (declaration.kind !== 'unnamed') {
      return declaration
    }

    const resolvedName = playwrightAnonymousVisualName(reporterTitlePath, declaration.occurrenceIndex)
    return resolvedName === null ? declaration : { ...declaration, visualName: resolvedName }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/snapshot-path-resolver.test.ts -t "withResolvedVisualNames"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/snapshot-path-resolver.ts tests/snapshot-path-resolver.test.ts
git commit -m "feat(resolver): add withResolvedVisualNames"
```

---

### Task 3: Apply finalized names in the reporter

**Files:**

- Modify: `src/reporter.ts` (`onTestEnd`, lines ~128-149; import block lines ~18-19)
- Test: `tests/offline.test.ts` (the existing assertion near line 1016)

- [ ] **Step 1: Update the failing expectation**

In `tests/offline.test.ts`, find the assertion:

```ts
expect((testEndEvent as { data: { visualNames: string[] } }).data.visualNames).toEqual(['__unnamed-screenshot-1'])
```

This test drives an unnamed screenshot through the reporter. Determine the test's reporter title path from the surrounding fixture (the describe/test titles used to build the `TestCase`) and replace the expectation with the real auto-name the reporter will now produce. For example, if the fixture test is titled `unnamed` with no enclosing describe and file-derived title path yields `['','chromium','<file>','unnamed']`, the expected value becomes:

```ts
expect((testEndEvent as { data: { visualNames: string[] } }).data.visualNames).toEqual(['unnamed-1'])
```

Read the fixture in that test to compute the exact string (apply `playwrightAnonymousVisualName` mentally: title parts after index 3, joined by space, ` <index>.png`, sanitized via dash-collapsing, extension stripped). Use the actual value from the fixture, not the example above.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/offline.test.ts`
Expected: FAIL on that assertion — actual is still `['__unnamed-screenshot-1']` because the reporter has not been wired yet.

- [ ] **Step 3: Wire the reporter**

In `src/reporter.ts`, add `withResolvedVisualNames` to the resolver import:

```ts
import { resolveBaselineTargets, withResolvedVisualNames } from './snapshot-path-resolver.ts'
```

In `onTestEnd`, replace:

```ts
const screenshotDeclarations = extractScreenshotDeclarations(result.steps)
```

with:

```ts
const reporterTitlePath = this.testMetadata.get(test.id)?.reporterTitlePath ?? this.reporterTitlePath(test)
const screenshotDeclarations = withResolvedVisualNames(extractScreenshotDeclarations(result.steps), reporterTitlePath)
```

No other changes are needed: `visualNames`, `visualDeclarations`, and `copySnapshotBaselines` already derive from `screenshotDeclarations`, and `createResolvedBaselineTarget` already keys `attachmentBaseName`/`artifactBaseName` off `declaration.visualName`, which now holds the real name.

- [ ] **Step 4: Run the full suite**

Run: `bun test tests/offline.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/reporter.ts tests/offline.test.ts
git commit -m "fix(reporter): use Playwright auto-name for unnamed screenshots"
```

---

### Task 4: Regression check — no phantom duplicate in report state

**Files:**

- Test: `tests/report-state.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test asserting that when a failing unnamed screenshot produces real artifacts (`*-actual/expected/diff`) under the real auto-name AND the declaration carries that same finalized name, the merged images contain exactly one entry (no `__unnamed-screenshot-1` placeholder). Model it on the existing `report-state.test.ts` cases (which already build `ReportStateTestEndData` with `attachments`, `visualNames`, `visualDeclarations`). Use a finalized declaration:

```ts
test('does not emit a phantom declared-only entry for a finalized unnamed screenshot', () => {
  const state = createMutableReportState('./screenshots')
  applyTestBeginEvent(state, {
    id: 't1',
    title: 'visual',
    titlePath: ['Suite'],
    browser: 'chromium',
    location: { file: 'example.spec.ts', line: 1 },
  })

  applyTestEndEvent(state, {
    id: 't1',
    status: 'failed',
    attachments: [
      { name: 'Suite-visual-1-actual.png', path: 't1/Suite-visual-1-actual.png', contentType: 'image/png' },
      { name: 'Suite-visual-1-expected.png', path: 't1/Suite-visual-1-expected.png', contentType: 'image/png' },
      { name: 'Suite-visual-1-diff.png', path: 't1/Suite-visual-1-diff.png', contentType: 'image/png' },
    ],
    visualNames: ['Suite-visual-1'],
    visualDeclarations: [{ visualName: 'Suite-visual-1', kind: 'unnamed', occurrenceIndex: 1 }],
  })

  const images = state.reportData.tests['t1']?.results?.[0]?.images ?? {}
  expect(Object.keys(images)).toEqual(['Suite-visual-1'])
  expect(images['Suite-visual-1']?.source).toBe('comparison')
})
```

Match the exact import names and the `ReportStateTestEndData` shape already used at the top of `tests/report-state.test.ts` (adjust field names if the existing tests differ, e.g. `createMutableReportState` signature).

- [ ] **Step 2: Run test to verify behavior**

Run: `bun test tests/report-state.test.ts -t "phantom"`
Expected: PASS — this confirms the merge collapses to one entry. (If it FAILS with two keys, the declared name and attachment name disagree; recheck Task 3's finalized value against the attachment base name.)

- [ ] **Step 3: Commit**

```bash
git add tests/report-state.test.ts
git commit -m "test(report-state): assert no phantom entry for finalized unnamed screenshot"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the entire suite**

Run: `bun test`
Expected: PASS (all suites). The pre-existing `reporter-utils.test.ts` assertion on `extractScreenshotDeclarations` still expects `__unnamed-screenshot-1` and remains valid — that function is unchanged; only the reporter's post-processing rewrites the name.

- [ ] **Step 2: Lint, typecheck, format**

Run: `bun run lint && bun run typecheck && bun run format:check`
Expected: all pass (the pre-commit hook runs these too).

- [ ] **Step 3: Confirm no behavioral regressions in offline artifact**

Run: `bun test tests/offline.test.ts`
Expected: PASS. The offline report and static artifact now key unnamed screenshots by their real auto-name end to end.

---

## Self-Review

**Spec coverage:** This plan implements spec Section "Naming Reconciliation" in full (real auto-name for unnamed, both event data and copied filenames via `declaration.visualName`, synthetic fallback when title path unavailable, `unnamed` target keyed off the finalized name). Spec Sections on CI gating and live-mode serving are explicitly out of scope for this plan (Plans 2 and 3).

**Placeholder scan:** Task 3 Step 1 intentionally instructs the implementer to compute the exact expected string from the fixture rather than hardcoding it, because the value depends on the fixture's title path; this is a deliberate read-the-fixture instruction, not a placeholder — the computation rule is given precisely.

**Type consistency:** `playwrightAnonymousVisualName(reporterTitlePath: readonly string[], occurrenceIndex: number): string | null` and `withResolvedVisualNames(declarations: readonly ScreenshotDeclaration[], reporterTitlePath: readonly string[]): ScreenshotDeclaration[]` are used consistently across Tasks 1-3. `ScreenshotDeclaration` is the existing type from `reporter-utils.ts`.
