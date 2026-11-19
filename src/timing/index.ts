/**
 * romp/timing: how long words need on screen, as pure functions, so a film's
 * scene lengths come from its captions instead of being typed in by hand.
 *
 *   readingTime(text)          seconds a viewer needs to read it, once it's whole
 *   captionTiming(text)        typing, then holding it whole for its reading time
 *   timeline(scenes)           scene lengths from their captions, transitions that
 *                              never land on a caption's reading window, act cards
 *                              at a sane length; and the `covered` and `scenes`
 *                              options the check wants
 *
 * The defaults are the ones the text rules check against, so a film timed with
 * these passes `unfinished` and `unread` by construction.
 */

export interface ReadingOptions {
  /** words a minute (default 180: a comfortable pace for on-screen text) */
  wpm?: number;
  /** never less than this, seconds (default 1.5: even one word needs a beat) */
  min?: number;
}

/** Words in a text (anything between spaces; `*highlight*` markers don't count). */
export function wordCount(text: string): number {
  return text.replace(/\*/g, "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Seconds a viewer needs to read a text (or a word count) once it's all on screen. */
export function readingTime(text: string | number, o: ReadingOptions = {}): number {
  const words = typeof text === "number" ? text : wordCount(text);
  return Math.max(o.min ?? 1.5, (words * 60) / (o.wpm ?? 180));
}

export interface CaptionTimingOptions extends ReadingOptions {
  /** characters typed a second (default 30; Infinity shows it whole at once) */
  cps?: number;
  /** seconds to hold it whole (default: its reading time) */
  hold?: number;
  /** seconds of entrance before typing starts (default 0: start typing as it appears) */
  enter?: number;
  /** seconds of exit after the hold (default 0) */
  exit?: number;
  fps?: number;
}

export interface CaptionTiming {
  /** characters in the text (highlight markers removed) */
  chars: number;
  words: number;
  enterFrames: number;
  typeFrames: number;
  holdFrames: number;
  exitFrames: number;
  /** enter + type + hold + exit */
  totalFrames: number;
  /** characters shown `frame` frames after the caption starts */
  typed(frame: number): number;
}

/** Typing, then holding it whole for its reading time. */
export function captionTiming(text: string, o: CaptionTimingOptions = {}): CaptionTiming {
  const fps = o.fps ?? 30;
  const cps = o.cps ?? 30;
  const chars = [...text.replace(/\*/g, "")].length;
  const enterFrames = Math.round((o.enter ?? 0) * fps);
  const typeFrames = cps === Infinity ? 0 : Math.ceil((chars / cps) * fps);
  const holdFrames = Math.round((o.hold ?? readingTime(text, o)) * fps);
  const exitFrames = Math.round((o.exit ?? 0) * fps);
  return {
    chars,
    words: wordCount(text),
    enterFrames,
    typeFrames,
    holdFrames,
    exitFrames,
    totalFrames: enterFrames + typeFrames + holdFrames + exitFrames,
    typed(frame) {
      const t = frame - enterFrames;
      if (t < 0) return 0;
      if (typeFrames === 0 || t >= typeFrames) return chars;
      return Math.min(chars, Math.floor(((t + 1) / typeFrames) * chars));
    },
  };
}

export interface CaptionSpec extends CaptionTimingOptions {
  text: string;
  /** seconds of pause before it (default: the timeline's `gap`) */
  gap?: number;
}

export interface SceneSpec {
  name: string;
  /** captions, one after another; the scene lasts at least as long as they need */
  captions?: (string | CaptionSpec)[];
  /** at least this long, seconds (the footage, a physics beat) */
  seconds?: number;
  /** an act card: `actSeconds` long unless `seconds` says otherwise */
  act?: boolean;
  /** seconds of the transition into this scene (default: the timeline's `transition`; 0 or false for a cut) */
  transition?: number | false;
}

export interface TimelineOptions extends CaptionTimingOptions {
  fps?: number;
  /** default transition into each scene after the first, seconds (default 0.5) */
  transition?: number;
  /** act card length, seconds (default 1.2) */
  actSeconds?: number;
  /** pause before each caption after the first, seconds (default 0.15) */
  gap?: number;
  /** after the incoming transition, before the first caption, seconds (default 0.2) */
  lead?: number;
  /** after the last caption, before the outgoing transition, seconds (default 0.2) */
  tail?: number;
}

export interface PlacedCaption {
  text: string;
  /** frames from the scene's start */
  from: number;
  to: number;
  /** frames from the film's start */
  at: number;
  timing: CaptionTiming;
}

export interface Placement {
  index: number;
  /** first frame on the film's timeline (transitions overlap the scene before) */
  start: number;
  /** its length, including the transitions at both ends (Remotion's TransitionSeries counts it this way) */
  frames: number;
  /** frames of the transition into it, and out of it (into the next) */
  transitionIn: number;
  transitionOut: number;
  captions: PlacedCaption[];
}

export interface Timeline<S extends SceneSpec = SceneSpec> {
  fps: number;
  /** the film's length in frames */
  frames: number;
  scenes: (S & Placement)[];
  /** for the check: transitions as covered spans (seconds), and every scene start as a cut */
  check: { covered: [number, number][]; scenes: number[] };
}

/**
 * Lay out a film from its scenes. Each scene is at least as long as its
 * captions need (typing, then their reading time), plus the transitions at both
 * ends, so a transition never lands on a caption's reading window. Act cards
 * default to `actSeconds` (1.2 s). Extra length a scene asks for (`seconds`)
 * goes after its captions.
 */
export function timeline<S extends SceneSpec>(specs: S[], o: TimelineOptions = {}): Timeline<S> {
  const fps = o.fps ?? 30;
  const fr = (s: number) => Math.round(s * fps);
  const trans = specs.map((s, i) => (i === 0 || s.transition === false ? 0 : fr(s.transition ?? o.transition ?? 0.5)));
  const scenes: (S & Placement)[] = [];
  let start = 0;
  specs.forEach((spec, i) => {
    const tIn = trans[i], tOut = trans[i + 1] ?? 0;
    const caps: PlacedCaption[] = [];
    let at = tIn + (spec.captions?.length ? fr(o.lead ?? 0.2) : 0);
    (spec.captions ?? []).forEach((c, k) => {
      const cs: CaptionSpec = typeof c === "string" ? { text: c } : c;
      if (k > 0) at += fr(cs.gap ?? o.gap ?? 0.15);
      const timing = captionTiming(cs.text, { ...o, ...cs, fps });
      caps.push({ text: cs.text, from: at, to: at + timing.totalFrames, at: start + at, timing });
      at += timing.totalFrames;
    });
    const need = at + (caps.length ? fr(o.tail ?? 0.2) : 0) + tOut;
    const asked = spec.seconds != null ? fr(spec.seconds) : spec.act ? fr(o.actSeconds ?? 1.2) : 0;
    const frames = Math.max(need, asked, tIn + tOut + 1);
    scenes.push({ ...spec, index: i, start, frames, transitionIn: tIn, transitionOut: tOut, captions: caps });
    start += frames - tOut;
  });
  const last = scenes[scenes.length - 1];
  const frames = last ? last.start + last.frames : 0;
  return {
    fps,
    frames,
    scenes,
    check: {
      covered: scenes.filter((s) => s.transitionIn > 0).map((s) => [s.start / fps, (s.start + s.transitionIn) / fps] as [number, number]),
      scenes: scenes.slice(1).map((s) => s.start / fps),
    },
  };
}

/** A caption at a frame of its scene: is it on, how many characters are typed, and the typed text. */
export function captionAt(c: PlacedCaption, frame: number): { on: boolean; typed: number; text: string } {
  const on = frame >= c.from && frame < c.to;
  const typed = on ? c.timing.typed(frame - c.from) : 0;
  return { on, typed, text: [...c.text.replace(/\*/g, "")].slice(0, typed).join("") };
}
