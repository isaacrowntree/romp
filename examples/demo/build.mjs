// Builds the demo: examples/demo/demo.ts → examples/demo/dist/romp-demo.js, an
// ES module exporting mount(el). Copy that file into the page that hosts the
// demo (it styles itself from the host's CSS custom properties).
//   node examples/demo/build.mjs
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, "demo.ts")],
  bundle: true,
  format: "esm",
  outfile: path.join(here, "dist/romp-demo.js"),
  minify: true,
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
});
console.log("examples/demo/dist/romp-demo.js");
