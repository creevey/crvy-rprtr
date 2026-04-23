# Fix CJS Require Resolution for Playwright Reporter Loading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@crvy/rprtr` loadable by Playwright's CJS `require.resolve()` reporter resolution by producing dual ESM + CJS builds and adding `"require"` export conditions to `package.json`.

**Architecture:** Playwright resolves reporter package paths via `require.resolve()` at config load time (`config.js:199`). When a package declares `"exports"` with only `"import"` conditions, CJS resolution fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The fix is to build CJS versions of the server-side entry points (`reporter.js`, `server.js`) as self-contained bundles using `.cjs` extension (required since `"type": "module"` makes `.js` = ESM), and add `"require"` conditions to `package.json` exports pointing to these `.cjs` files.

**Tech Stack:** esbuild (already in use), Bun, TypeScript

---

### Task 1: Add CJS build step for reporter and server entry points

**Files:**

- Modify: `build.ts:29-39`

The existing ESM build uses `splitting: true` which produces shared chunks. CJS doesn't support ES `import`/`export` in chunks, so the CJS build must be self-contained bundles (no splitting). We add a second esbuild call that outputs `reporter.cjs` and `server.cjs` in CJS format.

- [ ] **Step 1: Add CJS build after the existing ESM server-side build**

```ts
// Build CJS versions of server-side entry points (for require resolution in Playwright)
await build({
  entryPoints: ['./src/reporter.ts', './src/server.ts'],
  bundle: true,
  outdir: './dist',
  format: 'cjs',
  target: 'es2022',
  platform: 'node',
  packages: 'external',
  outExtension: { '.js': '.cjs' },
})
```

- [ ] **Step 2: Run build to verify it produces `.cjs` files**

Run: `bun run build`
Expected: `dist/reporter.cjs` and `dist/server.cjs` exist

- [ ] **Step 3: Commit**

```bash
git add build.ts
git commit -m "feat: add CJS build for reporter and server entry points"
```

---

### Task 2: Update package.json exports with `"require"` conditions

**Files:**

- Modify: `package.json:34-46`

Add `"require"` conditions pointing to the `.cjs` files. Also add a `"default"` condition as a universal fallback (matches both ESM and CJS consumers when no specific condition matches).

- [ ] **Step 1: Update exports field**

```json
{
  "exports": {
    ".": {
      "types": "./dist/reporter.d.ts",
      "import": "./dist/reporter.js",
      "require": "./dist/reporter.cjs",
      "default": "./dist/reporter.cjs"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js",
      "require": "./dist/server.cjs",
      "default": "./dist/server.cjs"
    },
    "./types": {
      "types": "./dist/types.d.ts"
    }
  }
}
```

- [ ] **Step 2: Verify CJS resolution works**

Run: `cd smoke-test && node -e "require('@crvy/rprtr')"`
Expected: No error (previously threw `ERR_PACKAGE_PATH_NOT_EXPORTED`)

- [ ] **Step 3: Verify ESM resolution still works**

Run: `cd smoke-test && node -e "import('@crvy/rprtr').then(m => console.log('ESM OK:', Object.keys(m)))"`
Expected: `ESM OK: [ 'CrvyRprtr', 'default' ]`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add require export conditions for CJS resolution"
```

---

### Task 3: Verify full Playwright reporter loading works

**Files:**

- Test: `smoke-test/`

- [ ] **Step 1: Reinstall smoke-test dependencies with updated package**

Run: `cd smoke-test && rm -rf node_modules && npm install`
Expected: Successful install

- [ ] **Step 2: Verify CJS require resolves**

Run: `cd smoke-test && node -e "console.log(require.resolve('@crvy/rprtr'))"`
Expected: Path ending in `dist/reporter.cjs`

- [ ] **Step 3: Verify ESM import resolves**

Run: `cd smoke-test && node -e "import('@crvy/rprtr').then(m => console.log(Object.keys(m)))"`
Expected: `[ 'CrvyRprtr', 'default' ]`

- [ ] **Step 4: Run Playwright with the reporter**

Run: `cd smoke-test && npx playwright test`
Expected: Tests run and reporter loads without `ERR_PACKAGE_PATH_NOT_EXPORTED`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add smoke test for CJS/ESM dual resolution"
```

---

### Task 4: Run typecheck and lint

**Files:**

- None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: No errors

---

### Task 5: Clean up smoke-test project

**Files:**

- Delete: `smoke-test/`

The smoke-test was created for local reproduction only. It references the package via `file:..` which won't work for other consumers and shouldn't be shipped.

- [ ] **Step 1: Remove smoke-test directory**

Run: `rm -rf smoke-test`
Expected: Directory removed

- [ ] **Step 2: Verify smoke-test is not in git**

Run: `git status`
Expected: `smoke-test/` not listed (it should be gitignored or absent)

- [ ] **Step 3: If not gitignored, add to .gitignore**

Add `smoke-test/` to `.gitignore` if not already present.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove local smoke-test project"
```
