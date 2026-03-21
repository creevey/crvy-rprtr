<script lang="ts">
  interface Props {
    checked: boolean;
    onchange: (checked: boolean) => void;
  }

  let { checked, onchange }: Props = $props();
</script>

<label class="relative inline-block w-12 h-6 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-1">
  <input
    type="checkbox"
    aria-label="Toggle theme"
    {checked}
    onchange={() => onchange(!checked)}
    class="opacity-0 w-0 h-0 absolute"
  />
  <span class="absolute inset-0 bg-surface-input border border-edge rounded-full transition-colors">
    <span
      class="absolute top-0.5 left-0.5 size-5 flex items-center justify-center bg-fg rounded-full transition-transform {checked ? 'translate-x-6' : ''}"
    >
      {#if checked}
        <svg class="size-3 text-surface" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      {:else}
        <svg class="size-3 text-surface" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z" />
        </svg>
      {/if}
    </span>
  </span>
</label>
