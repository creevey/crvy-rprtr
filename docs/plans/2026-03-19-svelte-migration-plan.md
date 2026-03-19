# Svelte 5 Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate creevey-reporter UI from React to Svelte 5 with runes, keeping Bun.serve API unchanged.

**Architecture:** Replace React components with Svelte 5 components using runes for state management. Bun.serve backend remains unchanged. CSS styles ported as-is.

**Tech Stack:** Svelte 5, Bun, TypeScript, oxlint, oxfmt

---

## Task 1: Install Svelte 5

**Files:**

- Modify: `package.json`

**Step 1: Add Svelte 5 dependency**

Run: `bun add svelte`

**Step 2: Verify installation**

Run: `bun pm ls svelte`
Expected: svelte@^5.x.x listed

---

## Task 2: Create Svelte Entry Point

**Files:**

- Create: `src/index.ts`
- Delete: `src/index.tsx`

**Step 1: Create index.ts**

```typescript
import { mount } from "svelte";
import { provideCreeveyContext } from "./client/CreeveyContext.svelte";
import { App } from "./client/App.svelte";
import type { CreeveySuite, CreeveyTest, TestData } from "./types.js";

interface InitialState {
  tests: CreeveySuite;
  isReport: boolean;
  isUpdateMode: boolean;
}

async function loadReportData(): Promise<InitialState> {
  const response = await fetch("/api/report");
  const data = await response.json();
  return {
    tests: treeifyTests(data.tests as Record<string, TestData>),
    isReport: true,
    isUpdateMode: data.isUpdateMode ?? false,
  };
}

function treeifyTests(testsById: Record<string, TestData>): CreeveySuite {
  const rootSuite: CreeveySuite = {
    path: [],
    skip: false,
    opened: true,
    checked: true,
    indeterminate: false,
    children: {},
  };

  Object.values(testsById).forEach((test) => {
    if (!test) return;

    const storyPath = test.storyPath ?? [];
    const browser = test.browser ?? "";
    const testName = test.testName;

    const pathParts: string[] = [...storyPath, testName, browser].filter((p): p is string =>
      Boolean(p),
    );
    const [browserName, ...testPathParts] = pathParts.reverse();
    if (!browserName) return;

    const lastSuite = testPathParts.reverse().reduce<CreeveySuite>((suite, token) => {
      if (!suite.children[token]) {
        suite.children[token] = {
          path: [...suite.path, token],
          skip: false,
          opened: false,
          checked: true,
          indeterminate: false,
          children: {},
        };
      }
      return suite.children[token] as CreeveySuite;
    }, rootSuite);

    lastSuite.children[browserName] = {
      ...test,
      checked: true,
    } as CreeveyTest;
  });

  return rootSuite;
}

const handleApprove = async (id: string, retry: number, image: string): Promise<void> => {
  await fetch("/api/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, retry, image }),
  });
  window.location.reload();
};

const handleApproveAll = async (): Promise<void> => {
  await fetch("/api/approve-all", { method: "POST" });
  window.location.reload();
};

provideCreeveyContext({
  isReport: true,
  isUpdateMode: false,
  onApproveAll: handleApproveAll,
});

const initialState = await loadReportData();

const root = document.getElementById("root")!;
mount(App, {
  target: root,
  props: {
    initialState,
    onApprove: handleApprove,
    onApproveAll: handleApproveAll,
  },
});
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors (Svelte needs proper tsconfig)

---

## Task 3: Configure TypeScript for Svelte

**Files:**

- Modify: `tsconfig.json`

**Step 1: Add Svelte compiler options**

```json
{
  "compilerOptions": {
    "types": ["svelte"],
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "module": "Preserve",
    "target": "ESNext",
    "lib": ["ESNext", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "allowJs": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"]
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

---

## Task 4: Create App.svelte Component

**Files:**

- Create: `src/client/App.svelte`

**Step 1: Write the component**

```svelte
<script lang="ts">
  import type { CreeveySuite, CreeveyTest, Images, ImagesViewMode } from '../types';
  import { useCreeveyContext } from './CreeveyContext.svelte';
  import './styles.css';

  interface Props {
    initialState: {
      tests: CreeveySuite;
      isReport: boolean;
      isUpdateMode: boolean;
    };
    onApprove: (id: string, retry: number, image: string) => void;
    onApproveAll: () => void;
  }

  let { initialState, onApprove, onApproveAll }: Props = $props();

  const { tests } = initialState;
  const { onSuiteOpen, onSuiteToggle } = useCreeveyContext();

  let selectedTest = $state<CreeveyTest | null>(null);
  let retry = $state(0);
  let imageName = $state('');
  let viewMode = $state<ImagesViewMode>('side-by-side');
  let swapActive = $state(false);

  let testResults = $derived(selectedTest?.results?.[retry - 1] ?? null);
  let currentImage = $derived(testResults?.images?.[imageName] ?? null);
  let canApprove = $derived(
    selectedTest && testResults && currentImage &&
    testResults.status !== 'success' &&
    selectedTest.approved?.[imageName] !== retry - 1
  );

  function handleSelectTest(test: CreeveyTest) {
    selectedTest = test;
    const r = test.results?.length ?? 0;
    retry = r;
    const images = test.results?.[r - 1]?.images;
    imageName = images ? Object.keys(images)[0] ?? '' : '';
  }

  function handleSuiteOpen(path: string[], opened: boolean) {
    onSuiteOpen(path, opened);
  }

  function handleSuiteToggle(path: string[], checked: boolean) {
    onSuiteToggle(path, checked);
  }

  function handleApprove() {
    if (selectedTest && canApprove) {
      onApprove(selectedTest.id, retry - 1, imageName);
    }
  }

  function handleSwapToggle() {
    swapActive = !swapActive;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === ' ' && viewMode === 'swap') {
      e.preventDefault();
      handleSwapToggle();
    }
  }

  $effect(() => {
    if (testResults?.images) {
      const keys = Object.keys(testResults.images);
      if (keys.length > 0 && !keys.includes(imageName)) {
        imageName = keys[0];
      }
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>Creevey Reporter</h1>
      <div class="tests-status">
        <div class="status-item">
          <span class="status-dot success"></span>
          <span>{countByStatus(tests, 'success')}</span>
        </div>
        <div class="status-item">
          <span class="status-dot failed"></span>
          <span>{countByStatus(tests, 'failed')}</span>
        </div>
        <div class="status-item">
          <span class="status-dot pending"></span>
          <span>{countByStatus(tests, 'pending')}</span>
        </div>
      </div>
    </div>
    <div class="test-list">
      {#each Object.values(tests.children).filter(Boolean) as child}
        {@render TestItem(
          child as CreeveySuite | CreeveyTest,
          0,
          selectedTest?.id,
          handleSelectTest,
          handleSuiteOpen,
          handleSuiteToggle
        )}
      {/each}
    </div>
  </div>
  <div class="main-content">
    {#if selectedTest && testResults}
      <div class="header">
        <div>
          <h2 class="header-title">{selectedTest.testName ?? selectedTest.storyId}</h2>
          {#if testResults.images && Object.keys(testResults.images).length > 1}
            <div class="image-tabs">
              {#each Object.keys(testResults.images) as name}
                <button
                  class="image-tab {name === imageName ? 'active' : ''}"
                  onclick={() => imageName = name}
                >
                  {name}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="view-modes">
          {#each (['side-by-side', 'swap', 'slide', 'blend'] as ImagesViewMode[]) as mode}
            <button
              class="view-mode-btn {viewMode === mode ? 'active' : ''}"
              onclick={() => viewMode = mode}
            >
              {mode}
            </button>
          {/each}
        </div>
      </div>
      <div class="content">
        {@render ImageViewer(currentImage, viewMode, swapActive, handleSwapToggle)}
      </div>
      <div class="footer">
        <span class="nav-hint">Use arrow keys to navigate, Enter to approve</span>
        <button class="approve-btn" disabled={!canApprove} onclick={handleApprove}>
          {canApprove ? 'Approve' : 'Approved'}
        </button>
      </div>
    {:else}
      <div class="empty-state">Select a test to view results</div>
    {/if}
  </div>
</div>

{#snippet TestItem(item, level, selectedId, onSelect, onOpen, onToggle)}
  {@const isTestItem = isTest(item)}
  {@const hasChildren = !isTestItem && Object.keys(item.children).length > 0}
  {@const suiteItem = item as CreeveySuite}
  <div
    class="test-item {selectedId && isTestItem && item.id === selectedId ? 'selected' : ''}"
    style="padding-left: {16 + level * 16}px"
    onclick={() => isTestItem ? onSelect(item) : onOpen(item.path, !item.opened)}
    role="button"
    tabindex="0"
    onkeydown={(e) => { if (e.key === 'Enter') { isTestItem ? onSelect(item) : onOpen(item.path, !item.opened); }}}
  >
    {#if hasChildren}
      <span class="chevron {item.opened ? 'expanded' : ''}">▶</span>
    {/if}
    <input
      type="checkbox"
      class="checkbox"
      checked={item.checked}
      onclick={(e) => e.stopPropagation()}
      onchange={(e) => { if (!isTestItem) onToggle(item.path, (e.target as HTMLInputElement).checked); }}
    />
    <span class="title">
      {isTestItem ? item.testName ?? item.storyId : item.path[item.path.length - 1] ?? 'Tests'}
    </span>
    {#if item.status}
      <span class="status-icon status-dot {item.status}"></span>
    {/if}
  </div>
  {#if !isTestItem && item.opened}
    {#each Object.values(item.children).filter(Boolean) as child}
      {@render TestItem(child as CreeveySuite | CreeveyTest, level + 1, selectedId, onSelect, onOpen, onToggle)}
    {/each}
  {/if}
{/snippet}

{#snippet ImageViewer(image, viewMode, swapActive, onSwapToggle)}
  {#if !image}
    <div class="empty-state">No image to display</div>
  {:else if viewMode === 'side-by-side'}
    <div class="image-container">
      {#if image.expect}
        <div class="image-panel">
          <h3>Expected</h3>
          <img src={image.expect} alt="Expected" />
        </div>
      {/if}
      {#if image.actual}
        <div class="image-panel">
          <h3>Actual</h3>
          <img src={image.actual} alt="Actual" />
        </div>
      {/if}
      {#if image.diff}
        <div class="image-panel">
          <h3>Diff</h3>
          <img src={image.diff} alt="Diff" />
        </div>
      {/if}
    </div>
  {:else if viewMode === 'swap'}
    <div class="image-container">
      <div class="image-panel" style="flex: 2">
        <h3>Swap View (click or press Space)</h3>
        <div
          style="position: relative; flex: 1; cursor: pointer;"
          onclick={onSwapToggle}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSwapToggle(); }}
        >
          {#if image.expect}
            <img
              src={image.expect}
              alt="Expected"
              style="position: absolute; top: 0; left: 0; width: 100%; opacity: {swapActive ? 0.5 : 1};"
            />
          {/if}
          {#if image.actual}
            <img
              src={image.actual}
              alt="Actual"
              style="position: absolute; top: 0; left: 0; width: 100%; opacity: {swapActive ? 1 : 0.5};"
            />
          {/if}
        </div>
      </div>
    </div>
  {:else if viewMode === 'blend'}
    <div class="image-container">
      <div class="image-panel" style="flex: 2">
        <h3>Blend (Difference)</h3>
        <div style="position: relative; flex: 1">
          {#if image.expect}
            <img src={image.expect} alt="Expected" style="position: absolute; top: 0; left: 0; width: 100%;" />
          {/if}
          {#if image.actual}
            <img src={image.actual} alt="Actual" style="position: absolute; top: 0; left: 0; width: 100%; mix-blend-mode: difference;" />
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="image-container">
      {#if image.actual}
        <div class="image-panel" style="flex: 2">
          <h3>Actual</h3>
          <img src={image.actual} alt="Actual" />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<script lang="ts" module>
  function isTest(x: unknown): x is CreeveyTest {
    return (
      x !== null &&
      typeof x === 'object' &&
      'id' in x &&
      'storyId' in x
    );
  }

  function countByStatus(suite: CreeveySuite, status: string): number {
    let count = 0;
    const stack: (CreeveySuite | CreeveyTest)[] = Object.values(suite.children).filter(Boolean) as (CreeveySuite | CreeveyTest)[];
    while (stack.length > 0) {
      const item = stack.pop();
      if (!item) continue;
      if (isTest(item)) {
        if (item.status === status) count++;
      } else {
        stack.push(...Object.values(item.children).filter(Boolean) as (CreeveySuite | CreeveyTest)[]);
      }
    }
    return count;
  }
</script>
```

---

## Task 5: Create CreeveyContext.svelte

**Files:**

- Create: `src/client/CreeveyContext.svelte`

**Step 1: Write the context**

```svelte
<script lang="ts" module>
  import type { CreeveySuite } from '../types';

  export interface CreeveyContextType {
    isReport: boolean;
    isRunning: boolean;
    isUpdateMode: boolean;
    onImageNext?: () => void;
    onImageApprove?: () => void;
    onApproveAll: () => void;
    onStart: (rootSuite: CreeveySuite) => void;
    onStop: () => void;
    onSuiteOpen: (path: string[], opened: boolean) => void;
    onSuiteToggle: (path: string[], checked: boolean) => void;
    sidebarFocusedItem: FocusableItem;
    setSidebarFocusedItem: (item: FocusableItem) => void;
  }

  export type FocusableItem = null | string[];

  const defaultContext: CreeveyContextType = {
    isReport: true,
    isRunning: false,
    isUpdateMode: false,
    onImageNext: undefined,
    onImageApprove: undefined,
    onApproveAll: () => {},
    onStart: () => {},
    onStop: () => {},
    onSuiteOpen: () => {},
    onSuiteToggle: () => {},
    sidebarFocusedItem: null,
    setSidebarFocusedItem: () => {},
  };

  export function createCreeveyContext(initial: Partial<CreeveyContextType> = {}): CreeveyContextType {
    return { ...defaultContext, ...initial };
  }
</script>

<script lang="ts">
  import { getContext, setContext } from 'svelte';
  import { createCreeveyContext, type CreeveyContextType, type FocusableItem } from './CreeveyContext.svelte';

  const CONTEXT_KEY = Symbol('creevey-context');

  export function provideCreeveyContext(initial?: Partial<CreeveyContextType>): void {
    setContext(CONTEXT_KEY, createCreeveyContext(initial));
  }

  export function useCreeveyContext(): CreeveyContextType {
    const ctx = getContext<CreeveyContextType>(CONTEXT_KEY);
    if (!ctx) {
      return createCreeveyContext();
    }
    return ctx;
  }
</script>
```

---

## Task 6: Update index.html for Svelte

**Files:**

- Modify: `index.html`

**Step 1: Update script reference**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Creevey Reporter</title>
    <link rel="stylesheet" href="/src/client/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/index.ts"></script>
  </body>
</html>
```

---

## Task 7: Update Server to Handle Svelte Files

**Files:**

- Modify: `src/server.ts`

**Step 1: Verify routes handle .ts files**

The existing routes should work since Bun can bundle Svelte. No changes expected.

**Step 2: Test dev server**

Run: `bun run dev`
Expected: Server starts without errors

---

## Task 8: Remove React Dependencies

**Files:**

- Modify: `package.json`
- Delete: `src/client/App.tsx`
- Delete: `src/client/CreeveyContext.tsx`

**Step 1: Remove React packages**

Run: `bun remove react react-dom @types/react`

**Step 2: Verify package.json**

```json
{
  "dependencies": {
    "svelte": "^5.x.x"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "oxfmt": "^0.41.0",
    "oxlint": "^1.56.0",
    "typescript": "^5.9.3"
  }
}
```

---

## Task 9: Run Full Verification

**Step 1: Typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 2: Lint**

Run: `bun run lint`
Expected: 0 warnings, 0 errors

**Step 3: Format**

Run: `bun run fmt`

**Step 4: Start server and verify UI**

Run: `bun run start`
Open: http://localhost:3000
Verify: UI renders correctly

---

## Task 10: Commit Migration

**Step 1: Stage changes**

Run: `git add -A && git status`

**Step 2: Commit**

```bash
git commit -m "feat: migrate UI from React to Svelte 5

- Replace React with Svelte 5 using runes for state
- Keep Bun.serve API unchanged
- Port styles as-is
- Use $state, $derived, $effect for reactivity"
```

---

## Execution Options

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
