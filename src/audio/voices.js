/*
  Cartoon voices: optional extras on the synth, for character films.
  - plop: something small dropping into liquid. Bubble resonance (a sine swept
    quickly UP) plus a tiny wet click; never hiss.
  - boing: a character landing. A rubbery pitch-bent body sized by how hard it
    hit (k), with a soft thud under it; `big` lowers it for bigger bodies.
  - babble: a character "talking" in gibberish: voiced syllables through vowel
    formants, pitch and pace per voice (VOICES, or pass your own), a sing-song
    contour and breaths between words.
  - slurp: a straw at the bottom of a cup (bubbly noise rising, a last plop).
  - beep: a payment terminal's approval (two short sine beeps).
  - ding: a two-note marimba success with a bell on top.
  - tock: a wooden block landing (marimba + rim).
  - pip: tiny footsteps / hop steps.
  - swish: something arriving: a short whoosh into a soft pop.
  - scribble: a felt-tip ring being drawn.
  Every tonal voice goes through the synth's `fit`, so it sits in the score's key.
*/
import { rng } from "./synth.js"

/** Formant pairs (Hz) for a few vowels: a, e, i, o, u, and a schwa. */
const VOWELS = [[800, 1200], [500, 1900], [320, 2400], [500, 900], [350, 800], [550, 1500]]

/** Voice presets for `babble`: base pitch (Hz), how sing-song (0..1), how fast (syllables/s). */
export const VOICES = {
  hero: { f0: 330, swing: 0.35, rate: 9 },
  low: { f0: 220, swing: 0.2, rate: 7.5 },
  sleepy: { f0: 260, swing: 0.15, rate: 6.5 },
  chill: { f0: 240, swing: 0.2, rate: 7 },
  loud: { f0: 420, swing: 0.5, rate: 10.5 },
  warm: { f0: 300, swing: 0.3, rate: 8 },
  sunny: { f0: 380, swing: 0.45, rate: 9.5 },
  squeaky: { f0: 440, swing: 0.4, rate: 8.5 },
  playful: { f0: 400, swing: 0.5, rate: 10 },
  singsong: { f0: 360, swing: 0.6, rate: 9 },
}

/** Adds the cartoon voices to a Synth (returns it). */
export function cartoon(s) {
  const ctx = s.ctx

  /** A small drop into liquid. `pitch` 0..1 raises it (e.g. counting up). */
  s.plop = (t, out, { vel = 0.32, pitch = 0.5, seed = 1, pan = 0 } = {}) => {
    const r = rng(seed * 17 + 3)
    const f0 = 260 + pitch * 260 + r() * 30
    const o = ctx.createOscillator(); o.type = "sine"
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.07)
    const g = s.env(t, { a: 0.002, d: 0.09, peak: vel })
    o.connect(g).connect(s.pan(pan, out)); o.start(t); o.stop(t + 0.2)
    // The wet click on contact.
    const n = s.noiseSrc(t, 0.02, seed), bp = s.filter("bandpass", 3200, 2), ng = s.env(t, { a: 0.0005, d: 0.012, peak: vel * 0.25 })
    n.connect(bp).connect(ng).connect(out)
    // A small second bubble just after.
    const o2 = ctx.createOscillator(); o2.type = "sine"
    o2.frequency.setValueAtTime(f0 * 1.6, t + 0.06); o2.frequency.exponentialRampToValueAtTime(f0 * 3.2, t + 0.1)
    const g2 = s.env(t + 0.06, { a: 0.002, d: 0.05, peak: vel * 0.35 })
    o2.connect(g2).connect(out); o2.start(t + 0.06); o2.stop(t + 0.2)
  }

  /** A landing: rubbery, sized by impact speed (k 0..1.4) and body size (big = low). */
  s.boing = (t, out, { k = 0.6, big = 1, seed = 1, pan = 0 } = {}) => {
    const r = rng(seed * 11 + 5)
    const v = Math.min(0.32, 0.08 + k * 0.17)
    const f = (180 + r() * 40) / big
    const o = ctx.createOscillator(); o.type = "triangle"
    o.frequency.setValueAtTime(f * 0.7, t)
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.05)
    o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.22)
    // The wobble: a few cycles of vibrato that die away (the "oing").
    const lfo = ctx.createOscillator(); lfo.frequency.value = 14 + r() * 4
    const lg = ctx.createGain(); lg.gain.setValueAtTime(f * 0.18, t); lg.gain.exponentialRampToValueAtTime(1, t + 0.3)
    lfo.connect(lg).connect(o.frequency)
    const lp = s.filter("lowpass", 1800, 1.5)
    const g = s.env(t, { a: 0.003, h: 0.03, d: 0.26, peak: v })
    o.connect(lp).connect(g).connect(s.pan(pan, out))
    o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5)
    // The thud under it (with an upper harmonic so a phone hears it).
    const th = ctx.createOscillator(); th.type = "sine"
    th.frequency.setValueAtTime(150 / big, t); th.frequency.exponentialRampToValueAtTime(70 / big, t + 0.1)
    const tg = s.env(t, { a: 0.002, d: 0.1, peak: v * 0.8 })
    th.connect(tg).connect(out); th.start(t); th.stop(t + 0.25)
  }

  /** A character talking: syllables of gibberish for `dur` seconds. `voice` is a
   * VOICES key or your own { f0, swing, rate }. */
  s.babble = (t, dur, out, { voice = "hero", vel = 0.11, seed = 1, pan = 0 } = {}) => {
    const V = typeof voice === "string" ? VOICES[voice] ?? VOICES.hero : voice
    const r = rng(seed * 101 + Math.round(V.f0))
    const p = s.pan(pan, out)
    let at = t
    let i = 0
    while (at < t + dur - 0.05) {
      const len = (1 / V.rate) * (0.7 + r() * 0.6)
      const [f1, f2] = VOWELS[Math.floor(r() * VOWELS.length)]
      // Sing-song contour: up a pentatonic step or two, down at phrase ends.
      const steps = [0, 2, 4, 7, 9, 12]
      const st = steps[Math.floor(r() * (2 + V.swing * 4))]
      const end = i % 5 === 4 ? -3 : 1
      const f = V.f0 * 2 ** (st / 12)
      const src = ctx.createOscillator(); src.type = "sawtooth"
      src.frequency.setValueAtTime(f, at); src.frequency.linearRampToValueAtTime(f * 2 ** (end / 12), at + len * 0.9)
      const a = s.filter("bandpass", f1, 6), b = s.filter("bandpass", f2, 8)
      const ga = s.gain(1), gb = s.gain(0.55)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, at)
      env.gain.linearRampToValueAtTime(vel, at + 0.015)
      env.gain.setValueAtTime(vel, at + len * 0.6)
      env.gain.linearRampToValueAtTime(0, at + len * 0.95)
      src.connect(a).connect(ga).connect(env)
      src.connect(b).connect(gb).connect(env)
      env.connect(p)
      src.start(at); src.stop(at + len + 0.02)
      at += len + (i % 5 === 4 ? 0.09 : 0.012) // a breath between "words"
      i++
    }
  }

  /** A straw at the bottom of a cup: bubbly band-passed noise rising. */
  s.slurp = (t, out, { vel = 0.14, dur = 0.55, seed = 9 } = {}) => {
    const n = s.noiseSrc(t, dur, seed), bp = s.filter("bandpass", 600, 4)
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(1600, t + dur * 0.8)
    // Gurgle: amplitude chopped by a fast, slightly irregular LFO.
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.setValueAtTime(18, t); lfo.frequency.linearRampToValueAtTime(30, t + dur)
    const depth = ctx.createGain(); depth.gain.value = vel * 0.5
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.05); g.gain.setValueAtTime(vel * 0.6, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur)
    lfo.connect(depth).connect(g.gain)
    n.connect(bp).connect(g).connect(out)
    lfo.start(t); lfo.stop(t + dur + 0.05)
    // The last drop rattling up the straw.
    s.plop(t + dur * 0.85, out, { vel: vel * 1.4, pitch: 0.9, seed })
  }

  /** A payment terminal approving: two short sine beeps. */
  s.beep = (t, out, { vel = 0.13 } = {}) => {
    for (const [dt, f] of [[0, 2093], [0.11, 2637]]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(vel, t + dt + 0.005); g.gain.setValueAtTime(vel, t + dt + 0.07); g.gain.linearRampToValueAtTime(0, t + dt + 0.085)
      o.connect(g).connect(out); o.start(t + dt); o.stop(t + dt + 0.1)
    }
  }

  /** A success: a two-note marimba ding with a bell on top. */
  s.ding = (t, out, { vel = 0.32, up = 0 } = {}) => {
    s.marimba(t, 81 + up, out, { vel, dur: 0.8, soft: 0.3 })
    s.marimba(t + 0.09, 86 + up, out, { vel: vel * 0.9, dur: 1.1, soft: 0.3 })
    s.bell(t + 0.09, 98 + up, out, { vel: vel * 0.18, dur: 1.2 })
  }

  /** A wooden block landing; climb `note` across a row of them. */
  s.tock = (t, out, { vel = 0.24, note = 74, seed = 1 } = {}) => {
    s.marimba(t, note, out, { vel, dur: 0.5, soft: 0.7 })
    s.rim(t, out, { vel: vel * 0.4, seed })
  }

  /** Tiny hop steps (under a running wipe, say). */
  s.pip = (t, out, { vel = 0.05, seed = 1, pan = 0 } = {}) => {
    const o = ctx.createOscillator(); o.type = "sine"
    const f = 900 + (seed % 5) * 90
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.03)
    const g = s.env(t, { a: 0.001, d: 0.035, peak: vel })
    o.connect(g).connect(s.pan(pan, out)); o.start(t); o.stop(t + 0.08)
  }

  /** Something arriving: a short whoosh into a soft pop. */
  s.swish = (t, out, { vel = 0.12, seed = 1 } = {}) => {
    s.whoosh(Math.max(0, t - 0.18), 0.24, out, { vel, peakAt: 0.75, f0: 700, f1: 3000, f2: 1200, seed })
    const o = ctx.createOscillator(); o.type = "sine"
    o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.04)
    const g = s.env(t, { a: 0.001, d: 0.05, peak: vel * 0.9 })
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.12)
  }

  /** A hand-drawn ring going on: a felt-tip circling. */
  s.scribble = (t, dur, out, { vel = 0.06 } = {}) => s.marker(t, dur, out, { vel })

  return s
}

