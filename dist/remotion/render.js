/**
 * romp/remotion/render: render a Remotion film fast. Node only; needs
 * @remotion/renderer and @remotion/bundler in your project.
 *
 *   renderScenes(config)  per-scene render with a cache: only the segments
 *                         whose scenes, sources or media changed are rendered
 *                         (muted, `frameRange`), then joined with `-c copy` and
 *                         the soundtrack muxed once. Writes a manifest.
 *   renderSheet(options)  contact sheets: every Nth frame at a low scale as one
 *                         JPEG sequence (one `renderFrames` call), laid out in
 *                         pages with a timestamp per tile
 *   renderStill(options)  one full-resolution frame
 *   bench(options)        times a short range at several concurrencies
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planSegments } from "../pipeline/segments.js";
import { keyOf } from "../pipeline/key.js";
import { hashFiles, listFiles, stampFiles } from "../pipeline/files.js";
import { aacArgs, concat, ffmpeg, muxArgs, probe } from "../pipeline/ffmpeg.js";
import { cachedFile } from "../pipeline/cache.js";
import { montage, timecode } from "../pipeline/montage.js";
const now = () => performance.now() / 1000;
async function serve(entry, publicDir, log) {
    const { bundle } = await import("@remotion/bundler");
    const t = now();
    const url = await bundle({ entryPoint: path.resolve(entry), publicDir: publicDir && existsSync(publicDir) ? path.resolve(publicDir) : undefined });
    log(`bundled in ${(now() - t).toFixed(1)} s`);
    return url;
}
/** The keys: one per scene, one for what every segment shares. */
export function sceneKeys(cfg, root = process.cwd()) {
    const claimed = new Set(cfg.scenes.flatMap((s) => listFiles(s.files ?? [], root)));
    const claimedMedia = new Set(cfg.scenes.flatMap((s) => listFiles(s.media ?? [], root)));
    const src = listFiles(cfg.src ?? ["src"], root).filter((f) => !claimed.has(f));
    const extra = listFiles(cfg.shared ?? ["package.json", "package-lock.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"], root);
    const pub = listFiles([cfg.publicDir ?? "public"], root).filter((f) => !claimedMedia.has(f) && !(cfg.audio && path.resolve(root, cfg.audio) === f));
    const settings = { composition: cfg.composition, inputProps: cfg.inputProps ?? {}, scale: cfg.scale ?? 1, crf: cfg.crf ?? 18, preset: cfg.x264Preset ?? null, gl: cfg.gl ?? null, frames: cfg.frames ?? null };
    const shared = keyOf(settings, hashFiles([...src, ...extra], root), stampFiles(pub, root));
    const scenes = {};
    for (const s of cfg.scenes)
        scenes[s.name] = keyOf(s.props ?? null, hashFiles(listFiles(s.files ?? [], root), root), stampFiles(listFiles(s.media ?? [], root), root));
    return { shared, scenes };
}
/** Render only what changed, join, mux the soundtrack once. */
export async function renderScenes(cfg) {
    const t0 = now();
    const log = cfg.log ?? ((s) => console.error(`romp render: ${s}`));
    const cacheDir = path.resolve(cfg.cache ?? ".romp/cache", "render", cfg.composition);
    mkdirSync(cacheDir, { recursive: true });
    const keys = sceneKeys(cfg);
    const total = cfg.frames ?? Math.max(...cfg.scenes.map((s) => s.from + s.frames));
    const segs = planSegments(cfg.scenes, { transitions: cfg.transitions, total }).map((s) => {
        const key = keyOf(keys.shared, s.from, s.to, s.scenes.map((n) => keys.scenes[n]));
        return { ...s, key, file: path.join(cacheDir, `${key}.mp4`), rebuilt: false, seconds: 0 };
    });
    const force = new Set(cfg.force ?? []);
    const stale = segs.filter((s) => !existsSync(s.file) || s.scenes.some((n) => force.has(n)));
    log(`${segs.length} segments, ${stale.length} to render${stale.length ? `: ${stale.map((s) => s.name).join(", ")}` : ""}`);
    let tb = 0, tr = 0;
    if (stale.length) {
        const r = await import("@remotion/renderer");
        const t1 = now();
        const serveUrl = await serve(cfg.entry, cfg.publicDir ?? "public", log);
        tb = now() - t1;
        const chromiumOptions = cfg.gl ? { gl: cfg.gl } : {};
        const composition = await r.selectComposition({ serveUrl, id: cfg.composition, inputProps: cfg.inputProps ?? {}, chromiumOptions });
        const browser = await r.openBrowser("chrome", { chromiumOptions });
        try {
            for (const s of stale) {
                const ts = now();
                const tmp = path.join(cacheDir, `.${s.key}.${process.pid}.mp4`);
                await r.renderMedia({
                    composition,
                    serveUrl,
                    codec: "h264",
                    outputLocation: tmp,
                    inputProps: cfg.inputProps ?? {},
                    frameRange: [s.from, s.to],
                    muted: true,
                    crf: cfg.crf ?? 18,
                    ...(cfg.x264Preset ? { x264Preset: cfg.x264Preset } : {}),
                    concurrency: cfg.concurrency ?? null,
                    scale: cfg.scale ?? 1,
                    chromiumOptions,
                    puppeteerInstance: browser,
                    overwrite: true,
                });
                renameSync(tmp, s.file);
                s.rebuilt = true;
                s.seconds = now() - ts;
                log(`rendered ${s.name} (frames ${s.from}–${s.to}) in ${s.seconds.toFixed(1)} s`);
            }
        }
        finally {
            await browser.close({ silent: true });
        }
        tr = now() - t1 - tb;
    }
    const tj = now();
    const out = path.resolve(cfg.out);
    mkdirSync(path.dirname(out), { recursive: true });
    const silent = cfg.audio ? path.join(cacheDir, `.joined.${process.pid}.mp4`) : out;
    await concat(segs.map((s) => s.file), silent, path.join(cacheDir, `.list.${process.pid}.txt`));
    rmSync(path.join(cacheDir, `.list.${process.pid}.txt`), { force: true });
    if (cfg.audio) {
        // The soundtrack's AAC is encoded once per soundtrack (that encode is most of a mux's time), then copied in.
        const wav = path.resolve(cfg.audio);
        const aac = await cachedFile(path.join(cacheDir, "audio"), keyOf(stampFiles([wav]), "aac320"), ".m4a", (tmp) => ffmpeg(aacArgs(wav, tmp)).then(() => undefined));
        await ffmpeg(muxArgs(silent, aac.path, out, { copyAudio: true, seconds: total / (await probe(silent)).fps }));
        rmSync(silent, { force: true });
    }
    const join = now() - tj;
    const got = await probe(out);
    if (got.frames !== total)
        log(`warning: the joined video has ${got.frames} frames, expected ${total}`);
    const manifest = {
        composition: cfg.composition,
        out,
        frames: got.frames,
        segments: segs,
        rebuilt: [...new Set(segs.filter((s) => s.rebuilt).flatMap((s) => s.scenes))],
        seconds: { bundle: tb, render: tr, join, total: now() - t0 },
    };
    writeFileSync(`${out}.manifest.json`, JSON.stringify(manifest, null, 2));
    return manifest;
}
/** Contact sheets from one `renderFrames` call. */
export async function renderSheet(o) {
    const t0 = now();
    const log = o.log ?? ((s) => console.error(`romp sheet: ${s}`));
    const r = await import("@remotion/renderer");
    const serveUrl = await serve(o.entry, o.publicDir ?? "public", log);
    const chromiumOptions = o.gl ? { gl: o.gl } : {};
    const composition = await r.selectComposition({ serveUrl, id: o.composition, inputProps: o.inputProps ?? {}, chromiumOptions });
    const every = o.every ?? Math.round(composition.fps);
    const from = Math.max(0, o.from ?? 0), to = Math.min(composition.durationInFrames - 1, o.to ?? composition.durationInFrames - 1);
    const dir = mkdtempSync(path.join(os.tmpdir(), "romp-sheet-"));
    try {
        const tr = now();
        await r.renderFrames({
            composition,
            serveUrl,
            inputProps: o.inputProps ?? {},
            outputDir: dir,
            imageFormat: "jpeg",
            jpegQuality: 80,
            scale: o.scale ?? 0.5,
            frameRange: [from, to],
            everyNthFrame: every,
            concurrency: o.concurrency ?? null,
            chromiumOptions,
            onStart: () => { },
            onFrameUpdate: () => { },
        });
        const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
        log(`${files.length} frames rendered in ${(now() - tr).toFixed(1)} s`);
        const frames = files.map((_, i) => from + i * every);
        const label = (f) => {
            const sec = o.sections?.find((s) => f >= s.from && f <= s.to);
            return `${timecode(f / composition.fps)} · f${f}${sec ? ` · ${sec.name}` : ""}`;
        };
        const pages = await montage(files.map((f, i) => ({ file: path.join(dir, f), label: label(frames[i]) })), path.resolve(o.out), { cols: o.cols ?? 4, rows: o.rows ?? 3, tileWidth: o.tileWidth ?? 480, title: `${o.composition} · every ${every} frames · ${timecode(from / composition.fps)}–${timecode(to / composition.fps)}` });
        return { pages, frames: files.length, seconds: now() - t0 };
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
/** One frame at full resolution (PNG). */
export async function renderStill(o) {
    const r = await import("@remotion/renderer");
    const serveUrl = await serve(o.entry, o.publicDir ?? "public", o.log ?? (() => { }));
    const chromiumOptions = o.gl ? { gl: o.gl } : {};
    const composition = await r.selectComposition({ serveUrl, id: o.composition, inputProps: o.inputProps ?? {}, chromiumOptions });
    const out = path.resolve(o.out);
    mkdirSync(path.dirname(out), { recursive: true });
    await r.renderStill({ composition, serveUrl, frame: o.frame, output: out, inputProps: o.inputProps ?? {}, scale: o.scale ?? 1, chromiumOptions, overwrite: true });
    return out;
}
/** Time a short range at each concurrency; the fastest wins. */
export async function bench(o) {
    const log = o.log ?? ((s) => console.error(`romp bench: ${s}`));
    const r = await import("@remotion/renderer");
    const serveUrl = await serve(o.entry, o.publicDir ?? "public", log);
    const chromiumOptions = o.gl ? { gl: o.gl } : {};
    const composition = await r.selectComposition({ serveUrl, id: o.composition, inputProps: o.inputProps ?? {}, chromiumOptions });
    const range = o.frames ?? [0, Math.min(composition.durationInFrames - 1, 149)];
    const cores = os.cpus().length;
    const list = o.concurrencies ?? [...new Set([1, 2, 4, 6, 8, 12, 16].filter((c) => c <= cores).concat([cores]))].sort((a, b) => a - b);
    const dir = mkdtempSync(path.join(os.tmpdir(), "romp-bench-"));
    const results = [];
    const browser = await r.openBrowser("chrome", { chromiumOptions });
    try {
        for (const c of list) {
            const t = now();
            await r.renderMedia({ composition, serveUrl, codec: "h264", outputLocation: path.join(dir, `c${c}.mp4`), inputProps: o.inputProps ?? {}, frameRange: range, muted: true, concurrency: c, scale: o.scale ?? 1, chromiumOptions, puppeteerInstance: browser, overwrite: true });
            const seconds = now() - t;
            results.push({ concurrency: c, seconds, fps: (range[1] - range[0] + 1) / seconds });
            log(`concurrency ${c}: ${seconds.toFixed(1)} s (${results[results.length - 1].fps.toFixed(1)} frames/s)`);
        }
    }
    finally {
        await browser.close({ silent: true });
        rmSync(dir, { recursive: true, force: true });
    }
    const best = results.reduce((a, b) => (b.fps > a.fps ? b : a)).concurrency;
    return { results, best };
}
//# sourceMappingURL=render.js.map