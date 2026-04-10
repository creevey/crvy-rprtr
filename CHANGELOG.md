# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2026-04-10
## [0.0.1] - 2026-04-10

### Added

- Migrate UI from React to Svelte 5
- **reporter:** Implement offline mode for reporter
- **server:** Add offline report loading on startup
- Migrate React client to Svelte 5 with Tailwind CSS v4
- Improve server logging and add new view components
- Approve without page reload, update local state optimistically
- Rework slide view with per-side card frames and clip-path clipping
- Attach baseline screenshots for passing toHaveScreenshot tests
- Extract startServer function, add CLI entry point, fix static asset paths
- Build pipeline produces reporter, server, CLI, and type declarations
- Configure package.json for npm publishing
- Add live UI updates and Git LFS for screenshots
- Add packaged offline reporter UI

### Changed

- Consolidate into single package, fix Svelte build
- Remove CreeveyContext dependency, use local state for suite UI
- Replace Storybook naming with Playwright conventions
- Fix all lint errors, add zod schemas, modularize codebase
- Make CreeveySuite children optional and add helper functions
- Rename reporter to crvy rprtr
- Rename offline report files to shorter pattern

### Documentation

- Add offline mode documentation
- Rewrite README for package consumers

### Fixed

- Reporter WS queuing, treeify path, attachments→images mapping
- Type data field in OfflineEvent for type safety
- Address race condition and offline event persistence issues
- Correct assertion logic and rename misleading test
- Use fs/promises.writeFile instead of Bun.write in reporter
- Remove unused import and document offline mode limitations
- UI/UX polish — accessibility, responsive, visual design, build warning
- UI/UX polish — layout, accessibility, contrast, focus, counters
- Use CSS grid stacking in SwapView to fix image size mismatch
- Correct approve navigation, status update, baseline copy, and view fallback
- Update test selectors and refresh screenshot baselines
- Show successful screenshot tests in sidebar
- Show passing screenshot tests in report UI
- Remove stale tests on run-end and fix diff count log
- Remove incorrect baseline snapshot association and preserve images correctly
- Attach passing baseline as expected, not actual
- Reset approved flag when test fails with new diffs
- Show passing screenshot baselines after rerun
- Attach baselines for passing toHaveScreenshot tests via reporter
- Address publint and arethetypeswrong findings
- Use p-limit for concurrent file operations and fix eqeqeq errors
- Stabilize bun tests and offline fallback
- Resolve dist paths relative to test file in runtime-smoke tests
- Treat oxfmt exit code 2 as success in staged checks

### Miscellaneous

- Add MIT LICENSE
- Add advanced linting and code quality tools from papai
- Exclude CHANGELOG.md from oxfmt formatting

### Styling

- Format README, package.json, and tsconfig.build.json

### Testing

- Add offline mode tests
- Rewrite offline tests with meaningful behavior validation
- Add matrix CI integration test with worker-specific offline reports
- Remove offline report files test

### Ci

- Add GitHub Actions workflow for automated checks
## [Unreleased]
# test
