<script lang="ts">
  import type { CreeveyTest, ImagesViewMode, Images } from '../../types';
  import { viewModes, VIEW_MODE_KEY } from '../viewMode';
  import { cn } from '../cn';
  import SlideView from './SlideView.svelte';

  interface Props {
    test: CreeveyTest;
    retry: number;
    imageName: string;
    viewMode: ImagesViewMode;
    canApprove: boolean;
    onImageChange: (name: string) => void;
    onRetryChange: (retry: number) => void;
    onViewModeChange: (mode: ImagesViewMode) => void;
  }

  let { test, retry, imageName, viewMode, canApprove, onImageChange, onRetryChange, onViewModeChange }: Props = $props();

  let swapActive = $state(false);

  let result = $derived(test.results?.[retry - 1]);
  let image = $derived(result?.images?.[imageName] ?? null);
  let imageNames = $derived(result?.images ? Object.keys(result.images) : []);
  let totalRetries = $derived(test.results?.length ?? 0);
  let hasDiffAndExpect = $derived(canApprove && Boolean(image?.diff && image?.expect));

  let imagesWithError = $derived(
    result?.images
      ? Object.keys(result.images).filter(
          (name) =>
            result!.status !== 'success' &&
            test.approved?.[name] !== retry - 1 &&
            result!.images?.[name]?.error != null,
        )
      : []
  );

  function handleKeydown(e: KeyboardEvent): void {
    if (e.code === 'Space' && viewMode === 'swap') {
      e.preventDefault();
      swapActive = !swapActive;
    }
    if (e.code === 'Tab' && hasDiffAndExpect) {
      e.preventDefault();
      const idx = viewModes.indexOf(viewMode);
      if (e.shiftKey) {
        onViewModeChange(viewModes.at((idx - 1) % viewModes.length)!);
      } else {
        onViewModeChange(viewModes.at((idx + 1) % viewModes.length)!);
      }
    }
  }

  $effect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  });

  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="py-3 px-5 bg-surface-alt border-b border-edge flex items-start justify-between gap-4 shrink-0">
    <div class="min-w-0">
      <h2 class="text-[15px] text-fg-bright m-0 mb-1 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
        {test.testName ?? test.storyId}
      </h2>
      {#if result?.error}
        <div class="text-xs text-error mb-2 px-2 py-1 bg-error/10 rounded-sm max-h-[60px] overflow-y-auto whitespace-pre-wrap font-mono">
          {result.error}
        </div>
      {/if}
      {#if imageNames.length > 1}
        <div class="flex gap-1 flex-wrap">
          {#each imageNames as name}
            <button
              class={cn(
                'px-2.5 py-[3px] bg-surface-input border rounded-sm text-fg text-xs cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent',
                name === imageName ? 'bg-accent border-accent text-white' : 'border-edge',
                imagesWithError.includes(name) && 'border-error',
              )}
              onclick={() => onImageChange(name)}
            >
              {name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {#if hasDiffAndExpect}
      <div class="flex shrink-0">
        {#each viewModes as mode, i}
          <button
            class={cn(
              'px-2.5 py-1 bg-surface-input border border-edge text-fg text-[11px] cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent',
              i === 0 && 'rounded-l',
              i === viewModes.length - 1 && 'rounded-r',
              viewMode === mode && 'bg-accent border-accent text-white',
            )}
            onclick={() => onViewModeChange(mode)}
          >
            {mode}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Body -->
  <div class="flex-1 overflow-auto p-4 min-h-0">
    {#if !image}
      <div class="flex-1 flex items-center justify-center text-fg-muted text-base">No image to display</div>
    {:else if viewMode === 'side-by-side' || !hasDiffAndExpect}
      <div class="flex flex-row gap-3 min-h-full">
        {#if image.expect}
          <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden min-w-0">
            <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">Expected</h3>
            <img src={image.expect} alt="Expected" class="w-full object-contain block" />
          </div>
        {/if}
        {#if image.actual}
          <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden min-w-0">
            <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">Actual</h3>
            <img src={image.actual} alt="Actual" class="w-full object-contain block" />
          </div>
        {/if}
        {#if image.diff}
          <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden min-w-0">
            <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">Diff</h3>
            <img src={image.diff} alt="Diff" class="w-full object-contain block" />
          </div>
        {/if}
      </div>
    {:else if viewMode === 'swap'}
      <div class="flex flex-col gap-3 min-h-full">
        <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden max-w-[800px]">
          <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">
            Swap View (click or press Space)
          </h3>
          <div
            class="relative cursor-pointer min-h-[100px]"
            onclick={() => swapActive = !swapActive}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') swapActive = !swapActive; }}
            role="button"
            tabindex="0"
          >
            {#if image.expect}
              <img
                src={image.expect}
                alt="Expected"
                class="w-full block transition-opacity"
                style:opacity={swapActive ? 0 : 1}
              />
            {/if}
            {#if image.actual}
              <img
                src={image.actual}
                alt="Actual"
                class="absolute inset-0 w-full block transition-opacity"
                style:opacity={swapActive ? 1 : 0}
              />
            {/if}
          </div>
        </div>
      </div>
    {:else if viewMode === 'slide'}
      <div class="flex flex-col gap-3 min-h-full">
        {#if image.actual && image.expect && image.diff}
          <SlideView actual={image.actual} expect={image.expect} diff={image.diff} />
        {:else if image.actual}
          <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden min-w-0">
            <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">Actual</h3>
            <img src={image.actual} alt="Actual" class="w-full object-contain block" />
          </div>
        {/if}
      </div>
    {:else if viewMode === 'blend'}
      <div class="flex flex-col gap-3 min-h-full">
        <div class="flex-1 flex flex-col bg-surface-panel rounded-md overflow-hidden max-w-[800px]">
          <h3 class="m-0 px-3 py-2 text-xs font-medium bg-surface-panel-hd text-fg-bright uppercase tracking-wider">
            Blend (Difference)
          </h3>
          <div class="relative min-h-[100px]">
            {#if image.expect}
              <img src={image.expect} alt="Expected" class="w-full block" />
            {/if}
            {#if image.actual}
              <img src={image.actual} alt="Actual" class="absolute inset-0 w-full mix-blend-difference invert" />
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Footer -->
  {#if totalRetries > 1}
    <div class="py-2 px-5 bg-surface-alt border-t border-edge flex items-center justify-center gap-1 shrink-0">
      <button
        class={cn(
          'min-w-7 h-7 flex items-center justify-center bg-surface-input border border-edge rounded text-fg text-xs cursor-pointer transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent',
          retry <= 1 && 'opacity-30 cursor-not-allowed',
        )}
        disabled={retry <= 1}
        aria-label="Previous retry"
        onclick={() => onRetryChange(retry - 1)}
      >
        &#8249;
      </button>
      <div class="flex gap-0.5 items-center">
        {#each Array.from({ length: totalRetries }, (_, i) => i + 1) as page}
          {#if totalRetries <= 7 || page === 1 || page === totalRetries || Math.abs(page - retry) <= 1}
            <button
              class={cn(
                'min-w-7 h-7 flex items-center justify-center border rounded text-xs cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-accent',
                page === retry
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface-input border-edge text-fg hover:bg-surface-hover',
              )}
              onclick={() => onRetryChange(page)}
            >
              {page}
            </button>
          {:else if page === 2 || page === totalRetries - 1}
            <span class="px-1 text-fg-muted text-xs">{"\u2026"}</span>
          {/if}
        {/each}
      </div>
      <button
        class={cn(
          'min-w-7 h-7 flex items-center justify-center bg-surface-input border border-edge rounded text-fg text-xs cursor-pointer transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent',
          retry >= totalRetries && 'opacity-30 cursor-not-allowed',
        )}
        disabled={retry >= totalRetries}
        aria-label="Next retry"
        onclick={() => onRetryChange(retry + 1)}
      >
        &#8250;
      </button>
    </div>
  {/if}
</div>
