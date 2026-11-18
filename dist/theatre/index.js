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
import { analyze } from "../check/analyze.js";
export { analyze, formatReport } from "../check/analyze.js";
/**
 * A `seek(t)` that moves Theatre's playhead to t and then calls your own
 * seek(t) (if any) with the same t: hand it to romp's `Clock`, a frame
 * renderer, or the motion check.
 */
export function seekSequence(sequence, seek) {
    return (t) => {
        sequence.position = Math.max(0, t);
        seek?.(t);
    };
}
/**
 * Follow Theatre's playhead: every time `sequence.position` changes (the
 * studio's scrubber, `sequence.play()`), call seek(position), so romp's baked
 * poses play on Theatre's timeline. Returns the unsubscribe.
 */
export function followSequence(sequence, onChange, seek, rafDriver) {
    return onChange(sequence.pointer.position, (t) => seek(t), rafDriver);
}
/**
 * Read a Theatre object's values as a sample: `x`, `y` (its centre, px),
 * `opacity` (default 1), `scale` or `scaleX`/`scaleY` (default 1), `width`
 * and `height` (or `size`), and `visible` (default true). Nested `position`
 * ({ x, y }) and `scale` ({ x, y }) objects work too.
 */
export function objectSample(value, o = {}) {
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
export function objectsRow(objects, o = {}) {
    const row = {};
    for (const [name, obj] of Object.entries(objects))
        row[name] = objectSample(obj.value, o);
    return row;
}
/** Step the sequence frame by frame, collecting rows (the playhead is put back afterwards). */
export function theatreFrames(o) {
    const fps = o.fps ?? 30;
    const back = o.sequence.position;
    const frames = [];
    const go = seekSequence(o.sequence, o.seek);
    try {
        for (let f = Math.round((o.from ?? 0) * fps); f <= Math.round(o.to * fps); f++) {
            go(f / fps);
            frames.push({ f, row: o.collect() });
        }
    }
    finally {
        go(back);
    }
    return frames;
}
/** The motion check over a Theatre sequence. */
export function theatreReport(o) {
    return analyze(theatreFrames(o), o);
}
//# sourceMappingURL=index.js.map