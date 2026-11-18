import { describe, expect, it } from "vitest";
import { Instruments, listen, type Schedule } from "../src/audio/index.js";
import { cartoon } from "../src/audio/cartoon.js";

const BEAT = 0.5;
const schedule: Schedule = (s, bus, at) => {
  const band = new Instruments(s);
  for (let b = 0; b < 8; b++) {
    const t = at(b * BEAT);
    if (t == null) continue;
    band.kick(t, bus.drums, { vel: 0.4 });
    if (b % 2 === 0) s.marimba(t, 74 + b, bus.music);
  }
  band.upright(1, 45, bus.music); // plucks inside: recorded once, as an upright
  s.ding(2.2, bus.sfx); // a marimba and a bell inside
  s.boing(1.3, s.pan(0.4, bus.sfx), { k: 1 }); // through a panner: still the sfx bus
  s.whoosh(3, 0.5, bus.sfx, { vel: 0.2, peakAt: 0.6 });
  s.crackle(0.2, 1.2, bus.sfx, { vel: 0.05 });
};

describe("romp/audio listen(): sound as a signal", () => {
  const score = listen(schedule, { extend: cartoon });

  it("records every voice the schedule plays, with its bus, level and note", () => {
    const kicks = score.select({ voice: "kick" });
    expect(kicks.map((e) => e.t)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(kicks.every((e) => e.bus === "drums" && e.vel === 0.4 && e.shape === "hit")).toBe(true);
    const marimba = score.select({ voice: "marimba" });
    expect(marimba.map((e) => e.midi)).toEqual([74, 76, 78, 80]);
    expect(marimba[0]).toMatchObject({ bus: "music", vel: 0.3 }); // the voice's default level
    expect(score.select({ voice: "boing" })[0]).toMatchObject({ bus: "sfx", t: 1.3 });
  });

  it("records the outermost call only (an upright's pluck, a ding's marimba aren't extra events)", () => {
    expect(score.select({ voice: "pluck" })).toEqual([]);
    expect(score.select({ voice: ["upright", "ding"] }).map((e) => e.voice)).toEqual(["upright", "ding"]);
    expect(score.select({ voice: "bell" })).toEqual([]);
  });

  it("is deterministic: the same schedule, the same score", () => {
    expect(listen(schedule, { extend: cartoon }).events).toEqual(score.events);
  });

  it("onsetsBetween is half-open", () => {
    expect(score.onsetsBetween(0.5, 1.5, { voice: "kick" }).map((e) => e.t)).toEqual([0.5, 1]);
    expect(score.onsetsBetween(0, 0.25, { bus: "music" }).map((e) => e.voice)).toEqual(["marimba"]);
  });

  it("envelopeAt: a hit attacks, then decays over its ring", () => {
    const env = (t: number) => score.envelopeAt(t, { voice: "kick" });
    expect(score.envelopeAt(-0.1)).toBe(0);
    expect(env(0.005)).toBeCloseTo(0.4, 6);
    expect(env(0.05)).toBeLessThan(env(0.005));
    expect(env(0.45)).toBeLessThan(0.01);
    expect(env(0.505)).toBeCloseTo(0.4, 2);
    // a shorter decay for a snappier pulse
    expect(score.envelopeAt(0.1, { voice: "kick", decay: 0.05 })).toBeLessThan(env(0.1));
    // a swell peaks at its peakAt; a bed holds
    expect(score.envelopeAt(3.3, { voice: "whoosh" })).toBeCloseTo(0.2, 6);
    expect(score.envelopeAt(3.1, { voice: "whoosh" })).toBeCloseTo(0.2 / 3, 6);
    expect(score.envelopeAt(0.7, { voice: "crackle" })).toBe(0.05);
    expect(score.envelopeAt(1.3, { voice: "crackle" })).toBe(0);
  });

  it("beatAt: where t sits between the drum onsets", () => {
    expect(score.beatAt(-0.1).index).toBe(-1);
    expect(score.beatAt(0.25)).toMatchObject({ index: 0, phase: 0.5, since: 0.25, t0: 0, t1: 0.5 });
    expect(score.beatAt(1.6).index).toBe(3);
    expect(score.beatAt(9)).toMatchObject({ index: 7, phase: 0 });
    // any selection can be the grid
    expect(score.beatAt(1.1, { voice: "marimba" })).toMatchObject({ index: 1, t0: 1, t1: 2 });
  });

  it("needs a synchronous schedule", () => {
    expect(() => listen(async () => {})).toThrow(/synchronous/);
  });
});
