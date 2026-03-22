<script lang="ts">
  import type { Images } from '../../types';

  interface Props {
    image: Partial<Images>;
  }

  let { image }: Props = $props();
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-col bg-surface-panel rounded-md overflow-hidden w-fit max-w-full border-2 border-purple-500/60">
    <h3 class="m-0 px-3 py-2 text-xs font-bold bg-purple-500/25 text-purple-800 dark:text-purple-400 uppercase tracking-wider">
      Blend (Difference)
    </h3>
    <div class="p-2">
      <div class="relative flex invert">
        {#if image.expect}
          <div class="absolute w-full h-full flex">
            <img src={image.expect} alt="Expected" class="max-w-full border border-green-500 invert" />
          </div>
        {/if}
        {#if image.diff}
          <img src={image.diff} alt="Diff" class="border border-transparent max-w-full invert opacity-0" />
        {/if}
        {#if image.actual}
          <div class="absolute w-full h-full flex">
            <img src={image.actual} alt="Actual" class="max-w-full border border-red-500 mix-blend-difference invert" />
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
