import { describe, expect, it } from "vitest";
import { analyze, type FrameRow, type Sample } from "../src/check/analyze.js";

const W = 800, H = 500, FPS = 30;
/** One object over `n` frames, its 100 px box at x0At(f). */
function frames(x0At: (f: number) => number, n = 90, extra: Partial<Sample> = {}): FrameRow[] {
  return Array.from({ length: n }, (_, f) => {
    const x0 = x0At(f);
    return { f, row: { hero: { x: x0 + 50, y: 250, shown: true, onScreen: x0 + 100 > 0 && x0 < W, area: 1e4, opacity: 1, box: { x0, y0: 200, x1: x0 + 100, y1: 300 }, ...extra } } };
  });
}
const lost = (fr: FrameRow[], o = {}) => analyze(fr, { fps: FPS, width: W, height: H, ...o }).issues.filter((i) => i.kind === "lost");

describe("lost", () => {
  it("flags a character that bounces out of the frame and stays out", () => {
    // In frame for a second, then flies off to the right at 40 px/frame and never comes back.
    const out = lost(frames((f) => (f < 30 ? 400 : 400 + (f - 30) * 40)));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("hero");
  });
  it("doesn't flag an entrance from off-frame", () => {
    expect(lost(frames((f) => Math.min(400, -300 + f * 20)))).toHaveLength(0);
  });
  it("doesn't flag a brief trip out that comes back within lostSeconds", () => {
    expect(lost(frames((f) => (f >= 30 && f < 50 ? 900 : 400)))).toHaveLength(0);
  });
  it("respects allowExit, per sample or by name", () => {
    const leaves = (f: number) => (f < 30 ? 400 : 400 + (f - 30) * 40);
    expect(lost(frames(leaves, 90, { allowExit: true }))).toHaveLength(0);
    expect(lost(frames(leaves), { allowExit: ["hero"] })).toHaveLength(0);
  });
  it("ignores covered frames", () => {
    expect(lost(frames((f) => (f < 30 ? 400 : 2000)), { covered: [[1, 3]] })).toHaveLength(0);
  });
});
