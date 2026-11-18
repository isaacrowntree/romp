/**
 * Sound as a signal: what a schedule plays, as pure functions of film time
 * that the picture can react to (a pulse on every kick, a glow that follows
 * the music, a shake on each boing), with no live analyser.
 *
 * `listen(schedule)` runs your schedule once against a silent stand-in for an
 * AudioContext and records every voice it calls (marimba, kick, boing…): when,
 * on which bus, how loud and how long. A schedule is deterministic, so this
 * IS the soundtrack you render or play live, note for note. The `Score` it
 * returns answers `envelopeAt(t)`, `beatAt(t)` and `onsetsBetween(t0, t1)`,
 * each a pure function of t: the same in a live viewer, a frame-by-frame
 * renderer and the motion check.
 */
import { Synth } from "./synth.js";
import { createMix } from "./mix.js";
// Each voice's default level and how long it rings (s), from its own defaults.
const VEL = {
    plop: 0.32, babble: 0.11, slurp: 0.14, beep: 0.13, ding: 0.32, tock: 0.24, pip: 0.05, swish: 0.12, scribble: 0.06,
    pluck: 0.5, kick: 0.55, shaker: 0.06, rhodes: 0.14, piano: 0.18, upright: 0.32, rim: 0.1, brush: 0.05,
    marker: 0.07, bell: 0.2, marimba: 0.3, flap: 0.12, whoosh: 0.25, tap: 0.28, splash: 0.3, ignite: 0.3, crackle: 0.12,
    crickets: 0.03, surf: 0.05, wind: 0.04, hum: 0.03, birds: 0.03, gullCall: 0.05, riser: 0.18, thump: 0.4, click: 0.18, engine: 0.12,
};
const RING = {
    kick: 0.2, shaker: 0.07, rim: 0.03, brush: 0.22, tap: 0.03, click: 0.015, thump: 0.4, tock: 0.25, pip: 0.06, plop: 0.1,
    boing: 0.3, beep: 0.2, ding: 0.9, marimba: 0.9, bell: 1.8, pluck: 1.6, rhodes: 1.6, piano: 2.2, upright: 1, flap: 0.1,
    splash: 0.3, ignite: 0.6, gullCall: 0.4, slurp: 0.55, swish: 0.2,
};
/** a hit's attack, s (the synth's envelopes take about this long) */
const ATTACK = 0.005;
/** voices whose numbers are (t0, t1): beds */
const BEDS = new Set(["crackle", "crickets", "bed", "surf", "wind", "hum", "birds"]);
/** voices whose second number is a length: swells (and babble/marker, steady) */
const SWELLS = { whoosh: 0.6, riser: 0.97, engine: 0.5 };
const LENGTHS = new Set(["whoosh", "riser", "engine", "marker", "babble", "scribble"]);
/** Synth / Instruments plumbing: never a voice */
const PLUMBING = new Set(["constructor", "gain", "pan", "filter", "noiseSrc", "env", "fit", "reverb", "wrapVoices"]);
/** A silent AudioContext: every node accepts every call and does nothing, so a schedule runs anywhere (node, a worker, a Remotion render). */
function silentContext() {
    const param = () => {
        const p = { value: 0 };
        for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues"])
            p[m] = () => p;
        return p;
    };
    const node = (params = []) => {
        const n = {
            outs: [],
            connect(to) {
                n.outs.push(to);
                return to;
            },
            disconnect() { },
            start() { },
            stop() { },
        };
        for (const p of params)
            n[p] = param();
        return n;
    };
    const sampleRate = 8000;
    return {
        sampleRate,
        currentTime: 0,
        state: "suspended",
        destination: node(),
        createGain: () => node(["gain"]),
        createOscillator: () => node(["frequency", "detune"]),
        createBiquadFilter: () => node(["frequency", "Q", "gain"]),
        createStereoPanner: () => node(["pan"]),
        createBufferSource: () => node(["playbackRate", "detune"]),
        createConvolver: () => node(),
        createDynamicsCompressor: () => node(["threshold", "ratio", "attack", "release", "knee"]),
        createBuffer: (ch, len, sr) => {
            const data = Array.from({ length: ch }, () => new Float32Array(len));
            return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (c) => data[c] };
        },
    };
}
/**
 * Run a schedule silently and record every voice it plays. Pure: the same
 * schedule always gives the same score. The schedule must be synchronous
 * (most are); `at(t)` is the identity, as when rendering offline.
 */
export function listen(schedule, opts = {}) {
    const ctx = silentContext();
    const s = new Synth(ctx);
    opts.extend?.(s);
    const buses = createMix(s);
    const busName = new Map();
    for (const k of ["music", "drums", "sfx", "voice"])
        busName.set(buses[k], k);
    // Which bus a node feeds: itself, or through a panner or filter on the way.
    const findBus = (n, depth = 0) => {
        if (busName.has(n))
            return busName.get(n);
        const outs = n?.outs;
        if (!outs || depth > 6)
            return "other";
        for (const o of outs) {
            const b = findBus(o, depth + 1);
            if (b !== "other")
                return b;
        }
        return "other";
    };
    const events = [];
    let depth = 0;
    const record = (voice, args) => {
        const t = args[0];
        if (typeof t !== "number")
            return;
        const k = args.findIndex((a, i) => i > 0 && a !== null && typeof a === "object" && "connect" in a);
        const nums = (k > 0 ? args.slice(1, k) : []).filter((a) => typeof a === "number");
        const o = (k > 0 && args[k + 1] && typeof args[k + 1] === "object" ? args[k + 1] : {});
        const num = (v) => (typeof v === "number" ? v : undefined);
        const vel = num(o.vel) ?? (voice === "boing" ? Math.min(0.32, 0.08 + (num(o.k) ?? 0.6) * 0.17) : VEL[voice] ?? 0.2);
        const ev = { t, end: t, voice, bus: k > 0 ? findBus(args[k]) : "other", vel, shape: "hit" };
        if (BEDS.has(voice) && nums.length) {
            ev.shape = "bed";
            ev.end = nums[0];
        }
        else if (LENGTHS.has(voice) || (nums.length && nums[0] < 20 && !(voice in RING))) {
            // (t, dur, out): a swell, or a steady stretch (babble, marker)
            const dur = nums[0] ?? num(o.dur) ?? 0.3;
            ev.end = t + dur;
            ev.shape = voice in SWELLS ? "swell" : "bed";
            if (ev.shape === "swell")
                ev.peakAt = num(o.peakAt) ?? num(o.passAt) ?? SWELLS[voice];
        }
        else {
            if (nums.length)
                ev.midi = nums[0];
            if (voice === "tock")
                ev.midi = num(o.note) ?? 74;
            ev.end = t + (num(o.dur) ?? RING[voice] ?? 0.3);
        }
        events.push(ev);
    };
    // Wrap every voice on an object (the synth, and each Instruments made on it):
    // record the outermost call only (upright plucks, ding plays a marimba).
    const wrap = (obj) => {
        const names = new Set();
        for (let p = obj; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
            for (const n of Object.getOwnPropertyNames(p))
                names.add(n);
        for (const n of names) {
            if (PLUMBING.has(n) || n.startsWith("_"))
                continue;
            const fn = obj[n];
            if (typeof fn !== "function")
                continue;
            obj[n] = function (...args) {
                if (depth === 0)
                    record(n, args);
                depth++;
                try {
                    return fn.apply(this, args);
                }
                finally {
                    depth--;
                }
            };
        }
    };
    s.wrapVoices = (o) => wrap(o);
    wrap(s);
    const done = schedule(s, buses, (t) => (t < 0 ? null : t));
    if (done && typeof done.then === "function")
        throw new Error("romp: listen() needs a synchronous schedule");
    return new Score(events);
}
const match = (v, f) => f == null || (typeof f === "string" ? f === v : f.includes(v));
/** What a schedule plays, as pure functions of film time. */
export class Score {
    /** every event, sorted by time */
    events;
    constructor(events) {
        this.events = [...events].sort((a, b) => a.t - b.t || a.voice.localeCompare(b.voice));
    }
    /** The events a filter selects. */
    select(f = {}) {
        return this.events.filter((e) => match(e.bus, f.bus) && match(e.voice, f.voice));
    }
    /** Events that start in [t0, t1). */
    onsetsBetween(t0, t1, f = {}) {
        return this.select(f).filter((e) => e.t >= t0 && e.t < t1);
    }
    /**
     * How loud the selected sounds are at t: the sum of each event's level
     * through its shape (a hit attacks in 5 ms and decays over its ring; a
     * swell rises to its peak and falls; a bed holds). `decay` (s) overrides
     * every hit's ring: short for a snappy pulse.
     */
    envelopeAt(t, f = {}) {
        let sum = 0;
        for (const e of this.events) {
            if (e.t > t)
                break;
            if (!match(e.bus, f.bus) || !match(e.voice, f.voice))
                continue;
            const dt = t - e.t;
            if (e.shape === "bed") {
                if (t <= e.end)
                    sum += e.vel;
            }
            else if (e.shape === "swell") {
                const len = e.end - e.t, peak = len * (e.peakAt ?? 0.5);
                if (t <= e.end)
                    sum += e.vel * (dt < peak ? dt / peak : (e.end - t) / Math.max(1e-6, len - peak));
            }
            else {
                const ring = f.decay ?? e.end - e.t;
                if (dt > ring * 3)
                    continue;
                sum += e.vel * (dt < ATTACK ? dt / ATTACK : Math.exp((-4 * (dt - ATTACK)) / ring));
            }
        }
        return sum;
    }
    /**
     * Where t sits in the beat: the selected onsets (the drums bus by default)
     * are the grid. `index` counts beats from 0 (−1 before the first), `phase`
     * goes 0 → 1 from one onset to the next, `since` is seconds since the last.
     * Onsets closer than 30 ms count as one.
     */
    beatAt(t, f = { bus: "drums" }) {
        const grid = [];
        for (const e of this.select(f))
            if (!grid.length || e.t - grid[grid.length - 1] > 0.03)
                grid.push(e.t);
        let lo = 0, hiI = grid.length - 1, idx = -1;
        while (lo <= hiI) {
            const mid = (lo + hiI) >> 1;
            if (grid[mid] <= t) {
                idx = mid;
                lo = mid + 1;
            }
            else
                hiI = mid - 1;
        }
        if (idx < 0)
            return { index: -1, phase: 0, since: 0, t0: -Infinity, t1: grid[0] ?? Infinity };
        const t0 = grid[idx], t1 = grid[idx + 1] ?? Infinity;
        return { index: idx, phase: Number.isFinite(t1) ? (t - t0) / (t1 - t0) : 0, since: t - t0, t0, t1 };
    }
}
//# sourceMappingURL=score.js.map