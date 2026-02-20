import { $ } from "bun";

// Clean dist
await $`rm -rf dist`;

// Step 1: Bundle with Bun
const result = await Bun.build({
  entrypoints: ["src/index.ts", "src/setup.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  external: ["bun:test"],
  packages: "external",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Bun build succeeded:", result.outputs.map((o) => o.path));

// Step 2: Generate declarations with tsc
await $`bunx tsc -p tsconfig.build.json`;
console.log("Declaration generation succeeded");

// Step 3: Copy matchers.d.ts, fixing the import path
const matchersDts = await Bun.file("src/matchers.d.ts").text();
// The source file imports from "./types.js" which is correct for the dist layout
await Bun.write("dist/matchers.d.ts", matchersDts);
console.log("Copied matchers.d.ts");

// Step 4: Prepend reference to matchers.d.ts in index.d.ts
const indexDts = await Bun.file("dist/index.d.ts").text();
await Bun.write("dist/index.d.ts", `/// <reference path="./matchers.d.ts" />\n${indexDts}`);
console.log("Added matchers.d.ts reference to index.d.ts");

console.log("\nBuild complete!");
