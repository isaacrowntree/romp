import { describe, expect, it } from "vitest";
import { analyze, inFrameShare, type FrameRow, type Sample } from "../src/check/analyze.js";

const W = 800, H = 500, FPS = 30;
/** One object, 40 frames, its box positioned by `x0At(f)` (100 px wide, inside vertically). */
function frames(x0At: (f: number) => number, extra: Partial<Sample> = {}): FrameRow[] {
  return Array.from({ length: 40 }, (_, f) => {
    const x0 = x0At(f);
    return { f, row: { hero: { x: x0 + 50, y: 250, shown: true, onScreen: x0 + 100 > 0 && x0 < W, area: 100 * 100, opacity: 1, box: { x0, y0: 200, x1: x0 + 100, y1: 300 }, ...extra } } };
  });
}
const crops = (fr: FrameRow[], o = {}) => analyze(fr, { fps: FPS, width: W, height: H, ...o }).issues.filter((i) => i.kind === "cropped");

describe("cropped", () => {
  it("measures a box's share inside the frame", () => {
    expect(inFrameShare({ x0: -50, y0: 0, x1: 50, y1: 100 }, W, H)).toBeCloseTo(0.5);
    expect(inFrameShare({ x0: 10, y0: 10, x1: 60, y1: 60 }, W, H)).toBe(1);
  });
  it("flags an object parked half out of frame for longer than 0.5 s", () => {
    const r = crops(frames(() => 750)); // 50% out, for all 40 frames
    expect(r).toHaveLength(1);
    expect(r[0].detail).toMatch(/50% of it outside the frame/);
  });
  it("ignores a short crop", () => {
    expect(crops(frames((f) => (f < 10 ? 750 : 400)))).toHaveLength(0); // 10 frames < 15
  });
  it("ignores an entrance (its on-frame share only rises) and an exit (only falls)", () => {
    expect(crops(frames((f) => 800 - f * 2))).toHaveLength(0); // sliding in slowly from the right
    expect(crops(frames((f) => 700 + f * 2))).toHaveLength(0); // sliding out
  });
  it("flags a crop that wobbles in and out (not a clean entrance)", () => {
    expect(crops(frames((f) => 740 + (f % 2) * 20))).toHaveLength(1);
  });
  it("respects allowCrop, covered frames and the thresholds", () => {
    expect(crops(frames(() => 750, { allowCrop: true }))).toHaveLength(0);
    expect(crops(frames(() => 750), { allowCrop: ["hero"] })).toHaveLength(0);
    expect(crops(frames(() => 750), { covered: [[0, 2]] })).toHaveLength(0);
    expect(crops(frames(() => 750), { croppedFraction: 0.6 })).toHaveLength(0);
    expect(crops(frames((f) => (f < 20 ? 750 : 400)), { croppedSeconds: 0.5 })).toHaveLength(1); // 20 frames > 15
    expect(crops(frames((f) => (f < 20 ? 750 : 400)), { croppedSeconds: 1 })).toHaveLength(0);
  });
  it("is off without the frame's height (backward compatible)", () => {
    expect(analyze(frames(() => 750), { fps: FPS, width: W }).issues.filter((i) => i.kind === "cropped")).toHaveLength(0);
  });
});
