import { describe, expect, it } from "vitest";
import { crossfadeBed, dropouts, formatDropouts, readWav, wavBase64, type PcmAudio } from "../src/audio/index.js";
import { fakeAudio } from "./fake-audio.js";

const SR = 8000;
/** A music bed: a 220 Hz tone at -20 dBFS-ish, silent where `quiet(t)` says. */
function bedOf(seconds: number, quiet: (t: number) => boolean = () => false): PcmAudio {
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = quiet(t) ? 0 : 0.14 * Math.sin(2 * Math.PI * 220 * t);
    l[i] = x;
    r[i] = x * 0.9;
  }
  return { sampleRate: SR, channels: [l, r] };
}
const asBuffer = (a: PcmAudio) => ({ numberOfChannels: a.channels.length, length: a.channels[0].length, sampleRate: a.sampleRate, getChannelData: (c: number) => a.channels[c] }) as unknown as AudioBuffer;

describe("dropouts", () => {
  it("flags the music dropping out for half a second at a join", () => {
    const d = dropouts(bedOf(8, (t) => t >= 3.0 && t < 3.47));
    expect(d).toHaveLength(1);
    expect(d[0].t).toBeCloseTo(3.0, 1);
    expect(d[0].duration).toBeCloseTo(0.47, 1);
    expect(formatDropouts(d, "mix.wav")).toMatch(/1 dropout\(s\) in mix\.wav\n +3\.00s +dropout +0\.4\d s at silence/);
  });
  it("passes a continuous bed, a blink under 0.1 s, a long rest, and silence at either end", () => {
    expect(dropouts(bedOf(6))).toEqual([]);
    expect(dropouts(bedOf(6, (t) => t >= 3 && t < 3.05))).toEqual([]);
    expect(dropouts(bedOf(8, (t) => t >= 3 && t < 5))).toEqual([]);
    expect(dropouts(bedOf(6, (t) => t < 0.5 || t > 5.6))).toEqual([]);
    expect(formatDropouts([])).toMatch(/no dropouts/);
  });
  it("reads an AudioBuffer too, and takes its thresholds", () => {
    const a = bedOf(8, (t) => t >= 3.0 && t < 3.3);
    expect(dropouts(asBuffer(a))).toHaveLength(1);
    expect(dropouts(a, { min: 0.5 })).toEqual([]);
  });
});

describe("readWav", () => {
  it("reads back a 16-bit WAV romp wrote", () => {
    const a = bedOf(1);
    const back = readWav(new Uint8Array(Buffer.from(wavBase64(asBuffer(a)), "base64")));
    expect(back.sampleRate).toBe(SR);
    expect(back.channels).toHaveLength(2);
    expect(back.channels[0].length).toBe(SR);
    expect(back.channels[0][100]).toBeCloseTo(a.channels[0][100], 3);
  });
  it("reads 32-bit float and refuses what isn't a WAV", () => {
    const n = 4, buf = Buffer.alloc(44 + n * 4);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
    buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(48000, 24);
    buf.writeUInt32LE(48000 * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(32, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
    [0, 0.5, -0.25, 1].forEach((x, i) => buf.writeFloatLE(x, 44 + i * 4));
    expect([...readWav(new Uint8Array(buf)).channels[0]]).toEqual([0, 0.5, -0.25, 1]);
    expect(() => readWav(new Uint8Array(12))).toThrow(/not a RIFF/);
  });
});

describe("crossfadeBed", () => {
  it("closes the gaps between sections and crossfades every join", () => {
    const { Ctx, log } = fakeAudio();
    const ctx = new Ctx() as unknown as BaseAudioContext;
    const s = { gain: (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; } };
    const wrote: [number, number][] = [];
    const out = ctx.createGain();
    const joins = crossfadeBed(s, out, [
      { from: 0, to: 9.6, write: (_g, t0, t1) => wrote.push([t0, t1]) },
      { from: 10, to: 20, write: (_g, t0, t1) => wrote.push([t0, t1]) }, // 0.4 s gap after the first: closed
      { from: 20, to: 30, write: (_g, t0, t1) => wrote.push([t0, t1]) },
    ], { fade: 0.6 });
    expect(joins).toEqual([10, 20]);
    // each section runs 0.3 s past its joins, so the pieces overlap: never a hole
    expect(wrote).toEqual([[0, 10.3], [9.7, 20.3], [19.7, 30]]);
    for (let k = 0; k < wrote.length - 1; k++) expect(wrote[k][1]).toBeGreaterThan(wrote[k + 1][0]);
    // the second section fades in from silence and out to silence
    const ramps = log.filter((l) => /gain#\d+\.gain\.linearRamp/.test(l));
    expect(ramps.some((l) => /linearRampToValueAtTime\(0,20\.3\)/.test(l))).toBe(true);
    expect(ramps.some((l) => /linearRampToValueAtTime\(1,10\.3\)/.test(l))).toBe(true);
  });
});
