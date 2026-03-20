import { build } from "esbuild";
import sveltePlugin from "esbuild-svelte";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Build CSS with Tailwind
const inputCss = await Bun.file("./src/client/app.css").text();
const result = await postcss([tailwindcss()]).process(inputCss, {
  from: "./src/client/app.css",
  to: "./dist/index.css",
});
await Bun.write("./dist/index.css", result.css);

// Build JS with esbuild
await build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outdir: "./dist",
  format: "esm",
  target: "es2022",
  plugins: [sveltePlugin({ compilerOptions: { css: "injected" } })],
});
