<script lang="ts">
  interface Props {
    actual: string;
    expect: string;
    diff: string;
  }

  let { actual, expect, diff }: Props = $props();

  let loaded = $state(false);
  let expectedContainerEl: HTMLDivElement | undefined = $state();
  let expectedWrapperEl: HTMLDivElement | undefined = $state();
  let diffImageEl: HTMLImageElement | undefined = $state();
  let step = $state(0);

  function handleSlide(e: Event): void {
    const offset = Number((e.target as HTMLInputElement).value);
    if (expectedContainerEl) expectedContainerEl.style.right = `${100 - offset}%`;
    if (expectedWrapperEl) expectedWrapperEl.style.left = `${100 - offset}%`;
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

  $effect(() => {
    if (loaded && expectedContainerEl && expectedWrapperEl) {
      expectedContainerEl.style.right = '100%';
      expectedWrapperEl.style.left = '100%';
    }
  });
</script>

{#if loaded}
  <div class="relative flex w-fit">
    <input
      class="slide-input"
      type="range"
      aria-label="Slide comparison"
      min={0}
      max={100}
      value={0}
      {step}
      oninput={handleSlide}
    />
    <div class="absolute w-full h-full overflow-hidden">
      <div class="relative w-full h-full flex">
        <img class="max-w-full border border-error" src={actual} alt="actual" />
      </div>
    </div>
    <div class="absolute w-full h-full overflow-hidden" bind:this={expectedContainerEl}>
      <div class="relative w-full h-full flex" bind:this={expectedWrapperEl}>
        <img class="max-w-full border border-success" src={expect} alt="expect" />
      </div>
    </div>
    <img
      bind:this={diffImageEl}
      class="opacity-0 max-w-full"
      src={diff}
      alt="diff"
    />
  </div>
{:else}
  <div class="flex items-center justify-center p-10 text-fg-muted">Loading images{"\u2026"}</div>
{/if}
