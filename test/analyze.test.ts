import { describe, expect, it } from "vitest";
import { analyze, type FrameRow, type Sample } from "../src/check/analyze.js";

const s = (x: number, y = 500, o: Partial<Sample> = {}): Sample => ({ x, y, shown: true, onScreen: true, area: 10000, opacity: 1, ...o });
const frames = (fn: (f: number) => Sample | undefined, n = 40): FrameRow[] =>
  Array.from({ length: n }, (_, f) => {
    const v = fn(f);
    return { f, row: v ? { obj: v } : {} };
  });

describe("analyze", () => {
  it("passes smooth motion", () => {
    expect(analyze(frames((f) => s(100 + f * 5))).issues).toEqual([]);
  });
  it("flags a pop: appears at full size, opaque, in frame", () => {
    const r = analyze(frames((f) => (f < 10 ? s(100, 500, { shown: false, area: 0, opacity: 0 }) : s(100))));
    expect(r.issues.map((i) => i.kind)).toContain("pop");
  });
  it("doesn't flag a fade-in or a seamless swap", () => {
    const fade = analyze(frames((f) => (f < 10 ? s(100, 500, { shown: false, area: 0, opacity: 0 }) : s(100, 500, { opacity: Math.min(1, (f - 10) / 6) * 0.3 }))));
    expect(fade.issues).toEqual([]);
    const swap = analyze(frames((f) => (f < 10 ? s(100, 500, { shown: false, area: 0, opacity: 0 }) : s(100, 500, { seamless: true }))));
    expect(swap.issues).toEqual([]);
  });
  it("flags a strobe and a teleport (scaled to the frame width)", () => {
    const strobe = analyze(frames((f) => s(100 + f * 130)), { width: 886 });
    expect(strobe.issues.some((i) => i.kind === "strobe")).toBe(true);
    const tp = analyze(frames((f) => s(f === 20 ? 900 : 100)), { width: 886 });
    expect(tp.issues.some((i) => i.kind === "teleport")).toBe(true);
    // at 1080 wide, 110 px/frame is under the scaled strobe threshold
    expect(analyze(frames((f) => s(f * 110)), { width: 1080 }).issues.some((i) => i.kind === "strobe")).toBe(false);
  });
  it("flags a spike (a kink) but not at an impact", () => {
    const kink = (f: number) => s(100 + f * 4 + (f === 20 ? 30 : 0));
    expect(analyze(frames(kink)).issues.some((i) => i.kind === "spike")).toBe(true);
    expect(analyze(frames(kink), { impacts: { obj: [20] } }).issues.some((i) => i.kind === "spike")).toBe(false);
    expect(analyze(frames((f) => ({ ...kink(f), impact: f === 20 }))).issues.some((i) => i.kind === "spike")).toBe(false);
  });
  it("skips whips (speed) and covered frames (everything)", () => {
    const fast = frames((f) => s(100 + f * 130));
    expect(analyze(fast, { whips: [[0, 2]] }).issues.filter((i) => i.kind === "strobe")).toEqual([]);
    const pop = frames((f) => (f < 10 ? s(100, 500, { shown: false, area: 0, opacity: 0 }) : s(100)));
    expect(analyze(pop, { covered: [[0.25, 0.4]] }).issues).toEqual([]);
  });
});
