// Baseline for the timings in the README: one full render, the way a film renders without the pipeline.
// node baseline.mjs out/full.mp4
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import path from "node:path";
const t0 = performance.now();
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const t1 = performance.now();
const composition = await selectComposition({ serveUrl, id: "Synthetic" });
let last = 0;
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: process.argv[2], muted: true, crf: 18, onProgress: ({ progress }) => { if (progress - last > 0.1) { last = progress; console.error(`${Math.round(progress * 100)}% at ${((performance.now() - t0) / 1000).toFixed(0)} s`); } } });
console.log(JSON.stringify({ frames: composition.durationInFrames, width: composition.width, height: composition.height, bundle: (t1 - t0) / 1000, total: (performance.now() - t0) / 1000 }));
