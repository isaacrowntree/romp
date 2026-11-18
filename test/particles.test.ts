import { describe, expect, it } from "vitest";
import { Emitter, confetti, drawParticles, fountain, hash01, particleSample, particleStyle, particlesAt, snow, sparks, type Particle } from "../src/particles/index.js";
import { analyze, type FrameRow } from "../src/check/analyze.js";
import { trackBurst } from "../src/remotion/index.js";

const W = 800, H = 500;
/** each particle as its own tracked object */
const each = (e: Emitter, from: number, to: number): FrameRow[] =>
  Array.from({ length: to - from + 1 }, (_, k) => {
    const f = from + k;
    const row: FrameRow["row"] = {};
    for (const p of e.particlesAt(f)) row[`p${p.i}`] = { ...particleSample([p], { width: W, height: H }), x: p.x, y: p.y };
    return { f, row };
  });

describe("romp/particles", () => {
  it("is a pure function of the frame: same options, same particles, in any order", () => {
    const a = new Emitter(confetti({ x: 400, y: 300, at: 10, seed: 4, ground: 470 }));
    const b = new Emitter(confetti({ x: 400, y: 300, at: 10, seed: 4, ground: 470 }));
    const forward = Array.from({ length: 100 }, (_, f) => a.particlesAt(f));
    const backward = Array.from({ length: 100 }, (_, k) => b.particlesAt(99 - k)).reverse();
    expect(backward).toEqual(forward);
    expect(a.particlesAt(37.5)).toEqual(a.particlesAt(37.5));
    expect(forward[10].length).toBe(80);
    expect(forward[9]).toEqual([]); // nothing before `at`
  });

  it("each particle's launch depends only on its index: more particles don't reshuffle the first ones", () => {
    const few = new Emitter(sparks({ x: 100, y: 100, count: 10, seed: 9 })).particlesAt(5);
    const many = new Emitter(sparks({ x: 100, y: 100, count: 40, seed: 9 })).particlesAt(5);
    expect(many.slice(0, 10)).toEqual(few);
    expect(new Emitter(sparks({ x: 100, y: 100, count: 10, seed: 10 })).particlesAt(5)).not.toEqual(few);
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
  });

  it("flies in closed form: gravity without drag is a parabola", () => {
    const e = new Emitter({ count: 1, x: 0, y: 0, direction: 0, spread: 0, speed: 300, gravity: 1000, life: 2, grow: 0, fadeOut: 0 });
    const p = e.particlesAt(15)[0]; // 0.5 s
    expect(p.x).toBeCloseTo(150, 6);
    expect(p.y).toBeCloseTo(0.5 * 1000 * 0.25, 6);
    expect(p.vy).toBeCloseTo(500, 6);
  });

  it("drag slows it towards drifting (terminal speed = gravity / drag)", () => {
    const e = new Emitter({ count: 1, x: 0, y: 0, direction: Math.PI / 2, spread: 0, speed: 0, gravity: 100, drag: 2, life: 20 });
    expect(e.particlesAt(30 * 10)[0].vy).toBeCloseTo(50, 3);
  });

  it("lands on a ground and stays there: never through it", () => {
    const floor = 470;
    const e = new Emitter(confetti({ x: 400, y: 300, seed: 2, ground: floor }));
    let rested = 0;
    for (let f = 0; f < 100; f++) for (const p of e.particlesAt(f)) {
      expect(p.y).toBeLessThanOrEqual(floor + 0.5);
      if (p.resting) rested++;
    }
    expect(rested).toBeGreaterThan(0);
    const still = e.particlesAt(80).filter((p) => p.resting);
    const later = e.particlesAt(85).filter((p) => p.resting && still.some((q) => q.i === p.i));
    for (const p of later) {
      const q = still.find((s) => s.i === p.i)!;
      expect([p.x, p.y, p.angle]).toEqual([q.x, q.y, q.angle]);
    }
  });

  it("bounces off a sloped polyline ground (the points you gave stage.ground)", () => {
    const slope = [{ x: 0, y: 400 }, { x: 800, y: 300 }];
    const e = new Emitter(sparks({ x: 400, y: 100, direction: Math.PI / 2, spread: 0.6, seed: 5, ground: slope, life: [1.5, 2] }));
    const under = (p: Particle) => p.y > 400 - (p.x / 800) * 100 + 0.5;
    for (let f = 0; f < 60; f++) expect(e.particlesAt(f).filter(under)).toEqual([]);
  });

  it("grows in and fades out by default, so particles tracked one by one aren't pops", () => {
    const soft = new Emitter(confetti({ x: 400, y: 250, count: 12, seed: 3, at: 5 }));
    expect(soft.particlesAt(5).every((p) => p.size === 0)).toBe(true);
    expect(analyze(each(soft, 0, 110), { fps: 30 }).issues.filter((i) => i.kind === "pop")).toEqual([]);
    const hard = new Emitter(confetti({ x: 400, y: 250, count: 12, seed: 3, at: 5, grow: 0, fadeOut: 0 }));
    expect(analyze(each(hard, 0, 110), { fps: 30 }).issues.filter((i) => i.kind === "pop").length).toBeGreaterThan(0);
  });

  it("a spark burst checks clean as one object, though single sparks outrun the strobe limit", () => {
    const e = new Emitter(sparks({ x: 400, y: 250, at: 5, seed: 7, speed: [2400, 3600] }));
    expect(analyze(each(e, 0, 30), { fps: 30, width: W }).issues.some((i) => i.kind === "strobe")).toBe(true);
    const whole = Array.from({ length: 31 }, (_, f) => ({ f, row: { sparks: particleSample(e.particlesAt(f), { width: W, height: H }) } }));
    expect(analyze(whole, { fps: 30, width: W, height: H }).issues).toEqual([]);
  });

  it("streams: snow keeps falling from above the frame at its rate", () => {
    const e = new Emitter(snow({ width: W, height: H, until: 300, seed: 1 }));
    expect(e.count).toBe(240); // 24/s for 10 s
    const now = e.particlesAt(200);
    expect(now.length).toBeGreaterThan(100);
    expect(now.every((p) => p.y > -30 && p.x > -60 && p.x < W + 60)).toBe(true);
    expect(() => new Emitter({ rate: 10 })).toThrow(/count/);
    const fo = new Emitter(fountain({ x: 400, y: 470, count: 60, ground: 470 }));
    expect(fo.particlesAt(20).length).toBeGreaterThan(0);
    expect(fo.span[0]).toBe(0);
  });

  it("several emitters at once, tagged by id", () => {
    const a = new Emitter(sparks({ id: "a", x: 0, y: 0 })), b = new Emitter(confetti({ id: "b", x: 0, y: 0, count: 5 }));
    const all = particlesAt([a, b], 3);
    expect(all.length).toBe(36 + 5);
    expect(new Set(all.map((p) => p.emitter))).toEqual(new Set(["a", "b"]));
  });

  it("draws: inline CSS, canvas, and a tracked burst box for Remotion", () => {
    const ps = new Emitter(confetti({ x: 400, y: 250, seed: 1, shapes: ["star", "triangle", "line", "circle", "rect"] })).particlesAt(12);
    const st = particleStyle(ps[0]);
    expect(st.position).toBe("absolute");
    expect(String(st.transform)).toMatch(/translate\(.+px, .+px\) rotate\(.+rad\) scaleY\(/);
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === "roundRect" ? undefined : (..._a: unknown[]) => calls.push(String(k))), set: () => true }) as unknown as CanvasRenderingContext2D;
    drawParticles(ctx, ps);
    expect(calls.filter((c) => c === "fill").length).toBe(ps.length);
    const props = trackBurst("confetti", ps) as { "data-romp": string; style: Record<string, unknown> };
    expect(props["data-romp"]).toBe("confetti");
    expect(props.style.display).toBe("block");
    expect(trackBurst("none", []).style).toMatchObject({ display: "none" });
  });
});
