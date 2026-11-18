/** A recording stand-in for (Offline)AudioContext: every node, param change and
 * start/stop is logged, so a schedule's output can be compared exactly. */
export function fakeAudio() {
  const log: string[] = [];
  let id = 0;
  const param = (owner: string, name: string, v = 0) => {
    const p: Record<string, unknown> = { value: v };
    for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues"]) {
      p[m] = (...a: number[]) => {
        log.push(`${owner}.${name}.${m}(${a.map((x) => +x.toFixed(6)).join(",")})`);
        return p;
      };
    }
    return new Proxy(p, {
      set(t, k, val) {
        if (k === "value") log.push(`${owner}.${name}=${+(+val).toFixed(6)}`);
        t[k as string] = val;
        return true;
      },
    });
  };
  const node = (kind: string, params: string[] = []) => {
    const name = `${kind}#${id++}`;
    log.push(`new ${name}`);
    const n: Record<string, unknown> = {
      name,
      connect: (to: { name?: string }) => {
        log.push(`${name}->${to?.name ?? "param"}`);
        return to;
      },
      disconnect: () => log.push(`${name} x`),
      start: (...a: number[]) => log.push(`${name}.start(${a.map((x) => +(+x).toFixed(6)).join(",")})`),
      stop: (t: number) => log.push(`${name}.stop(${+(+t).toFixed(6)})`),
    };
    for (const p of params) n[p] = param(name, p);
    return new Proxy(n, {
      set(t, k, val) {
        if (typeof val !== "object") log.push(`${name}.${String(k)}=${typeof val === "number" ? +val.toFixed(6) : val}`);
        t[k as string] = val;
        return true;
      },
    });
  };
  class Ctx {
    sampleRate: number;
    currentTime = 0;
    state = "running";
    destination = { name: "destination" };
    constructor(_ch = 2, _len = 48000, sr = 48000) {
      this.sampleRate = sr;
    }
    createGain = () => node("gain", ["gain"]);
    createOscillator = () => node("osc", ["frequency", "detune"]);
    createBiquadFilter = () => node("biquad", ["frequency", "Q", "gain"]);
    createStereoPanner = () => node("pan", ["pan"]);
    createBufferSource = () => node("src", ["playbackRate"]);
    createConvolver = () => node("conv");
    createDynamicsCompressor = () => node("comp", ["threshold", "ratio", "attack", "release", "knee"]);
    createBuffer = (ch: number, len: number, sr: number) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (c: number) => data[c] };
    };
    startRendering = async () => {
      const len = 8;
      return { numberOfChannels: 2, length: len, sampleRate: this.sampleRate, getChannelData: () => new Float32Array(len), log: [...log] };
    };
    resume = async () => {};
  }
  return { log, Ctx };
}
