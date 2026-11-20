/** Acting: what makes a drawn character read as alive rather than animated,
 * as pure functions of the frame (any frame, any order, the same every render):
 *
 * - speech: words become syllables with real timing (`syllables`), the mouth
 *   opens and rounds on each vowel (`talk`) and the voice can speak the very
 *   same syllables (`babble({ syllables })` in romp/audio), so lips and sound
 *   agree;
 * - eyes: they jump to what matters and hold (saccades in 3 frames), drift a
 *   little while they hold, blink on a big look, and the head follows the eyes
 *   a beat later (`gaze`);
 * - a jump has a crouch before it, a stretch that follows its speed, a hang at
 *   the top and a landing sized by how far it fell (`jump`);
 * - quick reactions with an anticipation each: surprise, giggle, nod, shake (`react`);
 * - squash keeps the body's volume (`keepVolume`).
 *
 * Frames are at the stage's fps (default 30); times in a speech are seconds. */
import { idle, jiggle, landing, type CharacterPose } from "./motion.js";

/** A deterministic hash of two integers into [0, 1). */
export function hash01(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * The width that keeps a squashed body's volume: `squashY ** -k`. k = 1 keeps
 * its area exactly (squashed to 0.8 tall → 1.25 wide); the default 0.7 reads
 * as rubbery without the drawing spreading too far.
 */
export const keepVolume = (squashY: number, k = 0.7) => Math.pow(Math.max(0.05, squashY), -k);

// ── Speech ────────────────────────────────────────────────────────────────

/** A vowel's mouth: a/e open, i wide, o/u round, m closed (a hum). */
export type Vowel = "a" | "e" | "i" | "o" | "u" | "m";

export interface Syllable {
  /** seconds from the start of the line */
  t0: number;
  t1: number;
  vowel: Vowel;
  /** a stressed syllable: louder, longer, a little nod */
  stress: boolean;
  /** the letters (or character) it came from */
  text: string;
}

export interface SyllableOptions {
  /** syllables a second (default 8: brisk cartoon speech) */
  rate?: number;
  /** jitter in syllable lengths (default 1) */
  seed?: number;
  /** stretch or squeeze the whole line to last exactly this many seconds */
  fit?: number;
  /** seconds of silence after , . ! ? and their CJK forms (default 0.16) */
  pause?: number;
  /** seconds between words (default 0.03) */
  gap?: number;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const STOP = /[,.;:!?…，。；：！？、]/u;
const VOWEL_OF: Record<string, Vowel> = { a: "a", e: "e", i: "i", y: "i", o: "o", u: "u" };
const CJK_VOWELS: Vowel[] = ["a", "a", "e", "i", "i", "o", "u", "u"];

/** A Latin word's syllables: its vowel groups (a word-final silent e joins the one before). */
function wordSyllables(word: string): { text: string; vowel: Vowel }[] {
  const w = word.toLowerCase();
  const groups = [...w.matchAll(/[aeiouy]+/g)];
  if (!groups.length) return /[a-z]/.test(w) ? [{ text: word, vowel: w.length <= 3 && /^h?m+$/.test(w) ? "m" : "e" }] : [...w.replace(/[^0-9]/g, "")].map((d) => ({ text: d, vowel: "e" as Vowel }));
  if (groups.length > 1) {
    const last = groups[groups.length - 1];
    if (last[0] === "e" && last.index === w.length - 1 && !/le$/.test(w)) groups.pop();
  }
  return groups.map((g) => ({ text: g[0], vowel: VOWEL_OF[g[0][0] === "y" && g[0].length > 1 ? g[0][1] : g[0][0]] ?? "e" }));
}

/**
 * A line of words as timed syllables. English: one per vowel group; Chinese,
 * Japanese and Korean: one per character. Pauses after punctuation, a breath
 * between words, stressed syllables a little longer. Pure: the same text and
 * seed give the same timing, so a mouth and a voice made from it agree.
 */
export function syllables(text: string, o: SyllableOptions = {}): Syllable[] {
  const rate = o.rate ?? 8, seed = o.seed ?? 1, pause = o.pause ?? 0.16, gap = o.gap ?? 0.03;
  const out: Syllable[] = [];
  let t = 0, n = 0;
  const say = (s: { text: string; vowel: Vowel }, stress: boolean) => {
    const len = (1 / rate) * (0.75 + 0.5 * hash01(seed, n)) * (stress ? 1.25 : 1);
    out.push({ t0: t, t1: t + len, vowel: s.vowel, stress, text: s.text });
    t += len;
    n++;
  };
  // Words, CJK characters and stops, in order.
  for (const m of text.matchAll(/[\p{L}\p{N}']+|[,.;:!?…，。；：！？、]|\s+/gu)) {
    const tok = m[0];
    if (/^\s+$/.test(tok)) {
      if (out.length) t += gap;
      continue;
    }
    if (STOP.test(tok)) {
      if (out.length) t += pause;
      continue;
    }
    if (CJK.test(tok)) {
      // Each character a syllable; mixed tokens (e.g. "PEARL店") split into runs.
      for (const run of tok.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []) {
        if (CJK.test(run)) say({ text: run, vowel: CJK_VOWELS[Math.floor(hash01(run.codePointAt(0)!, 7) * CJK_VOWELS.length)] }, n % 4 === 0);
        else wordSyllables(run).forEach((s, i) => say(s, i === 0));
      }
      continue;
    }
    const syl = wordSyllables(tok);
    syl.forEach((s, i) => say(s, syl.length > 1 ? i === 0 : tok.length > 3));
  }
  if (o.fit && t > 0 && out.length) {
    const end = out[out.length - 1].t1;
    const k = o.fit / end;
    for (const s of out) {
      s.t0 *= k;
      s.t1 *= k;
    }
  }
  return out;
}

/** How long a line of syllables lasts (seconds). */
export const speechLength = (syl: readonly Syllable[]) => (syl.length ? syl[syl.length - 1].t1 : 0);

export interface Speech {
  /** 0 closed … 1 wide open */
  open: number;
  /** the vowel being said (or "m" between syllables) */
  vowel: Vowel;
  /** a mouth to draw, from the vowel and how open it is */
  mouth: "closed" | "open" | "wide" | "round";
  /** still talking (inside the line) */
  talking: boolean;
  /** 0…1: a stressed syllable's beat, for a nod or a squash */
  beat: number;
}

/**
 * The mouth at `t` seconds into a line: each syllable opens in ~30 ms, holds,
 * and closes by 95% of its length (the same envelope `babble` voices), round
 * for o/u, wide for i, closed in pauses.
 */
export function talk(t: number, syl: readonly Syllable[]): Speech {
  const end = speechLength(syl);
  let s: Syllable | undefined;
  for (const x of syl) if (t >= x.t0 && t < x.t1) s = x;
  if (!s) return { open: 0, vowel: "m", mouth: "closed", talking: t >= 0 && t < end, beat: 0 };
  const len = s.t1 - s.t0, u = (t - s.t0) / len;
  const env = u < 0.03 / len ? (u * len) / 0.03 : u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.35);
  const peak = s.vowel === "m" ? 0.15 : s.stress ? 1 : 0.75;
  const open = env * peak;
  const mouth = open < 0.2 ? "closed" : s.vowel === "o" || s.vowel === "u" ? "round" : s.vowel === "i" ? "wide" : "open";
  return { open, vowel: s.vowel, mouth, talking: true, beat: s.stress ? env * (1 - u) : 0 };
}

/** A talking character's body: the jaw's small squash and a nod on every stressed syllable, over its idle. */
export function talkPose(frame: number, t: number, syl: readonly Syllable[], seed = 0): CharacterPose & { speech: Speech } {
  const sp = talk(t, syl);
  const i = idle(frame, seed);
  const squashY = i.squashY + 0.025 * sp.open - 0.03 * sp.beat;
  return { ...i, squashY, squashX: i.squashX * keepVolume(squashY / i.squashY), tilt: i.tilt + 5 * sp.beat, speech: sp };
}

// ── Eyes ──────────────────────────────────────────────────────────────────

export interface GazeKey {
  /** frame the look starts */
  at: number;
  /** -1 (left) … 1 (right) */
  x: number;
  /** -1 (up) … 1 (down) */
  y?: number;
}

export interface GazeOptions {
  /** where to look, from when (sorted or not) */
  keys?: readonly GazeKey[];
  seed?: number;
  /** how far the eyes drift while holding a look (default 0.18; 0 for none) */
  wander?: number;
  /** frames a saccade takes (default 3) */
  saccade?: number;
  /** how quickly the head follows (per frame, default 0.3) and how far behind it starts (default 2 frames) */
  follow?: number;
  delay?: number;
}

export interface Gaze {
  /** the eyes, -1…1 */
  x: number;
  y: number;
  /** the head following them, -1…1 (scale it to a tilt or a turn) */
  head: number;
  /** a blink that comes with a big look (0…1) */
  blink: number;
}

/**
 * Eyes that jump and hold, the way eyes do: each look is a saccade of a few
 * frames, then a hold with small drifts (every 1.2–2.5 s, never in the first
 * 20 frames of a look), a blink with a big change of look, and the head
 * following the eyes on a critically damped spring a couple of frames behind.
 */
export function gaze(frame: number, o: GazeOptions = {}): Gaze {
  const seed = o.seed ?? 0, wander = o.wander ?? 0.18, sac = o.saccade ?? 3, w = o.follow ?? 0.3, delay = o.delay ?? 2;
  const keys = [...(o.keys ?? [])].sort((a, b) => a.at - b.at);
  // Every change of look, in order: the keys, and drifts while a look holds.
  type Step = { at: number; x: number; y: number };
  const steps: Step[] = [];
  const base = (f: number) => {
    let k: GazeKey | undefined;
    for (const x of keys) if (x.at <= f) k = x;
    return k ?? { at: -Infinity, x: 0, y: 0 };
  };
  const from = Math.min(keys[0]?.at ?? 0, frame) - 240;
  for (const k of keys) steps.push({ at: k.at, x: k.x, y: k.y ?? 0 });
  if (wander > 0) {
    const SLOT = 55;
    for (let s = Math.floor(from / SLOT); s * SLOT <= frame; s++) {
      const at = s * SLOT + Math.floor(hash01(seed, s) * 20);
      const b = base(at);
      if (at - b.at < 20) continue;
      steps.push({ at, x: clamp(b.x + (hash01(seed + 31, s) - 0.5) * 2 * wander, -1, 1), y: clamp((b.y ?? 0) + (hash01(seed + 57, s) - 0.5) * wander, -1, 1) });
    }
  }
  steps.sort((a, b) => a.at - b.at);
  let x = 0, y = 0, head = 0, blink = 0, px = 0, py = 0;
  for (const s of steps) {
    if (s.at > frame) break;
    const dx = s.x - px, dy = s.y - py;
    const u = smooth((frame - s.at) / sac);
    x += dx * u;
    y += dy * u;
    const th = frame - s.at - delay;
    if (th > 0) head += dx * (1 - (1 + w * th) * Math.exp(-w * th));
    if (Math.abs(dx) > 0.7 && frame - s.at < 3) blink = Math.max(blink, frame - s.at < 2 ? 1 : 0.5);
    px = s.x;
    py = s.y;
  }
  return { x, y, head, blink };
}

// ── Jumps ─────────────────────────────────────────────────────────────────

export interface JumpOptions {
  /** px at the top (default 120) */
  height?: number;
  /** frames in the air (default 16) */
  air?: number;
  /** frames of crouch before take-off (default 5) */
  crouch?: number;
  seed?: number;
}

export interface Jumping {
  /** px offset, up is negative */
  y: number;
  pose: CharacterPose;
  /** a take-off or touch-down this frame (mark it for the motion check) */
  contact: boolean;
  phase: "before" | "crouch" | "air" | "landed";
}

/**
 * One jump from `at`: a crouch (anticipation), take-off stretched by its
 * speed, a parabola that hangs at the top, then the landing squash sized by
 * how hard it came down. Volume kept throughout.
 */
export function jump(frame: number, at: number, o: JumpOptions = {}): Jumping {
  const H = o.height ?? 120, air = Math.max(4, o.air ?? 16), crouch = Math.max(1, o.crouch ?? 5), seed = o.seed ?? 0;
  const off = at + crouch, land = off + air;
  const i = idle(frame, seed);
  if (frame < at) return { y: 0, pose: i, contact: false, phase: "before" };
  if (frame < off) {
    const u = smooth((frame - at) / crouch);
    const sy = 1 - 0.16 * u;
    return { y: 0, pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt + 4 * u, lift: -1.5 * u, blink: 0 }, contact: frame >= off - 1, phase: "crouch" };
  }
  if (frame < land) {
    const u = (frame - off) / air;
    const v = 1 - 2 * u; // up +1 … down -1
    const sy = 1 + 0.16 * Math.abs(v) ** 1.5; // stretched by speed, round at the top
    return {
      y: -H * 4 * u * (1 - u),
      pose: { squashY: sy, squashX: keepVolume(sy), tilt: -12 * v, lift: 3 * v, blink: 0, jiggle: jiggle(frame - off, 0.5) },
      contact: frame - off <= 1,
      phase: "air",
    };
  }
  const strength = Math.min(1.4, 0.5 + H / 250);
  const p = landing(frame, land, seed, strength);
  return { y: 0, pose: { ...p, squashX: keepVolume(p.squashY / i.squashY) * i.squashX }, contact: frame - land <= 2, phase: "landed" };
}

// ── Reactions ─────────────────────────────────────────────────────────────

export type Reaction = "surprise" | "giggle" | "nod" | "shake";

export interface Reacting {
  /** offset up, as a share of the character's height (multiply by its size) */
  y: number;
  pose: CharacterPose;
  /** a mouth to draw, when the reaction calls for one */
  mouth?: "round" | "open" | "closed";
  /** eyes left/right, when it moves them */
  lookX?: number;
  /** finished (back to idle) */
  done: boolean;
}

/** How long each reaction takes (frames at 30 fps). */
export const REACTION_FRAMES: Record<Reaction, number> = { surprise: 34, giggle: 26, nod: 18, shake: 22 };

/**
 * A quick reaction from `at`, each with its anticipation:
 * - surprise (a "take"): a 3-frame flinch down, a pop up with eyes wide and a
 *   round mouth, the hat flying up, a squashy landing;
 * - giggle: fast small bounces, eyes squeezed, mouth open, fading out;
 * - nod: two dips forward;
 * - shake: the head and eyes swinging side to side, settling.
 */
export function react(frame: number, at: number, kind: Reaction, o: { seed?: number; strength?: number } = {}): Reacting {
  const seed = o.seed ?? 0, k = o.strength ?? 1;
  const dt = frame - at;
  const i = idle(frame, seed);
  const done = dt >= REACTION_FRAMES[kind];
  if (dt < 0 || done) return { y: 0, pose: i, done };
  if (kind === "surprise") {
    if (dt < 3) {
      const sy = 1 - 0.1 * k * (dt / 3);
      return { y: 0, pose: { ...i, squashY: sy, squashX: keepVolume(sy), blink: 0.5 }, done };
    }
    const AIR = 9;
    if (dt < 3 + AIR) {
      const u = (dt - 3) / AIR, v = 1 - 2 * u;
      const sy = 1 + 0.18 * k * Math.max(0, v);
      return { y: -0.13 * k * 4 * u * (1 - u), pose: { squashY: sy, squashX: keepVolume(sy), tilt: -10 * k * v, lift: 7 * k * Math.max(0, v), blink: 0, jiggle: jiggle(dt - 3, k) }, mouth: "round", done };
    }
    const p = landing(frame, at + 3 + AIR, seed, 0.7 * k);
    return { y: 0, pose: { ...p, blink: dt < 3 + AIR + 14 ? 0 : p.blink }, mouth: dt < 3 + AIR + 14 ? "round" : undefined, done };
  }
  if (kind === "giggle") {
    const fade = Math.exp(-dt / 12);
    const b = Math.sin(dt * 1.6) * fade;
    const sy = 1 + 0.05 * k * b;
    return { y: -0.015 * k * Math.abs(b), pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: 4 * k * Math.sin(dt * 0.8) * fade, blink: 0.65 }, mouth: "open", done };
  }
  if (kind === "nod") {
    const u = dt / REACTION_FRAMES.nod;
    const dip = Math.sin(Math.PI * 2 * u) ** 2 * (1 - 0.4 * u);
    const sy = i.squashY - 0.06 * k * dip;
    return { y: 0.01 * k * dip, pose: { ...i, squashY: sy, squashX: keepVolume(sy), tilt: i.tilt + 7 * k * dip, blink: dip > 0.6 ? 0.4 : i.blink }, done };
  }
  // shake
  const fade = 1 - dt / REACTION_FRAMES.shake;
  const s = Math.sin(dt * 0.95) * fade;
  return { y: 0, pose: { ...i, tilt: i.tilt + 9 * k * s, jiggle: 3 * s }, lookX: -0.7 * s, mouth: "closed", done };
}

// ── Life ──────────────────────────────────────────────────────────────────

/**
 * Blinks that don't tick like a metronome: one in each 2.2–4 s, at a seeded
 * moment, and sometimes a double blink. 0 open … 1 shut.
 */
export function blinks(frame: number, seed = 0): number {
  const SLOT = 90;
  const s = Math.floor(frame / SLOT);
  for (const slot of [s, s - 1]) {
    const at = slot * SLOT + Math.floor(hash01(seed + 101, slot) * 60);
    const dts = [frame - at];
    if (hash01(seed + 202, slot) < 0.25) dts.push(frame - at - 6);
    for (const dt of dts) if (dt >= 0 && dt < 4) return dt < 2 ? 1 : 0.5;
  }
  return 0;
}

/**
 * Idle that breathes like breathing (in slower than out), shifts its weight
 * now and then, and blinks irregularly. A drop-in for `idle`.
 */
export function alive(frame: number, seed = 0): CharacterPose {
  const ph = (frame + seed * 9) / 11;
  const b = Math.sin(ph + 0.45 * Math.sin(ph)); // skewed: a slower inhale
  const sy = 1 + 0.025 * b;
  const shift = Math.sin((frame + seed * 41) / 47) * Math.sin((frame + seed * 13) / 83);
  const bl = blinks(frame, seed);
  return { squashY: sy - 0.01 * bl, squashX: keepVolume(sy), tilt: 2.2 * Math.sin((frame + seed * 5) / 15) + 3 * shift, lift: 0, blink: bl, jiggle: 0 };
}

