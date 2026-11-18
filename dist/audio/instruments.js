/*
  The band's instruments, modelled in Web Audio (no samples): Karplus–Strong
  pluck, soft kick, shaker, FM Rhodes, additive piano, upright bass, rim click
  and brushes. Deterministic: the same schedule always renders the same take.
  They play on the synth's own context, borrowing its plumbing (synth.js).
*/
import { midiHz, rng } from "./synth.js";
export class Instruments {
    /** @param s the soundtrack's Synth (its context, shared noise and plumbing) */
    constructor(s) {
        this.s = s;
        this.ctx = s.ctx;
        this.ksCache = new Map();
        // listen() records what a schedule plays: it asks to wrap these voices too.
        s.wrapVoices?.(this);
    }
    gain(v) { return this.s.gain(v); }
    pan(p, out) { return this.s.pan(p, out); }
    filter(type, f, q) { return this.s.filter(type, f, q); }
    noiseSrc(t, dur, seed) { return this.s.noiseSrc(t, dur, seed); }
    env(t, o) { return this.s.env(t, o); }
    /** Karplus–Strong plucked string: a burst of noise in a damped delay line. Sounds like a nylon guitar / harp. */
    pluck(t, midi, out, { vel = 0.5, bright = 0.5, dur = 1.6, pan = 0, seed = 1 } = {}) {
        const key = `${midi}|${bright.toFixed(2)}|${dur}|${seed % 4}`;
        let buf = this.ksCache.get(key);
        if (!buf) {
            const sr = this.ctx.sampleRate, n = Math.floor(sr * dur);
            buf = this.ctx.createBuffer(1, n, sr);
            const out = buf.getChannelData(0);
            const period = sr / midiHz(midi), L = Math.floor(period), frac = period - L;
            const line = new Float32Array(L + 2), r = rng(seed * 977 + midi);
            // A softened excitation (brightness = how much of the raw noise survives).
            let prev = 0;
            for (let i = 0; i < line.length; i++) {
                const x = r() * 2 - 1;
                prev = prev + (x - prev) * (0.25 + bright * 0.7);
                line[i] = prev;
            }
            const damp = 0.996 - (1 - bright) * 0.004;
            let p = 0;
            for (let i = 0; i < n; i++) {
                const a = line[p], b = line[(p + 1) % line.length];
                const v = a * (1 - frac * 0.5) + b * frac * 0.5;
                out[i] = a;
                line[p] = ((a + b) / 2) * damp + (v - a) * 0.0;
                p = (p + 1) % L;
            }
            // Fade the tail so a cut-off never clicks.
            for (let i = 0; i < 2000 && i < n; i++)
                out[n - 1 - i] *= i / 2000;
            this.ksCache.set(key, buf);
        }
        const s = this.ctx.createBufferSource();
        s.buffer = buf;
        const g = this.gain(vel);
        s.connect(g).connect(this.pan(pan, out));
        s.start(t);
    }
    /** A soft kick: a pitch-dropped sine with a felt click on top. */
    kick(t, out, { vel = 0.55 } = {}) {
        const o = this.ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        const g = this.env(t, { a: 0.002, d: 0.2, peak: vel * 0.7 });
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.5);
        const n = this.noiseSrc(t, 0.03, t * 13), bp = this.filter("bandpass", 1800, 1.2), ng = this.env(t, { a: 0.001, d: 0.025, peak: vel * 0.35 });
        n.connect(bp).connect(ng).connect(out);
    }
    /** Shaker: high-passed noise, a short swell. */
    shaker(t, out, { vel = 0.06, seed = 1 } = {}) {
        const n = this.noiseSrc(t, 0.08, seed), hp = this.filter("highpass", 6500, 0.7);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.02);
        g.gain.linearRampToValueAtTime(0, t + 0.07);
        n.connect(hp).connect(g).connect(out);
    }
    /**
     * Rhodes-style electric piano: 2-op FM (sine modulating sine at 1:1) whose
     * index decays — the warm bell of a DX "E.Piano" — plus a short high tine.
     * Round and clean: no saws, nothing buzzy.
     */
    rhodes(t, midi, out, { vel = 0.14, dur = 1.6, pan = 0 } = {}) {
        const f = midiHz(midi), p = this.pan(pan, out);
        const car = this.ctx.createOscillator();
        car.type = "sine";
        car.frequency.value = f;
        const mod = this.ctx.createOscillator();
        mod.type = "sine";
        mod.frequency.value = f;
        const idx = this.ctx.createGain();
        idx.gain.setValueAtTime(f * (1.4 + vel * 3), t);
        idx.gain.setTargetAtTime(f * 0.25, t, 0.25);
        mod.connect(idx).connect(car.frequency);
        const g = this.env(t, { a: 0.004, h: 0.02, d: dur, peak: vel });
        car.connect(g).connect(p);
        const tine = this.ctx.createOscillator();
        tine.type = "sine";
        tine.frequency.value = f * 14.2;
        const tg = this.env(t, { a: 0.001, d: 0.05, peak: vel * 0.05 });
        tine.connect(tg).connect(p);
        for (const o of [car, mod, tine]) {
            o.start(t);
            o.stop(t + dur * 1.3 + 0.1);
        }
    }
    /** Acoustic piano: slightly inharmonic partials, brighter when struck harder, and a felt hammer. */
    piano(t, midi, out, { vel = 0.18, dur = 2.2, pan = 0 } = {}) {
        const f = midiHz(midi), p = this.pan(pan, out), B = 0.0004;
        for (let n = 1; n <= 7; n++) {
            const o = this.ctx.createOscillator();
            o.type = "sine";
            o.frequency.value = f * n * Math.sqrt(1 + B * n * n);
            const amp = (vel / n ** (1.5 - vel)) * (n === 1 ? 1 : 0.8);
            const g = this.env(t, { a: 0.002, d: dur / (1 + (n - 1) * 0.55), peak: amp });
            o.connect(g).connect(p);
            o.start(t);
            o.stop(t + dur + 0.1);
        }
        const h = this.noiseSrc(t, 0.03, midi * 3 + t), lp = this.filter("lowpass", 2500), hg = this.env(t, { a: 0.001, d: 0.02, peak: vel * 0.08 });
        h.connect(lp).connect(hg).connect(p);
    }
    /** Upright bass: a low plucked string (Karplus–Strong, dark) with a finger thump. */
    upright(t, midi, out, { vel = 0.32, dur = 1.0 } = {}) {
        // A round body (fundamental + a soft 2nd harmonic so it carries on a phone), with only a whisper
        // of plucked string on top — a louder string layer twangs like a jazz guitar.
        const f = midiHz(midi);
        [[1, 1], [2, 0.32], [3, 0.08]].forEach(([n, a]) => {
            const o = this.ctx.createOscillator();
            o.type = "sine";
            o.frequency.value = f * n;
            const g = this.env(t, { a: 0.012, h: dur * 0.25, d: dur * 0.9, peak: vel * a });
            o.connect(g).connect(out);
            o.start(t);
            o.stop(t + dur * 1.6 + 0.1);
        });
        this.pluck(t, midi, out, { vel: vel * 0.18, bright: 0.12, dur: Math.max(0.6, dur), seed: 3 });
    }
    /** Rim click (the bossa clave): a woody tock. */
    rim(t, out, { vel = 0.1, seed = 1 } = {}) {
        const o = this.ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(1750 + (seed % 3) * 30, t);
        const g = this.env(t, { a: 0.0005, d: 0.025, peak: vel });
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.06);
        const b = this.ctx.createOscillator();
        b.type = "sine";
        b.frequency.value = 520;
        const bg = this.env(t, { a: 0.0005, d: 0.04, peak: vel * 0.5 });
        b.connect(bg).connect(out);
        b.start(t);
        b.stop(t + 0.08);
    }
    /** Brushes on a snare: a soft swept swish. */
    brush(t, out, { vel = 0.05, dur = 0.22, seed = 1 } = {}) {
        const n = this.noiseSrc(t, dur, seed), bp = this.filter("bandpass", 3500, 0.6);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel, t + dur * 0.35);
        g.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(bp).connect(g).connect(out);
    }
}
//# sourceMappingURL=instruments.js.map