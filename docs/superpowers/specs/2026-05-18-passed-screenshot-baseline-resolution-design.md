# Passed Screenshot Baseline Resolution Design

**Date:** 2026-05-18
**Topic:** Resolve and display baseline screenshots for passed Playwright screenshot assertions in Crvy Rprtr

## Overview

Crvy Rprtr currently keeps some passed Playwright screenshot assertions visible by extracting screenshot declarations from runtime test steps and, for a narrow set of cases, copying the baseline snapshot into Crvy Rprtr's screenshot directory. When resolution fails, the UI falls back to a `declared-only` state that renders `Passed Visual Assertion`.

That fallback is honest, but too limited. The current baseline-copy logic is hardcoded to Playwright's legacy default path layout and does not model Playwright's real snapshot resolution rules for custom templates, duplicate named screenshots, or unnamed screenshots.

This design upgrades Crvy Rprtr from a narrow default-layout baseline copier to a deterministic snapshot resolver that:

1. resolves named screenshot baselines using Playwright's documented screenshot path semantics,
2. mirrors Playwright's internal unnamed screenshot naming and path resolution logic locally,
3. supports custom snapshot layouts via explicit reporter options,
4. only shows baseline images when resolution is exact,
5. preserves the current `declared-only` fallback when exact resolution is not possible.

## User Story

As a reviewer looking at a passed screenshot assertion in Crvy Rprtr, I want to see the baseline screenshot image in the UI instead of only `Passed Visual Assertion`, so I can understand what visual assertion passed without opening snapshot files manually.

## Current Product Behavior

### Screenshot tests

- Failed screenshot assertions already surface concrete `actual`, `expected`, and `diff` artifacts when Playwright emits them.
- Passed screenshot assertions may appear as:
  - `baseline-only` when Crvy Rprtr successfully copied the expected snapshot into its own screenshot directory, or
  - `declared-only` when Crvy Rprtr detected the assertion but could not resolve a file.

### Non-screenshot tests

Non-screenshot tests are stored in report state, but the UI intentionally behaves as a visual-review tool rather than a general Playwright report viewer:

- sidebar tree entries are filtered through `hasScreenshots(...)`,
- summary counts ignore tests without screenshots,
- non-screenshot tests are normally not navigable from the UI.

If one were opened indirectly, the results panel would render `No image to display`.

This feature therefore remains tightly scoped to screenshot assertions and does not need to broaden non-screenshot test presentation.

## Goals

1. Show a baseline image for passed named screenshot assertions when the resolved snapshot exists on disk.
2. Show a baseline image for passed unnamed screenshot assertions when the resolved snapshot exists on disk.
3. Support both Playwright default snapshot layout and explicitly configured custom snapshot templates.
4. Preserve user trust by only showing baselines when path resolution is deterministic.
5. Keep the existing `declared-only` fallback for unresolved assertions.

## Non-Goals

1. Monkey-patch Playwright's `toHaveScreenshot()` matcher at runtime.
2. Parse test source files to detect screenshot assertions.
3. Execute or auto-load arbitrary Playwright config files from the reporter.
4. Guess baselines by scanning directories or fuzzy-matching filenames.
5. Expand Crvy Rprtr into a general non-visual Playwright test report UI.

## Approaches Considered

### A. Default-layout resolver only

Mirror only the legacy/default snapshot layout.

**Pros**

- smallest implementation
- improves many default cases

**Cons**

- incorrect for customized snapshot templates
- preserves a major source of surprise for advanced users

### B. Resolver + explicit reporter options

Mirror Playwright resolution logic locally and accept explicit reporter options for custom snapshot layout.

**Pros**

- deterministic
- supports custom layouts without patching Playwright
- avoids executing config code
- keeps feature behavior easy to document and test

**Cons**

- users with custom layouts must duplicate relevant path settings in reporter config

### C. Auto-read Playwright config

Attempt to discover snapshot templates by loading Playwright config automatically.

**Pros**

- nicest DX when it works

**Cons**

- brittle with computed config
- couples reporter behavior to arbitrary config execution
- hard to keep deterministic across environments and merged reports

## Recommendation

Adopt **Approach B**.

Crvy Rprtr should ship a local snapshot path resolver that mirrors Playwright behavior and accepts explicit reporter options for custom layouts. This balances correctness, maintainability, and trustworthiness without requiring runtime patching or config-file execution.

## Architecture

Introduce a dedicated resolver module, for example `src/snapshot-path-resolver.ts`, responsible for mapping detected screenshot assertions to exact baseline paths on disk.

### Responsibilities

1. **Named screenshot resolution**
   - Resolve named screenshot paths using logic that mirrors Playwright's documented `snapshotPath(name, { kind: 'screenshot' })` behavior.
   - Respect explicit Crvy Rprtr options for custom snapshot layout.

2. **Unnamed screenshot resolution**
   - Reuse the observed internal Playwright naming algorithm for anonymous screenshots:
     - per-test anonymous index,
     - title-path-based default naming,
     - sanitization,
     - long-name trimming,
     - template expansion.

3. **Reporter integration**
   - `src/reporter.ts` should stop hardcoding `test.location.file + "-snapshots"`.
   - Instead, it should ask the resolver for exact baseline entries for each detected screenshot assertion.
   - If a resolved baseline exists, copy it into the reporter screenshot directory as `*-expected.png`.
   - If not, preserve current `declared-only` behavior.

### Boundary of responsibility

The reporter still needs a runtime signal that a screenshot assertion happened. That signal remains the Playwright runtime step output already present in `result.steps`.

This design removes fragile source-file parsing and disk-guessing. The remaining inference boundary is limited to recognizing screenshot assertions from Playwright runtime steps and then resolving paths deterministically.

## Reporter Option Changes

Extend `CrvyRprtrOptions` with explicit snapshot resolution settings:

- `playwrightSnapshotDir?: string`
  - overrides the base snapshot directory used for resolution.
- `playwrightSnapshotPathTemplate?: string`
  - mirrors Playwright `snapshotPathTemplate`.
- `playwrightToHaveScreenshotPathTemplate?: string`
  - mirrors Playwright `expect.toHaveScreenshot.pathTemplate`.
  - takes precedence over `playwrightSnapshotPathTemplate`, matching Playwright semantics.

These option names should stay reporter-scoped and explicit so users understand they duplicate Playwright path settings for Crvy Rprtr's benefit rather than replacing Playwright's own config.

## Resolver Inputs and Internal Model

The resolver should operate on structured values rather than raw reporter objects where practical.

### Inputs

- resolved test file path
- test title path
- test title
- project or browser name
- platform / snapshot suffix
- screenshot declaration sequence
- resolver config derived from reporter options

### Screenshot declaration model

Evolve the current extracted declaration shape from:

- `visualName`
- optional `snapshotBaseName`

into a richer internal form such as:

- `visualName`
- `kind: 'named' | 'unnamed'`
- `declaredName?: string`
- `occurrenceIndex`

This allows Crvy Rprtr to:

- handle duplicate named screenshots correctly,
- map unnamed screenshots to Playwright's anonymous index logic,
- keep a stable UI-facing `visualName` while changing resolver internals independently.

## Named Screenshot Resolution

For named screenshots, Crvy Rprtr should mirror Playwright's screenshot snapshot behavior closely enough that users can treat it as equivalent to:

- `test.info().snapshotPath(name, { kind: 'screenshot' })`

Even though that public API is not callable from the reporter runtime, its documented semantics should define Crvy Rprtr's named-resolution behavior.

### Requirements

- support empty and non-empty project names,
- support nested names such as `dir/header.png`,
- support duplicate named assertions in a single test via named occurrence tracking,
- support custom template overrides via reporter options,
- use exact file existence checks before surfacing a baseline.

## Unnamed Screenshot Resolution

For unnamed screenshots, Crvy Rprtr should locally mirror Playwright's internal anonymous snapshot naming and path generation logic as closely as practical.

### Algorithm

For each detected unnamed screenshot assertion in a test:

1. Maintain a per-test `lastAnonymousSnapshotIndex`, starting at `0`.
2. Increment it for each unnamed screenshot declaration in encounter order.
3. Build the anonymous base name from:
   - test title path, excluding the root file entry,
   - anonymous index.
4. Append `.png`.
5. Apply the same normalization stages Playwright uses:
   - `trimLongString(...)`,
   - `sanitizeFilePathBeforeExtension(...)`,
   - `sanitizeForFilePath(...)`.
6. Expand the selected template using the same token model Playwright documents and implements.

### Template tokens to support

- `testDir`
- `snapshotDir`
- `testFileDir`
- `testFileName`
- `testFilePath`
- `testName`
- `arg`
- `ext`
- `projectName`
- `platform`
- `snapshotSuffix`

### Named duplicate handling

Mirror Playwright's `lastNamedSnapshotIndex` handling as well:

- first use of `header.png` resolves normally,
- second use in the same test resolves to the suffixed form,
- later uses continue the same sequence.

## Confidence Rules

Crvy Rprtr should only display a baseline image when resolution is exact.

### Allowed

- deterministic resolution from mirrored Playwright naming and template rules,
- exact file existence checks against the resolved path.

### Not allowed

- directory scans to find similar files,
- fuzzy filename matching,
- choosing among multiple candidate baselines,
- heuristics based on neighboring snapshots.

## Fallback Behavior

If the exact resolved path does not exist:

- do not attach a baseline image,
- keep the assertion as `declared-only`,
- continue rendering the current `Passed Visual Assertion` UI.

This keeps the UI truthful: every rendered baseline is exact, not guessed.

## Data Flow

1. Reporter extracts screenshot declarations from runtime Playwright steps.
2. Reporter passes structured declaration data and test metadata into the snapshot resolver.
3. Resolver returns zero or more exact resolved baseline files.
4. Reporter copies any resolved baseline into `screenshotDir/<test-id>/<visual-name>-expected.png`.
5. Existing attachment-to-image mapping continues to produce `baseline-only` image records.
6. Unresolved declarations still flow into state as `declared-only` through the existing visual-name path.

No browser payload schema change is required beyond what already exists for attachments and declared visual names.

## Files Likely to Change

1. `src/reporter.ts`
   - replace hardcoded baseline path construction with resolver calls
   - thread new reporter options into resolver config

2. `src/reporter-utils.ts`
   - emit richer screenshot declaration metadata
   - preserve stable `visualName` generation for named and unnamed cases

3. `src/snapshot-path-resolver.ts`
   - new shared resolver module implementing named and unnamed path logic

4. `tests/offline.test.ts`
   - reporter-level baseline resolution coverage

5. new focused resolver tests, e.g. `tests/snapshot-path-resolver.test.ts`
   - deterministic resolution coverage for named and unnamed cases

6. `README.md`
   - document new reporter options and exact-fallback behavior

## Testing Strategy

### Unit tests

Add focused resolver coverage for:

- named screenshots with default layout,
- empty project name,
- nested names like `dir/header.png`,
- duplicate named assertions in one test,
- custom `playwrightSnapshotPathTemplate`,
- custom `playwrightToHaveScreenshotPathTemplate`,
- first unnamed assertion,
- multiple unnamed assertions in one test,
- title sanitization,
- long title trimming,
- token expansion for project/platform/suffix,
- exact fallback when file is missing.

### Reporter integration tests

Verify that:

- named resolved baselines become `*-expected.png` attachments,
- unnamed resolved baselines also become `*-expected.png` attachments,
- unresolved assertions stay `declared-only`,
- no incorrect baseline is attached when path resolution fails.

### UI behavior tests

Keep UI tests lightweight:

- `baseline-only` still renders the image,
- `declared-only` still renders the explanatory card,
- non-screenshot test behavior does not change.

## Documentation Changes

Update `README.md` to:

- explain that passed screenshot assertions can show resolved baselines for named screenshots and for unnamed screenshots when exact resolution succeeds,
- document the new reporter options for custom snapshot templates,
- explicitly state that Crvy Rprtr does not auto-read Playwright config for template discovery,
- explain fallback behavior:
  - exact match found -> baseline image shown,
  - exact match not found -> `Passed Visual Assertion`.

## Rollout Constraints

1. Preserve backward compatibility for users on the default Playwright snapshot layout.
2. Keep custom-layout support explicit via reporter options.
3. Avoid depending on Playwright private runtime imports in production code beyond mirrored local logic.
4. Keep all Playwright-resolution assumptions isolated in one module so future Playwright drift is easy to update.

## Success Criteria

This design is successful if:

1. passed named screenshots reliably show their baselines,
2. passed unnamed screenshots show baselines when exact mirrored resolution succeeds,
3. no guessed or wrong baselines are shown,
4. unresolved assertions retain the current truthful fallback UX,
5. default-layout users get improved behavior without extra setup,
6. non-screenshot test visibility remains intentionally unchanged.
