import { describe, expect, it } from "vitest";
import { analyze, type AnalyzeOptions, type FrameRow, type Sample } from "../src/check/analyze.js";
import { boxGap } from "../src/check/screen.js";

const W = 1080, H = 1920, FPS = 30;
type B = { x0: number; y0: number; x1: number; y1: number };
const at = (box: B, o: Partial<Sample> = {}): Sample => ({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, shown: true, onScreen: true, area: (box.x1 - box.x0) * (box.y1 - box.y0), opacity: 1, box, ...o });
const film = (n: number, row: (f: number) => Record<string, Sample | undefined>): FrameRow[] =>
  Array.from({ length: n }, (_, f) => {
    const r = row(f);
    return { f, row: Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as Record<string, Sample> };
  });
const issues = (fr: FrameRow[], kind: string, o: AnalyzeOptions = {}) => analyze(fr, { fps: FPS, width: W, height: H, ...o }).issues.filter((i) => i.kind === kind);
/** A box w×h with its top-left at (x, y). */
const box = (x: number, y: number, w: number, h: number): B => ({ x0: x, y0: y, x1: x + w, y1: y + h });
/** A phone screenshot (390 CSS px wide, 844 tall) drawn `w` px wide. */
const phone = (x: number, y: number, w: number, o: Partial<Sample> = {}) => at(box(x, y, w, (w * 844) / 390), { role: "screen", native: { width: 390 }, ...o });

describe("legibility", () => {
  it("flags a phone mock a third of a portrait frame wide", () => {
    const r = issues(film(30, () => ({ app: phone(360, 600, 360) })), "legibility");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/16 px text renders at 14\.8 px/);
  });
  it("flags a whole desktop page in a browser frame", () => {
    const page = at(box(90, 700, 900, 600), { role: "screen", native: { width: 1440 } });
    expect(issues(film(30, () => ({ page })), "legibility")).toHaveLength(1);
  });
  it("passes a phone drawn big enough, and a zoomed or cropped screen", () => {
    expect(issues(film(30, () => ({ app: phone(200, 300, 680) })), "legibility")).toEqual([]);
    // Zoomed past the frame onto the part that matters: legible, and not cropped.
    const zoom = film(30, () => ({ app: phone(-400, -200, 1900) }));
    expect(issues(zoom, "legibility")).toEqual([]);
    expect(issues(zoom, "cropped")).toEqual([]);
  });
  it("lets a screen zoom in from small", () => {
    expect(issues(film(30, (f) => ({ app: phone(200, 300, 200 + f * 20) })), "legibility")).toEqual([]);
  });
  it("takes the content's own text size, the frame size and allow", () => {
    const small = film(30, () => ({ app: phone(360, 600, 360, { minTextPx: 24 }) }));
    expect(issues(small, "legibility")).toEqual([]);
    const fr = film(30, () => ({ app: phone(360, 600, 360) }));
    expect(issues(fr, "legibility", { allow: { legibility: ["app"] } })).toEqual([]);
    expect(issues(fr, "legibility", { legiblePx: 14 })).toEqual([]);
    // Half the frame, half the minimum: 14.8 px on a 540-wide frame is fine.
    expect(analyze(fr, { fps: FPS, width: 540, height: 960 }).issues.filter((i) => i.kind === "legibility")).toEqual([]);
    // Untagged, or without a native size: no verdict.
    expect(issues(film(30, () => ({ app: phone(360, 600, 360, { native: undefined }) })), "legibility")).toEqual([]);
  });
});

describe("cropped: screens and focus", () => {
  it("flags a phone 2% off the right edge, which a prop may be", () => {
    const fr = film(30, () => ({ app: phone(688, 500, 400) }));
    const r = issues(fr, "cropped");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/2\.\d% of it outside.*must be wholly in it/);
    expect(issues(film(30, () => ({ app: phone(688, 500, 400, { role: "prop" }) })), "cropped")).toEqual([]);
    expect(issues(film(30, () => ({ ring: at(box(1000, 500, 100, 100), { role: "focus" }) })), "cropped")).toHaveLength(1);
  });
  it("lets it slide in, and takes a numeric allowCrop", () => {
    expect(issues(film(30, (f) => ({ app: phone(1080 - f * 20, 500, 400) })), "cropped")).toEqual([]);
    expect(issues(film(30, () => ({ app: phone(700, 500, 400, { allowCrop: 0.05 }) })), "cropped")).toEqual([]);
    expect(issues(film(30, () => ({ app: phone(700, 500, 400, { allowCrop: true }) })), "cropped")).toEqual([]);
    expect(issues(film(30, () => ({ app: phone(700, 500, 400) })), "cropped", { screenCroppedFraction: 0.05 })).toEqual([]);
  });
  it("still lets a numeric allowCrop flag what goes past it", () => {
    expect(issues(film(30, () => ({ hero: at(box(900, 500, 400, 400), { allowCrop: 0.1 }) })), "cropped")).toHaveLength(1);
  });
});

describe("overlap: props over a title", () => {
  const TITLE = box(100, 200, 880, 140);
  const title = () => at(TITLE, { role: "text", text: "Plan the trip", chars: { shown: 13, total: 13 }, z: 1 });
  it("flags a fast prop crossing a title, even in four frames", () => {
    // A vehicle sprite crossing the title at 60 px a frame: over it for ~4 frames.
    const fr = film(30, (f) => ({ title: title(), van: f >= 10 && f < 30 ? at(box(-200 + (f - 10) * 60, 260, 160, 80), { role: "prop", z: 2 }) : undefined }));
    const r = issues(fr, "overlap");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/van is drawn over it/);
  });
  it("flags untagged tracked props under strict only", () => {
    const fr = film(30, (f) => ({ title: title(), paper: at(box(300 + f, 250, 60, 60), { z: 2 }) }));
    expect(issues(fr, "overlap")).toEqual([]);
    expect(issues(fr, "overlap", { strict: true })).toHaveLength(1);
  });
  it("lets a prop drawn under the title, or one frame of a glancing pass, go", () => {
    expect(issues(film(30, () => ({ title: title(), bg: at(box(0, 0, 1080, 600), { role: "prop", z: 0 }) })), "overlap")).toEqual([]);
    expect(issues(film(30, (f) => ({ title: title(), dot: f === 12 ? at(box(400, 250, 20, 20), { role: "prop", z: 2 }) : undefined })), "overlap")).toEqual([]);
  });
});

describe("jump and anchor: a bubble that snaps to its line", () => {
  const BUBBLE = (y: number, o: Partial<Sample> = {}) => at(box(200, y, 500, 160), { role: "text", text: "Here we go", chars: { shown: 10, total: 10 }, ...o });
  it("flags a 60 px snap up at a scene start", () => {
    // Appears 60 px low on frame 10, snaps up on frame 11, then sits still.
    const fr = film(40, (f) => ({ bubble: f < 10 ? undefined : BUBBLE(f === 10 ? 1060 : 1000) }));
    const r = issues(fr, "jump");
    expect(r.map((i) => i.frame)).toEqual([11]);
    expect(r[0].detail).toMatch(/snapped 60 px/);
    // At a declared cut it's a new shot, not a snap.
    expect(issues(fr, "jump", { scenes: [11 / FPS] })).toEqual([]);
  });
  it("leaves steady fast motion, easing and animation on twos alone", () => {
    expect(issues(film(30, (f) => ({ ball: at(box(f * 30, 500, 80, 80)) })), "jump")).toEqual([]);
    expect(issues(film(30, (f) => ({ ball: at(box(Math.min(f, 15) * 40, 500, 80, 80)) })), "jump")).toEqual([]);
    expect(issues(film(30, (f) => ({ walk: at(box(Math.floor(f / 2) * 50, 500, 80, 80)) })), "jump")).toEqual([]);
  });
  it("flags a bubble below its ground line, entering or leaving", () => {
    const fr = film(40, (f) => ({ bubble: BUBBLE(f < 5 ? 1100 - f * 30 : f > 30 ? 960 + (f - 30) * 20 : 960, { ground: 1150 }) }));
    const r = issues(fr, "anchor");
    expect(r).toHaveLength(2);
    expect(r[0].frame).toBe(0);
    expect(r[0].detail).toMatch(/below its ground line \(y 1150\)/);
    expect(issues(film(40, () => ({ bubble: BUBBLE(960, { ground: 1150 }) })), "anchor")).toEqual([]);
  });
  it("flags a bubble far from its speaker", () => {
    const speaker = at(box(100, 1200, 200, 400));
    const near = film(30, () => ({ guide: speaker, bubble: BUBBLE(1000, { anchor: "guide" }) }));
    expect(issues(near, "anchor")).toEqual([]);
    const far = film(30, () => ({ guide: speaker, bubble: BUBBLE(400, { anchor: "guide" }) }));
    expect(issues(far, "anchor")[0].detail).toMatch(/640 px from guide/);
    expect(boxGap(box(0, 0, 10, 10), box(13, 14, 5, 5))).toBe(5);
  });
});
