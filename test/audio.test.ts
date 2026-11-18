import { describe, expect, it } from "vitest";
import { fakeAudio } from "./fake-audio.js";
import { fitTo, wavBase64 } from "../src/audio/index.js";
import { renderOffline, playLive, type Schedule } from "../src/audio/mix.js";
import { cartoon } from "../src/audio/cartoon.js";
import { Instruments } from "../src/audio/index.js";

const schedule: Schedule = (s, b, at) => {
  const band = new Instruments(s);
  for (let i = 0; i < 8; i++) {
    const t = at(i * 0.5);
    if (t == null) continue;
    band.kick(t, b.drums, { vel: 0.3 });
    s.marimba(t, 74 + (i % 5) * 2, b.music, { vel: 0.2 });
  }
  const t = at(1.2);
  if (t != null) {
    s.boing(t, b.sfx, { k: 0.8, seed: 3 });
    s.babble(t, 0.6, b.voice, { voice: "squeaky", seed: 2 });
    s.plop(t + 0.3, b.sfx, { pitch: 0.4 });
  }
};

describe("audio", () => {
  it("fitTo moves a note to the nearest pitch class in the set", () => {
    const D_PENT = new Set([2, 4, 6, 9, 11]);
    expect(fitTo(D_PENT, 62)).toBe(62);
    expect(fitTo(D_PENT, 61)).toBe(62); // C# → D
    expect(fitTo(D_PENT, 65)).toBe(66); // F → F#
  });

  it("wavBase64 writes a valid 16-bit PCM header", () => {
    const data = [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, -1, 0.25, 0])];
    const buf = { numberOfChannels: 2, length: 4, sampleRate: 48000, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
    const bytes = Buffer.from(wavBase64(buf), "base64");
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
    expect(bytes.readUInt16LE(22)).toBe(2);
    expect(bytes.readUInt32LE(24)).toBe(48000);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(bytes.length).toBe(44 + 4 * 2 * 2);
  });

  it("the same schedule renders identically offline, twice (determinism)", async () => {
    const run = async () => {
      const { Ctx } = fakeAudio();
      (globalThis as Record<string, unknown>).OfflineAudioContext = Ctx;
      const out = (await renderOffline(schedule, { duration: 5, extend: cartoon })) as unknown as { log: string[] };
      return out.log;
    };
    const a = await run(), b = await run();
    expect(a.length).toBeGreaterThan(200);
    expect(a).toEqual(b);
  });

  it("plays the same schedule live from t, skipping what came before", async () => {
    const { Ctx, log } = fakeAudio();
    const ctx = new Ctx() as unknown as AudioContext;
    (ctx as unknown as { currentTime: number }).currentTime = 10;
    const live = await playLive(ctx, schedule, { from: 2, latency: 0.1, extend: cartoon });
    expect(live.origin).toBeCloseTo(10 + 0.1 - 2, 6);
    // the first kick still to play is at film t = 2 → context 10.1
    expect(log.some((l) => /\.start\(10\.1\)/.test(l))).toBe(true);
    // nothing before film t = 2 (context 10.1) was scheduled
    const starts = log.filter((l) => /\.start\(/.test(l)).map((l) => +l.match(/\.start\(([\d.]+)/)![1]);
    expect(Math.min(...starts.filter((x) => x > 1))).toBeGreaterThanOrEqual(10.1 - 0.2);
    live.stop();
  });
});
