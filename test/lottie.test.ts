// @vitest-environment happy-dom
// lottie-web, for real, under a DOM shim, playing a hand-written After Effects-style export.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectLottie, lottieFrames, lottieReport, type LottieLike } from "../src/lottie/index.js";

const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/check.lottie.json"), "utf8"));
let load: (d: unknown) => LottieLike;

beforeAll(async () => {
  // happy-dom has no canvas; lottie-web only needs one for its image preloader.
  (HTMLCanvasElement.prototype as any).getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  const lottie = (await import("lottie-web/build/player/lottie_svg.js")).default as any;
  load = (d) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    return lottie.loadAnimation({ container, renderer: "svg", loop: false, autoplay: false, animationData: structuredClone(d) });
  };
});

describe("romp/lottie", () => {
  it("reads layers through parents and precomps, with their boxes", () => {
    const anim = load(data);
    anim.goToAndStop(0, true);
    const row = collectLottie(anim);
    expect(Object.keys(row).sort()).toEqual(["badge", "ball", "card", "card/label", "fader", "jumper"]); // no null "rig"
    // the ball's position is its parent's (100, 0) plus its own (0, 150), a 40 px circle
    expect(row.ball.x).toBeCloseTo(100, 3);
    expect(row.ball.y).toBeCloseTo(150, 3);
    expect(row.ball.box).toEqual({ x0: 80, y0: 130, x1: 120, y1: 170 });
    // a layer inside a precomp sits where the precomp puts it
    expect(row["card/label"].box).toEqual({ x0: 170, y0: 190, x1: 230, y1: 210 });
    expect(row.badge.shown).toBe(false); // before its in-point
    anim.goToAndStop(59, true);
    expect(collectLottie(anim).ball.x).toBeCloseTo(300, 3);
  });

  it("flags the cut-in at full size and the hold-keyframe jump, and nothing else", () => {
    const r = lottieReport(load(data));
    expect(r.frames).toBe(60);
    const found = r.issues.map((i) => `${i.kind} ${i.name} ${i.frame}`);
    expect(found).toContain("pop badge 20");
    expect(found).toContain("teleport jumper 30");
    // (the jump is also a kink either side of it); the eased ball, the fade and the precomp are clean
    expect(new Set(r.issues.map((i) => i.name))).toEqual(new Set(["badge", "jumper"]));
  });

  it("tracks only the layers asked for, and a frame range", () => {
    const frames = lottieFrames(load(data), { layers: ["ball", "label"], from: 10, to: 19 });
    expect(frames.map((f) => f.f)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(Object.keys(frames[0].row).sort()).toEqual(["ball", "card/label"]);
  });

  it("a fade-in isn't a pop; the same layer cut in at full opacity is", () => {
    const cut = structuredClone(data);
    cut.layers.find((l: { nm: string }) => l.nm === "fader").ks.o = { a: 0, k: 100 };
    const kinds = (d: unknown) => lottieReport(load(d), { layers: ["fader"] }).issues.map((i) => i.kind);
    expect(kinds(data)).toEqual([]);
    expect(kinds(cut)).toEqual(["pop"]);
  });
});
