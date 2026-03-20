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
  <span class="absolute inset-0 bg-surface-input rounded-full transition-colors">
    <span
      class="absolute top-0.5 left-0.5 size-5 flex items-center justify-center text-xs bg-fg-muted rounded-full transition-transform {checked ? 'translate-x-6' : ''}"
    >
      {checked ? '☪' : '☀'}
    </span>
  </span>
</label>
