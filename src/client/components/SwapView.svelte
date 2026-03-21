<script lang="ts">
  import type { Images } from '../../types';
  import { cn } from '../cn';

  interface Props {
    image: Partial<Images>;
  }

  let { image }: Props = $props();

  let swapActive = $state(false);

  function toggle(): void {
    swapActive = !swapActive;
  }
</script>

<svelte:window onkeydown={(e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } }} />

<div class="flex flex-col gap-3 items-center">
  <div class={cn(
    'flex flex-col bg-surface-panel rounded-md overflow-hidden border-2 w-fit max-w-full',
    swapActive ? 'border-red-500/60' : 'border-green-500/60',
  )}>
    <h3 class={cn(
      'm-0 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors',
      swapActive ? 'bg-red-500/25 text-red-800 dark:text-red-400' : 'bg-green-500/25 text-green-800 dark:text-green-400',
    )}>
      {swapActive ? 'Actual' : 'Expected'} (click or press Space)
    </h3>
    <div
      class="relative cursor-pointer p-2"
      onclick={toggle}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
      role="button"
      tabindex="0"
    >
      {#if image.expect}
        <img
          src={image.expect}
          alt="Expected"
          class="block transition-opacity w-auto max-w-full mx-auto"
          style:opacity={swapActive ? 0 : 1}
        />
      {/if}
      {#if image.actual}
        <img
          src={image.actual}
          alt="Actual"
          class="absolute inset-2 block transition-opacity w-auto max-w-full mx-auto"
          style:opacity={swapActive ? 1 : 0}
        />
      {/if}
    </div>
  </div>
</div>
