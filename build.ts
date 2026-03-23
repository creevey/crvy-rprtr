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

// Build client-side JS (Svelte app)
await build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  outdir: "./dist",
  format: "esm",
  target: "es2022",
  plugins: [sveltePlugin({ compilerOptions: { css: "injected" } })],
});

// Build server-side JS (reporter, server, CLI)
await build({
  entryPoints: ["./src/reporter.ts", "./src/server.ts", "./src/cli.ts"],
  bundle: true,
  splitting: true,
  outdir: "./dist",
  format: "esm",
  target: "es2022",
  platform: "node",
  packages: "external",
});

// Generate .d.ts files via tsc
const tsc = Bun.spawn(["bunx", "tsc", "--project", "tsconfig.build.json"], {
  stdout: "inherit",
  stderr: "inherit",
});
const tscExitCode = await tsc.exited;
if (tscExitCode !== 0) {
  throw new Error(`tsc exited with code ${tscExitCode}`);
}

// Copy index.html into dist/
await Bun.write("./dist/index.html", Bun.file("./index.html"));
