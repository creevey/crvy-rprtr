<script lang="ts">
  import type { CreeveySuite, CreeveyTest, Images, ImagesViewMode } from '../types';
  import { useCreeveyContext } from './CreeveyContext.ts';
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
        imageName = keys[0] ?? '';
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

{#snippet TestItem(item: CreeveySuite | CreeveyTest, level: number, selectedId: string | undefined, onSelect: (test: CreeveyTest) => void, onOpen: (path: string[], opened: boolean) => void, onToggle: (path: string[], checked: boolean) => void)}
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

{#snippet ImageViewer(image: Images | null | undefined, viewMode: ImagesViewMode, swapActive: boolean, onSwapToggle: () => void)}
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
