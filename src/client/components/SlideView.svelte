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

  // Must match h-9 (36px)
  const HEADER_H = 36;

  function handleSlide(e: Event): void {
    offset = Number((e.target as HTMLInputElement).value);
    step = step; // keep step reactive
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
  <!--
    Ghost diff image (margin-top reserves header space) sizes the outer container.
    Both actual and expected layers are absolute overlays at normal coordinates,
    so their children (images, headers) position correctly without any left-shift trick.
    The expected layer is clipped via clip-path driven by the slider offset.
  -->
  <div class="relative flex w-fit">
    <input
      class="slide-input"
      style="z-index: 10"
      type="range"
      aria-label="Slide comparison"
      min={0}
      max={100}
      value={0}
      {step}
      oninput={handleSlide}
    />

    <!-- Actual card (bottom layer, full width) — "ACTUAL" right-aligned -->
    <div class="absolute inset-0 rounded-xl border-2 border-error pointer-events-none">
      <div class="h-9 px-3 flex items-center justify-end bg-error/15 rounded-t-xl">
        <span class="text-xs font-bold text-error uppercase tracking-wider select-none">Actual</span>
      </div>
    </div>
    <div class="absolute left-0 right-0 bottom-0 overflow-hidden" style="top: {HEADER_H}px">
      <img class="max-w-full block" src={actual} alt="actual" />
    </div>

    <!-- Expected card (clipped to left `offset`% via clip-path) — "EXPECTED" left-aligned -->
    <div
      class="absolute inset-0"
      style="clip-path: polygon(0 0, {offset}% 0, {offset}% 100%, 0 100%)"
    >
      <div class="absolute inset-0 rounded-xl border-2 border-success pointer-events-none">
        <div class="h-9 px-3 flex items-center bg-success/15 rounded-t-xl">
          <span class="text-xs font-bold text-success uppercase tracking-wider select-none">Expected</span>
        </div>
      </div>
      <div class="absolute left-0 right-0 bottom-0 overflow-hidden" style="top: {HEADER_H}px">
        <img class="max-w-full block" src={expect} alt="expect" />
      </div>
    </div>

    <!-- Ghost: diff image with margin-top to reserve header height, sizes the container -->
    <img
      bind:this={diffImageEl}
      class="opacity-0 max-w-full block"
      style="margin-top: {HEADER_H}px"
      src={diff}
      alt="diff"
    />
  </div>
{:else}
  <div class="flex items-center justify-center p-10 text-fg-muted">Loading images{"\u2026"}</div>
{/if}
