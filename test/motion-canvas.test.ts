import { describe, expect, it } from "vitest";
import { byKey, centred, motionCanvasReport, nodeSample, nodesRow, playBaked, type NodeLike } from "../src/motion-canvas/index.js";

// A stand-in for a Motion Canvas node: a w×h box at (x, y) from the view's centre.
const node = (key: string, x: number, y: number, w: number, h: number, opacity = 1): NodeLike => ({
  key,
  absolutePosition: () => ({ x, y }),
  absoluteOpacity: () => opacity,
  cacheBBox: () => ({ x: -w / 2, y: -h / 2, width: w, height: h }),
  localToWorld: () => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y }),
});

describe("romp/motion-canvas", () => {
  it("playBaked calls apply once per frame, by the scene's time, for its duration", () => {
    const ts: number[] = [];
    const gen = playBaked((t) => ts.push(t), { duration: 0.1, fps: 30 });
    let yields = 0;
    while (!gen.next().done) yields++;
    expect(ts.map((t) => +t.toFixed(4))).toEqual([0, 0.0333, 0.0667, 0.1]);
    expect(yields).toBe(3);
    // with Motion Canvas's useTime: time counted from where it starts
    let now = 2;
    const ts2: number[] = [];
    const g2 = playBaked((t) => ts2.push(t), { duration: 0.05, time: () => now });
    g2.next();
    now = 2.02;
    g2.next();
    now = 2.06;
    expect(g2.next().done).toBe(true);
    expect(ts2.map((t) => +t.toFixed(4))).toEqual([0, 0.02, 0.05]);
  });

  it("centred: screen px and radians → view px from the centre and degrees", () => {
    expect(centred({ x: 960, y: 540, angle: Math.PI / 2 }, 1920, 1080)).toEqual({ position: [0, 0], rotation: 90 });
    expect(centred({ x: 0, y: 0 }, 1920, 1080).position).toEqual([-960, -540]);
  });

  it("reads a node as a sample in frame px, through its world matrix", () => {
    const s = nodeSample(node("hero", 0, 0, 100, 50), 800, 600);
    expect(s).toMatchObject({ x: 400, y: 300, shown: true, onScreen: true, area: 5000, opacity: 1 });
    expect(s.box).toEqual({ x0: 350, y0: 275, x1: 450, y1: 325 });
    expect(nodeSample(null, 800, 600).shown).toBe(false);
    expect(nodeSample(node("ghost", 0, 0, 10, 10, 0), 800, 600).shown).toBe(false);
    expect(Object.keys(nodesRow({ a: node("a", 0, 0, 1, 1), b: undefined }, 800, 600))).toEqual(["a", "b"]);
    const view = { findAll: (pred: (n: any) => boolean) => [node("hero", 0, 0, 1, 1), node("other", 0, 0, 1, 1)].filter(pred) };
    expect(Object.keys(byKey(view, ["hero"]))).toEqual(["hero"]);
  });

  it("runs the motion check over a scene: a node that appears at full size is a pop", async () => {
    let frame = 0;
    const seen: number[] = [];
    const r = await motionCanvasReport({
      seek: async (f) => {
        frame = f;
        seen.push(f);
      },
      nodes: () => ({ logo: frame >= 15 ? node("logo", 0, 0, 200, 200) : null, ball: node("ball", -300 + frame * 10, 0, 40, 40) }),
      fps: 30,
      width: 800,
      height: 600,
      to: 1,
    });
    expect(seen.length).toBe(31);
    expect(r.issues.map((i) => `${i.kind} ${i.name} ${i.frame}`)).toEqual(["pop logo 15"]);
  });
});
