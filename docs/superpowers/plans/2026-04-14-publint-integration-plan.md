# Publint Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add publint validation to CI (non-blocking warning) and prepublishOnly (hard gate)

**Architecture:** Install publint as a dev dependency, integrate it into check.sh as a parallel check that silently skips when dist/ doesn't exist, and chain it in prepublishOnly after build.

**Tech Stack:** publint, bash (check.sh), npm scripts

---

### Task 1: Add publint dev dependency

**Files:**

- Modify: `package.json:78-94`

- [ ] **Step 1: Add publint to devDependencies**

```json
"publint": "^0.3.18"
```

Add this entry in devDependencies after the existing entries. Use the latest version compatible with Node 22+ and Bun.

- [ ] **Step 2: Install the dependency**

Run: `bun install`

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb && git commit -m "deps: add publint for package.json validation"
```

---

### Task 2: Add publint to check.sh CI script

**Files:**

- Modify: `scripts/check.sh:52`

- [ ] **Step 1: Read current check.sh to find the checks array**

The checks array on line 52 contains: `("lint" "typecheck" "format:check")` for staged mode and line 132 contains: `("lint" "typecheck" "format:check" "knip" "test:bun" "duplicates")` for full mode.

- [ ] **Step 2: Add publint to the full-mode checks array (line 132)**

Add `"publint"` to the checks array. The publint check should be non-blocking - it reports issues but never fails the build. This means the script should capture its exit code but not increment `failed` when publint exits non-zero.

**Implementation approach:** Add publint to checks array, but modify the result-checking logic to treat publint's exit code specially - always mark it as passed even if it fails. Alternatively, run publint in a separate subshell that always exits 0 but captures output.

```bash
# Addpublint to checks array
checks=("lint" "typecheck" "format:check" "knip" "test:bun" "duplicates" "publint")
```

And in the result-checking loop, add special handling:

```bash
# For publint, dist/ must exist to run meaningful validation
# Skip if dist/ doesn't exist yet
if [ "$check" = "publint" ]; then
  if [ ! -d "./dist" ]; then
    echo "ℹ publint skipped (dist/ not found)"
    continue
  fi
  #publint always reports issues but we treat it as non-blocking in CI
fi
```

- [ ] **Step 3: Test the publint check manually**

Run: `bunx publint`
Verify it runs and outputs validation results.

- [ ] **Step 4: Commit**

```bash
git add scripts/check.sh && git commit -m "ci: add publint as non-blocking check in check.sh"
```

---

### Task 3: Update prepublishOnly script

**Files:**

- Modify: `package.json:70`

- [ ] **Step 1: Update prepublishOnly to chain publint**

Change from:

```json
"prepublishOnly": "bun run build"
```

To:

```json
"prepublishOnly": "bun run build && bunx publint"
```

- [ ] **Step 2: Test the prepublishOnly logic manually**

Run: `bun run build && bunx publint`
Verify both commands execute and publint runs after build.

- [ ] **Step 3: Commit**

```bash
git add package.json && git commit -m "pub: chain publint after build in prepublishOnly"
```

---

### Task 4: Verify full integration

- [ ] **Step 1: Run check script to verify publint integration**

Run: `./scripts/check.sh`
Verify publint runs and reports any package.json issues without failing the build.

- [ ] **Step 2: Verify with staged files**

Run: `./scripts/check.sh --staged`
Verify the staged check also includes publint when relevant files change.

---

### Task 5: Review spec coverage

- [ ] Spec coverage check:
  - [x] CI non-blocking warning — Task 2 implements this
  - [x] prepublishOnly hard gate — Task 3 implements this
  - [x] dist/ existence handling — Task 2 implements this with silent skip
  - [x] Commit the design doc — Done

**Placeholder scan:** No TBD/TODO found. All steps have actual content.

**Type consistency:** N/A — this is bash/npm changes, no type consistency concerns.
