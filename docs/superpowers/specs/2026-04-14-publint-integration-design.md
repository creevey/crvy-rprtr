# Publint Integration Design

**Date:** 2026-04-14
**Topic:** Integrate publint for package.json validation

## Overview

Add `publint` to validate the package's `package.json` configuration against npm publishing standards. This catches issues like incorrect exports fields, missing types conditions, invalid bin shebangs, etc.

## Integration Points

### 1. CI (Non-blocking Warning)

Add `publint` to `check.sh` as a warning-only check that runs in parallel with other checks. It reports issues but never fails the build.

**Implementation:**

- Add `publint` to the checks array (but handle its exit code gracefully)
- If `dist/` doesn't exist, skip silently (publishable artifacts aren't built yet in CI)
- Report issues as warnings, not failures

### 2. `prepublishOnly` (Hard Gate)

Chain `publint` after `build` so publishing fails if there are errors.

**Implementation:**

```json
"prepublishOnly": "bun run build && bunx publint"
```

This ensures every publish is validated before it goes out.

## Files to Modify

1. `package.json` — Add `publint` dev dependency, update `prepublishOnly` script
2. `scripts/check.sh` — Add publint as a parallel check with graceful skip

## Verification

After implementation:

- `bun run check` should show publint output as a warning
- `npm publish` (or `bun publish`) should fail if publint finds errors
