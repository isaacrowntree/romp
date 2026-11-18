/**
 * romp for Theatre.js: a Theatre sequence is a seekable timeline (its
 * `position` is film seconds), so it can host romp-baked motion and the
 * motion check can step it.
 *
 *   // Theatre's playhead drives romp (studio scrubbing, sequence.play())
 *   followSequence(sheet.sequence, onChange, (t) => stage.pose(t));
 *
 *   // romp drives Theatre (romp's Clock, a Remotion frame, the motion check)
 *   const seek = seekSequence(sheet.sequence, (t) => stage.pose(t));
 *
 * Thin by design: nothing here imports @theatre/core. Pass its `onChange`
 * yourself (`import { onChange } from "@theatre/core"`), so this entry point
 * loads anywhere and works with any 0.x release that has `sequence.position`.
 */
import { analyze, type AnalyzeOptions, type FrameRow, type Report, type Sample } from "../check/analyze.js";

export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";

/** The parts of a Theatre `ISequence` romp uses. */
export interface SequenceLike {
  /** the playhead, seconds */
  position: number;
  pointer: { position: unknown };
}

/** Theatre's `onChange(pointer, callback, rafDriver?)`: returns an unsubscribe. */
export type OnChange = (pointer: any, cb: (value: any) => void, driver?: any) => () => void;

/**
 * A `seek(t)` that moves Theatre's playhead to t and then calls your own
 * seek(t) (if any) with the same t: hand it to romp's `Clock`, a frame
 * renderer, or the motion check.
 */
export function seekSequence(sequence: SequenceLike, seek?: (t: number) => void): (t: number) => void {
  return (t: number) => {
    sequence.position = Math.max(0, t);
    seek?.(t);
  };
}

/**
 * Follow Theatre's playhead: every time `sequence.position` changes (the
 * studio's scrubber, `sequence.play()`), call seek(position), so romp's baked
 * poses play on Theatre's timeline. Returns the unsubscribe.
 */
export function followSequence(sequence: SequenceLike, onChange: OnChange, seek: (t: number) => void, rafDriver?: unknown): () => void {
  return onChange(sequence.pointer.position, (t: number) => seek(t), rafDriver);
}

/** A Theatre object's props as a motion-check sample. */
export interface ObjectSampleOptions {
  /** its drawn size, px, when the props don't carry `width`/`height` */
  size?: { w: number; h: number };
  /** the frame's size (for onScreen and the visible area) */
  frame?: { width: number; height: number };
}

/**
 * Read a Theatre object's values as a sample: `x`, `y` (its centre, px),
 * `opacity` (default 1), `scale` or `scaleX`/`scaleY` (default 1), `width`
 * and `height` (or `size`), and `visible` (default true). Nested `position`
 * ({ x, y }) and `scale` ({ x, y }) objects work too.
 */
export function objectSample(value: Record<string, any>, o: ObjectSampleOptions = {}): Sample {
  const pos = typeof value.position === "object" && value.position ? value.position : value;
  const x = +pos.x || 0, y = +pos.y || 0;
  const sc = value.scale;
  const sx = typeof sc === "object" && sc ? +sc.x : +(value.scaleX ?? sc ?? 1);
  const sy = typeof sc === "object" && sc ? +sc.y : +(value.scaleY ?? sc ?? 1);
  const w = Math.abs((+(value.width ?? value.w ?? o.size?.w ?? 0) || 0) * sx), h = Math.abs((+(value.height ?? value.h ?? o.size?.h ?? 0) || 0) * sy);
  const opacity = Math.max(0, Math.min(1, +(value.opacity ?? 1)));
  const shown = value.visible !== false && opacity > 0.01;
  const box = w > 0 && h > 0 ? { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 } : undefined;
  const F = o.frame;
  const visW = box && F ? Math.max(0, Math.min(box.x1, F.width) - Math.max(box.x0, 0)) : w;
  const visH = box && F ? Math.max(0, Math.min(box.y1, F.height) - Math.max(box.y0, 0)) : h;
  const onScreen = F ? (box ? visW > 0 && visH > 0 : x >= 0 && y >= 0 && x <= F.width && y <= F.height) : true;
  return { x, y, shown, onScreen, area: shown ? visW * visH : 0, opacity: shown ? opacity : 0, box };
}

/** One frame's row from Theatre objects (`sheet.object(…)`), by name. */
export function objectsRow(objects: Record<string, { value: Record<string, any> }>, o: ObjectSampleOptions = {}): Record<string, Sample> {
  const row: Record<string, Sample> = {};
  for (const [name, obj] of Object.entries(objects)) row[name] = objectSample(obj.value, o);
  return row;
}

export interface TheatreReportOptions extends AnalyzeOptions {
  sequence: SequenceLike;
  /** this frame's tracked objects: `() => collectDom(root)`, `() => objectsRow(objects, …)`, or your own */
  collect: () => Record<string, Sample>;
  /** seconds; default 0 … `to` */
  from?: number;
  to: number;
  /** called after each move of the playhead, before collecting: run your own seek, or tick Theatre's rafDriver so objects update */
  seek?: (t: number) => void;
}

/** Step the sequence frame by frame, collecting rows (the playhead is put back afterwards). */
export function theatreFrames(o: TheatreReportOptions): FrameRow[] {
  const fps = o.fps ?? 30;
  const back = o.sequence.position;
  const frames: FrameRow[] = [];
  const go = seekSequence(o.sequence, o.seek);
  try {
    for (let f = Math.round((o.from ?? 0) * fps); f <= Math.round(o.to * fps); f++) {
      go(f / fps);
      frames.push({ f, row: o.collect() });
    }
  } finally {
    go(back);
  }
  return frames;
}

/** The motion check over a Theatre sequence. */
export function theatreReport(o: TheatreReportOptions): Report {
  return analyze(theatreFrames(o), o);
}
