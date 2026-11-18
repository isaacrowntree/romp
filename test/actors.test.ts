import { describe, expect, it } from "vitest";
import { Body, Drop, Leap, Stage, poseAt, poseAtTime, type Actor } from "../src/core/index.js";

const floor = (s: Stage, y = 400) => s.ground([{ x: -2000, y }, { x: 4000, y }]);

describe("poseAt discrete blending", () => {
  // A hand-made actor whose `shown` flips between frames 1 and 2.
  const flip: Actor<{ shown: boolean; x: number; label: string }> = {
    build() {},
    sample: () => ({ shown: true, x: 0, label: "a" }),
    frames: [
      { shown: false, x: 0, label: "a" },
      { shown: false, x: 0, label: "a" },
      { shown: true, x: 10, label: "b" },
    ],
  };
  it("nearest (the default) switches at the halfway point", () => {
    expect(poseAt(flip, 1.4).shown).toBe(false);
    expect(poseAt(flip, 1.6).shown).toBe(true);
    expect(poseAt(flip, 1.6, { discrete: "nearest" }).label).toBe("b");
  });
  it("previous holds the earlier frame until the next one", () => {
    expect(poseAt(flip, 1.6, { discrete: "previous" }).shown).toBe(false);
    expect(poseAt(flip, 1.99, { discrete: "previous" }).label).toBe("a");
    expect(poseAt(flip, 2, { discrete: "previous" }).shown).toBe(true);
    expect(poseAtTime(flip, 1.6 / 30, 30, { discrete: "previous" }).shown).toBe(false);
  });
});

describe("Stage.add and Stage.pose", () => {
  it("sets actor.stage before build", () => {
    const s = new Stage();
    let seen: Stage | undefined;
    s.add({ build(st: Stage) { seen = (this as Actor).stage; void st; }, sample: () => ({ shown: true }) } as Actor);
    expect(seen).toBe(s);
  });
  it("hands each actor its interpolated pose, and NaN poses as hidden", () => {
    const s = new Stage();
    floor(s);
    const got: unknown[] = [];
    const b = s.add(new Body({ id: "b", x: 100, y: 0, w: 40, h: 40, vy: 300 }));
    (b as Body & { apply?: (p: unknown) => void }).apply = (p) => got.push(p);
    const bad: Actor<{ shown: boolean; x: number }> = { build() {}, sample: () => ({ shown: true, x: Number.NaN }), apply: (p) => got.push(p) };
    s.add(bad);
    s.bake({ frames: 20, fps: 30 });
    s.pose(0.25);
    expect((got[0] as { shown: boolean }).shown).toBe(true);
    expect(got[1]).toEqual({ shown: false });
  });
});

describe("Drop", () => {
  const drop = (o: Partial<ConstructorParameters<typeof Drop>[0]> = {}) => {
    const s = new Stage();
    floor(s);
    const d = s.add(new Drop({ id: "pin", x: 100, y: 0, w: 40, h: 40, ...o }));
    s.bake({ frames: 90, fps: 30 });
    return d;
  };
  it("keeps its old defaults (lands, records an impact)", () => {
    const d = drop();
    expect(d.impacts.length).toBeGreaterThan(0);
    expect(Number.isFinite(d.landed)).toBe(true);
  });
  it("unwinds spin and tilt to zero exactly at touchdown, and arrests depth drift", () => {
    const d = drop({ spinAt: 2, tilt: 0.4, z: [-300, 0] });
    const start = d.flight(0), mid = d.flight(d.landed / 2), at = d.flight(d.landed), after = d.flight(d.landed + 20);
    expect(start.spin).toBeCloseTo(2);
    expect(Math.abs(mid.spin)).toBeLessThan(2);
    expect(at.spin).toBeCloseTo(0);
    expect(at.tilt).toBeCloseTo(0);
    expect(at.z).toBeCloseTo(0);
    expect(after.z).toBeCloseTo(0);
  });
  it("falls faster with a larger gravity scale", () => {
    expect(drop({ gravityScale: 3 }).landed).toBeLessThan(drop().landed);
  });
  it("touches the ground with its foot, and rocks the way it's told when it lands straight down", () => {
    const d = drop({ foot: 6, rock: -1 });
    const rest = poseAt(d, 89);
    expect(Math.abs(rest.y + 20 - 400)).toBeLessThan(2); // feet (centre + half height) on the floor, within Box2D's contact skin
    expect(d.flight(89).rockDir).toBe(-1);
  });
  it("lands on its own ledge, drawn in its parent's frame", () => {
    const s = new Stage();
    const d = s.add(new Drop({ id: "far", x: 20100, y: 0, w: 30, h: 30, ledge: { x0: 20000, x1: 20200, y: 250 }, frame: { x: 20000, y: 0 } }));
    s.bake({ frames: 90, fps: 30 });
    const p = d.framePose(89);
    expect(p.x).toBeCloseTo(100, 0);
    expect(Math.abs(p.y + 15 - 250)).toBeLessThan(2);
  });
});

describe("Leap", () => {
  it("scales gravity and offsets its pose by frame", () => {
    const run = (gravity?: number) => {
      const s = new Stage();
      const l = s.add(new Leap({ id: "fish", x: 100, y: 420, vx: 120, vy: -700, surface: 400, gravity, frame: { x: 100, y: 0 } }));
      s.bake({ frames: 120, fps: 30 });
      return l;
    };
    const normal = run(), heavy = run(3);
    expect(heavy.crossings[1].frame).toBeLessThan(normal.crossings[1].frame);
    expect(poseAt(normal, 2).x).toBeLessThan(40); // drawn relative to x = 100
  });
});
