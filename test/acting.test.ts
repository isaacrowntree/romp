import { describe, expect, it } from "vitest";
import { alive, BLINK, prosody, blendPose, blinks, gaze, handoff, hop, jump, keepVolume, react, REACTION_FRAMES, reactionFrames, speechLength, syllables, takeCurve, takeLength, talk, talkPose, waddle } from "../src/core/index.js";

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
    expect(talk((o[0].t0 + o[0].t1) / 2, o, { lead: 0 }).mouth).toBe("round");
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
    expect(gaze(60, { keys, wander: 0 }).blink).toBeGreaterThan(0.3); // closing with the look
    expect(gaze(62, { keys, wander: 0 }).blink).toBe(1);
    expect(gaze(72, { keys, wander: 0 }).blink).toBe(0);
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
    for (let f = 1; f < 4000; f++) if (blinks(f, 3) > 0 && blinks(f - 1, 3) === 0) starts.push(f);
    const gaps = new Set(starts.slice(1).map((s, i) => s - starts[i]));
    expect(starts.length).toBeGreaterThan(20); // ~14 a minute over 133 s
    expect(starts.length).toBeLessThan(45);
    expect(gaps.size).toBeGreaterThan(5);
  });
  it("breathes with its volume kept", () => {
    for (let f = 0; f < 100; f++) {
      const p = alive(f, 2);
      expect(Math.abs(p.squashY - 1)).toBeLessThan(0.04);
    }
  });
  it("hop hits its landing: squashed on the contact frame, then cushioned out", () => {
    const land = hop(16, 16).pose.squashY; // t = 0: the contact
    expect(land).toBeLessThan(0.85);
    expect(hop(17, 16).pose.squashY).toBeGreaterThan(land);
    expect(hop(16, 16).y).toBe(0);
    expect(hop(15, 16).y).toBeLessThan(0); // still falling the frame before
  });
  it("closes fast and opens slowly", () => {
    const close = BLINK.indexOf(1), open = BLINK.length - 1 - [...BLINK].reverse().indexOf(1);
    expect(close).toBeLessThan(BLINK.length - 1 - open);
  });
});

describe("takes", () => {
  it("goes the other way first, then pops to the accent on the very next frame (hard)", () => {
    expect(takeCurve(5).v).toBeLessThan(-0.3);
    expect(takeCurve(5).phase).toBe("antic");
    const { pop } = takeCurve(0);
    expect(pop).toBe(8);
    expect(takeCurve(pop - 2)).toMatchObject({ v: 0.5, smear: 1 }); // the in-between, smeared
    expect(takeCurve(pop - 1).v).toBeGreaterThan(1); // past the accent
    expect(takeCurve(pop).v).toBe(1);
    expect(takeCurve(pop + 1).v).toBe(1); // held a couple of frames
  });
  it("a hard accent bounces back past its settle; a soft one never overshoots", () => {
    const hard = Array.from({ length: 40 }, (_, f) => takeCurve(f).v);
    expect(Math.min(...hard.slice(10, 20))).toBeLessThan(0.5);
    const soft = Array.from({ length: 40 }, (_, f) => takeCurve(f, { accent: "soft" }).v);
    expect(Math.max(...soft)).toBeLessThanOrEqual(1);
    const settled = soft.slice(20, 24);
    for (const v of settled) expect(v).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });
  it("holds the settle, releases to rest, and its length adds up", () => {
    const n = takeLength();
    expect(takeCurve(n - 1).v).toBeGreaterThan(0);
    expect(takeCurve(n)).toMatchObject({ v: 0, phase: "done" });
    expect(takeCurve(500, { release: Infinity }).v).toBe(0.5);
  });
});

describe("reactions as takes", () => {
  it("surprise marks its accent as a contact, and squints in the anticipation", () => {
    expect(react(4, 0, "surprise").pose.blink).toBeGreaterThan(0.5);
    expect(react(7, 0, "surprise").contact).toBe(true);
    expect(react(20, 0, "surprise").contact).toBe(false);
  });
  it("a double take glances away and back before the take", () => {
    expect(react(2, 0, "doubleTake").lookX).toBeGreaterThan(0); // the first look, at it
    expect(react(5, 0, "doubleTake").lookX).toBeLessThan(0.1); // away, as if nothing happened
    expect(react(6 + 8, 0, "doubleTake").y).toBeLessThan(0); // the take
  });
  it("realize shuts the eyes in the dip, then opens them", () => {
    expect(react(4, 0, "realize").pose.blink).toBe(1);
    expect(react(12, 0, "realize").pose.blink).toBe(0);
  });
  it("tremble alternates two poses every 2 frames while it holds", () => {
    const a = react(8, 0, "tremble").pose.squashY, b = react(10, 0, "tremble").pose.squashY, c = react(12, 0, "tremble").pose.squashY;
    expect(a).not.toBeCloseTo(b, 3);
    expect(a).toBeCloseTo(c, 3);
  });
  it("every reaction is done after its REACTION_FRAMES", () => {
    for (const k of Object.keys(REACTION_FRAMES) as (keyof typeof REACTION_FRAMES)[]) expect(react(REACTION_FRAMES[k], 0, k).done).toBe(true);
  });
});

describe("gaze anticipation", () => {
  it("dips just before a big look, not for a small one", () => {
    expect(gaze(8, { keys: [{ at: 10, x: 1 }], wander: 0 }).dip).toBeGreaterThan(0.3);
    expect(gaze(20, { keys: [{ at: 10, x: 1 }], wander: 0 }).dip).toBe(0);
    expect(gaze(8, { keys: [{ at: 10, x: 0.3 }], wander: 0 }).dip).toBe(0);
  });
  it("the head overshoots a little and settles", () => {
    const h = Array.from({ length: 60 }, (_, f) => gaze(f + 10, { keys: [{ at: 10, x: 1 }], wander: 0 }).head);
    expect(Math.max(...h)).toBeGreaterThan(1);
    expect(Math.max(...h)).toBeLessThan(1.1);
    expect(h[59]).toBeCloseTo(1, 2);
  });
});

describe("feel (0.11)", () => {
  it("the mouth leads the sound by 2 frames", () => {
    const s = syllables("hello");
    expect(talk(-1 / 30, s).open).toBeGreaterThan(0); // already open before the sound starts
    expect(talk(-1 / 30, s, { lead: 0 }).open).toBe(0);
  });
  it("m, b and p shut the lips before their vowel", () => {
    const s = syllables("ma", { rate: 4 });
    expect(s[0].onset).toBe("m");
    expect(talk(s[0].t0 + 0.01, s, { lead: 0 }).mouth).toBe("closed");
    expect(talk(s[0].t0 + 0.14, s, { lead: 0 }).mouth).not.toBe("closed");
  });
  it("pursuit glides the eyes after a moving thing instead of jumping", () => {
    const keys = [{ at: 0, x: -1, pursue: true }, { at: 30, x: 1 }];
    const xs = Array.from({ length: 31 }, (_, f) => gaze(f, { keys, wander: 0 }).x);
    expect(xs[15]).toBeGreaterThan(-0.3);
    expect(xs[15]).toBeLessThan(0.3);
    for (let f = 5; f < 30; f++) expect(Math.abs(xs[f] - xs[f - 1])).toBeLessThan(0.12);
  });
  it("a waddle rocks about the feet, lingers at each side and bobs up through the middle", () => {
    const a = Array.from({ length: 60 }, (_, f) => waddle(f, { period: 20, angle: 10 }));
    expect(Math.max(...a.map((w) => w.angle))).toBeGreaterThan(9);
    expect(Math.min(...a.map((w) => w.angle))).toBeLessThan(-9);
    const near = a.slice(20).filter((w) => Math.abs(w.angle) > 8).length;
    expect(near).toBeGreaterThan(14); // more than half the time near a side
    expect(Math.min(...a.map((w) => w.y))).toBeLessThan(0);
  });
  it("a heavy jump squashes and stretches less than a light one", () => {
    const land = (weight: number) => Math.min(...Array.from({ length: 40 }, (_, f) => jump(f, 0, { weight }).pose.squashY));
    expect(land(1)).toBeGreaterThan(land(0));
  });
});

describe("flow (0.12)", () => {
  it("a take's pop passes through an in-between and an overshoot: never a jump straight to the pose", () => {
    const vs = Array.from({ length: 12 }, (_, f) => takeCurve(f).v);
    for (let f = 1; f < 12; f++) expect(Math.abs(vs[f] - vs[f - 1])).toBeLessThan(0.95);
  });
  it("surprise sinks in the anticipation, widens the eyes at the accent, and its hat lags the body", () => {
    expect(react(5, 0, "surprise").y).toBeGreaterThan(0); // down first
    expect(react(9, 0, "surprise").eyeScale).toBeGreaterThan(1.15);
    // At the accent's first frame the body is up but the hat hasn't caught up yet; two frames later it has passed it.
    const at = react(8, 0, "surprise").pose.lift, later = react(10, 0, "surprise").pose.lift;
    expect(later).toBeGreaterThan(at);
  });
  it("mouths are held on twos and stay open between syllables of a word", () => {
    const s = syllables("banana", { seed: 2 });
    let flips = 0;
    let prev = talk(0, s).mouth;
    for (let f = 1; f < 30; f++) {
      const m = talk(f / 30, s).mouth;
      if (m !== prev) flips++;
      prev = m;
    }
    expect(flips).toBeLessThan(8);
    const mid = s[1]; // "a" after "n": the jaw doesn't shut between syllables
    expect(talk(mid.t1 - 0.005, s, { lead: 0, onTwos: false }).open).toBeGreaterThan(0.3);
  });
  it("no gaze blink at the end of a pursuit, nor twice within 12 frames", () => {
    const pursuit = [{ at: 0, x: -1, pursue: true }, { at: 20, x: 1 }];
    for (let f = 18; f < 30; f++) expect(gaze(f, { keys: pursuit, wander: 0 }).blink).toBe(0);
    const close = [{ at: 0, x: 1 }, { at: 6, x: -1 }];
    for (let f = 10; f < 16; f++) expect(gaze(f, { keys: close, wander: 0 }).blink).toBe(0);
  });
  it("a double take's lead can be long enough to read", () => {
    expect(reactionFrames("doubleTake", { lead: 24 })).toBe(reactionFrames("doubleTake") + 18);
    expect(react(20, 0, "doubleTake", { lead: 24 }).y).toBe(0); // still looking away
  });
  it("blendPose hands one pose to another without a jump", () => {
    const a = { squashX: 1, squashY: 1, tilt: 0, lift: 0, blink: 0, jiggle: 0 }, b = { squashX: 0.8, squashY: 1.2, tilt: 10, lift: 4, blink: 1, jiggle: 2 };
    expect(blendPose(a, b, 0.5).tilt).toBe(5);
    expect(handoff(9, 10)).toBe(0);
    expect(handoff(15, 10)).toBe(1);
    expect(handoff(12, 10)).toBeGreaterThan(0);
  });
});

describe("voice melody (0.13)", () => {
  it("marks how each phrase ends", () => {
    const s = syllables("Hi there, you. Really? Yes!");
    expect(s.map((x) => x.end).filter(Boolean)).toEqual([",", ".", "?", "!"]);
    expect(syllables("no punctuation").at(-1)!.end).toBe(".");
    expect(syllables("你好？").at(-1)!.end).toBe("?");
  });
  it("a statement falls at its end, a question rises", () => {
    const st = prosody(syllables("It lands by itself."), { swing: 0 });
    expect(st.at(-1)!.st1).toBeLessThan(st.at(-1)!.st0);
    const q = prosody(syllables("It lands by itself?"), { swing: 0 });
    expect(q.at(-1)!.st1).toBeGreaterThan(q.at(-1)!.st0 + 3);
  });
  it("a phrase drifts down (declination); an exclamation is higher and louder", () => {
    const p = prosody(syllables("one two three four five six"), { swing: 0 });
    expect(p[0].st0).toBeGreaterThan(p[5].st0);
    const plain = prosody(syllables("We did it."), { swing: 0 }), shout = prosody(syllables("We did it!"), { swing: 0 });
    expect(shout[0].st0).toBeGreaterThan(plain[0].st0);
    expect(shout.at(-1)!.gain).toBeGreaterThan(plain.at(-1)!.gain);
  });
  it("stressed syllables get a pitch accent", () => {
    const s = syllables("banana split", { seed: 1 });
    const p = prosody(s, { swing: 0 });
    const i = s.findIndex((x) => x.stress);
    expect(p[i].st0).toBeGreaterThan(p[i + 1].st0);
  });
});
