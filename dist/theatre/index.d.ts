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
import { type AnalyzeOptions, type FrameRow, type Report, type Sample } from "../check/analyze.js";
export { analyze, formatReport, type Report, type Issue, type Sample, type FrameRow } from "../check/analyze.js";
/** The parts of a Theatre `ISequence` romp uses. */
export interface SequenceLike {
    /** the playhead, seconds */
    position: number;
    pointer: {
        position: unknown;
    };
}
/** Theatre's `onChange(pointer, callback, rafDriver?)`: returns an unsubscribe. */
export type OnChange = (pointer: any, cb: (value: any) => void, driver?: any) => () => void;
/**
 * A `seek(t)` that moves Theatre's playhead to t and then calls your own
 * seek(t) (if any) with the same t: hand it to romp's `Clock`, a frame
 * renderer, or the motion check.
 */
export declare function seekSequence(sequence: SequenceLike, seek?: (t: number) => void): (t: number) => void;
/**
 * Follow Theatre's playhead: every time `sequence.position` changes (the
 * studio's scrubber, `sequence.play()`), call seek(position), so romp's baked
 * poses play on Theatre's timeline. Returns the unsubscribe.
 */
export declare function followSequence(sequence: SequenceLike, onChange: OnChange, seek: (t: number) => void, rafDriver?: unknown): () => void;
/** A Theatre object's props as a motion-check sample. */
export interface ObjectSampleOptions {
    /** its drawn size, px, when the props don't carry `width`/`height` */
    size?: {
        w: number;
        h: number;
    };
    /** the frame's size (for onScreen and the visible area) */
    frame?: {
        width: number;
        height: number;
    };
}
/**
 * Read a Theatre object's values as a sample: `x`, `y` (its centre, px),
 * `opacity` (default 1), `scale` or `scaleX`/`scaleY` (default 1), `width`
 * and `height` (or `size`), and `visible` (default true). Nested `position`
 * ({ x, y }) and `scale` ({ x, y }) objects work too.
 */
export declare function objectSample(value: Record<string, any>, o?: ObjectSampleOptions): Sample;
/** One frame's row from Theatre objects (`sheet.object(…)`), by name. */
export declare function objectsRow(objects: Record<string, {
    value: Record<string, any>;
}>, o?: ObjectSampleOptions): Record<string, Sample>;
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
export declare function theatreFrames(o: TheatreReportOptions): FrameRow[];
/** The motion check over a Theatre sequence. */
export declare function theatreReport(o: TheatreReportOptions): Report;
