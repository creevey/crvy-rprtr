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
import { mount } from 'svelte';
import { App } from './client/App.svelte';

const root = document.getElementById('root')!;
mount(App, { target: root });
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
  
  let selectedTest = $state<CreeveyTest | null>(null);
  let retry = $state(0);
  let imageName = $state('');
  let viewMode = $state<ImagesViewMode>('side-by-side');
  
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

  function handleApprove() {
    if (selectedTest && canApprove) {
      onApprove(selectedTest.id, retry - 1, imageName);
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
      </div>
    </div>
    <div class="test-list">
      {#each Object.values(tests.children).filter(Boolean) as child}
        {@render TestItem(
          child as CreeveySuite | CreeveyTest,
          0,
          selectedTest?.id,
          handleSelectTest
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
        <ImageViewer image={currentImage} {viewMode} />
      </div>
      <div class="footer">
        <span class="nav-hint">Use arrow keys to navigate</span>
        <button class="approve-btn" disabled={!canApprove} onclick={handleApprove}>
          {canApprove ? 'Approve' : 'Approved'}
        </button>
      </div>
    {:else}
      <div class="empty-state">Select a test to view results</div>
    {/if}
  </div>
</div>

{#snippet TestItem(item, level, selectedId, onSelect)}
  {@const isTestItem = isTest(item)}
  {@const hasChildren = !isTestItem && Object.keys(item.children).length > 0}
  <div
    class="test-item {selectedId && isTestItem && item.id === selectedId ? 'selected' : ''}"
    style="padding-left: {16 + level * 16}px"
    onclick={() => isTestItem ? onSelect(item) : (item.opened = !item.opened)}
    role="button"
    tabindex="0"
  >
    {#if hasChildren}
      <span class="chevron {item.opened ? 'expanded' : ''}">▶</span>
    {/if}
    <input
      type="checkbox"
      class="checkbox"
      checked={item.checked}
      onclick={(e) => e.stopPropagation()}
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
      {@render TestItem(child as CreeveySuite | CreeveyTest, level + 1, selectedId, onSelect)}
    {/each}
  {/if}
{/snippet}

{#snippet ImageViewer(props)}
  {@const { image, viewMode } = props}
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

  export function createCreeveyContext(initial: CreeveyContextType): CreeveyContextType {
    return initial;
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
