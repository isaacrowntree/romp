// Bundles the demo page (docs/demo.ts → docs/demo.js) for GitHub Pages (master:/docs).
import { build } from "esbuild";
await build({ entryPoints: ["docs/demo.ts"], bundle: true, format: "iife", outfile: "docs/demo.js", minify: true, sourcemap: false, logLevel: "warning" });
console.log("docs/demo.js");
