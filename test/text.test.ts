import { describe, expect, it } from "vitest";
import { analyze, type AnalyzeOptions, type FrameRow, type Sample } from "../src/check/analyze.js";
import { safeArea, boxOverlap } from "../src/check/text.js";
import { formatReport } from "../src/check/analyze.js";

const W = 1080, H = 1920, FPS = 30;
type B = { x0: number; y0: number; x1: number; y1: number };
/** A sample with a box (centre, area and on-screen from the box). */
const at = (box: B, o: Partial<Sample> = {}): Sample => ({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, shown: true, onScreen: true, area: (box.x1 - box.x0) * (box.y1 - box.y0), opacity: 1, box, ...o });
const CAP: B = { x0: 100, y0: 200, x1: 980, y1: 320 };
const text = (t: string, shown = t.length, o: Partial<Sample> = {}, box = CAP) => at(box, { role: "text", text: t, chars: { shown, total: t.length }, ...o });
/** n frames of rows. */
const film = (n: number, row: (f: number) => Record<string, Sample | undefined>): FrameRow[] =>
  Array.from({ length: n }, (_, f) => {
    const r = row(f);
    return { f, row: Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as Record<string, Sample> };
  });
const TEXT = ["offsafe", "covers", "overlap", "unfinished", "unread", "empty", "stale"];
/** The text rules' issues (the motion rules see these fixtures too: a caption cut out is a pop). */
const kinds = (fr: FrameRow[], o: AnalyzeOptions = {}, kind?: string) => analyze(fr, { fps: FPS, width: W, height: H, ...o }).issues.filter((i) => (kind ? i.kind === kind : TEXT.includes(i.kind)));

const LINE = "Cards and the help sheet are content too, edited right in place"; // 12 words: 4 s to read
/** A caption that types at `cps`, is whole from then on, and goes at frame `end`. */
const typed = (f: number, from: number, cps = 30) => Math.min(LINE.length, Math.max(0, Math.floor(((f - from) / FPS) * cps)));

describe("text rules: nothing new without roles", () => {
  it("leaves an untagged film alone", () => {
    const fr = film(60, (f) => ({ a: at({ x0: 0, y0: 0, x1: 100, y1: 100 }), b: at({ x0: 10, y0: 10, x1: 90, y1: 90 }, { chars: { shown: f % 3, total: 10 } }) }));
    expect(kinds(fr)).toEqual([]);
  });
});

describe("offsafe", () => {
  it("has phone-safe defaults for portrait and landscape", () => {
    expect(safeArea(1080, 1920)).toEqual({ top: 96, bottom: 96, left: 38, right: 38 });
    expect(safeArea(1920, 1080)).toEqual({ top: 38, bottom: 38, left: 96, right: 96 });
    expect(safeArea(1000, 1000, 0.1)).toEqual({ top: 100, bottom: 100, left: 100, right: 100 });
    expect(safeArea(1080, 1920, { top: 200 }).top).toBe(200);
  });
  it("flags a bubble that runs off the right edge", () => {
    const r = kinds(film(30, () => ({ bubble: text(LINE, LINE.length, {}, { x0: 400, y0: 900, x1: 1100, y1: 1100 }) })), {}, "offsafe");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/past the right safe margin/);
  });
  it("flags text that touches the edge, though it's all in frame (unlike cropped)", () => {
    expect(kinds(film(30, () => ({ cap: text("Hello there", 11, {}, { x0: 10, y0: 900, x1: 500, y1: 1000 }) }))).map((i) => i.kind)).toEqual(["offsafe"]);
  });
  it("lets text slide in, and respects allow and transparency", () => {
    const slide = film(30, (f) => ({ cap: text("Hi", 2, {}, { x0: -300 + f * 15, y0: 900, x1: 200 + f * 15, y1: 1000 }) }));
    expect(kinds(slide, {}, "offsafe")).toEqual([]);
    const off = film(30, () => ({ cap: text("Hi", 2, {}, { x0: 0, y0: 900, x1: 500, y1: 1000 }) }));
    expect(kinds(off, { allow: { offsafe: ["cap"] } }, "offsafe")).toEqual([]);
    expect(kinds(off, { allow: { offsafe: ["c*"] } }, "offsafe")).toEqual([]);
    expect(kinds(off, { safe: 0 }, "offsafe")).toEqual([]);
    expect(kinds(film(30, () => ({ cap: text("Hi", 2, { opacity: 0.3 }, { x0: 0, y0: 900, x1: 500, y1: 1000 }) })), {}, "offsafe")).toEqual([]);
  });
});

describe("covers", () => {
  const button: B = { x0: 300, y0: 1000, x1: 800, y1: 1100 };
  it("flags a bubble over the highlighted button", () => {
    const fr = film(30, () => ({ bubble: text("Yes, that's mine", 16, {}, { x0: 100, y0: 950, x1: 900, y1: 1150 }), ring: at(button, { role: "focus" }) }));
    const r = kinds(fr, {}, "covers");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/of the focus ring/);
  });
  it("is fine away from it, or for a moment", () => {
    expect(kinds(film(30, () => ({ bubble: text("Hi", 2, {}, { x0: 100, y0: 1300, x1: 900, y1: 1500 }), ring: at(button, { role: "focus" }) })), {}, "covers")).toEqual([]);
    expect(kinds(film(30, (f) => ({ bubble: text("Hi", 2, {}, f < 3 ? { x0: 100, y0: 950, x1: 900, y1: 1150 } : { x0: 100, y0: 1300, x1: 900, y1: 1500 }), ring: at(button, { role: "focus" }) })), {}, "covers")).toEqual([]);
  });
});

describe("overlap", () => {
  it("flags two texts on top of each other", () => {
    const fr = film(30, () => ({ title: text("Moved, and tested", 17), sub: text("1000 checks", 11, {}, { x0: 200, y0: 300, x1: 800, y1: 400 }) }));
    expect(kinds(fr, {}, "overlap")).toHaveLength(1);
  });
  it("flags a prop drawn over a title, not one drawn under it", () => {
    const dots = (z: number) => film(30, () => ({ title: text("Moved, and tested", 17, { z: 5 }), dot: at({ x0: 500, y0: 220, x1: 560, y1: 280 }, { role: "prop", z }) }));
    expect(kinds(dots(9), {}, "overlap")).toHaveLength(1);
    expect(kinds(dots(1), {}, "overlap")).toEqual([]);
  });
  it("only counts untagged objects as props under strict", () => {
    const fr = film(30, () => ({ title: text("Every page the same!", 20), paper: at({ x0: 400, y0: 250, x1: 700, y1: 500 }) }));
    expect(kinds(fr, {}, "overlap")).toEqual([]);
    expect(kinds(fr, { strict: true }, "overlap")).toHaveLength(1);
  });
});

describe("unfinished", () => {
  it("flags a caption that goes mid-word", () => {
    const fr = film(60, (f) => ({ cap: f < 40 ? text(LINE, typed(f, 0, 30)) : undefined }));
    const r = kinds(fr, {}, "unfinished");
    expect(r).toHaveLength(1);
    expect(r[0].frame).toBe(40);
    expect(r[0].detail).toMatch(/gone at 39 of 63 characters \("Cards/);
  });
  it("flags one whose scene cuts, or a transition covers, while it's still typing", () => {
    const fr = film(80, (f) => ({ cap: text(LINE, typed(f, 0, 30)) }));
    expect(kinds(fr, { scenes: [1.5] }, "unfinished")[0].detail).toMatch(/the scene cuts/);
    expect(kinds(fr, { covered: [[1.5, 2]] }, "unfinished")[0].detail).toMatch(/covered/);
  });
});

describe("unread", () => {
  it("flags a line whole for less than its reading time", () => {
    // types in 2.1 s, then whole for 1 s of the 4 s it takes
    const fr = film(120, (f) => ({ cap: f < 93 ? text(LINE, typed(f, 0)) : undefined }));
    const r = kinds(fr, {}, "unread");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/whole; it takes 4\.0 s to read/);
  });
  it("passes a line held for its reading time", () => {
    const fr = film(220, (f) => ({ cap: f < 200 ? text(LINE, typed(f, 0)) : undefined }));
    expect(kinds(fr)).toEqual([]);
  });
  it("uses the words given, or the reading options", () => {
    const fr = film(80, (f) => ({ cap: f < 60 ? at(CAP, { role: "text", words: 3 }) : undefined }));
    expect(kinds(fr)).toEqual([]); // 3 words: 1.5 s, shown 2 s
    expect(kinds(fr, { reading: { min: 3 } }, "unread")).toHaveLength(1);
  });
});

describe("empty", () => {
  it("flags a bubble drawn before any words", () => {
    const fr = film(120, (f) => ({ bubble: f < 110 ? text("Hi there", f < 20 ? 0 : 8) : undefined }));
    const r = kinds(fr, {}, "empty");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/no words/);
  });
  it("lets a bubble pop in a few frames before typing", () => {
    expect(kinds(film(120, (f) => ({ bubble: f < 110 ? text("Hi there", f < 4 ? 0 : 8) : undefined })))).toEqual([]);
  });
  it("flags a heading still typing after its scene starts (a blank title)", () => {
    const fr = film(240, (f) => ({ head: text(LINE, typed(f, 0, 20), { heading: true }) }));
    const r = kinds(fr, {}, "empty");
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/heading still typing/);
    // the same words in a bubble may type
    expect(kinds(film(240, (f) => ({ b: text(LINE, typed(f, 0, 20)) })), {}, "empty")).toEqual([]);
  });
});

describe("stale", () => {
  const still = film(300, () => ({ cap: text("Short", 5), van: at({ x0: 100, y0: 1500, x1: 400, y1: 1700 }) }));
  it("is off unless strict or asked for", () => {
    expect(kinds(still, {}, "stale")).toEqual([]);
  });
  it("flags a long hold with nothing moving once the words are read", () => {
    const r = kinds(still, { strict: true }, "stale");
    expect(r).toHaveLength(1);
    expect(r[0].frame).toBe(44); // its 45th frame whole: read (1.5 s)
    expect(kinds(still, { stale: 10 }, "stale")).toEqual([]);
  });
  it("is fine while something moves", () => {
    const moving = film(300, (f) => ({ cap: text("Short", 5), van: at({ x0: 100 + f, y0: 1500, x1: 400 + f, y1: 1700 }) }));
    expect(kinds(moving, { strict: true }, "stale")).toEqual([]);
  });
});

describe("report", () => {
  it("prints the new kinds with time, name and detail", () => {
    const fr = film(60, (f) => ({ cap: f < 40 ? text(LINE, typed(f, 0)) : undefined }));
    const out = formatReport(analyze(fr, { fps: FPS, width: W, height: H }), FPS);
    expect(out).toMatch(/40 +1\.33s +unfinished cap: gone at 39 of 63/);
  });
  it("measures the area two boxes share", () => {
    expect(boxOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 20, y1: 20 })).toBe(25);
    expect(boxOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 11, y0: 0, x1: 20, y1: 10 })).toBe(0);
  });
});
