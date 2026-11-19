/**
 * romp for Remotion (or any DOM renderer): mark what the motion check should
 * follow, and read baked physics by frame.
 *
 *   <div {...track("hero", { impact: nearImpact(body.impacts, frame) })} style={…} />
 *
 * Run the check with the CLI: `romp check src/check-entry.tsx --public public`.
 */
export { collectDom } from "../check/dom.js";
export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";
export { captionTiming, captionAt, readingTime, timeline, type Timeline, type SceneSpec, type PlacedCaption } from "../timing/index.js";
import type { AnalyzeOptions, Role, TextKind } from "../check/analyze.js";
import type { Placement } from "../timing/index.js";
import { particleSample, type Particle } from "../particles/index.js";

export interface TrackOptions {
  impact?: boolean;
  seamless?: boolean;
  allowCrop?: boolean;
  allowExit?: boolean;
  /** for the text rules: words to read, the highlighted thing being talked about, or a prop */
  role?: Role;
  /** text rules it may break on purpose */
  allow?: TextKind[];
  /** paint order, when CSS z-index puts it above or below its place in the document */
  z?: number;
}

/** Data attributes for the motion check: spread them on the element to track. */
export function track(name: string, o: TrackOptions = {}): Record<string, string | undefined> {
  return {
    "data-romp": name,
    "data-romp-impact": o.impact ? "1" : undefined,
    "data-romp-seamless": o.seamless ? "1" : undefined,
    "data-romp-allow-crop": o.allowCrop ? "1" : undefined,
    "data-romp-allow-exit": o.allowExit ? "1" : undefined,
    "data-romp-role": o.role,
    "data-romp-allow": o.allow?.length ? o.allow.join(",") : undefined,
    "data-romp-z": o.z != null ? String(o.z) : undefined,
  };
}

/**
 * Track words on screen (a caption, a speech bubble, a heading) for the text
 * rules: its whole text, and how many characters of it are showing.
 *
 *   const t = captionTiming(line);
 *   const typed = t.typed(frame - from);
 *   <div {...trackText(`bubble:${from}`, line, { typed })}>{line.slice(0, typed)}</div>
 */
export function trackText(name: string, text: string, o: TrackOptions & { typed?: number; heading?: boolean } = {}): Record<string, string | undefined> {
  const total = [...text.replace(/\*/g, "")].length;
  return {
    ...track(name, { ...o, role: "text" }),
    "data-romp-text": text.replace(/\*/g, ""),
    "data-romp-chars-total": String(total),
    "data-romp-chars-shown": String(Math.max(0, Math.min(total, o.typed ?? total))),
    "data-romp-heading": o.heading ? "1" : undefined,
  };
}

/** Props for a `<Sequence>` (or a `TransitionSeries.Sequence`'s length) from a placed scene. */
export function sceneSequence(scene: Placement & { name?: string }): { from: number; durationInFrames: number; name?: string } {
  return { from: scene.start, durationInFrames: scene.frames, name: scene.name };
}

/**
 * Track a particle burst as ONE object: props for an empty element centred on
 * where the burst comes from, covering all of it, at its strongest opacity. Render it next to the
 * particles (untracked themselves: single sparks outrun the strobe limit by
 * design) and the motion check sees the burst grow in, travel and fade out.
 *
 *   const sparks = emitter.particlesAt(frame);
 *   <div {...trackBurst("sparks", sparks)} />
 *   {sparks.map((p) => <i key={p.i} style={particleStyle(p)} />)}
 */
export function trackBurst(name: string, particles: readonly Particle[], o: { impact?: boolean; allowCrop?: boolean; allowExit?: boolean } = {}): Record<string, unknown> {
  const s = particleSample(particles);
  const b = s.box;
  // Centred on where the burst comes from (the DOM collector reads an element's
  // centre), and wide enough to cover every particle.
  const rx = b ? Math.max(s.x - b.x0, b.x1 - s.x) : 0, ry = b ? Math.max(s.y - b.y0, b.y1 - s.y) : 0;
  return {
    ...track(name, o),
    style: {
      position: "absolute",
      left: s.x - rx,
      top: s.y - ry,
      width: 2 * rx,
      height: 2 * ry,
      opacity: s.opacity,
      display: s.shown ? "block" : "none",
      pointerEvents: "none",
    },
  };
}

/** What a `romp check` entry file default-exports. Any analyze() option goes
 * here too (the text rules' `scenes`, `safe`, `allow`, `strict`, …): spread a
 * timeline's `check` in. */
export interface CheckEntry extends Omit<AnalyzeOptions, "fps" | "width" | "height"> {
  component: any;
  props?: Record<string, unknown>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  /** [from, to] seconds of deliberate fast moves */
  whips?: [number, number][];
  /** [from, to] seconds where the scene is hidden (a transition, a full-frame card) */
  covered?: [number, number][];
  /** cropped check: the share of an object's box allowed outside the frame (default 0.25) */
  croppedFraction?: number;
  /** cropped check: how long it may stay over that (default 0.5 s) */
  croppedSeconds?: number;
  /** names never checked for cropping (or `track(name, { allowCrop: true })`) */
  allowCrop?: string[];
  /** names allowed to leave the frame for good (or `track(name, { allowExit: true })`) */
  allowExit?: string[];
}
