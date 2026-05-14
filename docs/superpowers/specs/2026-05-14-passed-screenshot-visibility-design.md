# Passed Screenshot Visibility Design

**Date:** 2026-05-14
**Topic:** Show Playwright screenshot assertions for passed tests in Crvy Rprtr

## Overview

Crvy Rprtr currently depends on Playwright result attachments to decide whether a test has reviewable screenshots. This breaks down for passed `toHaveScreenshot()` assertions because Playwright does not attach successful screenshot artifacts to `TestResult.attachments` or `TestStep.attachments`. As a result, a passed visual assertion is either hidden entirely or shown only when Crvy Rprtr can independently copy the baseline snapshot into its own screenshot directory.

This design formalizes a two-phase recommendation:

1. Implement a reporter-only, zero-test-changes Phase 1 that keeps passed visual assertions visible with honest UX labels, reconciles baseline files from the screenshot directory, and live-refreshes the UI when reports or copied screenshots change.
2. Keep an explicit test-runtime capture helper as a follow-up Phase 2 for teams that need true passed `actual` screenshots and support for customized Playwright snapshot path templates.

## Research Summary

### Verified Playwright constraints

- Successful `toHaveScreenshot()` assertions do not attach `-expected`, `-actual`, or `-diff` files to the reporter result payload.
- Playwright's newer reporter API exposes `TestStep.attachments`, but only for artifacts that were explicitly attached during step execution.
- The screenshot matcher attaches files only in missing-snapshot and mismatch paths; the success path returns without attachments.
- Exact snapshot resolution for custom `snapshotPathTemplate` / `expect.toHaveScreenshot.pathTemplate` is available inside the test runtime via `test.info().snapshotPath(...)`, but not as a directly resolved reporter API value.

### Current Crvy Rprtr behavior

- The reporter already extracts screenshot names from result steps and copies baseline snapshot files into `screenshotDir/<test-id>/<name>-expected` for passed tests when it can derive the default snapshot path.
- The UI can render baseline-only screenshot entries because it already accepts images with `expect` but no `actual` or `diff`.
- The server loads `report.json` and offline reports on startup, but it does not watch `report.json`, offline report files, or the screenshot directory for changes after startup.
- When baseline resolution fails, the test still has no visual artifact record and can disappear from the sidebar because the current UI filters on `hasScreenshots(...)`.

## Goals

1. Keep passed screenshot assertions visible in the UI without requiring users to rewrite existing tests.
2. Distinguish between full comparison data and baseline-only fallback data so the UI does not imply a comparison that never existed.
3. Keep the UI up to date when offline report files or copied screenshot artifacts appear after the server has already started.
4. Preserve approval behavior for failed comparisons without widening scope into approval of baseline-only or declared-only pass records.

## Non-Goals

1. Re-implement Playwright's screenshot matcher.
2. Invent a reporter-only mechanism that always resolves custom snapshot path templates.
3. Capture a real passed `actual` screenshot in Phase 1.
4. Change the public Crvy Rprtr server API beyond the additions needed for passed visual metadata.

## Solution Variants Considered

### Variant A: Reporter-only baseline discovery and UX hardening

Continue using step titles to detect screenshot assertions, copy baseline snapshots into Crvy Rprtr's screenshot directory when possible, and add explicit metadata for screenshot assertions even when no file can be resolved.

**Pros**

- No test changes for existing users.
- Works with current reporter architecture.
- Preserves low-friction adoption.

**Cons**

- Cannot show the true passed `actual` image.
- Snapshot resolution is heuristic when users customize Playwright path templates.

### Variant B: Test-runtime helper or fixture

Introduce an opt-in helper that wraps `toHaveScreenshot()`, resolves the exact snapshot path with `test.info().snapshotPath(...)`, and explicitly attaches or records the desired artifacts.

**Pros**

- Correct for custom snapshot templates.
- Can capture true passed `actual` screenshots.
- Uses Playwright APIs exactly where they are strongest.

**Cons**

- Requires test adoption.
- Not a drop-in fix for existing suites.

### Variant C: Sidecar manifest written from test runtime

Write a small manifest alongside Playwright execution that records screenshot assertion names and resolved paths, then merge it with Crvy Rprtr report data.

**Pros**

- Accurate path resolution.
- Decouples path fidelity from reporter attachments.

**Cons**

- More moving parts than Variant B.
- Still requires test-runtime participation.

### Variant D: Watch report files only

Refresh the UI when `report.json` or offline reports change, but do not change the visual artifact model.

**Pros**

- Smallest change.

**Cons**

- Does not solve missing passed artifacts.
- Leaves successful visual assertions hidden when no copied baseline exists.

## Recommendation

Adopt Variant A as the primary implementation and explicitly reserve Variant B as a follow-up enhancement.

This gives Crvy Rprtr a useful, truthful Phase 1:

- passed visual assertions remain visible,
- baseline-only fallbacks are clearly labeled,
- unresolved assertions still appear as visual cases with an explanatory empty state,
- report and screenshot directory changes show up live while the server is running.

Teams that later need exact passed `actual` screenshots or custom template support can opt into the helper-based Phase 2 without discarding the Phase 1 UX work.

## Detailed Design

### 1. Visual record model

The current `Images` type treats `actual` as a required string and uses an empty string for baseline-only pass entries. Phase 1 should make the model explicit.

Each image record should carry a source classification:

- `comparison`: has `actual` and usually `diff`, produced from a failing or updated comparison.
- `baseline-only`: has `expect`, but no `actual`, because Crvy Rprtr copied the baseline as a fallback for a passed assertion.
- `declared-only`: the reporter detected a screenshot assertion name, but no artifact file could be resolved.

This change lets the UI distinguish three very different states that are currently collapsed into “has screenshots” versus “does not have screenshots”.

### 2. Reporter payload enrichment

`onTestEnd` should send two separate concepts:

- `attachments`: concrete copied files in Crvy Rprtr's screenshot directory.
- `visualNames`: screenshot assertion names extracted from Playwright result steps.

The key design point is that `visualNames` must be sent even when baseline copying fails. That is what allows a passed screenshot assertion to remain visible as `declared-only` instead of silently disappearing.

### 3. State reconciliation

The report-state layer should build image records in this order:

1. Convert concrete attachments into image entries.
2. Add baseline-only metadata when only an expected image exists.
3. Add declared-only placeholders for `visualNames` that do not have any resolved artifact.
4. Preserve previous passing image records for reruns only when the current payload contains no newer artifact for that image name.

This keeps the current “preserve prior passing images” behavior, but makes it type-safe and intentional.

### 4. Live refresh and filesystem watching

The server should watch three sources after startup:

- the main `report.json` file,
- the offline report directory for `crvy-rprtr*.json` files,
- the screenshot directory for copied `*-expected`, `*-actual`, and `*-diff` files.

On change, the server should debounce a reload, rebuild report data from disk, and broadcast a `sync` payload to connected browsers. This solves the practical issue where the server starts before all offline reports or copied baselines exist.

### 5. UI behavior

#### Sidebar and tree

- Continue showing tests that have any visual record, including `declared-only`.
- Add lightweight labeling for baseline-only pass records so users understand they are looking at the reference image, not a fresh capture.

#### Results view

- `comparison`: keep existing compare views.
- `baseline-only`: show only the expected image and a short note such as “Baseline copied from snapshot; Playwright did not emit a passed actual image.”
- `declared-only`: show an empty state that explains the screenshot assertion ran, but Crvy Rprtr could not resolve a file. The message should point users toward the future helper mode for full passed-actual capture.

#### Approval behavior

- Approval remains enabled only for failed comparisons with `actual` images.
- Baseline-only and declared-only pass records are informational, not approval targets.

## Phase 2 Follow-up: Explicit Capture Helper

Phase 2 should introduce an opt-in helper or fixture that wraps Playwright screenshot assertions and records exact artifact paths via test runtime APIs.

The helper should:

1. call `test.info().snapshotPath(name, { kind: 'screenshot' })` for exact expected path resolution,
2. optionally capture a display-only passed `actual` screenshot,
3. attach or emit those artifacts explicitly so the reporter no longer depends on heuristic snapshot path reconstruction.

This phase is intentionally deferred because it requires an adoption path and public API design, while Phase 1 can improve UX immediately for current users.

## Files Likely to Change in Phase 1

1. `src/reporter.ts` — emit `visualNames` and keep baseline-copy fallback.
2. `src/reporter-utils.ts` — normalize screenshot name extraction for nested steps.
3. `src/types.ts` — add explicit visual-source semantics.
4. `src/schemas.ts` — extend payload schemas with `visualNames` and richer image metadata.
5. `src/report-utils.ts` — classify attachment-derived image records.
6. `src/report-state.ts` — merge attachments, baseline-only, declared-only, and preserved pass data.
7. `src/server/app.ts` — add watcher bootstrap and sync reload.
8. `src/client/components/Sidebar.svelte` — improve discoverability language.
9. `src/client/components/ResultsPage.svelte` — render baseline-only and declared-only states clearly.
10. `src/client/components/SideBySideView.svelte` — support informational labels for baseline-only rendering.
11. `tests/offline.test.ts` — reporter payload coverage.
12. `tests/offline-reports.test.ts` and new focused state tests — merge/reconciliation coverage.

## Verification Criteria

After Phase 1 implementation:

1. A passed screenshot assertion with a resolvable baseline appears in the sidebar and results view as `baseline-only`.
2. A passed screenshot assertion with no resolvable file still appears in the sidebar and shows a declared-only empty state.
3. Failed screenshot assertions keep current approval behavior.
4. Starting the server before offline reports or copied baselines exist no longer requires a manual restart to see new visual entries.
