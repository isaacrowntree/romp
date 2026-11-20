import { describe, expect, it } from "vitest";
import { alive, blinks, gaze, hop, jump, keepVolume, react, REACTION_FRAMES, speechLength, syllables, talk, talkPose } from "../src/core/index.js";

describe("syllables", () => {
  it("counts English vowel groups, with a word-final silent e joining the one before", () => {
    expect(syllables("pearl").length).toBe(1);
    expect(syllables("make").length).toBe(1);
    expect(syllables("banana").length).toBe(3);
    expect(syllables("little").length).toBe(2);
  });
  it("gives each Chinese character its own syllable, and Latin runs inside them their own", () => {
    expect(syllables("珍珠").length).toBe(2);
    expect(syllables("任何PEARL店").length).toBe(4);
  });
  it("pauses after punctuation and between words, in order, without overlap", () => {
    const s = syllables("Hi, you. Ok");
    for (let i = 1; i < s.length; i++) expect(s[i].t0).toBeGreaterThanOrEqual(s[i - 1].t1);
    expect(s[1].t0 - s[0].t1).toBeGreaterThan(0.15); // after the comma
  });
  it("is deterministic, and fits a given length exactly", () => {
    expect(syllables("One tap, Face ID.", { seed: 3 })).toEqual(syllables("One tap, Face ID.", { seed: 3 }));
    expect(speechLength(syllables("One tap, Face ID.", { fit: 2.5 }))).toBeCloseTo(2.5, 9);
  });
  it("maps vowels to mouths: o/u round, i wide", () => {
    expect(syllables("go")[0].vowel).toBe("o");
    expect(syllables("see")[0].vowel).toBe("e");
    expect(syllables("hi")[0].vowel).toBe("i");
  });
});

describe("talk", () => {
  const s = syllables("Hello, PEARL.", { seed: 2 });
  it("opens inside a syllable and closes in the pause after a comma", () => {
    const mid = (s[0].t0 + s[0].t1) / 2;
    expect(talk(mid, s).open).toBeGreaterThan(0.5);
    const pause = (s[1].t1 + s[2].t0) / 2;
    expect(talk(pause, s).mouth).toBe("closed");
    expect(talk(pause, s).talking).toBe(true);
  });
  it("is silent before and after the line", () => {
    expect(talk(-0.1, s).talking).toBe(false);
    expect(talk(speechLength(s) + 0.1, s)).toMatchObject({ open: 0, talking: false });
  });
  it("rounds the mouth on o", () => {
    const o = syllables("go");
    expect(talk((o[0].t0 + o[0].t1) / 2, o).mouth).toBe("round");
  });
  it("gives a body that nods on stresses and keeps its volume", () => {
    const p = talkPose(10, (s[0].t0 + s[0].t1) / 2, s, 1);
    expect(p.speech.talking).toBe(true);
    expect(p.squashX * p.squashY ** 0.7).toBeGreaterThan(0.95);
  });
});

describe("gaze", () => {
  const keys = [{ at: 10, x: 1 }, { at: 60, x: -1 }];
  it("jumps to a look in a few frames, then holds it", () => {
    expect(gaze(9, { keys, wander: 0 }).x).toBeCloseTo(0, 6);
    expect(gaze(13, { keys, wander: 0 }).x).toBeCloseTo(1, 6);
    expect(gaze(40, { keys, wander: 0 }).x).toBeCloseTo(1, 6);
  });
  it("blinks with a big change of look", () => {
    expect(gaze(60, { keys, wander: 0 }).blink).toBe(1);
    expect(gaze(70, { keys, wander: 0 }).blink).toBe(0);
  });
  it("turns the head after the eyes", () => {
    const g = gaze(13, { keys, wander: 0 });
    expect(g.head).toBeLessThan(g.x);
    expect(gaze(55, { keys, wander: 0 }).head).toBeGreaterThan(0.95);
  });
  it("drifts while holding, never far, never right after a look", () => {
    let moved = false;
    for (let f = 13; f < 300; f++) {
      const g = gaze(f, { keys: [{ at: 10, x: 0.5 }], seed: 4 });
      if (f >= 13 && f < 30) expect(g.x).toBeCloseTo(0.5, 6);
      expect(Math.abs(g.x - 0.5)).toBeLessThanOrEqual(0.18 + 1e-9);
      if (Math.abs(g.x - 0.5) > 0.01) moved = true;
    }
    expect(moved).toBe(true);
  });
});

describe("jump", () => {
  const o = { height: 120, air: 16, crouch: 5 };
  it("crouches before it leaves, peaks at the top, lands back at 0", () => {
    expect(jump(2, 0, o).phase).toBe("crouch");
    expect(jump(2, 0, o).pose.squashY).toBeLessThan(1);
    expect(jump(5 + 8, 0, o).y).toBeCloseTo(-120, 6);
    expect(jump(5 + 16 + 1, 0, o).y).toBe(0);
  });
  it("never jumps more than the motion check allows in one frame", () => {
    for (let f = 1; f < 40; f++) expect(Math.abs(jump(f, 0, o).y - jump(f - 1, 0, o).y)).toBeLessThan(40);
  });
  it("is stretched leaving the ground and round at the top, with its volume kept", () => {
    const leave = jump(6, 0, o).pose, top = jump(13, 0, o).pose;
    expect(leave.squashY).toBeGreaterThan(top.squashY);
    expect(leave.squashX).toBeCloseTo(keepVolume(leave.squashY), 9);
  });
  it("marks the take-off and the landing as contacts", () => {
    expect(jump(5, 0, o).contact).toBe(true);
    expect(jump(21, 0, o).contact).toBe(true);
    expect(jump(13, 0, o).contact).toBe(false);
  });
});

describe("react", () => {
  it("surprise flinches down first, then pops up with a round mouth", () => {
    expect(react(2, 0, "surprise").pose.squashY).toBeLessThan(1);
    const pop = react(7, 0, "surprise");
    expect(pop.y).toBeLessThan(0);
    expect(pop.mouth).toBe("round");
  });
  it("every reaction ends, and back to idle", () => {
    for (const k of Object.keys(REACTION_FRAMES) as (keyof typeof REACTION_FRAMES)[]) {
      expect(react(REACTION_FRAMES[k], 0, k).done).toBe(true);
      expect(react(REACTION_FRAMES[k] - 1, 0, k).done).toBe(false);
    }
  });
  it("shake swings the eyes as well as the head", () => {
    expect(Math.abs(react(2, 0, "shake").lookX ?? 0)).toBeGreaterThan(0.3);
  });
});

describe("life", () => {
  it("blinks irregularly: not at a fixed period", () => {
    const starts: number[] = [];
    for (let f = 1; f < 2000; f++) if (blinks(f, 3) === 1 && blinks(f - 1, 3) === 0) starts.push(f);
    const gaps = new Set(starts.slice(1).map((s, i) => s - starts[i]));
    expect(starts.length).toBeGreaterThan(15);
    expect(gaps.size).toBeGreaterThan(5);
  });
  it("breathes with its volume kept", () => {
    for (let f = 0; f < 100; f++) {
      const p = alive(f, 2);
      expect(Math.abs(p.squashY - 1)).toBeLessThan(0.04);
    }
  });
  it("hop squashes smoothly at contact (no one-frame switch)", () => {
    for (let f = 1; f < 32; f++) expect(Math.abs(hop(f, 16).pose.squashY - hop(f - 1, 16).pose.squashY)).toBeLessThan(0.13);
  });
});
