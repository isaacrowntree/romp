import { describe, expect, it } from "vitest";
import * as theatre from "@theatre/core";
import { followSequence, objectSample, objectsRow, seekSequence, theatreFrames, theatreReport, type SequenceLike } from "../src/theatre/index.js";
import { Body, Stage, poseAtTime } from "../src/core/index.js";

// @theatre/core is CommonJS: its exports may sit on `default` when imported from ESM.
const core = ((theatre as any).getProject ? theatre : (theatre as any).default) as typeof theatre;

describe("romp/theatre", () => {
  it("drives a real Theatre sequence, and follows its playhead", () => {
    const sheet = core.getProject("romp theatre test").sheet("scene");
    const seen: number[] = [];
    const seek = seekSequence(sheet.sequence, (t) => seen.push(t));
    seek(1.25);
    expect(sheet.sequence.position).toBe(1.25);
    expect(seen).toEqual([1.25]);

    const driver = core.createRafDriver({ name: "romp test" });
    const followed: number[] = [];
    const stop = followSequence(sheet.sequence, core.onChange, (t) => followed.push(t), driver);
    sheet.sequence.position = 2;
    driver.tick(performance.now());
    sheet.sequence.position = 3.5;
    driver.tick(performance.now());
    stop();
    sheet.sequence.position = 4;
    driver.tick(performance.now());
    expect(followed).toContain(2);
    expect(followed).toContain(3.5);
    expect(followed).not.toContain(4);

    const obj = sheet.object("badge", { x: 100, y: 80, width: 40, height: 20, opacity: 0.5 });
    expect(objectsRow({ badge: obj }).badge).toMatchObject({ x: 100, y: 80, shown: true, area: 800, opacity: 0.5 });
  });

  it("hosts romp-baked motion on Theatre's timeline", () => {
    const stage = new Stage();
    stage.ground([{ x: 0, y: 400 }, { x: 800, y: 400 }]);
    stage.add(new Body({ id: "hero", x: 200, y: 100, w: 60, h: 60 }));
    stage.bake({ frames: 60 });
    const hero = stage.get<Body>("hero");
    const sheet = core.getProject("romp theatre host").sheet("scene");
    let drawn = { x: 0, y: 0 };
    const seek = seekSequence(sheet.sequence, (t) => (drawn = poseAtTime(hero, t)));
    seek(1);
    expect(drawn).toEqual(poseAtTime(hero, 1));
  });

  it("reads object props as samples: nested position/scale, size, visibility, the frame", () => {
    expect(objectSample({ position: { x: 10, y: 20 }, scale: { x: 2, y: 1 } }, { size: { w: 10, h: 10 } })).toMatchObject({ x: 10, y: 20, area: 200 });
    expect(objectSample({ x: 0, y: 0, width: 100, height: 100 }, { frame: { width: 800, height: 600 } })).toMatchObject({ area: 2500, onScreen: true });
    expect(objectSample({ x: 5, y: 5, visible: false }).shown).toBe(false);
  });

  it("steps a sequence for the motion check and puts the playhead back", () => {
    // A stand-in sequence: a badge that cuts in at 1 s at full size.
    const seq: SequenceLike = { position: 0.4, pointer: { position: null } };
    const collect = () => ({ badge: objectSample(seq.position >= 1 ? { x: 400, y: 300, width: 120, height: 60 } : { x: 400, y: 300, width: 120, height: 60, visible: false }) });
    const ticks: number[] = [];
    const frames = theatreFrames({ sequence: seq, collect, to: 2, seek: (t) => ticks.push(t) });
    expect(frames.length).toBe(61);
    expect(ticks.length).toBe(62); // every frame, then back
    expect(seq.position).toBe(0.4);
    const r = theatreReport({ sequence: seq, collect, to: 2, fps: 30 });
    expect(r.issues.map((i) => `${i.kind} ${i.frame}`)).toEqual(["pop 30"]);
  });
});
