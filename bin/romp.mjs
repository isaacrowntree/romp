#!/usr/bin/env node
// romp CLI.
//   romp check <entry.tsx> [--public <dir>] [--from <s>] [--to <s>] [--arg <json>] [--strict] [--audio <file.wav>] [--json]
//     Plays a Remotion composition frame by frame in headless Chromium
//     (@remotion/player), collects every [data-romp] element per frame and runs
//     the motion check, with the text rules for elements tracked with a role.
//     --strict also counts untagged elements as props (overlap) and runs the
//     stale rule. Exit 1 when it finds issues. The entry default-exports
//     { component, props?, durationInFrames, fps, width, height, whips?, covered?,
//       …any analyze() option }.
//   romp check --audio <file.wav>
//     The audio check alone: dropouts (0.1–1 s of near-silence inside the bed).
//     With an entry as well, both run and either fails the command.
//   romp check --lottie <anim.json> [--layers a,b] [--from s] [--to s] [--json]
//     Plays a Lottie (After Effects) export with lottie-web in headless Chromium,
//     every frame, and runs the motion check over its layers (romp/lottie).
//   romp sound <module.ts> --out <file.wav> [--arg <json>] [--lufs -16]
//     The module exports `render(arg)` returning an AudioBuffer or a base64 WAV
//     (romp/audio's renderOffline / renderWav). Rendered in headless Chromium,
//     loudness-normalised with ffmpeg when it's on PATH.
// Needs esbuild and playwright (and react, react-dom, remotion, @remotion/player
// for `check`, or lottie-web for `check --lottie`) installed in your project.
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

const argv = process.argv.slice(2);
// `--audio file.wav` and `--strict` can sit anywhere; take them out first.
const audioAt = argv.indexOf("--audio");
const audioFile = audioAt >= 0 ? argv.splice(audioAt, 2)[1] : null;
const strictAt = argv.indexOf("--strict");
const strict = strictAt >= 0 && !!argv.splice(strictAt, 1);
// `romp check --lottie anim.json`: the file follows the flag (a .json entry means the same).
const lottieAt = argv.indexOf("--lottie");
const lottieFile = lottieAt >= 0 ? argv.splice(lottieAt, 2)[1] : argv[0] === "check" && /\.json$/i.test(argv[1] ?? "") ? argv.splice(1, 1)[0] : null;
const cmd = argv[0];
const file = lottieFile ?? argv[1];
const rest = argv.slice(lottieFile ? 1 : 2);
const flag = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = rest[i + 1];
  return v == null || v.startsWith("--") ? true : v;
};
const audioOnly = cmd === "check" && audioFile && (!file || file.startsWith("--"));
if (!cmd || (!file && !audioOnly) || cmd === "--help") {
  console.log("usage:\n  romp check <entry.tsx> [--public dir] [--from s] [--to s] [--arg json] [--strict] [--audio file.wav] [--json]\n  romp check --audio <file.wav> [--json]\n  romp check --lottie <anim.json> [--layers a,b] [--from s] [--to s] [--json]\n  romp sound <module.ts> --out file.wav [--arg json] [--lufs -16]");
  process.exit(cmd ? 0 : 1);
}

/** The audio check: dropouts in a rendered soundtrack. */
async function audioCheck() {
  if (!audioFile) return null;
  const { readWav, dropouts, formatDropouts } = await import(path.join(dist, "audio/gaps.js"));
  const found = dropouts(readWav(fs.readFileSync(path.resolve(audioFile))));
  return { file: audioFile, dropouts: found, text: formatDropouts(found, audioFile) };
}

if (audioOnly) {
  const a = await audioCheck();
  console.log(argv.includes("--json") ? JSON.stringify({ audio: { file: a.file, dropouts: a.dropouts } }) : a.text);
  process.exit(a.dropouts.length ? 1 : 0);
}

const { build } = need("esbuild");
const { chromium } = need("playwright");
if (lottieFile) {
  try {
    req.resolve("lottie-web");
  } catch {
    console.error('romp: this needs "lottie-web" installed in your project (npm i -D lottie-web)');
    process.exit(2);
  }
}
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
  const js = lottieFile ? await bundle(
    `import lottie from "lottie-web";
import { lottieReport } from ${JSON.stringify(path.join(dist, "lottie/index.js"))};
import data from ${JSON.stringify(entry)};
const root = document.getElementById("root");
root.style.width = data.w + "px"; root.style.height = data.h + "px"; root.style.overflow = "hidden";
const anim = lottie.loadAnimation({ container: root, renderer: "svg", loop: false, autoplay: false, animationData: data });
const layers = ${JSON.stringify(typeof flag("layers") === "string" ? flag("layers").split(",").map((s) => s.trim()) : null)};
window.__rompMeta = { fps: data.fr, durationInFrames: Math.round(data.op - data.ip), width: data.w, height: data.h };
window.__rompRun = async (from, to) => {
  if (!anim.isLoaded) await new Promise((r) => anim.addEventListener("DOMLoaded", r));
  return lottieReport(anim, { from, to, layers: layers ?? undefined });
};`,
    "lottie",
  ) : await bundle(
    `import { createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { collectDom } from ${JSON.stringify(path.join(dist, "check/dom.js"))};
import { analyze } from ${JSON.stringify(path.join(dist, "check/analyze.js"))};
import E0 from ${JSON.stringify(entry)};
// The entry is the config, or a function of --arg (one entry for several cuts).
const E = typeof E0 === "function" ? E0(${JSON.stringify(flag("arg") ? JSON.parse(flag("arg")) : null)}) : E0;
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
  const { component, props, durationInFrames, ...opts } = E;
  return analyze(frames, { ...opts, fps: E.fps, width: E.width, height: E.height, strict: ${strict} || !!E.strict });
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
  const audio = await audioCheck();
  if (flag("json")) console.log(JSON.stringify(audio ? { ...report, audio: { file: audio.file, dropouts: audio.dropouts } } : report));
  else {
    const { formatReport } = await import(path.join(dist, "check/analyze.js"));
    console.log(formatReport(report, meta.fps));
    if (audio) console.log(audio.text);
  }
  process.exit(report.issues.length || audio?.dropouts.length ? 1 : 0);
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
