import { build } from "esbuild";
import sveltePlugin from "esbuild-svelte";

await build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outdir: "./dist",
  format: "esm",
  target: "es2022",
  plugins: [sveltePlugin({ compilerOptions: { css: "injected" } })],
});
