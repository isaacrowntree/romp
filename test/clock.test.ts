import { describe, expect, it } from "vitest";
import { Clock } from "../src/core/clock.js";

describe("Clock", () => {
  it("drives seek(t) from the wall clock, pauses, seeks and stops at the end", async () => {
    let now = 100;
    const cbs: (() => void)[] = [];
    const seen: number[] = [];
    const events: string[] = [];
    const c = new Clock({
      seek: (t) => seen.push(+t.toFixed(3)),
      duration: 2,
      now: () => now,
      raf: (cb) => (cbs.push(cb), cbs.length),
      cancelRaf: () => {},
      onPlay: (t) => void events.push(`play ${t}`),
      onStop: () => void events.push("stop"),
    });
    await c.play(0);
    now += 0.5;
    cbs.shift()!();
    expect(c.current()).toBeCloseTo(0.5, 6);
    c.pause();
    expect(c.playing).toBe(false);
    now += 5;
    expect(c.current()).toBeCloseTo(0.5, 6);
    await c.seek(1.5);
    expect(seen.at(-1)).toBe(1.5);
    await c.play();
    now += 1;
    while (cbs.length) cbs.shift()!();
    expect(c.playing).toBe(false);
    expect(seen.at(-1)).toBe(2);
    expect(events).toEqual(["play 0", "stop", "play 1.5", "stop"]);
  });

  it("follows the audio clock while sound is playing", async () => {
    const audio = { state: "running", currentTime: 7, resume: async () => {} } as unknown as AudioContext;
    const cbs: (() => void)[] = [];
    const c = new Clock({ seek: () => {}, duration: 10, audio, now: () => 999, raf: (cb) => (cbs.push(cb), 1), cancelRaf: () => {} });
    await c.play(1);
    (audio as unknown as { currentTime: number }).currentTime = 8.25;
    expect(c.current()).toBeCloseTo(2.25, 6);
  });
});
