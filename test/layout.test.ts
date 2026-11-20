import { describe, expect, it } from "vitest";
import { analyze, type AnalyzeOptions, type FrameRow, type Sample } from "../src/check/analyze.js";
import { unionShare } from "../src/check/layout.js";

const W = 1080, H = 1920, FPS = 30;
type B = { x0: number; y0: number; x1: number; y1: number };
const box = (x: number, y: number, w: number, h: number): B => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const at = (b: B, o: Partial<Sample> = {}): Sample => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, shown: true, onScreen: true, area: (b.x1 - b.x0) * (b.y1 - b.y0), opacity: 1, box: b, ...o });
const film = (n: number, row: (f: number) => Record<string, Sample | undefined>): FrameRow[] =>
  Array.from({ length: n }, (_, f) => {
    const r = row(f);
    return { f, row: Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as Record<string, Sample> };
  });
const issues = (fr: FrameRow[], kind: string, o: AnalyzeOptions = {}) => analyze(fr, { fps: FPS, width: W, height: H, ...o }).issues.filter((i) => i.kind === kind);
const text = (b: B, o: Partial<Sample> = {}) => at(b, { role: "text", text: "Plan the trip", chars: { shown: 13, total: 13 }, ...o });

describe("blank", () => {
  it("flags a second of empty frame between scenes", () => {
    const fr = film(90, (f) => ({ cap: f < 30 || f >= 60 ? text(box(100, 200, 880, 120)) : undefined }));
    const r = issues(fr, "blank");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ frame: 30, name: "(frame)" });
    expect(r[0].detail).toMatch(/nothing tracked is visible for 1\.0 s/);
  });
  it("counts only-background as blank, and spares covered spans and short gaps", () => {
    const bg = at(box(0, 0, W, H), { role: "background" });
    const fr = film(90, (f) => ({ bg, cap: f < 30 || f >= 60 ? text(box(100, 200, 880, 120)) : undefined }));
    expect(issues(fr, "blank")).toHaveLength(1);
    expect(issues(fr, "blank", { covered: [[1, 2]] })).toEqual([]);
    expect(issues(film(90, (f) => ({ cap: f < 40 || f >= 50 ? text(box(100, 200, 880, 120)) : undefined })), "blank")).toEqual([]);
    expect(issues(fr, "blank", { blankSeconds: false })).toEqual([]);
  });
  it("leaves a film that tags nothing alone (unless strict)", () => {
    const fr = film(90, (f) => ({ a: f < 30 ? at(box(0, 0, 100, 100)) : undefined }));
    expect(issues(fr, "blank")).toEqual([]);
    expect(issues(fr, "blank", { strict: true })).toHaveLength(1);
  });
});

describe("clipped", () => {
  const phone = (clip?: B, o: Partial<Sample> = {}) => at(box(300, 400, 480, 1040), { role: "screen", native: { width: 390 }, clip, ...o });
  it("flags a screenshot cut off by the phone it sits in", () => {
    const r = issues(film(30, () => ({ app: phone(box(300, 400, 480, 900)) })), "clipped");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/13% of its content is cut off/);
  });
  it("passes a whole screen, one sliding in through a mask, and a deliberate crop", () => {
    expect(issues(film(30, () => ({ app: phone() })), "clipped")).toEqual([]);
    expect(issues(film(30, (f) => ({ app: phone(box(300, 400, 480, 30 + f * 34)) })), "clipped")).toEqual([]);
    expect(issues(film(30, () => ({ app: phone(box(300, 400, 480, 900), { allowCrop: true }) })), "clipped")).toEqual([]);
    // The frame's edge isn't a clipping container: that's cropped's business.
    expect(issues(film(30, () => ({ app: at(box(700, 400, 480, 1040), { role: "screen", clip: box(700, 400, 380, 1040) }) })), "clipped")).toEqual([]);
  });
});

describe("legibility: text size", () => {
  it("flags a label set too small, scaled with the frame", () => {
    const fr = film(30, () => ({ label: text(box(100, 200, 400, 30), { fontPx: 14 }) }));
    expect(issues(fr, "legibility")[0].detail).toMatch(/text renders at 14\.0 px, under 20 px/);
    expect(issues(film(30, () => ({ label: text(box(100, 200, 400, 30), { fontPx: 28 }) })), "legibility")).toEqual([]);
    expect(analyze(fr, { fps: FPS, width: 540, height: 960 }).issues.filter((i) => i.kind === "legibility")).toEqual([]);
    expect(issues(fr, "legibility", { textPx: 12 })).toEqual([]);
  });
  it("lets a text grow in", () => {
    expect(issues(film(30, (f) => ({ label: text(box(100, 200, 400, 30), { fontPx: 4 + f * 2 }) })), "legibility")).toEqual([]);
  });
});

describe("occupancy (opt-in)", () => {
  const tiny = () => ({ a: at(box(440, 860, 200, 200)), b: text(box(400, 1100, 280, 60)) });
  it("flags everything tiny in the middle of the frame, when asked", () => {
    const fr = film(90, tiny);
    expect(issues(fr, "occupancy")).toEqual([]);
    const r = issues(fr, "occupancy", { occupancy: true });
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/covers [23]% of the frame for 3\.0 s/);
    expect(issues(fr, "occupancy", { occupancy: { share: 0.02 } })).toEqual([]);
    expect(issues(fr, "occupancy", { occupancy: { seconds: 5 } })).toEqual([]);
  });
  it("counts a frame-filling screen, not a background", () => {
    expect(issues(film(90, () => ({ ...tiny(), app: at(box(100, 200, 880, 1500), { role: "screen" }) })), "occupancy", { occupancy: true })).toEqual([]);
    expect(issues(film(90, () => ({ ...tiny(), bg: at(box(0, 0, W, H), { role: "background" }) })), "occupancy", { occupancy: true })).toHaveLength(1);
    expect(unionShare([box(0, 0, 540, 1920), box(0, 0, 540, 1920)], W, H)).toBeCloseTo(0.5, 2);
  });
});

describe("overlap: a heading on a screen", () => {
  const app = at(box(100, 300, 880, 1400), { role: "screen", native: { width: 390 }, z: 1 });
  it("flags a heading sitting on the screen's content", () => {
    const r = issues(film(30, () => ({ app, title: text(box(140, 360, 800, 140), { z: 2 }) })), "overlap");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/sits on the screen app's content with no panel/);
  });
  it("passes one on a solid panel of its own; flags a screen drawn over a heading", () => {
    expect(issues(film(30, () => ({ app, title: text(box(140, 360, 800, 140), { z: 2, opaque: true }) })), "overlap")).toEqual([]);
    const over = issues(film(30, () => ({ app: { ...app, z: 3 }, title: text(box(140, 360, 800, 140), { z: 2, opaque: true }) })), "overlap");
    expect(over[0].detail).toMatch(/the screen app is drawn over it/);
  });
  it("passes a heading above the screen, and a background under it", () => {
    expect(issues(film(30, () => ({ app, title: text(box(140, 140, 800, 140), { z: 2 }) })), "overlap")).toEqual([]);
    expect(issues(film(30, () => ({ bg: at(box(0, 0, W, H), { role: "background", z: 5 }), title: text(box(140, 140, 800, 140), { z: 2 }) })), "overlap")).toEqual([]);
  });
});

describe("layoutOnly (sampled frames)", () => {
  it("skips the motion and timing rules and keeps the layout ones", () => {
    // A pop, a strobe and a caption cut mid-word, plus a caption past the edge.
    const fr = film(60, (f) => ({
      pop: f >= 10 ? at(box(400, 800, 300, 300)) : undefined,
      fast: at(box(f * 150 - 4000, 1300, 50, 50)),
      cap: f < 20 ? text(box(100, 200, 880, 120), { chars: { shown: 5, total: 13 } }) : undefined,
      edge: text(box(1000, 600, 300, 100)),
    }));
    const all = analyze(fr, { fps: FPS, width: W, height: H }).issues.map((i) => i.kind);
    expect(all).toEqual(expect.arrayContaining(["pop", "strobe", "unfinished", "offsafe"]));
    const lay = analyze(fr, { fps: FPS, width: W, height: H, layoutOnly: true }).issues.map((i) => i.kind);
    expect(lay).toContain("offsafe");
    expect(lay.filter((k) => ["pop", "strobe", "teleport", "jump", "spike", "lost", "unfinished", "unread", "empty", "stale"].includes(k))).toEqual([]);
  });
});

describe("spike at a scene cut", () => {
  it("isn't flagged when the cut is declared", () => {
    // Bobbing gently, then restarting its bob at the cut (frame 30).
    const fr = film(60, (f) => ({ dot: at(box(500 + Math.sin(((f % 30) + 5) / 3) * 30, 900, 40, 40)) }));
    expect(issues(fr, "spike").length).toBeGreaterThan(0);
    expect(issues(fr, "spike", { scenes: [1] })).toEqual([]);
  });
});
