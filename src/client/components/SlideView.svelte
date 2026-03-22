<script lang="ts">
  interface Props {
    actual: string;
    expect: string;
    diff: string;
  }

  let { actual, expect, diff }: Props = $props();

  let loaded = $state(false);
  let offset = $state(0);
  let diffImageEl: HTMLImageElement | undefined = $state();
  let step = $state(0);

  // h-9 = 36px header, p-2 = 8px image padding
  const HEADER_H = 36;
  const PAD = 8;

  function handleSlide(e: Event): void {
    offset = Number((e.target as HTMLInputElement).value);
  }

  $effect(() => {
    loaded = false;
    const srcs = [actual, expect, diff];
    Promise.all(
      srcs.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = document.createElement('img');
            img.src = url;
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
      ),
    ).then(() => {
      loaded = true;
    });
  });

  $effect(() => {
    if (loaded && diffImageEl) {
      const width = diffImageEl.getBoundingClientRect().width;
      step = width > 0 ? 100 / width : 1;
    }
  });
</script>

{#if loaded}
  <div class="relative flex w-fit">
    <input
      class="slide-input"
      style="z-index: 30"
      type="range"
      aria-label="Slide comparison"
      min={0}
      max={100}
      value={0}
      {step}
      oninput={handleSlide}
    />

    <!-- Actual card (bottom layer, full width) — "ACTUAL" right-aligned -->
    <div class="absolute inset-0 rounded-xl border-2 border-error pointer-events-none z-10">
      <div class="h-9 px-3 flex items-center justify-end rounded-t-xl" style="background:color-mix(in srgb,var(--c-error) 15%,var(--c-surface))">
        <span class="text-xs font-bold text-error uppercase tracking-wider select-none">Actual</span>
      </div>
    </div>
    <div class="absolute overflow-hidden" style="top:{HEADER_H + PAD}px; left:{PAD}px; right:{PAD}px; bottom:{PAD}px">
      <img class="max-w-full block" src={actual} alt="actual" />
    </div>

    <!--
      Expected card: z-20 so its frame wins over the actual frame (z-10) on the left side.
      Clip-path restricts it to [0, offset%] — actual frame shows through on the right.
    -->
    <div
      class="absolute inset-0 z-20"
      style="clip-path: polygon(0 0, {offset}% 0, {offset}% 100%, 0 100%)"
    >
      <div class="absolute inset-0 rounded-xl border-2 border-success pointer-events-none z-10">
        <div class="h-9 px-3 flex items-center rounded-t-xl" style="background:color-mix(in srgb,var(--c-success) 15%,var(--c-surface))">
          <span class="text-xs font-bold text-success uppercase tracking-wider select-none">Expected</span>
        </div>
      </div>
      <div class="absolute overflow-hidden" style="top:{HEADER_H + PAD}px; left:{PAD}px; right:{PAD}px; bottom:{PAD}px">
        <img class="max-w-full block" src={expect} alt="expect" />
      </div>
    </div>

    <!-- Ghost: margin-top for header + padding for image area — sizes the outer container -->
    <img
      bind:this={diffImageEl}
      class="opacity-0 max-w-full block"
      style="margin:{HEADER_H + PAD}px {PAD}px {PAD}px"
      src={diff}
      alt="diff"
    />
  </div>
{:else}
  <div class="flex items-center justify-center p-10 text-fg-muted">Loading images{"\u2026"}</div>
{/if}
