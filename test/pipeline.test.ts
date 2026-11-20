import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { stableKey, keyOf, hashString } from "../src/pipeline/key.js";
import { planSegments } from "../src/pipeline/segments.js";
import { aacArgs, concatArgs, concatList, encodeArgs, muxArgs, marksArgs, parseMarks, concat, ffmpeg, probe, marksFromVideo } from "../src/pipeline/ffmpeg.js";
import { acquireLock, LockHeld } from "../src/pipeline/lock.js";
import { cachedFile } from "../src/pipeline/cache.js";
import { hashFiles, listFiles, stampFiles } from "../src/pipeline/files.js";
import { pages, sheetHtml, timecode } from "../src/pipeline/montage.js";
import { soundKey } from "../src/audio/index.js";
import { sceneKeys } from "../src/remotion/render.js";
import { renderPlan } from "../src/remotion/index.js";
import { timeline } from "../src/timing/index.js";

const tmp = mkdtempSync(path.join(os.tmpdir(), "romp-pipe-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("keys", () => {
  it("are stable across key order and runs, and change with any value", () => {
    expect(stableKey({ b: 1, a: [1, "x"] })).toBe(stableKey({ a: [1, "x"], b: 1 }));
    expect(keyOf({ a: 1 })).toBe(keyOf({ a: 1 }));
    expect(keyOf({ a: 1 })).not.toBe(keyOf({ a: 2 }));
    expect(hashString("abc")).toMatch(/^[0-9a-f]{28}$/);
  });
  it("key functions by their source, typed arrays by contents", () => {
    expect(keyOf((x: number) => x + 1)).toBe(keyOf((x: number) => x + 1));
    expect(keyOf((x: number) => x + 1)).not.toBe(keyOf((x: number) => x + 2));
    expect(keyOf(new Float32Array([1, 2]))).not.toBe(keyOf(new Float32Array([1, 3])));
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => stableKey(a)).not.toThrow();
  });
  it("soundKey: same schedule, options and data → same key; a changed cue → a new one", () => {
    const sched = (s: any, bus: any, at: any) => void [s, bus, at];
    const cues = [0, 1.5, 3];
    expect(soundKey(sched, { duration: 10 }, cues)).toBe(soundKey(sched, { duration: 10 }, [0, 1.5, 3]));
    expect(soundKey(sched, { duration: 10 }, cues)).not.toBe(soundKey(sched, { duration: 10 }, [0, 1.5, 3.2]));
    expect(soundKey(sched, { duration: 10 }, cues)).not.toBe(soundKey(sched, { duration: 11 }, cues));
  });
});

describe("planSegments", () => {
  const scenes = [
    { name: "a", from: 0, frames: 100 },
    { name: "b", from: 85, frames: 115 }, // overlaps a by 15 (a transition)
    { name: "c", from: 200, frames: 100 }, // a hard cut
  ];
  it("cuts at scene starts and ends, isolating shared stretches", () => {
    const s = planSegments(scenes);
    expect(s.map((x) => [x.name, x.from, x.to])).toEqual([
      ["a", 0, 84],
      ["a→b", 85, 99],
      ["b", 100, 199],
      ["c", 200, 299],
    ]);
    // Every frame once, in order.
    expect(s.reduce((n, x) => n + x.to - x.from + 1, 0)).toBe(300);
  });
  it("never cuts inside a declared transition", () => {
    // A transition declared across the hard cut: 190–210 stays in one segment.
    const s = planSegments(scenes, { transitions: [[190, 210]] });
    expect(s.find((x) => x.from <= 195 && x.to >= 205)).toBeTruthy();
    for (const x of s) expect(x.from <= 190 || x.from >= 210).toBe(true);
    expect(s.find((x) => x.from === 190)!.scenes).toEqual(["b", "c"]);
  });
  it("comes from a timeline (renderPlan), transitions declared", () => {
    const film = timeline([{ name: "one", seconds: 3 }, { name: "two", seconds: 3 }, { name: "three", seconds: 3 }], { fps: 30, transition: 0.5 });
    const p = renderPlan(film);
    expect(p.transitions).toEqual([[film.scenes[1].start, film.scenes[1].start + 15], [film.scenes[2].start, film.scenes[2].start + 15]]);
    const s = planSegments(p.scenes, { transitions: p.transitions, total: p.frames });
    expect(s.map((x) => x.name)).toEqual(["one", "one→two", "two", "two→three", "three"]);
    expect(s[s.length - 1].to).toBe(film.frames - 1);
  });
});

describe("scene keys (render cache)", () => {
  const root = path.join(tmp, "film");
  mkdirSync(path.join(root, "src/scenes"), { recursive: true });
  mkdirSync(path.join(root, "public"), { recursive: true });
  writeFileSync(path.join(root, "src/Film.tsx"), "export const Film = 1;");
  writeFileSync(path.join(root, "src/scenes/a.json"), '{"t":"A"}');
  writeFileSync(path.join(root, "src/scenes/b.json"), '{"t":"B"}');
  writeFileSync(path.join(root, "public/b.mp4"), "video");
  const cfg = {
    entry: "src/index.ts",
    composition: "Film",
    out: "out.mp4",
    scenes: [
      { name: "a", from: 0, frames: 30, files: ["src/scenes/a.json"] },
      { name: "b", from: 30, frames: 30, files: ["src/scenes/b.json"], media: ["public/b.mp4"] },
    ],
  };
  it("changes only the edited scene's key", () => {
    const k0 = sceneKeys(cfg, root);
    writeFileSync(path.join(root, "src/scenes/b.json"), '{"t":"B2"}');
    const k1 = sceneKeys(cfg, root);
    expect(k1.scenes.a).toBe(k0.scenes.a);
    expect(k1.scenes.b).not.toBe(k0.scenes.b);
    expect(k1.shared).toBe(k0.shared);
  });
  it("a shared source, a scene's media or the render settings change what they should", () => {
    const k0 = sceneKeys(cfg, root);
    const t = new Date(Date.now() + 60_000);
    utimesSync(path.join(root, "public/b.mp4"), t, t);
    const k1 = sceneKeys(cfg, root);
    expect(k1.scenes.b).not.toBe(k0.scenes.b);
    expect(k1.scenes.a).toBe(k0.scenes.a);
    writeFileSync(path.join(root, "src/Film.tsx"), "export const Film = 2;");
    expect(sceneKeys(cfg, root).shared).not.toBe(k1.shared);
    expect(sceneKeys({ ...cfg, crf: 20 }, root).shared).not.toBe(sceneKeys(cfg, root).shared);
  });
  it("hashes files by content and stamps media by size and time", () => {
    const files = listFiles(["src"], root);
    expect(files.map((f) => path.relative(root, f))).toEqual(["src/Film.tsx", "src/scenes/a.json", "src/scenes/b.json"]);
    expect(hashFiles(files, root)).toBe(hashFiles([...files].reverse(), root));
    expect(stampFiles(listFiles(["public"], root), root)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("ffmpeg recipes", () => {
  it("builds concat, mux and one-pass multi-size encodes", () => {
    expect(concatList(["/a/x.mp4", "/a/it's.mp4"])).toBe("file '/a/x.mp4'\nfile '/a/it'\\''s.mp4'\n");
    expect(concatArgs("l.txt", "o.mp4")).toEqual(expect.arrayContaining(["-f", "concat", "-c", "copy", "o.mp4"]));
    expect(muxArgs("v.mp4", "a.wav", "o.mp4")).toEqual(expect.arrayContaining(["-c:v", "copy", "-shortest"]));
    // A cached AAC is copied in, cut to the video's length (not -shortest, which can drop the last frame).
    const m = muxArgs("v.mp4", "a.m4a", "o.mp4", { copyAudio: true, seconds: 200 });
    expect(m).toEqual(expect.arrayContaining(["-c:a", "copy", "-t", "200.000000"]));
    expect(m).not.toContain("-shortest");
    expect(aacArgs("a.wav", "a.m4a")).toEqual(expect.arrayContaining(["-c:a", "aac", "-b:a", "320k"]));
    const e = encodeArgs("in.mp4", [{ file: "4k.mp4" }, { file: "hd.mp4", height: 1080, crf: 20 }]);
    expect(e.filter((a) => a === "-i")).toHaveLength(1);
    expect(e[e.indexOf("-filter_complex") + 1]).toBe("[0:v]split=2[s0][s1];[s0]null[v0];[s1]scale=-2:1080:flags=lanczos[v1]");
    expect(e.slice(-1)).toEqual(["hd.mp4"]);
    expect(marksArgs("r.mp4", 0.4).join(" ")).toContain("gt(scene\\,0.4)");
  });
  it("reads cut times from showinfo, a minimum gap apart", () => {
    const err = "[Parsed_showinfo_1] n:0 pts:150 pts_time:5.005 duration\n[Parsed_showinfo_1] n:1 pts:153 pts_time:5.1 x\n[Parsed_showinfo_1] n:2 pts:300 pts_time:10 x";
    expect(parseMarks(err)).toEqual([5.005, 10]);
    expect(parseMarks(err, 0)).toEqual([5.005, 5.1, 10]);
  });
  it.skipIf(!hasFfmpeg)("joins segments with -c copy frame-exactly, encodes two sizes in one pass, and finds planted cuts", async () => {
    const seg = (name: string, color: string, frames: number) => {
      const f = path.join(tmp, `${name}.mp4`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=320x240:r=30`, "-frames:v", String(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", f]);
      return f;
    };
    const parts = [seg("s1", "red", 45), seg("s2", "blue", 30), seg("s3", "green", 60)];
    const joined = path.join(tmp, "joined.mp4");
    await concat(parts, joined);
    expect((await probe(joined)).frames).toBe(135);
    // Planted cuts: the colour changes at 1.5 s and 2.5 s.
    const marks = await marksFromVideo(joined, { threshold: 0.3 });
    expect(marks.map((t) => Math.round(t * 10) / 10)).toEqual([1.5, 2.5]);
    const a = path.join(tmp, "big.mp4"), b = path.join(tmp, "small.mp4");
    await ffmpeg(encodeArgs(joined, [{ file: a, preset: "ultrafast" }, { file: b, height: 120, preset: "ultrafast" }]));
    expect((await probe(a)).height).toBe(240);
    expect((await probe(b)).height).toBe(120);
  }, 60_000);
});

describe("the lock", () => {
  const dir = path.join(tmp, "locks");
  it("refuses a second holder while the first is alive, then frees", () => {
    const l = acquireLock("device-1", { dir });
    expect(() => acquireLock("device-1", { dir })).toThrow(LockHeld);
    const other = acquireLock("device-2", { dir });
    other.release();
    l.release();
    acquireLock("device-1", { dir }).release();
  });
  it("takes over a lock left by a process that died", () => {
    writeFileSync(path.join(dir, "device-3.lock"), JSON.stringify({ pid: 999999, since: "earlier" }));
    const l = acquireLock("device-3", { dir });
    expect(JSON.parse(readFileSync(l.file, "utf8")).pid).toBe(process.pid);
    l.release();
    expect(existsSync(l.file)).toBe(false);
  });
});

describe("cachedFile", () => {
  it("makes once, then hits", async () => {
    let made = 0;
    const make = async (p: string) => {
      made++;
      writeFileSync(p, "sound");
    };
    const a = await cachedFile(path.join(tmp, "c"), "k1", ".wav", make);
    const b = await cachedFile(path.join(tmp, "c"), "k1", ".wav", make);
    expect([a.hit, b.hit, made]).toEqual([false, true, 1]);
    expect(readFileSync(b.path, "utf8")).toBe("sound");
  });
  it("leaves nothing behind when making fails", async () => {
    await expect(cachedFile(path.join(tmp, "c"), "k2", ".wav", async () => { throw new Error("no"); })).rejects.toThrow("no");
    expect(existsSync(path.join(tmp, "c", "k2.wav"))).toBe(false);
  });
});

describe("contact sheets", () => {
  it("pages tiles, labels them and escapes", () => {
    expect(pages([1, 2, 3, 4, 5, 6, 7], 3, 2).map((p) => p.length)).toEqual([6, 1]);
    expect(timecode(65.25)).toBe("1:05.3");
    const html = sheetHtml([{ src: "data:x", label: "0:01.0 · <b>" }], { cols: 4, tileWidth: 300, title: "Film" });
    expect(html).toContain("repeat(4,300px)");
    expect(html).toContain("0:01.0 · &lt;b&gt;");
  });
});
