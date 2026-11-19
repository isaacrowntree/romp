import { describe, expect, it } from "vitest";
import { captionAt, captionTiming, readingTime, timeline, wordCount, type Timeline } from "../src/timing/index.js";
import { analyze, type FrameRow } from "../src/check/analyze.js";
import { sceneSequence, trackText } from "../src/remotion/index.js";

const FPS = 30;

describe("readingTime", () => {
  it("is words at 180 a minute, never under 1.5 s", () => {
    expect(wordCount("One *highlighted* word, and — a dash")).toBe(6); // the dash alone isn't a word
    expect(readingTime("Hello")).toBe(1.5);
    expect(readingTime("one two three four five six seven eight nine")).toBe(3);
    expect(readingTime(12)).toBe(4);
    expect(readingTime(12, { wpm: 240, min: 1 })).toBe(3);
  });
});

describe("captionTiming", () => {
  it("types, then holds it whole for its reading time", () => {
    const t = captionTiming("Writers write English, the rest is automatic"); // 44 chars, 7 words
    expect(t.chars).toBe(44);
    expect(t.typeFrames).toBe(44); // 30 cps at 30 fps
    expect(t.holdFrames).toBe(Math.round((7 / 3) * 30));
    expect(t.totalFrames).toBe(t.typeFrames + t.holdFrames);
    expect(t.typed(0)).toBe(1);
    expect(t.typed(t.typeFrames - 1)).toBe(44);
    expect(t.typed(500)).toBe(44);
  });
  it("takes an entrance, an exit, a hold and instant text", () => {
    const t = captionTiming("*Hi* there", { cps: Infinity, enter: 0.2, exit: 0.3, hold: 2 });
    expect(t.chars).toBe(8);
    expect(t).toMatchObject({ enterFrames: 6, typeFrames: 0, holdFrames: 60, exitFrames: 9, totalFrames: 75 });
    expect(t.typed(5)).toBe(0);
    expect(t.typed(6)).toBe(8);
  });
});

/** A fake render of a timeline: each scene's captions as text samples, on screen while they're on. */
function render(tl: Timeline, cutShort = 0): FrameRow[] {
  return Array.from({ length: tl.frames - cutShort }, (_, f) => {
    const row: FrameRow["row"] = {};
    for (const s of tl.scenes) {
      if (f < s.start || f >= s.start + s.frames) continue;
      s.captions.forEach((c, k) => {
        const a = captionAt(c, f - s.start);
        if (a.on) row[`${s.name}:${k}`] = { x: 540, y: 200, shown: true, onScreen: true, area: 800 * 100, opacity: 1, box: { x0: 140, y0: 150, x1: 940, y1: 250 }, role: "text", text: c.text, chars: { shown: a.typed, total: c.timing.chars } };
      });
    }
    return { f, row };
  });
}

describe("timeline", () => {
  const specs = [
    { name: "intro", seconds: 3 },
    { name: "act", act: true },
    { name: "confirm", captions: ["Is this your order?", "One tap, and it is yours"] },
    { name: "help", captions: [{ text: "Help comes first", cps: 20 }], transition: 0.8 },
    { name: "end", seconds: 2, transition: false },
  ];
  const tl = timeline(specs);
  it("sizes scenes from their captions, and act cards at 1.2 s", () => {
    const [intro, act, confirm, help, end] = tl.scenes;
    expect(intro.frames).toBe(90); // asked 3 s (the transition out overlaps its end)
    expect(act.frames).toBe(Math.max(36, 15 + 15 + 1));
    expect(act.start).toBe(intro.start + intro.frames - 15);
    const last = confirm.captions[1];
    // the outgoing transition starts after the last caption's reading window (and a 0.2 s tail)
    expect(confirm.frames - confirm.transitionOut).toBeGreaterThanOrEqual(last.to + 6);
    // captions start after the incoming transition
    expect(confirm.captions[0].from).toBe(confirm.transitionIn + 6);
    expect(confirm.captions[1].from).toBe(confirm.captions[0].to + 5);
    expect(help.transitionIn).toBe(24);
    expect(end.transitionIn).toBe(0);
    expect(tl.frames).toBe(end.start + end.frames);
    expect(tl.check.covered[0]).toEqual([act.start / FPS, (act.start + 15) / FPS]);
    expect(tl.check.scenes).toHaveLength(4);
  });
  it("passes the text rules by construction", () => {
    const r = analyze(render(tl), { fps: FPS, width: 1080, height: 1920, ...tl.check });
    expect(r.issues.filter((i) => i.kind !== "pop")).toEqual([]);
  });
  it("planted bug: a scene cut short fails the check", () => {
    // The same captions squeezed into a fixed 2 s scene: the second one can't finish.
    const squeezed = timeline(specs);
    const c = squeezed.scenes[2];
    c.frames = 60;
    c.captions = c.captions.map((x) => ({ ...x, to: Math.min(x.to, 60) }));
    const r = analyze(render(squeezed), { fps: FPS, width: 1080, height: 1920, ...squeezed.check });
    expect(r.issues.some((i) => i.kind === "unfinished" || i.kind === "unread")).toBe(true);
  });
  it("binds to Remotion: sequences and text tracking", () => {
    expect(sceneSequence(tl.scenes[2])).toEqual({ from: tl.scenes[2].start, durationInFrames: tl.scenes[2].frames, name: "confirm" });
    expect(trackText("cap", "*Hello* you", { typed: 3, heading: true })).toMatchObject({
      "data-romp": "cap",
      "data-romp-role": "text",
      "data-romp-text": "Hello you",
      "data-romp-chars-total": "9",
      "data-romp-chars-shown": "3",
      "data-romp-heading": "1",
    });
  });
});
