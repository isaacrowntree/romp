import { describe, expect, it } from "vitest";
import { Body, LAYER, poseAt, poseAtTime, SpringyBody, Stage } from "../src/core/stage.js";
import { impactResponse, landing, nearImpact } from "../src/core/motion.js";

function pile() {
  const s = new Stage();
  s.ground([{ x: 0, y: 200 }, { x: 0, y: 800 }, { x: 600, y: 800 }, { x: 600, y: 200 }]);
  for (let i = 0; i < 5; i++) s.add(new Body({ id: `b${i}`, x: 150 + i * 70, y: 0, w: 80, h: 80, spawn: i * 4, vx: (i % 2 ? -1 : 1) * 60, vy: 600, spin: 0.4 }));
  return s.bake({ frames: 90 });
}

describe("Stage", () => {
  it("is deterministic: baking twice gives identical poses", () => {
    const a = pile(), b = pile();
    for (const id of ["b0", "b2", "b4"]) expect(a.get(id).frames).toEqual(b.get(id).frames);
  });

  it("records impacts when a body lands, with speed", () => {
    const s = pile();
    const b = s.get<Body>("b0");
    expect(b.impacts.length).toBeGreaterThan(0);
    expect(b.impacts[0].speed).toBeGreaterThan(100);
    expect(b.landed).toBeGreaterThan(0);
  });

  it("hides a body before its spawn frame and interpolates between frames", () => {
    const s = pile();
    expect(poseAt(s.get("b4"), 10).shown).toBe(false);
    expect(poseAt(s.get("b4"), 20).shown).toBe(true);
    const p = poseAt(s.get("b0"), 5.5), q = poseAt(s.get("b0"), 5), r = poseAt(s.get("b0"), 6);
    expect(p.y).toBeCloseTo((q.y + r.y) / 2, 6);
    // seconds and frames read the same motion
    expect(poseAtTime(s.get("b0"), 0.5, 30)).toEqual(poseAt(s.get("b0"), 15));
  });

  it("works y-up (three.js) with gravity pointing down the screen's y", () => {
    const s = new Stage({ yDown: false });
    s.ground([{ x: -500, y: 0 }, { x: 500, y: 0 }]);
    s.add(new Body({ id: "ball", shape: "circle", x: 0, y: 300, w: 40, h: 40 }));
    s.bake({ frames: 60 });
    const b = s.get<Body>("ball");
    expect(poseAt(b, 60).y).toBeLessThan(poseAt(b, 0).y);
    expect(b.impacts.length).toBeGreaterThan(0);
  });

  it("SpringyBody welds only when it lands on its own ground", () => {
    const s = new Stage();
    const shelf = s.ground([{ x: 0, y: 400 }, { x: 200, y: 400 }], { layer: LAYER.B });
    s.ground([{ x: 300, y: 700 }, { x: 600, y: 700 }]);
    const onShelf = s.add(new SpringyBody({ id: "a", x: 100, y: 200, w: 60, h: 80, ground: shelf, groundY: 400, mask: LAYER.B }));
    const elsewhere = s.add(new SpringyBody({ id: "b", x: 450, y: 300, w: 60, h: 80, ground: shelf, groundY: 400 }));
    s.bake({ frames: 60 });
    expect(onShelf.isWelded).toBe(true);
    expect(elsewhere.isWelded).toBe(false);
  });
});

describe("motion", () => {
  it("squashes on landing and settles back", () => {
    expect(landing(10, 10).squashY).toBeLessThan(1);
    expect(Math.abs(landing(200, 10).squashY - 1)).toBeLessThan(0.05);
  });
  it("responds to real impacts", () => {
    const s = pile();
    const b = s.get<Body>("b0");
    const f = Math.ceil(b.impacts[0].frame);
    expect(impactResponse(b, f).squashY).toBeLessThan(0.95);
    expect(nearImpact(b.impacts, f)).toBe(true);
    expect(nearImpact(b.impacts, 0)).toBe(false);
  });
});

describe("sideways impacts", () => {
  it("records a bounce off a wall as a side impact, and landed ignores it", () => {
    const s = new Stage({ gravity: 0 });
    s.ground([{ x: 500, y: -1000 }, { x: 500, y: 1000 }]);
    s.add(new Body({ id: "ball", shape: "circle", x: 200, y: 0, w: 60, h: 60, vx: 900, restitution: 0.8 }));
    const b = s.bake({ frames: 60 }).get("ball");
    const side = b.impacts.filter((h) => h.side);
    expect(side.length).toBeGreaterThan(0);
    expect(nearImpact(b.impacts, side[0].frame)).toBe(true);
  });
});
