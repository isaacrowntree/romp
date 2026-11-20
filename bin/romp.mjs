#!/usr/bin/env node
// romp CLI.
//   romp check <entry.tsx> [--public <dir>] [--from <s>] [--to <s>] [--arg <json>] [--strict] [--audio <file.wav>] [--json]
//     Plays a Remotion composition frame by frame in headless Chromium
//     (@remotion/player), collects every [data-romp] element per frame and runs
//     the motion check, with the text rules for elements tracked with a role.
//     --strict also counts untagged tracked elements as props (overlap), runs
//     the stale rule and warns about untracked <svg>, <canvas>, <img> and <video>
//     drawn over a text (the check can't see inside them). Exit 1 on issues. The entry default-exports
//     { component, props?, durationInFrames, fps, width, height, whips?, covered?,
//       …any analyze() option }.
//     --jobs N         pages to shard frames across (default: half the cores, ≤ 8)
//     --scene <name|n> one scene (the entry's `sections`, or its `scenes` cuts numbered from 1); --scenes lists them
//     --every N        every Nth frame: layout rules only (fast; motion rules need every frame)
//     --untracked error  untracked text or drawing surfaces over a text or screen fail the check (else warnings)
//     --occupancy [share]  the opt-in occupancy rule
//     --paced          wait two animation frames per frame instead of flushing React synchronously
//     --no-media       don't load video or audio files (layout only)
//   romp check --audio <file.wav>
//     The audio check alone: dropouts (0.1–1 s of near-silence inside the bed).
//     With an entry as well, both run and either fails the command.
//   romp check --lottie <anim.json> [--layers a,b] [--from s] [--to s] [--json]
//     Plays a Lottie (After Effects) export with lottie-web in headless Chromium,
//     every frame, and runs the motion check over its layers (romp/lottie).
//   romp sheet [romp.render.ts] [--out dir] [--every n] [--scale 0.5] [--cols 4] [--rows 3] [--scene name] [--from s] [--to s]
//     Contact sheets: every Nth frame (default one a second) at a low scale, as
//     one JPEG sequence (one renderFrames call), laid out in pages with a
//     timestamp per tile. --still <frame> renders one full-size frame instead.
//   romp render [romp.render.ts] [--force scene,…] [--concurrency n] [--gl angle]
//     Per-scene render with a cache: only segments whose scenes, sources or
//     media changed are rendered, joined with -c copy, the soundtrack muxed once.
//   romp bench [romp.render.ts] [--frames a-b] [--concurrency 1,2,4,8]
//     The fastest Remotion concurrency on this machine.
//   romp lint <plan.ts> [--json]      the plan lint (no browser)
//   romp encode <in.mp4> --out a.mp4 --out b.mp4@1080 [--crf 18] [--preset medium]
//     One decode, several encodes (a 4K master and a 1080p share copy).
//   romp marks <recording.mp4> [--threshold 0.3] [--min-gap 0.5] [--json]
//     Cut points in a long recording, by frame difference.
//   romp lock <name> -- <command…>   run a command holding a lock; a second one is refused
//   romp sound <module.ts> --out <file.wav> [--arg <json>] [--lufs -16] [--cache .romp/cache]
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
// The pipeline commands read romp.render.ts unless given a config.
const PIPE = ["render", "sheet", "still", "bench"];
if (PIPE.includes(argv[0]) && (argv[1] == null || argv[1].startsWith("--"))) argv.splice(1, 0, "romp.render.ts");
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
  console.log("usage:\n  romp sheet|render|bench [romp.render.ts] …   romp lint <plan.ts>   romp encode <in> --out a.mp4 --out b.mp4@1080\n  romp marks <video>   romp lock <name> -- <command…>\n  romp check <entry.tsx> [--public dir] [--from s] [--to s] [--scene name] [--scenes] [--jobs n] [--every n] [--arg json] [--strict] [--untracked error] [--occupancy [share]] [--no-media] [--paced] [--audio file.wav] [--json]\n  romp check --audio <file.wav> [--json]\n  romp check --lottie <anim.json> [--layers a,b] [--from s] [--to s] [--json]\n  romp sound <module.ts> --out file.wav [--arg json] [--lufs -16]");
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


// ── The pipeline: config loading, lint, encode, marks, lock, render, sheet ──
/** Import a TS/JS module (a config, a plan) in Node: bundled with esbuild next to the project's node_modules. */
async function loadModule(file) {
  const { build: esb } = need("esbuild");
  const dir = path.join(cwd, ".romp", "tmp");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${path.basename(file).replace(/\W+/g, "_")}-${process.pid}.mjs`);
  await esb({ entryPoints: [path.resolve(file)], bundle: true, format: "esm", platform: "node", packages: "external", outfile: out, logLevel: "warning", jsx: "automatic", loader: { ".png": "empty", ".jpg": "empty", ".svg": "empty", ".mp4": "empty", ".wav": "empty", ".css": "empty" } });
  try {
    const m = await import(`${out}?t=${Date.now()}`);
    const v = m.default ?? m;
    return typeof v === "function" ? await v(flag("arg") ? JSON.parse(flag("arg")) : undefined) : v;
  } finally {
    fs.rmSync(out, { force: true });
  }
}
const pipe = async (m) => import(path.join(dist, m));
const secsOf = (t0) => ((performance.now() - t0) / 1000).toFixed(1);
const listFlag = (name) => {
  const out = [];
  rest.forEach((a, i) => { if (a === `--${name}` && rest[i + 1] && !rest[i + 1].startsWith("--")) out.push(rest[i + 1]); });
  return out;
};

if (cmd === "lint") {
  const { lintPlan, formatLint } = await pipe("pipeline/lint.js");
  const t0 = performance.now();
  const plan = await loadModule(file);
  const r = lintPlan(plan);
  console.log(flag("json") ? JSON.stringify(r) : formatLint(r));
  console.error(`romp lint: ${secsOf(t0)} s`);
  process.exit(r.issues.length ? 1 : 0);
}

if (cmd === "encode") {
  const { encodeArgs, ffmpeg } = await pipe("pipeline/ffmpeg.js");
  const outs = listFlag("out").map((o) => {
    const [f, h] = o.split("@");
    return { file: path.resolve(f), height: h ? +h : undefined, crf: flag("crf") ? +flag("crf") : undefined, preset: typeof flag("preset") === "string" ? flag("preset") : undefined };
  });
  if (!outs.length) {
    console.error("romp encode: give at least one --out file.mp4[@height]");
    process.exit(2);
  }
  const t0 = performance.now();
  await ffmpeg(encodeArgs(path.resolve(file), outs));
  console.log(`${outs.map((o) => path.relative(cwd, o.file)).join(", ")} (${secsOf(t0)} s, one pass)`);
  process.exit(0);
}

if (cmd === "marks") {
  const { marksFromVideo } = await pipe("pipeline/ffmpeg.js");
  const marks = await marksFromVideo(path.resolve(file), { threshold: flag("threshold") ? +flag("threshold") : undefined, minGap: flag("min-gap") ? +flag("min-gap") : undefined });
  console.log(flag("json") ? JSON.stringify(marks) : marks.map((t) => t.toFixed(3)).join("\n"));
  process.exit(0);
}

if (cmd === "lock") {
  const { acquireLock, LockHeld } = await pipe("pipeline/lock.js");
  const dd = process.argv.indexOf("--");
  const command = dd >= 0 ? process.argv.slice(dd + 1) : [];
  let lock;
  try {
    lock = acquireLock(file, { dir: typeof flag("dir") === "string" ? flag("dir") : undefined });
  } catch (e) {
    if (e instanceof LockHeld) {
      console.error(`romp lock: ${e.message}; refusing to start a second one`);
      process.exit(75);
    }
    throw e;
  }
  if (!command.length) {
    console.error(`romp lock: took ${lock.file}; give a command after --`);
    lock.release();
    process.exit(2);
  }
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
  lock.release();
  process.exit(res.status ?? 1);
}

if (PIPE.includes(cmd)) {
  const cfg = await loadModule(file);
  const R = await pipe("remotion/render.js");
  const fps = cfg.fps ?? 30;
  const settings = { ...cfg, ...(flag("concurrency") && cmd !== "bench" ? { concurrency: +flag("concurrency") } : {}), ...(typeof flag("gl") === "string" ? { gl: flag("gl") } : {}) };
  const t0 = performance.now();
  if (cmd === "render") {
    const m = await R.renderScenes({ ...settings, force: typeof flag("force") === "string" ? flag("force").split(",") : cfg.force, out: typeof flag("out") === "string" ? flag("out") : cfg.out });
    if (flag("json")) console.log(JSON.stringify(m));
    else {
      console.log(`${path.relative(cwd, m.out)}: ${m.frames} frames, ${m.segments.length} segments, ${m.segments.filter((s) => s.rebuilt).length} rendered (${m.rebuilt.join(", ") || "none"}) in ${m.seconds.total.toFixed(1)} s`);
      console.log(`manifest: ${path.relative(cwd, m.out)}.manifest.json`);
    }
    process.exit(0);
  }
  if (cmd === "bench") {
    const fr = typeof flag("frames") === "string" ? flag("frames").split("-").map(Number) : undefined;
    const cs = typeof flag("concurrency") === "string" ? flag("concurrency").split(",").map(Number) : undefined;
    const b = await R.bench({ ...settings, frames: fr, concurrencies: cs });
    console.log(b.results.map((x) => `concurrency ${String(x.concurrency).padStart(2)}: ${x.seconds.toFixed(1).padStart(6)} s  ${x.fps.toFixed(1).padStart(6)} frames/s`).join("\n"));
    console.log(`best: --concurrency ${b.best}`);
    process.exit(0);
  }
  // sheet / still
  const sections = (cfg.sections ?? cfg.scenes ?? []).map((s) => ("frames" in s ? { name: s.name, from: s.from, to: s.from + s.frames - 1 } : { name: s.name, from: Math.round(s.from * fps), to: Math.round(s.to * fps) - 1 }));
  const still = cmd === "still" ? +file : flag("still");
  if (cmd === "still" || (still != null && still !== true)) {
    const frame = +(cmd === "still" ? flag("frame", 0) : still);
    const out = await R.renderStill({ ...settings, frame, out: typeof flag("out") === "string" ? flag("out") : `out/still-${frame}.png` });
    console.log(`${path.relative(cwd, out)} (${secsOf(t0)} s)`);
    process.exit(0);
  }
  let from, to;
  const sc = typeof flag("scene") === "string" ? sections.find((x, i) => x.name === flag("scene") || String(i + 1) === flag("scene")) : null;
  if (typeof flag("scene") === "string" && !sc) {
    console.error(`romp sheet: no scene "${flag("scene")}". Scenes: ${sections.map((x) => x.name).join(", ")}`);
    process.exit(2);
  }
  if (sc) [from, to] = [sc.from, sc.to];
  if (flag("from")) from = Math.round(+flag("from") * fps);
  if (flag("to")) to = Math.round(+flag("to") * fps);
  const r = await R.renderSheet({
    ...settings,
    from,
    to,
    every: flag("every") ? +flag("every") : undefined,
    scale: flag("scale") ? +flag("scale") : undefined,
    cols: flag("cols") ? +flag("cols") : undefined,
    rows: flag("rows") ? +flag("rows") : undefined,
    tileWidth: flag("tile") ? +flag("tile") : undefined,
    sections,
    out: typeof flag("out") === "string" ? flag("out") : "out/sheets",
  });
  console.log(`${r.pages.length} page(s), ${r.frames} frames, in ${r.seconds.toFixed(1)} s:\n  ${r.pages.map((p) => path.relative(cwd, p)).join("\n  ")}`);
  process.exit(0);
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

/** Chromium with the frame-rate limit off: requestAnimationFrame isn't held to 60 Hz. */
const launch = () => chromium.launch({ args: ["--disable-frame-rate-limit", "--disable-gpu-vsync"] });

if (cmd === "check" && lottieFile) {
  const entry = path.resolve(file);
  const js = await bundle(
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
  );
  const server = await serve(js, null);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.__rompMeta);
  const meta = await page.evaluate(() => window.__rompMeta);
  await page.setViewportSize({ width: meta.width, height: meta.height });
  const from = Math.round(+flag("from", 0) * meta.fps), to = Math.min(meta.durationInFrames - 1, Math.round(+flag("to", meta.durationInFrames / meta.fps) * meta.fps));
  const report = await page.evaluate(([a, b]) => window.__rompRun(a, b), [from, to]);
  await browser.close();
  server.close();
  const { formatReport } = await import(path.join(dist, "check/analyze.js"));
  console.log(flag("json") ? JSON.stringify(report) : formatReport(report, meta.fps));
  process.exit(report.issues.length ? 1 : 0);
}

if (cmd === "check") {
  const t0 = Date.now();
  const entry = path.resolve(file);
  const paced = !!flag("paced");
  const js = await bundle(
    `import { createElement, createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { collectDom, untrackedOver } from ${JSON.stringify(path.join(dist, "check/dom.js"))};
import E0 from ${JSON.stringify(entry)};
// The entry is the config, or a function of --arg (one entry for several cuts).
const E = typeof E0 === "function" ? E0(${JSON.stringify(flag("arg") ? JSON.parse(flag("arg")) : null)}) : E0;
const ref = createRef();
const root = document.getElementById("root");
root.style.width = E.width + "px"; root.style.height = E.height + "px";
createRoot(root).render(createElement(Player, { ref, component: E.component, inputProps: E.props ?? {}, durationInFrames: E.durationInFrames, fps: E.fps, compositionWidth: E.width, compositionHeight: E.height, style: { width: E.width, height: E.height } }));
const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
// One macrotask: React's scheduler runs passive effects (and what they set) in the meantime.
const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const { component, props, ...opts } = E;
window.__rompMeta = { fps: E.fps, durationInFrames: E.durationInFrames, width: E.width, height: E.height, opts: JSON.parse(JSON.stringify(opts)) };
const ready = (async () => { while (!ref.current) await raf(); await document.fonts.ready; })();
window.__rompRows = async (frames, o) => {
  await ready;
  const rows = [], unseen = [], seen = new Set();
  for (const f of frames) {
    if (o.trace) console.log("romp:frame " + f);
    if (o.paced) { ref.current.seekTo(f); await raf(); }
    else { flushSync(() => ref.current.seekTo(f)); await tick(); await tick(); }
    rows.push({ f, row: collectDom(root) });
    if (o.strict) for (const u of untrackedOver(root)) if (!seen.has(u.what + "|" + u.text)) { seen.add(u.what + "|" + u.text); unseen.push({ ...u, f }); }
  }
  return { rows, unseen };
};`,
    "check",
  );
  const pub = flag("public") ? path.resolve(flag("public")) : null;
  const server = await serve(js, pub);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launch();
  const noMedia = !!flag("no-media");
  /** A fresh page (its own context, so its own renderer process) with the composition loaded. */
  async function open(log) {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    const page = await ctx.newPage();
    page.on("console", (m) => { log.push(`[${m.type()}] ${m.text()}`); if (log.length > 60) log.shift(); });
    page.on("pageerror", (e) => { log.push(`[pageerror] ${e.message}`); if (log.length > 60) log.shift(); });
    // Layout only: media never needs to play (a <Video> keeps its box without it).
    if (noMedia) await page.route(/\.(mp4|webm|mov|m4v|mkv|mp3|m4a|aac|ogg|opus|wav)(\?|$)/i, (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(url);
    await page.waitForFunction(() => window.__rompMeta);
    const meta = await page.evaluate(() => window.__rompMeta);
    await page.setViewportSize({ width: meta.width, height: meta.height });
    return { page, meta, ctx };
  }
  const first = await open([]);
  const meta = first.meta;
  const fps = meta.fps;
  await first.ctx.close();

  // ── Which frames: --scene, --from/--to, --every ─────────────────────────────
  const opts = meta.opts ?? {};
  const sections = opts.sections?.length
    ? opts.sections
    : [0, ...(opts.scenes ?? [])].map((t, i, a) => ({ name: String(i + 1), from: t, to: a[i + 1] ?? meta.durationInFrames / fps }));
  if (flag("scenes")) {
    for (const [i, s] of sections.entries()) console.log(`${String(i + 1).padStart(3)}  ${s.name.padEnd(24)} ${s.from.toFixed(2).padStart(8)}–${s.to.toFixed(2)} s  (${Math.round((s.to - s.from) * fps)} frames)`);
    await browser.close();
    server.close();
    process.exit(0);
  }
  let fromS = +flag("from", 0), toS = +flag("to", meta.durationInFrames / fps);
  const sceneArg = flag("scene");
  if (typeof sceneArg === "string") {
    const sc = sections.find((s) => s.name === sceneArg) ?? (/^\d+$/.test(sceneArg) ? sections[+sceneArg - 1] : null);
    if (!sc) {
      console.error(`romp check: no scene "${sceneArg}". Scenes: ${sections.map((s) => s.name).join(", ")} (or 1–${sections.length})`);
      process.exit(2);
    }
    fromS = sc.from;
    toS = sc.to - 1 / fps;
  }
  const from = Math.max(0, Math.round(fromS * fps)), to = Math.min(meta.durationInFrames - 1, Math.round(toS * fps));
  const every = Math.max(1, Math.round(+flag("every", 1)) || 1);
  const want = [];
  for (let f = Math.ceil(from / every) * every; f <= to; f += every) want.push(f);

  // ── Shard across pages ──────────────────────────────────────────────────────
  const cores = os.cpus().length;
  const jobsAsked = flag("jobs");
  const jobs = Math.max(1, Math.min(typeof jobsAsked === "string" ? +jobsAsked : Math.max(1, Math.min(8, Math.floor(cores / 2))), Math.ceil(want.length / 150)));
  const per = Math.ceil(want.length / jobs);
  const CHUNK = 150;
  async function shard(list) {
    const log = [];
    let { page, ctx } = await open(log);
    const rows = [], unseen = [];
    for (let k = 0; k < list.length; k += CHUNK) {
      const part = list.slice(k, k + CHUNK);
      try {
        const r = await page.evaluate(([fs_, o]) => window.__rompRows(fs_, o), [part, { strict, paced }]);
        rows.push(...r.rows);
        unseen.push(...r.unseen);
      } catch (e) {
        // Find the frame: replay the chunk in a fresh page, logging each frame.
        console.error(`romp check: the page failed between frames ${part[0]} and ${part[part.length - 1]}: ${String(e.message ?? e).split("\n")[0]}`);
        console.error("page console (latest last):\n  " + (log.slice(-30).join("\n  ") || "(nothing)"));
        await ctx.close().catch(() => {});
        const tlog = [];
        const again = await open(tlog);
        let last = null;
        again.page.on("console", (m) => { const x = /^romp:frame (\d+)$/.exec(m.text()); if (x) last = +x[1]; });
        await again.page.evaluate(([fs_, o]) => window.__rompRows(fs_, o), [part, { strict, paced, trace: true }]).then(
          () => console.error("romp check: the replay didn't fail (a memory build-up across frames?); try --jobs with more pages, or --from/--to"),
          () => console.error(`romp check: the page died on frame ${last} (${(last / fps).toFixed(2)} s), the last frame it reached`),
        );
        await browser.close().catch(() => {});
        server.close();
        process.exit(2);
      }
    }
    await ctx.close();
    return { rows, unseen };
  }
  const parts = await Promise.all(Array.from({ length: jobs }, (_, j) => shard(want.slice(j * per, (j + 1) * per))));
  await browser.close();
  server.close();
  // Merged in frame order, then checked as one film: rules over neighbouring frames see across shard edges.
  const frames = parts.flatMap((p) => p.rows).sort((a, b) => a.f - b.f);
  if (process.env.ROMP_DUMP_ROWS) fs.writeFileSync(process.env.ROMP_DUMP_ROWS, JSON.stringify(frames));
  const unseenAll = new Map();
  for (const u of parts.flatMap((p) => p.unseen).sort((a, b) => a.f - b.f)) if (!unseenAll.has(u.what + "|" + u.text)) unseenAll.set(u.what + "|" + u.text, u);
  const { analyze, formatReport } = await import(path.join(dist, "check/analyze.js"));
  const base = { ...opts, width: meta.width, height: meta.height, strict: strict || !!opts.strict };
  if (flag("occupancy")) base.occupancy = typeof flag("occupancy") === "string" ? +flag("occupancy") : true;
  // Sampled: frame k·N becomes frame k at fps/N, so every threshold in seconds still holds.
  const report = every > 1
    ? (() => {
        const r = analyze(frames.map(({ f, row }) => ({ f: f / every, row })), { ...base, fps: fps / every, layoutOnly: true });
        r.issues.forEach((i) => (i.frame *= every));
        return r;
      })()
    : analyze(frames, { ...base, fps });
  const untrackedErr = flag("untracked") === "error";
  const notes = [...unseenAll.values()].map((u) =>
    u.kind === "text"
      ? `untracked ${u.what} (${u.size}) is drawn on ${u.text} at frame ${u.f}: romp can't check it. Track it (trackText), or mark it as part of what it sits on`
      : `untracked ${u.what} (${u.size}) is drawn over ${u.text} at frame ${u.f}: romp can't see what's in it. Track its props (data-romp works on SVG children too)`,
  );
  if (untrackedErr) {
    [...unseenAll.values()].forEach((u, i) => report.issues.push({ frame: u.f, name: u.text, kind: "untracked", detail: notes[i] }));
    report.issues.sort((a, b) => a.frame - b.frame);
  } else if (notes.length) report.warnings = notes;
  const secs = (Date.now() - t0) / 1000;
  const audio = await audioCheck();
  if (flag("json")) console.log(JSON.stringify(audio ? { ...report, audio: { file: audio.file, dropouts: audio.dropouts } } : report));
  else {
    console.log(formatReport(report, fps));
    if (every > 1) console.log(`(sampled every ${every} frames: layout rules only; pop, strobe, teleport, jump, spike, lost, unfinished, unread, empty and stale need every frame)`);
    if (audio) console.log(audio.text);
  }
  console.error(`romp check: ${want.length} frames in ${secs.toFixed(1)} s on ${jobs} page${jobs > 1 ? "s" : ""}${paced ? " (paced)" : ""}`);
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
  const arg0 = flag("arg") ? JSON.parse(flag("arg")) : undefined;
  const lufs0 = flag("lufs", "-16");
  // The cache key is everything that makes the sound: the bundled module (schedule, voices, timeline), its argument and the loudness.
  const cacheDir = typeof flag("cache") === "string" ? path.resolve(flag("cache"), "sound") : null;
  const { createHash } = await import("node:crypto");
  // esbuild's path comments name the per-run temp dir: leave them out of the key.
  const key = createHash("sha256").update(js.replace(/^\s*\/\/ .*$/gm, "")).update("\0").update(JSON.stringify(arg0 ?? null)).update("\0").update(String(lufs0)).digest("hex").slice(0, 24);
  if (cacheDir && fs.existsSync(path.join(cacheDir, `${key}.wav`))) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.copyFileSync(path.join(cacheDir, `${key}.wav`), path.resolve(out));
    console.log(`${out} (cached ${key})`);
    process.exit(0);
  }
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
  if (cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.copyFileSync(path.resolve(out), path.join(cacheDir, `${key}.wav`));
  }
  console.log(`${out} (${((Date.now() - t0) / 1000).toFixed(1)} s${cacheDir ? `, cached as ${key}` : ""})`);
}
