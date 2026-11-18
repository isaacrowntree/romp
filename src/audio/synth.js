/*
  romp's effect voices, all synthesised (no samples, so every sound is yours to
  use anywhere). Each voice schedules itself on an AudioContext (realtime) or an
  OfflineAudioContext (rendered) at an absolute time and connects to a bus.

  Craft rules these follow (see the README):
  - transients lead the picture by ~1 frame (callers pass `t - LEAD`);
  - whooshes have three parts — prepare, cross (loudest, brightest), release —
    shaped to the motion's speed and weight; landings get their own layer;
  - nothing repeats identically: every voice takes a seed and varies pitch,
    length and colour slightly;
  - energy lives in 200 Hz–6 kHz (phone speakers): bass-ish voices carry an
    upper harmonic or click so they survive a phone.
*/

/** The nearest note to `midi` in pitch-class set `pcs`. */
export const fitTo = (pcs, midi) => {
  for (let d = 0; d <= 6; d++) for (const m of [midi + d, midi - d]) if (pcs.has(((m % 12) + 12) % 12)) return m
  return midi
}

export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12)

/** Deterministic noise: the whole soundtrack is a pure function of the film. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6 }
}

export class Synth {
  constructor(ctx) {
    this.ctx = ctx
    const r = rng(7)
    // 2 s of white noise, shared by every noise voice (each starts at a random offset).
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
  }

  // ── plumbing ──────────────────────────────────────────────────────────────
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g }
  pan(p, out) { const s = this.ctx.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p)); s.connect(out); return s }
  filter(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b }
  noiseSrc(t, dur, seed = 0) {
    t = Math.max(0, t) // a lead-in at the very start would be negative
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise
    s.loop = true
    s.start(t, ((seed * 0.6180339) % 1) * 1.9, dur + 0.05)
    return s
  }
  /** Attack–hold–exponential-decay envelope on a fresh gain node. */
  env(t, { a = 0.005, h = 0, d = 0.2, peak = 1 } = {}) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + a)
    g.gain.setValueAtTime(peak, t + a + h)
    g.gain.setTargetAtTime(0, t + a + h, d / 4)
    return g
  }

  /**
   * The nearest note to `midi` that belongs to the chord sounding at t (`this.harmony`, set by the
   * mixer from the score): a tonal effect is part of the band's chord, never a semitone against it.
   */
  fit(t, midi) {
    return this.harmony ? fitTo(this.harmony(t), midi) : midi
  }

  /** A felt-tip highlighter swiped across a word: band-passed noise brightening as it goes. */
  marker(t, dur, out, { vel = 0.07 } = {}) {
    const n = this.noiseSrc(t, dur, t * 5), bp = this.filter("bandpass", 2600, 1.4)
    bp.frequency.setValueAtTime(2200, t); bp.frequency.linearRampToValueAtTime(3200, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.03); g.gain.setValueAtTime(vel, t + dur - 0.04); g.gain.linearRampToValueAtTime(0, t + dur)
    n.connect(bp).connect(g).connect(out)
  }

  /** A bell / glockenspiel: inharmonic partials with their own decays. */
  bell(t, midi, out, { vel = 0.2, dur = 1.8, pan = 0, bright = 1 } = {}) {
    const f = midiHz(this.fit(t, midi)), p = this.pan(pan, out)
    ;[[1, 1, 1], [2.756, 0.45 * bright, 0.5], [5.404, 0.22 * bright, 0.28], [8.933, 0.1 * bright, 0.16]].forEach(([ratio, amp, life]) => {
      const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * ratio
      const g = this.env(t, { a: 0.002, d: dur * life, peak: vel * amp })
      o.connect(g).connect(p); o.start(t); o.stop(t + dur * life + 0.1)
    })
  }

  /**
   * Marimba: a film's sonic family (one voice for every tonal effect, the way a
   * phone's system tones share one). A struck wooden bar — fundamental, the
   * tuned 4th partial, a little of the 10th — and a felt-mallet knock. Use it
   * for every tonal effect, in the score's key (see `fit`).
   */
  marimba(t, midi, out, { vel = 0.3, dur = 0.9, pan = 0, soft = 0.5 } = {}) {
    midi = this.fit(t, midi)
    const f = midiHz(midi), p = this.pan(pan, out)
    ;[[1, 1, 1], [3.93, 0.3 * (1 - soft * 0.6), 0.25], [9.9, 0.06 * (1 - soft), 0.08]].forEach(([ratio, amp, life]) => {
      const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * ratio
      const g = this.env(t, { a: 0.0015 + soft * 0.002, d: dur * life * (midi > 84 ? 0.6 : 1), peak: vel * amp })
      o.connect(g).connect(p); o.start(t); o.stop(t + dur * life + 0.1)
    })
    const n = this.noiseSrc(t, 0.02, midi + t), bp = this.filter("bandpass", Math.min(4000, f * 2), 1.5)
    const ng = this.env(t, { a: 0.0005, d: 0.01, peak: vel * 0.18 * (1 - soft * 0.5) })
    n.connect(bp).connect(ng).connect(p)
  }

  /** Rim click (the bossa clave): a woody tock. */
  rim(t, out, { vel = 0.1, seed = 1 } = {}) {
    const o = this.ctx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(1750 + (seed % 3) * 30, t)
    const g = this.env(t, { a: 0.0005, d: 0.025, peak: vel })
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.06)
    const b = this.ctx.createOscillator(); b.type = "sine"; b.frequency.value = 520
    const bg = this.env(t, { a: 0.0005, d: 0.04, peak: vel * 0.5 })
    b.connect(bg).connect(out); b.start(t); b.stop(t + 0.08)
  }

  /** Paper card hinging up: a dry papery flap. */
  flap(t, out, { vel = 0.12, size = 1, pan = 0, seed = 1 } = {}) {
    const n = this.noiseSrc(t, 0.2, seed), bp = this.filter("bandpass", 1100 / Math.sqrt(size) + (seed % 7) * 40, 0.9)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.03); g.gain.setTargetAtTime(0, t + 0.04, 0.035)
    n.connect(bp).connect(g).connect(this.pan(pan, out))
    // The card snapping upright.
    const k = this.noiseSrc(t + 0.07, 0.02, seed + 3), kb = this.filter("bandpass", 2400, 2), kg = this.env(t + 0.07, { a: 0.0005, d: 0.015, peak: vel * 0.5 })
    k.connect(kb).connect(kg).connect(this.pan(pan, out))
  }

  /**
   * Whoosh: filtered noise in three parts — prepare (rises), cross (`peakAt`,
   * loudest and brightest), release (falls darker). Speed → brightness and length.
   */
  whoosh(t, dur, out, { vel = 0.25, peakAt = 0.6, f0 = 500, f1 = 2600, f2 = 700, q = 1.1, pan0 = 0, pan1 = 0, seed = 1 } = {}) {
    const n = this.noiseSrc(t, dur, seed), bp = this.filter("bandpass", f0, q)
    const tc = t + dur * peakAt
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, tc); bp.frequency.exponentialRampToValueAtTime(f2, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, tc); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const p = this.ctx.createStereoPanner()
    p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + dur)
    n.connect(bp).connect(g).connect(p).connect(out)
  }

  /** UI tap: the soft iOS-style tick. */
  tap(t, out, { vel = 0.28 } = {}) {
    const o = this.ctx.createOscillator(); o.type = "triangle"; o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(1200, t + 0.025)
    const g = this.env(t, { a: 0.0005, d: 0.03, peak: vel })
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.08)
    const n = this.noiseSrc(t, 0.015, t * 3), hp = this.filter("highpass", 4000), ng = this.env(t, { a: 0.0005, d: 0.008, peak: vel * 0.4 })
    n.connect(hp).connect(ng).connect(out)
  }

  /**
   * Water, built the way water actually sounds: bubble resonance — a sine whose
   * pitch sweeps quickly *up* (the "plop") — not hiss. Entry: a deep plunk, a
   * short bright spray, then droplets and small bubbles. Exit (`out`): a light
   * "shlp" and a couple of drips.
   */
  splash(t, out, { vel = 0.3, big = 1, seed = 1 } = {}) {
    const r = rng(seed * 31)
    const bloop = (s, f0, f1, d, v, pan = 0) => {
      const o = this.ctx.createOscillator(); o.type = "sine"
      o.frequency.setValueAtTime(f0, s); o.frequency.exponentialRampToValueAtTime(f1, s + d * 0.7)
      const g = this.env(s, { a: 0.002, d, peak: v })
      o.connect(g).connect(this.pan(pan, out)); o.start(s); o.stop(s + d + 0.05)
    }
    if (big >= 0.9) {
      // The plunk: the cavity the fish punches, resonating as it closes.
      bloop(t, 190, 640, 0.09, vel * 0.9)
      bloop(t + 0.012, 300, 900, 0.06, vel * 0.4)
    } else bloop(t, 520, 1300, 0.04, vel * 0.5)
    // The spray: a short, bright, quickly-gone burst.
    const n = this.noiseSrc(t, 0.25, seed), bp = this.filter("bandpass", big >= 0.9 ? 1600 : 2600, 0.7)
    const ng = this.env(t, { a: 0.003, d: big >= 0.9 ? 0.13 : 0.06, peak: vel * (big >= 0.9 ? 0.35 : 0.2) })
    n.connect(bp).connect(ng).connect(out)
    // Droplets falling back, and a few small bubbles rising.
    for (let i = 0; i < (big >= 0.9 ? 6 : 2); i++) {
      const dt = 0.06 + r() * (big >= 0.9 ? 0.45 : 0.2), f = 900 + r() * 900
      bloop(t + dt, f, f * 2.2, 0.025 + r() * 0.02, vel * (0.12 + r() * 0.12), (r() - 0.5) * 0.6)
    }
    for (let i = 0; big >= 0.9 && i < 3; i++) {
      const dt = 0.15 + r() * 0.35, f = 380 + r() * 300
      bloop(t + dt, f, f * 1.8, 0.05, vel * 0.1, (r() - 0.5) * 0.3)
    }
  }

  /** Fire: a whoomp as it catches. */
  ignite(t, out, { vel = 0.3 } = {}) {
    const n = this.noiseSrc(t, 0.9, 99), lp = this.filter("lowpass", 300, 0.9)
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.18); lp.frequency.exponentialRampToValueAtTime(500, t + 0.8)
    const g = this.env(t, { a: 0.06, d: 0.6, peak: vel })
    n.connect(lp).connect(g).connect(out)
  }

  /** Fire crackle from t0 to t1: random pops and a low breath, level shaped by `level(t)`. */
  crackle(t0, t1, out, { vel = 0.12, level = () => 1, seed = 5 } = {}) {
    const r = rng(seed)
    for (let t = t0; t < t1; t += 0.02 + r() * 0.11) {
      const L = level(t)
      if (L <= 0.01) continue
      const n = this.noiseSrc(t, 0.02, t * 17), bp = this.filter("bandpass", 1200 + r() * 3000, 2)
      const g = this.env(t, { a: 0.0005, d: 0.006 + r() * 0.02, peak: vel * L * (0.3 + r() * 0.9) })
      n.connect(bp).connect(g).connect(this.pan((r() - 0.5) * 0.4, out))
    }
    const b = this.noiseSrc(t0, t1 - t0, 3), lp = this.filter("lowpass", 420, 0.6), g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    for (let t = t0; t <= t1; t += 0.1) g.gain.linearRampToValueAtTime(vel * 0.5 * level(t), t)
    b.connect(lp).connect(g).connect(out)
  }

  /** Crickets: tiny pulsed chirps, far off. */
  crickets(t0, t1, out, { vel = 0.03, level = () => 1, seed = 11 } = {}) {
    const r = rng(seed)
    for (let t = t0 + r() * 0.3; t < t1; t += 0.35 + r() * 0.5) {
      const L = level(t)
      if (L <= 0.01) continue
      const f = 4300 + r() * 500, pan = (r() - 0.5) * 1.2
      for (let k = 0; k < 3; k++) {
        const s = t + k * 0.045
        const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = f
        const g = this.env(s, { a: 0.004, h: 0.012, d: 0.02, peak: vel * L })
        o.connect(g).connect(this.pan(pan, out)); o.start(s); o.stop(s + 0.06)
      }
    }
  }

  // ── ambience beds: continuous, shaped by `level(t)` (0…1) ───────────────────

  /** A bed of filtered noise whose gain follows `shape(t)` (sampled every 50 ms). */
  bed(t0, t1, out, { vel, level = () => 1, shape = () => 1, seed = 1, type = "lowpass", f = 800, q = 0.7, fmod = null }) {
    const n = this.noiseSrc(t0, t1 - t0, seed), flt = this.filter(type, f, q), g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    for (let t = t0; t <= t1; t += 0.05) {
      g.gain.linearRampToValueAtTime(Math.max(0, vel * level(t) * shape(t)), t)
      if (fmod) flt.frequency.linearRampToValueAtTime(fmod(t), t)
    }
    n.connect(flt).connect(g).connect(out)
  }

  /** The sea: a low wash that swells and draws back (~3.6 s a wave), and the fizz of it breaking. */
  surf(t0, t1, out, { vel = 0.05, level = () => 1, seed = 31 } = {}) {
    const swell = (t) => 0.35 + 0.65 * Math.sin((Math.PI * (t - t0)) / 3.6) ** 2
    this.bed(t0, t1, out, { vel, level, shape: swell, seed, f: 520, fmod: (t) => 380 + 520 * swell(t) })
    this.bed(t0, t1, this.pan(0.25, out), { vel: vel * 0.35, level, shape: (t) => swell(t - 0.5) ** 3, seed: seed + 1, type: "bandpass", f: 3200, q: 0.6 })
  }

  /** Wind over the hills: a band of noise wandering in pitch and strength. */
  wind(t0, t1, out, { vel = 0.04, level = () => 1, seed = 41 } = {}) {
    const gust = (t) => 0.55 + 0.45 * Math.sin(t * 0.9 + 1.3) * Math.sin(t * 0.37)
    this.bed(t0, t1, out, { vel, level, shape: gust, seed, type: "bandpass", f: 500, q: 1.4, fmod: (t) => 380 + 380 * gust(t) })
  }

  /** A town's hum: a low distant rumble and a soft wash of far-off traffic. */
  hum(t0, t1, out, { vel = 0.03, level = () => 1, seed = 51 } = {}) {
    this.bed(t0, t1, out, { vel, level, seed, f: 220, q: 0.5 })
    this.bed(t0, t1, out, { vel: vel * 0.4, level, shape: (t) => 0.6 + 0.4 * Math.sin(t * 1.7), seed: seed + 1, type: "bandpass", f: 900, q: 0.8 })
  }

  /** Birdsong: short phrases of quick, gliding whistles, here and there, never busy. */
  birds(t0, t1, out, { vel = 0.03, level = () => 1, seed = 61 } = {}) {
    const r = rng(seed)
    for (let t = t0 + r() * 0.3; t < t1; t += 0.45 + r() * 0.9) {
      const L = level(t)
      if (L <= 0.01) continue
      const base = 2600 + r() * 1800, notes = 2 + Math.floor(r() * 3), pan = (r() - 0.5) * 1.4
      for (let k = 0; k < notes; k++) {
        const s = t + k * (0.07 + r() * 0.04), f = base * (1 + (r() - 0.4) * 0.25)
        const o = this.ctx.createOscillator(); o.type = "sine"
        o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * (r() < 0.5 ? 1.35 : 0.75), s + 0.06)
        const g = this.env(s, { a: 0.006, h: 0.02, d: 0.05, peak: vel * L })
        o.connect(g).connect(this.pan(pan, out)); o.start(s); o.stop(s + 0.12)
      }
    }
  }

  /** A gull's call: a bright, falling, slightly rough cry, twice. */
  gullCall(t, out, { vel = 0.05, pan = 0 } = {}) {
    for (const [dt, k] of [[0, 1], [0.24, 0.8]]) {
      const s = t + dt, o = this.ctx.createOscillator(), m = this.ctx.createOscillator(), mg = this.gain(60)
      o.type = "triangle"
      o.frequency.setValueAtTime(1500, s); o.frequency.linearRampToValueAtTime(1900, s + 0.04); o.frequency.exponentialRampToValueAtTime(1050, s + 0.2)
      m.frequency.value = 38; m.connect(mg).connect(o.frequency)
      const bp = this.filter("bandpass", 1700, 1.2), g = this.env(s, { a: 0.01, h: 0.05, d: 0.14, peak: vel * k })
      o.connect(bp).connect(g).connect(this.pan(pan, out)); o.start(s); m.start(s); o.stop(s + 0.3); m.stop(s + 0.3)
    }
  }

  /** A riser: noise + a saw sweeping up, building to `t + dur`. */
  riser(t, dur, out, { vel = 0.18 } = {}) {
    const n = this.noiseSrc(t, dur, 21), bp = this.filter("bandpass", 400, 0.8)
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur)
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.97); g.gain.linearRampToValueAtTime(0, t + dur)
    n.connect(bp).connect(g).connect(out)
    const o = this.ctx.createOscillator(); o.type = "triangle"
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(440, t + dur)
    const lp = this.filter("lowpass", 900), og = this.ctx.createGain()
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vel * 0.25, t + dur * 0.97); og.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + dur + 0.05)
  }

  /** A soft landing thump with weight (the map arriving, the logo). */
  thump(t, out, { vel = 0.4 } = {}) {
    const o = this.ctx.createOscillator(); o.type = "sine"
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.2)
    const g = this.env(t, { a: 0.003, d: 0.4, peak: vel })
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.6)
    const n = this.noiseSrc(t, 0.25, 41), lp = this.filter("lowpass", 900), ng = this.env(t, { a: 0.002, d: 0.15, peak: vel * 0.35 })
    n.connect(lp).connect(ng).connect(out)
  }

  /** A switch (headlights): a dry mechanical click. */
  click(t, out, { vel = 0.18 } = {}) {
    const n = this.noiseSrc(t, 0.02, t * 11), bp = this.filter("bandpass", 3200, 3)
    const g = this.env(t, { a: 0.0003, d: 0.01, peak: vel })
    n.connect(bp).connect(g).connect(out)
    const o = this.ctx.createOscillator(); o.type = "square"; o.frequency.value = 180
    const lp = this.filter("lowpass", 800), og = this.env(t, { a: 0.0005, d: 0.015, peak: vel * 0.3 })
    o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + 0.04)
  }

  /** A small engine: a pass-by (Doppler: pitch falls as it passes) or a cheerful rev. */
  engine(t, dur, out, { vel = 0.12, f0 = 70, f1 = 55, passAt = 0.5, pan0 = -0.4, pan1 = 0.4, rev = false } = {}) {
    const o = this.ctx.createOscillator(); o.type = "sawtooth"
    const tc = t + dur * passAt
    if (rev) { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.4); o.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + dur) }
    else { o.frequency.setValueAtTime(f0, t); o.frequency.setValueAtTime(f0, tc - 0.08); o.frequency.exponentialRampToValueAtTime(f1, tc + 0.12) }
    const lp = this.filter("lowpass", 900, 1.2)
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(1600, tc); lp.frequency.exponentialRampToValueAtTime(500, t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, tc); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const p = this.ctx.createStereoPanner(); p.pan.setValueAtTime(pan0, t); p.pan.linearRampToValueAtTime(pan1, t + dur)
    // A second, detuned cylinder for body.
    const o2 = this.ctx.createOscillator(); o2.type = "square"; o2.frequency.value = 1
    o2.frequency.setValueAtTime(f0 * 2.01, t)
    if (!rev) { o2.frequency.setValueAtTime(f0 * 2.01, tc - 0.08); o2.frequency.exponentialRampToValueAtTime(f1 * 2.01, tc + 0.12) }
    else { o2.frequency.exponentialRampToValueAtTime(f1 * 2.01, t + dur * 0.4); o2.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + dur) }
    const g2 = this.gain(0.25)
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(p).connect(out)
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05)
  }

  /** A generated room: decaying stereo noise as a convolver impulse. */
  reverb(seconds = 2.2, decay = 3) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * seconds)
    const ir = this.ctx.createBuffer(2, n, sr), r = rng(3)
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c)
      for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * (1 - i / n) ** decay
    }
    const cv = this.ctx.createConvolver()
    cv.buffer = ir
    return cv
  }
}
