#!/usr/bin/env node
// romp CLI.
//   romp check <entry.tsx> [--public <dir>] [--from <s>] [--to <s>] [--json]
//     Plays a Remotion composition frame by frame in headless Chromium
//     (@remotion/player), collects every [data-romp] element per frame and runs
//     the motion check. Exit 1 when it finds issues. The entry default-exports
//     { component, props?, durationInFrames, fps, width, height, whips?, covered? }.
//   romp sound <module.ts> --out <file.wav> [--arg <json>] [--lufs -16]
//     The module exports `render(arg)` returning an AudioBuffer or a base64 WAV
//     (romp/audio's renderOffline / renderWav). Rendered in headless Chromium,
//     loudness-normalised with ffmpeg when it's on PATH.
// Needs esbuild and playwright (and react, react-dom, remotion, @remotion/player
// for `check`) installed in your project.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const here = path.dirname(new URL(import.meta.url).pathname);
const dist = path.resolve(here, "../dist");
const cwd = process.cwd();
const req = createRequire(path.join(cwd, "package.json"));
const need = (m) => {
  try {
    return req(m);
  } catch {
    console.error(`romp: this needs "${m}" installed in your project (npm i -D ${m})`);
    process.exit(2);
  }
};

const [cmd, file, ...rest] = process.argv.slice(2);
const flag = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] ?? true : def;
};
if (!cmd || !file || cmd === "--help") {
  console.log("usage:\n  romp check <entry.tsx> [--public dir] [--from s] [--to s] [--json]\n  romp sound <module.ts> --out file.wav [--arg json] [--lufs -16]");
  process.exit(cmd ? 0 : 1);
}

const { build } = need("esbuild");
const { chromium } = need("playwright");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "romp-"));

async function bundle(entrySource, name) {
  const entry = path.join(tmp, `${name}.tsx`);
  fs.writeFileSync(entry, entrySource);
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    jsx: "automatic",
    absWorkingDir: cwd,
    nodePaths: [path.join(cwd, "node_modules")],
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".json": "json", ".png": "dataurl", ".svg": "dataurl" },
    logLevel: "warning",
  });
  return out.outputFiles[0].text;
}

function serve(js, publicDir) {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style><div id="root"></div><script src="/__romp.js"></script>`;
  const types = { ".js": "text/javascript", ".json": "application/json", ".webm": "video/webm", ".mp4": "video/mp4", ".wav": "audio/wav", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  const server = http.createServer((q, r) => {
    const u = decodeURIComponent((q.url || "/").split("?")[0]);
    if (u === "/") return r.writeHead(200, { "content-type": "text/html" }), r.end(html);
    if (u === "/__romp.js") return r.writeHead(200, { "content-type": "text/javascript" }), r.end(js);
    const f = publicDir && path.join(publicDir, u);
    if (f && f.startsWith(publicDir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const st = fs.statSync(f);
      const range = q.headers.range;
      const type = types[path.extname(f)] ?? "application/octet-stream";
      if (range) {
        const [a, b] = range.replace("bytes=", "").split("-").map((x) => (x ? +x : undefined));
        const start = a ?? 0, end = b ?? st.size - 1;
        r.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${st.size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
        return fs.createReadStream(f, { start, end }).pipe(r);
      }
      r.writeHead(200, { "content-type": type, "content-length": st.size, "accept-ranges": "bytes" });
      return fs.createReadStream(f).pipe(r);
    }
    r.writeHead(404).end();
  });
  return new Promise((res) => server.listen(0, "127.0.0.1", () => res(server)));
}

if (cmd === "check") {
  const entry = path.resolve(file);
  const js = await bundle(
    `import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { collectDom } from ${JSON.stringify(path.join(dist, "check/dom.js"))};
import { analyze } from ${JSON.stringify(path.join(dist, "check/analyze.js"))};
import E from ${JSON.stringify(entry)};
const ref = createRef();
const root = document.getElementById("root");
root.style.width = E.width + "px"; root.style.height = E.height + "px";
createRoot(root).render(createElement(Player, { ref, component: E.component, inputProps: E.props ?? {}, durationInFrames: E.durationInFrames, fps: E.fps, compositionWidth: E.width, compositionHeight: E.height, style: { width: E.width, height: E.height } }));
const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
window.__rompMeta = { fps: E.fps, durationInFrames: E.durationInFrames, width: E.width, height: E.height };
window.__rompRun = async (from, to) => {
  while (!ref.current) await raf();
  await document.fonts.ready;
  const frames = [];
  for (let f = from; f <= to; f++) { ref.current.seekTo(f); await raf(); frames.push({ f, row: collectDom(root) }); }
  return analyze(frames, { fps: E.fps, width: E.width, whips: E.whips, covered: E.covered });
};`,
    "check",
  );
  const pub = flag("public") ? path.resolve(flag("public")) : null;
  const server = await serve(js, pub);
  const browser = await chromium.launch();
  const meta0 = { width: 1080, height: 1920 };
  const page = await browser.newPage({ viewport: meta0 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__rompMeta);
  const meta = await page.evaluate(() => window.__rompMeta);
  await page.setViewportSize({ width: meta.width, height: meta.height });
  const from = Math.round(+(flag("from", 0)) * meta.fps), to = Math.min(meta.durationInFrames - 1, Math.round(+(flag("to", meta.durationInFrames / meta.fps)) * meta.fps));
  const report = await page.evaluate(([a, b]) => window.__rompRun(a, b), [from, to]);
  await browser.close();
  server.close();
  if (flag("json")) console.log(JSON.stringify(report));
  else {
    const { formatReport } = await import(path.join(dist, "check/analyze.js"));
    console.log(formatReport(report, meta.fps));
  }
  process.exit(report.issues.length ? 1 : 0);
}

if (cmd === "sound") {
  const mod = path.resolve(file);
  const out = flag("out");
  if (!out) {
    console.error("romp sound: --out <file.wav> is required");
    process.exit(1);
  }
  const js = await bundle(
    `import * as M from ${JSON.stringify(mod)};
import { wavBase64 } from ${JSON.stringify(path.join(dist, "audio/wav.js"))};
window.__rompSound = async (arg) => { const r = await M.render(arg); return typeof r === "string" ? r : wavBase64(r); };`,
    "sound",
  );
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>romp sound</title>");
  await page.addScriptTag({ content: js });
  const arg = flag("arg") ? JSON.parse(flag("arg")) : undefined;
  const t0 = Date.now();
  const b64 = await page.evaluate((a) => window.__rompSound(a), arg);
  await browser.close();
  const raw = path.join(tmp, "raw.wav");
  fs.writeFileSync(raw, Buffer.from(b64, "base64"));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const lufs = flag("lufs", "-16");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", `loudnorm=I=${lufs}:TP=-1.5:LRA=11`, "-ar", "48000", "-c:a", "pcm_s16le", path.resolve(out)]);
  } catch {
    console.warn("romp sound: ffmpeg not found, writing without loudness normalisation");
    fs.copyFileSync(raw, path.resolve(out));
  }
  console.log(`${out} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
